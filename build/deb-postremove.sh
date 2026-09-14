#!/bin/sh
set -eu

rm -f '/usr/share/metainfo/com.ryvor.CerberusStoreBuilder.metainfo.xml'

if command -v appstreamcli >/dev/null 2>&1; then
  appstreamcli refresh-cache --force >/dev/null 2>&1 || true
fi
