#!/usr/bin/env bash
# Télécharge les sources ZNIEFF Hauts-de-France utilisées en production — SHA-256 fail-closed.
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <target-dir>" >&2
  exit 2
fi

target_dir="$1"
landing='https://www.cbnhdf.fr/je-telecharge'
mkdir -p "$target_dir"

download() {
  local filename="$1"
  local url="$2"
  local expected="$3"
  local path="$target_dir/$filename"
  curl --fail --location --retry 4 --retry-all-errors --connect-timeout 30 --max-time 180 \
    --silent --show-error "$url" -o "$path"
  if [ "$(head -c 2 "$path")" != 'PK' ]; then
    echo "Échec: $filename — fichier non XLSX ($landing)" >&2
    exit 1
  fi
  local actual
  actual="$(sha256sum "$path" | cut -d' ' -f1)"
  echo "$filename SHA-256: $actual"
  if [ "$actual" != "$expected" ]; then
    echo "SHA-256 Digitale inattendu pour $filename: $actual != $expected" >&2
    exit 1
  fi
}

download 'digitale-flora.xlsx' \
  'https://www.cbnhdf.fr/system/files/2026-05/DIGITALE_BS-BIF-FVF_PV_4.0_20260331.xlsx' \
  '71ae71b770f7b3911349e501caaaa65ac7dba8172d12b96ef4b90d5056995c95'

download 'digitale-bryophytes.xlsx' \
  'https://www.cbnhdf.fr/system/files/2026-05/DIGITALE_BS-BIF-FVF_MH_4.0_20260331.xlsx' \
  '810cc4cc9458721710a826d009884698fcf9b06d059af41153197c12470cb3bc'

# La faune n'est pas encore unifiée à l'échelle HDF : deux listes historiques
# officielles sont donc téléchargées séparément dans le même dossier de build.
bash "$(dirname "$0")/download_znieff_fauna.sh" "$target_dir"

echo "Sources ZNIEFF HDF (flore, bryophytes, faune historique) téléchargées dans $target_dir"
