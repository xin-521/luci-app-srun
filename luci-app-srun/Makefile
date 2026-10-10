# SPDX-License-Identifier: Apache-2.0
#
# Copyright (C) 2026 zeroxin <zeroxin1936999453@zohomail.com>
#
# This is free software, licensed under the Apache License, Version 2.0 .

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for SRun/深澜 portal authentication
LUCI_DESCRIPTION:=LuCI app for the srun/深澜 campus portal client: account management, per-account runtime config, and live status/log pages.
LUCI_MAINTAINER:=zeroxin <zeroxin1936999453@zohomail.com>
LUCI_DEPENDS:=+luci-base +srun
LUCI_PKGARCH:=all
LUCI_URL:=https://github.com/xin-521/luci-app-srun.git

PKG_LICENSE:=Apache-2.0
PKG_MAINTAINER:=zeroxin <zeroxin1936999453@zohomail.com>

# luci.mk derives the package VERSION from PKG_VERSION-PKG_RELEASE (and falls
# back to the feed snapshot version when unset), and MAINTAINER only from
# LUCI_MAINTAINER. Pin the version so a buildroot/feed build produces the same
# version as the released dist/ apks. Keep in sync with scripts/build-apk.sh.
PKG_VERSION:=1.0.9
PKG_RELEASE:=1

# The ubus object luci.srun is a plain shell rpcd plugin; restart rpcd on
# install so it is picked up without a reboot. Defining postinst replaces the
# luci.mk default (ifndef-protected), so its Luci index/module cache cleanup
# is repeated here; uci-defaults are applied too (buildroot's default_postinst
# is also replaced by this block), with the IPKG_INSTROOT guard leaving them
# for the first boot when building firmware images.
define Package/luci-app-srun/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	[ -x /etc/uci-defaults/80_srun ] && sh /etc/uci-defaults/80_srun >/dev/null 2>&1
	rm -f /etc/uci-defaults/80_srun
	rm -f /tmp/luci-indexcache.*
	rm -rf /tmp/luci-modulecache/
	[ -x /etc/init.d/rpcd ] && /etc/init.d/rpcd restart >/dev/null 2>&1
	[ -x /etc/init.d/srun ] && /etc/init.d/srun enable >/dev/null 2>&1
	exit 0
}
exit 0
endef

# luci.mk lives at the root of a LuCI feed checkout. Accept both placements:
#   <luci-feed>/applications/luci-app-srun/   (feed layout, ../../luci.mk)
#   openwrt/package/luci-app-srun/ or a src-link feed pointing at this repo
#   (no ../../luci.mk then - fall back to the luci feed installed in the tree).
LUCI_MK:=$(firstword $(wildcard ../../luci.mk $(TOPDIR)/feeds/*/luci.mk))
$(if $(LUCI_MK),,$(error luci.mk not found: put this package into an OpenWrt tree with the luci feed, or into <luci-feed>/applications/))
include $(LUCI_MK)

# call BuildPackage - OpenWrt buildroot signature
