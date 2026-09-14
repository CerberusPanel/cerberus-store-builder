#!/bin/sh
set -eu

metadata_source='/opt/Cerberus Store Builder/resources/com.ryvor.CerberusStoreBuilder.metainfo.xml'
metadata_target='/usr/share/metainfo/com.ryvor.CerberusStoreBuilder.metainfo.xml'

if [ -f "$metadata_source" ]; then
  install -Dm644 "$metadata_source" "$metadata_target"
fi

if command -v appstreamcli >/dev/null 2>&1; then
  appstreamcli refresh-cache --force >/dev/null 2>&1 || true
fi
