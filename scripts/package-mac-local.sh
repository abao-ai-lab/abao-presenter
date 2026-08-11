#!/usr/bin/env bash

set -euo pipefail

abao_project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$abao_project_root"

abao_version="$(node -p "require('./package.json').version")"
abao_arch="arm64"
abao_app_path="release/mac-${abao_arch}/ABAO Presenter.app"
abao_artifact_base="ABAO-Presenter-${abao_version}-${abao_arch}"
abao_package_tmp="$(mktemp -d)"

cleanup() {
  rm -rf "$abao_package_tmp"
}
trap cleanup EXIT

npm run build
npx electron-builder --mac dir --arm64 --publish never -c.electronDist=node_modules/electron/dist

mkdir -p "$abao_package_tmp/dmg-root"
cp -R "$abao_app_path" "$abao_package_tmp/dmg-root/"
ln -s /Applications "$abao_package_tmp/dmg-root/Applications"

ditto -c -k --sequesterRsrc --keepParent "$abao_app_path" "$abao_package_tmp/${abao_artifact_base}.zip"
hdiutil create \
  -volname "ABAO Presenter ${abao_version}" \
  -srcfolder "$abao_package_tmp/dmg-root" \
  -format UDZO \
  "$abao_package_tmp/${abao_artifact_base}.dmg"

install -m 644 "$abao_package_tmp/${abao_artifact_base}.zip" "release/${abao_artifact_base}.zip"
install -m 644 "$abao_package_tmp/${abao_artifact_base}.dmg" "release/${abao_artifact_base}.dmg"
shasum -a 256 "release/${abao_artifact_base}.dmg" "release/${abao_artifact_base}.zip" > release/SHA256SUMS.txt

hdiutil verify "release/${abao_artifact_base}.dmg"
shasum -a 256 -c release/SHA256SUMS.txt
