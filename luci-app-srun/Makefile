# SPDX-License-Identifier: Apache-2.0
#
# Copyright (C) 2026 zeroxin <zeroxin1936999453@zohomail.com>
#
# This is free software, licensed under the Apache License, Version 2.0 .

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for SRun/深澜 portal authentication
LUCI_DEPENDS:=+luci-base +srun
LUCI_PKGARCH:=all

PKG_LICENSE:=Apache-2.0
PKG_MAINTAINER:=zeroxin <zeroxin1936999453@zohomail.com>

# The ubus object luci.srun is a plain shell rpcd plugin; restart rpcd on
# install so it is picked up without a reboot.
define Package/luci-app-srun/postinst
#!/bin/sh
[ -x /etc/init.d/rpcd ] && /etc/init.d/rpcd restart >/dev/null 2>&1
[ -x /etc/init.d/srun ] && /etc/init.d/srun enable >/dev/null 2>&1
exit 0
endef

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature
