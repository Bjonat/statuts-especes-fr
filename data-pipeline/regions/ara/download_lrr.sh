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

download 'vertebres-amph-rept-chiro.xlsx' \
  'https://www.biodiversite-auvergne-rhone-alpes.fr/wp-content/uploads/2023/03/LR_AURA2024_Chauves-souris_reptiles_amphibiens.xlsx' \
  'ae49929b0a3d226fa392850c4fa95d928d5f374f179a01fd9ea5f71feac1a581'

download 'oiseaux-mammiferes.ods' \
  'https://www.auvergne-rhone-alpes.developpement-durable.gouv.fr/IMG/ods/2024-lrr-oisx_mamm_web-dreal.ods' \
  '3308ae670319c729f248d444ddfb08b621a02cbc52610c3e4ad2a548eefacd7b'

echo "ARA LRR sources téléchargées dans $target_dir"
