#!/bin/sh
# Build OpenWrt .apk packages (srun + luci-app-srun).
#
# Host tools (built separately, not shipped here):
#   APK    - apk-tools 3 `apk`
#   PO2LMO - LuCI po2lmo (for zh_Hans translations)
#
# Usage: APK=/path/to/apk PO2LMO=/path/to/po2lmo sh scripts/build-apk.sh
#
# Useful overrides (see scripts/README.md):
#   SRUN_BIN / BIN   binary to package        SRUN_ARCH  .apk arch string
#   DIST             output directory         WITH_SRUN / WITH_LUCI  0 to skip
#   SRUN_VER / LUCI_VER / MAINTAINER
set -eu

APK=${APK:-/c/msys64/tmp/apk-tools-src/src/apk.exe}
PO2LMO=${PO2LMO:-/c/msys64/tmp/luci-po2lmo/po2lmo.exe}

HERE=$(cd "$(dirname "$0")" && pwd)
APP=$(cd "$HERE/.." && pwd)                # this repo root
ROOT=$(cd "$APP/.." && pwd)               # parent (upstream srun checkout, optional)
PKG=$APP/luci-app-srun
# Output directory; CI overrides it to keep one directory per architecture.
DIST=${DIST:-$APP/dist}
SRUN_ARCH=${SRUN_ARCH:-aarch64_cortex-a53}
# Which packages to build (CI builds the noarch LuCI app only once).
WITH_SRUN=${WITH_SRUN:-1}
WITH_LUCI=${WITH_LUCI:-1}

# Where the cross-compiled srun binary comes from, in order:
#   1. $SRUN_BIN (or $BIN)             - explicit
#   2. $APP/prebuilt/srun-$SRUN_ARCH   - vendored in this repo
#   3. $ROOT/target/aarch64-unknown-linux-musl/release/srun - sibling upstream build
PREBUILT=$APP/prebuilt/srun-$SRUN_ARCH
if [ -n "${SRUN_BIN:-}" ]; then
	BIN=$SRUN_BIN
elif [ -n "${BIN:-}" ]; then
	:
elif [ -f "$PREBUILT" ]; then
	BIN=$PREBUILT
else
	BIN=$ROOT/target/aarch64-unknown-linux-musl/release/srun
fi

SRUN_VER=${SRUN_VER:-0.6.2-r3}
LUCI_VER=${LUCI_VER:-1.0.9-r1}
# Packager/maintainer recorded in both .apk files. Upstream authorship of the
# srun binary itself stays expressed via origin/url/GPL-3.0 licence.
MAINTAINER=${MAINTAINER:-zeroxin <zeroxin1936999453@zohomail.com>}
LUCI_ARCH=noarch

[ -x "$APK" ]  || { echo "missing apk tool: $APK" >&2; exit 1; }
if [ "$WITH_SRUN" = 1 ]; then
[ -f "$BIN" ]  || {
	echo "missing srun binary: $BIN" >&2
	echo "  build it:  cargo build --release --target aarch64-unknown-linux-musl" >&2
	echo "  or set:    SRUN_BIN=/path/to/srun" >&2
	echo "  or vendor: $PREBUILT" >&2
	exit 1
}
fi

rm -rf "$DIST"
mkdir -p "$DIST" "$DIST/.stage"

mkpkg() { # name version arch description license origin url maintainer depends files out
	"$APK" mkpkg \
		--info "name:$1" --info "version:$2" --info "arch:$3" \
		--info "description:$4" --info "license:$5" \
		--info "origin:$6" --info "url:$7" --info "maintainer:$8" \
		${9:+--info "depends:$9"} \
		${EXTRA:-} \
		--files "${10}" --output "$DIST/${11}"
}

# ---- srun (statically linked musl binary) ----
if [ "$WITH_SRUN" = 1 ]; then
S=$DIST/.stage/srun
mkdir -p "$S/usr/bin"
cp "$BIN" "$S/usr/bin/srun"
chmod 755 "$S/usr/bin/srun"
chmod 755 "$APP/scripts/srun-post-install.sh"
EXTRA="--script post-install:$APP/scripts/srun-post-install.sh" \
mkpkg srun "$SRUN_VER" "$SRUN_ARCH" \
	"SRun/深澜 portal authentication client" \
	"GPL-3.0" "srun" "https://github.com/zu1k/srun" "$MAINTAINER" "" \
	"$S" "srun-$SRUN_VER.apk"
unset EXTRA
fi

# ---- srun-luci-app (noarch: JS, ucode, init, ACL, menu, i18n) ----
if [ "$WITH_LUCI" = 1 ]; then
L=$DIST/.stage/luci-app-srun
mkdir -p "$L"
# install root/ tree (etc, usr/share/luci, usr/share/rpcd, usr/libexec)
cp -a "$PKG/root/." "$L/"
# htdocs -> /www
mkdir -p "$L/www/luci-static/resources/view/srun"
cp -a "$PKG/htdocs/luci-static/resources/view/srun/." "$L/www/luci-static/resources/view/srun/"
# translations
mkdir -p "$L/usr/lib/lua/luci/i18n"
if [ -x "$PO2LMO" ]; then
	"$PO2LMO" "$PKG/po/zh_Hans/srun.po" "$L/usr/lib/lua/luci/i18n/srun.zh_Hans.lmo"
fi
# fix exec bits
chmod 755 "$L/etc/init.d/srun" "$L/etc/uci-defaults/80_srun" \
	"$L/usr/libexec/srun-daemon" "$L/usr/libexec/srun-generate-config" \
	"$L/usr/libexec/rpcd/luci.srun"
chmod 755 "$PKG/post-install.sh"
EXTRA="--script post-install:$PKG/post-install.sh" \
mkpkg luci-app-srun "$LUCI_VER" "$LUCI_ARCH" \
	"LuCI support for SRun/深澜 portal authentication" \
	"Apache-2.0" "openwrt-luci-app-srun" \
	"${LUCI_APP_URL:-https://github.com/xin-521/luci-app-srun.git}" "$MAINTAINER" \
	"luci-base srun" \
	"$L" "luci-app-srun-$LUCI_VER.apk"
unset EXTRA
fi

rm -rf "$DIST/.stage"

# ---- verify + index + checksums ----
for f in "$DIST"/*.apk; do
	"$APK" verify --allow-untrusted "$f" >/dev/null 2>&1 \
		&& echo "verified: $(basename "$f")" \
		|| { echo "INVALID: $f" >&2; exit 1; }
done
"$APK" --allow-untrusted mkndx -o "$DIST/APKINDEX.tar.gz" "$DIST"/*.apk
( cd "$DIST" && sha256sum ./*.apk > sha256sums )

echo "done -> $DIST"
ls -l "$DIST"
