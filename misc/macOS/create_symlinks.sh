#!/bin/sh

ccache_path="/usr/local/bin/ccache"
symlink_path="/usr/local/opt/ccache/libexec"

mkdir -p "$symlink_path"

ln -s "$ccache_path" "$symlink_path/cc"
ln -s "$ccache_path" "$symlink_path/clang"
ln -s "$ccache_path" "$symlink_path/clang++"
ln -s "$ccache_path" "$symlink_path/c++"
ln -s "$ccache_path" "$symlink_path/gcc"
ln -s "$ccache_path" "$symlink_path/g++"

for _f in /usr/local/bin/g++-*; do
  name=$(basename "$_f")
  version=$(printf '%s' "$name" | cut -c '5-')
  ln -s "$ccache_path" "$symlink_path/c++-${version}"
  ln -s "$ccache_path" "$symlink_path/gcc-${version}"
  ln -s "$ccache_path" "$symlink_path/g++-${version}"
done
