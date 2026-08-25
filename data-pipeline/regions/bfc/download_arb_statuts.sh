#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <target.xlsx>" >&2
  exit 2
fi

target="$1"
dreal='https://www.bourgogne-franche-comte.developpement-durable.gouv.fr/IMG/xlsx/260303_sp_statuts_bfc.xlsx'
expected='4c16ef90ccfa016a7715aac7dc195e1e897ce27763f50937df5b687173e1ee02'

mkdir -p "$(dirname "$target")"
curl --fail --location --retry 3 --silent --show-error "$dreal" -o "$target"
if [ "$(head -c 2 "$target")" != 'PK' ]; then
  if grep -aq 'Maintenance en cours' "$target"; then
    echo 'DREAL BFC en maintenance : le XLSX 03/03/2026 est indisponible.' >&2
  else
    echo 'La DREAL BFC n’a pas renvoyé un XLSX exploitable.' >&2
  fi
  exit 1
fi

actual="$(sha256sum "$target" | cut -d' ' -f1)"
echo "DREAL BFC 2026-03-03 SHA-256: $actual"
if [ "$actual" != "$expected" ]; then
  echo "SHA-256 DREAL BFC inattendu: $actual != $expected" >&2
  exit 1
fi
