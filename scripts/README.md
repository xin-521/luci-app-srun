# scripts

## build-apk.sh

为 armv8 构建 OpenWrt `.apk` 包（`srun` + `luci-app-srun`）到 `../dist/`。

依赖两个**宿主机工具**（在 Windows/MSYS2 上自行构建，见下）：

- `apk` —— apk-tools 3（`apk mkpkg` / `apk mkndx` / `apk verify`）。
- `po2lmo` —— LuCI 的 `.po → .lmo` 编译器（可省略，省略则不含中文翻译）。

```sh
# 默认从 /c/msys64/tmp/... 读取工具，可用环境变量覆盖
APK=/path/to/apk PO2LMO=/path/to/po2lmo sh scripts/build-apk.sh

# 覆盖版本/架构
SRUN_VER=0.6.2-r3 SRUN_ARCH=aarch64_generic sh scripts/build-apk.sh
```

### `srun` 二进制从哪里来

本仓库**不包含** Rust 源码（属上游 `zu1k/srun`）。`build-apk.sh` 按下列顺序定位待打包的二进制：

1. `SRUN_BIN=/path/to/srun`（或 `BIN=...`）显式指定；
2. `prebuilt/srun-$SRUN_ARCH`（仓库内自带，目录已 gitignore）；
3. `../target/aarch64-unknown-linux-musl/release/srun`（恰好与上游 srun 检出同级时）。

均不存在则报错并提示自行交叉编译：

```sh
cargo build --release --target aarch64-unknown-linux-musl   # 需在 srun 源码目录，带 AUTH_SERVER_IP=...
# 或
SRUN_BIN=~/srun-aarch64 sh scripts/build-apk.sh
```

> 因 `~/.config/git/ignore` 默认含 `dist/`，仓库根 `.gitignore` 用 `!dist/` 显式重新纳入了
> `dist/`（预编译 `.apk` 产物）。若不希望仓库里带二进制，去掉该行即可。

脚本会：暂存文件 → `apk mkpkg` → `apk verify --allow-untrusted` → 生成
`APKINDEX.tar.gz` → 输出 `sha256sums`。

## 宿主机工具构建备忘（MSYS2）

**apk-tools 3**（原生 msys 构建）：

```sh
pacman -S --needed gcc make pkgconf openssl-devel zlib-devel lua
# 取源码
curl -L https://gitlab.alpinelinux.org/alpine/apk-tools/-/archive/master/apk-tools-master.tar.gz | tar xz
cd apk-tools-master
# MSYS2/Cygwin 兼容补丁：
#  - src/Makefile: $(obj)/libapk.so 增加前置依赖 $(libapk_so)
#  - src/io.c: fgetpwent/fgetgrent 分支追加 && !defined(__CYGWIN__)
#  - portability/cygwin-compat.h: memfd_create→-1，MFD_*→0
#  - src/app_mkpkg.c: 文件属主强制 root（fakeroot 等价）
make -j4 CRYPTO=openssl URL_BACKEND=wget ZSTD=no LUA=no \
     "CFLAGS_EXTRA=-include $PWD/portability/cygwin-compat.h" \
     "LIBS_apk=-lapk -lssl -lcrypto -lz"
# 产物：src/apk.exe
```

**po2lmo**（LuCI）：

```sh
# 需要 luci 的 modules/luci-base/src/{po2lmo.c,lib/lmo.c,lib/lmo.h,lib/plural_formula.y,contrib/lemon.c,contrib/lempar.c}
gcc -std=gnu17 -o lemon contrib/lemon.c
./lemon -q lib/plural_formula.y
gcc -O2 -I. -Ilib -o po2lmo po2lmo.c lib/lmo.c lib/plural_formula.c
```

以上两步只需在首次构建前做一次。
