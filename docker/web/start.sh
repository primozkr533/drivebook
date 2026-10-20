#!/bin/sh
# Docker's runtime HOSTNAME (container id) would bind Next to eth0 only, and busybox wget
# resolves `localhost` to ::1 — so listen dual-stack on `::` when the kernel has IPv6.
if [ -s /proc/net/if_inet6 ]; then
  export HOSTNAME="::"
else
  export HOSTNAME="0.0.0.0"
fi
exec node server.js
