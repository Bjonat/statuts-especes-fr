#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <target.xlsx>" >&2
  exit 2
fi

target="$1"
dreal='https://www.grand-est.developpement-durable.gouv.fr/IMG/xlsx/listes_edz_aee_florev1_08_2024_2_.xlsx'
expected='d95b53ebaff27683b58476f8cd4dd39b59190fd3f9e571da284e6d936174af1d'

mkdir -p "$(dirname "$target")"
curl --fail --location --retry 3 --silent --show-error "$dreal" -o "$target"
if [ "$(head -c 2 "$target")" != 'PK' ]; then
  if grep -aq 'Maintenance en cours' "$target"; then
    echo 'DREAL Grand Est flore en maintenance : le XLSX LEDZflora v1.0 est indisponible.' >&2
  else
    echo 'La DREAL Grand Est n’a pas renvoyé un XLSX flore exploitable.' >&2
  fi
  exit 1
fi

actual="$(sha256sum "$target" | cut -d' ' -f1)"
echo "Grand Est ZNIEFF flore SHA-256: $actual"
if [ "$actual" != "$expected" ]; then
  echo "SHA-256 Grand Est flore inattendu: $actual != $expected" >&2
  exit 1
fi
