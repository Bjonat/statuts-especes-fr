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
  # Refuse HTML maintenance pages disguised as XLSX
  if ! unzip -t "$path" >/dev/null 2>&1; then
    echo "Fichier OCC invalide (pas un XLSX ZIP): $filename" >&2
    if grep -aqi 'maintenance\|<!doctype html\|<html' "$path"; then
      echo "Le frontal DREAL Occitanie renvoie une page de maintenance." >&2
    fi
    exit 1
  fi
  local actual
  actual="$(sha256sum "$path" | cut -d' ' -f1)"
  echo "$filename SHA-256: $actual"
  if [ "$actual" != "$expected" ]; then
    echo "SHA-256 inattendu pour $filename: $actual != $expected" >&2
    exit 1
  fi
}

download 'znieff-flora.xlsx' \
  'https://www.occitanie.developpement-durable.gouv.fr/IMG/xlsx/liste_taxons_det_flore_occitanie_cotation_v13-v16_osmose_public.xlsx' \
  '87464cbb51ccc07de54586d10c6071b0a5344027f8c335dea2f06fcb877bb834'

download 'znieff-fauna.xlsx' \
  'https://www.occitanie.developpement-durable.gouv.fr/IMG/xlsx/listes_faune_znieff_20240725.xlsx' \
  'ec66eed10fde0e97558c1f2a973fd8480037b722ec4e03814517e5944754d873'

echo "OCC ZNIEFF sources téléchargées dans $target_dir"
