#!/usr/bin/env bash
# Télécharge l'export GeoNat'îdF (SHA-256 fail-closed) pour LRR Île-de-France.
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <target.csv>" >&2
  exit 2
fi

target="$1"
url='https://geonature.arb-idf.fr/geonature/api/media/exports/schedules/Statuts_des_taxons_STyt8fLcp03L11.csv'
landing='https://geonature.arb-idf.fr/table-diffusion-statuts-taxons-franciliens'
expected='1466cacc15e65384ed66c67f6266ae6fcd1d27d45fee8367e133f1d23f4b8d62'

mkdir -p "$(dirname "$target")"
curl --fail --location --retry 3 --silent --show-error "$url" -o "$target"

if head -c 512 "$target" | grep -Eqi 'Maintenance en cours|<!doctype html|<html'; then
  echo "Échec: page HTML/maintenance à la place du CSV ($landing)" >&2
  exit 1
fi
if ! grep -q 'lrr' "$target" || ! grep -q 'cd_nom' "$target"; then
  echo "Échec: CSV GeoNat'îdF invalide (lrr/cd_nom absents)" >&2
  exit 1
fi

actual="$(sha256sum "$target" | cut -d' ' -f1)"
echo "Île-de-France GeoNat SHA-256: $actual"
if [ "$actual" != "$expected" ]; then
  echo "SHA-256 GeoNat'îdF inattendu: $actual != $expected" >&2
  exit 1
fi
