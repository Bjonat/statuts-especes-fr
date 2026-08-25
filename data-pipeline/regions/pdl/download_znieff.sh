#!/usr/bin/env bash
# Télécharge les listes ZNIEFF PDL 2018 (SHA-256 fail-closed).
set -euo pipefail

OUT_DIR="${1:?usage: download_znieff.sh <output-dir>}"
mkdir -p "$OUT_DIR"

UA='Mozilla/5.0 (compatible; statuts-especes-fr-pipeline/1.0)'
LANDING='https://www.pays-de-la-loire.developpement-durable.gouv.fr/les-listes-des-especes-determinantes-et-habitats-a4613.html'

download() {
  local name="$1" url="$2" expected="$3"
  local target="$OUT_DIR/$name"
  echo "Téléchargement $name…"
  curl --fail --location --retry 3 -A "$UA" "$url" -o "$target"
  if head -c 512 "$target" | grep -Eqi 'Maintenance en cours|<!doctype html|<html'; then
    echo "Échec: $name — page HTML/maintenance ($LANDING)" >&2
    exit 1
  fi
  if ! head -c 2 "$target" | grep -q 'PK'; then
    echo "Échec: $name — signature ODS/ZIP invalide" >&2
    exit 1
  fi
  local actual
  actual="$(sha256sum "$target" | awk '{print $1}')"
  if [[ "$actual" != "$expected" ]]; then
    echo "Échec: $name — SHA-256 inattendu" >&2
    echo "  attendu: $expected" >&2
    echo "  obtenu : $actual" >&2
    exit 1
  fi
  echo "OK $name SHA-256: $actual"
}

download liste_pdl__2018_faune_vf.ods \
  'https://www.pays-de-la-loire.developpement-durable.gouv.fr/IMG/ods/liste_pdl__2018_faune_vf.ods' \
  '1bd95cf726ddbf5cb17f71c00092eecf3ed7b6e0fa6d7d6216b1a46adc73b91e'

download liste_pdl__2018_flore_vf.ods \
  'https://www.pays-de-la-loire.developpement-durable.gouv.fr/IMG/ods/liste_pdl__2018_flore_vf.ods' \
  '2b99b0bf40fa6c3f9ccec4b72a0d991baa792f5919a00a430575106c671f9d37'
