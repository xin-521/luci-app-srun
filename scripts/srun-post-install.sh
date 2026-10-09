#!/bin/sh
# The build host (MSYS2, noacl mount) cannot record an exec bit on a plain ELF,
# so the packaged /usr/bin/srun arrives as 0644. Restore it here.
[ -e /usr/bin/srun ] && chmod 755 /usr/bin/srun
exit 0
