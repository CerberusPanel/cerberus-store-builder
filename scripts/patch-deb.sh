#!/usr/bin/env bash

set -e

METAINFO="build/linux/com.cerberus.storebuilder.metainfo.xml"

for DEB in dist-electron/*.deb; do
	echo "Adding AppStream metadata to: $DEB"

	TEMP_DIR="$(mktemp -d)"

	dpkg-deb -R "$DEB" "$TEMP_DIR"

	mkdir -p "$TEMP_DIR/usr/share/metainfo"

	cp "$METAINFO" \
		"$TEMP_DIR/usr/share/metainfo/com.cerberus.storebuilder.metainfo.xml"

	chmod 0644 \
		"$TEMP_DIR/usr/share/metainfo/com.cerberus.storebuilder.metainfo.xml"

	dpkg-deb --build --root-owner-group "$TEMP_DIR" "$DEB"

	rm -rf "$TEMP_DIR"
done

echo "AppStream metadata added successfully."