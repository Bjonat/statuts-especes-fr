#!/usr/bin/env bash
# Télécharge le tableur ZNIEFF Centre-Val de Loire 2026 (SHA-256 fail-closed).
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <target.xls>" >&2
  exit 2
fi

target="$1"
url='https://www.centre-val-de-loire.developpement-durable.gouv.fr/IMG/xls/listes_dz_cvl_actual_avril_2026.xls'
landing='https://www.centre-val-de-loire.developpement-durable.gouv.fr/habitats-et-especes-determinantes-a4278.html'
expected='6018854543765120bed896317671aed73c22b145416a29fa6040cca3a19c18c5'
ua='Mozilla/5.0 (compatible; statuts-especes-fr-pipeline/1.0)'

mkdir -p "$(dirname "$target")"
curl --fail --location --retry 3 -A "$ua" --silent --show-error "$url" -o "$target"

if head -c 512 "$target" | grep -Eqi 'Maintenance en cours|<!doctype html|<html'; then
  echo "Échec: page HTML/maintenance à la place du XLS ($landing)" >&2
  exit 1
fi

# OLE Compound Document signature
sig="$(head -c 8 "$target" | od -An -tx1 | tr -d ' \n')"
if [ "$sig" != "d0cf11e0a1b11ae1" ]; then
  echo "Échec: signature XLS/OLE invalide ($sig)" >&2
  exit 1
fi

actual="$(sha256sum "$target" | cut -d' ' -f1)"
echo "Centre-Val de Loire ZNIEFF SHA-256: $actual"
if [ "$actual" != "$expected" ]; then
  echo "SHA-256 ZNIEFF CVL inattendu: $actual != $expected" >&2
  exit 1
fi
