# SPDX-License-Identifier: Apache-2.0
#
# Copyright (C) 2026 zeroxin <zeroxin1936999453@zohomail.com>
#
# This is free software, licensed under the Apache License, Version 2.0 .

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for SRun/深澜 portal authentication
LUCI_DEPENDS:=+luci-base +srun
LUCI_PKGARCH:=all
LUCI_URL:=https://github.com/xin-521/luci-app-srun.git

PKG_LICENSE:=Apache-2.0
PKG_MAINTAINER:=zeroxin <zeroxin1936999453@zohomail.com>

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

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature
