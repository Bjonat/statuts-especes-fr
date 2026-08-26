#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <target-dir>" >&2
  exit 2
fi

target_dir="$1"
mkdir -p "$target_dir"

download() {
  local filename="$1"
  local url="$2"
  local expected="$3"
  local path="$target_dir/$filename"
  curl --fail --location --retry 4 --retry-all-errors --connect-timeout 30 --max-time 180 \
    --silent --show-error "$url" -o "$path"
  local actual
  actual="$(sha256sum "$path" | cut -d' ' -f1)"
  echo "$filename SHA-256: $actual"
  if [ "$actual" != "$expected" ]; then
    echo "SHA-256 inattendu pour $filename: $actual != $expected" >&2
    exit 1
  fi
}

download 'digitale-flora.xlsx' \
  'https://www.cbnhdf.fr/system/files/2026-05/DIGITALE_BS-BIF-FVF_PV_4.0_20260331.xlsx' \
  '71ae71b770f7b3911349e501caaaa65ac7dba8172d12b96ef4b90d5056995c95'

download 'digitale-bryophytes.xlsx' \
  'https://www.cbnhdf.fr/system/files/2026-05/DIGITALE_BS-BIF-FVF_MH_4.0_20260331.xlsx' \
  '810cc4cc9458721710a826d009884698fcf9b06d059af41153197c12470cb3bc'

echo "HDF Digitale ZNIEFF téléchargées dans $target_dir"
