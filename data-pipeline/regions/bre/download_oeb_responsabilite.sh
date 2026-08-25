#!/usr/bin/env bash
# Télécharge le CSV OEB responsabilité biologique régionale (SHA-256 fail-closed).
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <target.csv>" >&2
  exit 2
fi

target="$1"
url='https://www.data.gouv.fr/api/1/datasets/r/b1d4b313-965a-4bc1-945d-32332befa07a'
landing='https://data.bretagne-environnement.fr/datasets/especes-a-responsabilite-biologique-regionale-en-bretagne'
expected='38965de26b6c462d5a366b92b9c80bd586b88ff7273603d591367f49c02a7240'

mkdir -p "$(dirname "$target")"
curl --fail --location --retry 3 --silent --show-error "$url" -o "$target"

if head -c 512 "$target" | grep -Eqi 'Maintenance en cours|<!doctype html|<html'; then
  echo "Échec: page HTML/maintenance à la place du CSV ($landing)" >&2
  exit 1
fi
if ! grep -q 'RESULTAT_EVALUATION' "$target"; then
  echo "Échec: CSV responsabilité biologique invalide (RESULTAT_EVALUATION absent)" >&2
  exit 1
fi
if ! grep -q 'CODE_NOM_TAXREF' "$target"; then
  echo "Échec: CSV responsabilité biologique invalide (CODE_NOM_TAXREF absent)" >&2
  exit 1
fi

actual="$(sha256sum "$target" | cut -d' ' -f1)"
echo "Bretagne responsabilité biologique SHA-256: $actual"
if [ "$actual" != "$expected" ]; then
  echo "SHA-256 Bretagne responsabilité inattendu: $actual != $expected" >&2
  exit 1
fi
