#!/bin/sh

if ! command -v jq >/dev/null; then
  echo 'Error: required `jq` program is missing' >&2
  exit 1
fi

tmp_dir=$(mktemp -d)
cd "$tmp_dir"

gh_token=$(printenv INPUT_GITHUB-TOKEN)
tags=$(curl -s -L -H "authorization: Bearer $gh_token" https://api.github.com/repos/ccache/ccache/tags)
version=$(echo "$tags" | jq -r 'map(.name | select(test("^v[\\d\\.]+$"))) | first | sub("^v"; "")')
curl -L --retry 3 -o ccache.tar.gz "https://github.com/ccache/ccache/releases/download/v${version}/ccache-${version}-darwin.tar.gz"

tar -xf ccache.tar.gz
cd "ccache-${version}-darwin"
sudo install -m755 ccache /usr/local/bin

rm -rf "$tmp_dir"
