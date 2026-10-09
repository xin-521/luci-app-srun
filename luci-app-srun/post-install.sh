#!/bin/sh
# Post-install/upgrade hook for luci-app-srun.
#  - restart rpcd so the ucode plugin (ubus object "luci.srun") is loaded
#  - create the default /etc/config/srun
#  - enable the service (boot + first config apply will start it)
[ -x /etc/init.d/rpcd ] && /etc/init.d/rpcd restart >/dev/null 2>&1
[ -e /usr/bin/srun ] && chmod 755 /usr/bin/srun
[ -x /etc/uci-defaults/80_srun ] && sh /etc/uci-defaults/80_srun >/dev/null 2>&1
[ -x /etc/init.d/srun ] && /etc/init.d/srun enable >/dev/null 2>&1
exit 0
