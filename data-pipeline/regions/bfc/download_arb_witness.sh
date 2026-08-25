#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <target.xlsx>" >&2
  exit 2
fi

target="$1"
witness='https://www.arb-bfc.fr/content/uploads/2024/06/231219_sp_statuts_bfc_a_diffuser.xlsx'
expected='0912139a6f6b6902d6be22e383471b971782502e155b5ae83526bddacbcac073'

mkdir -p "$(dirname "$target")"
curl --fail --location --retry 3 --silent --show-error "$witness" -o "$target"
test "$(head -c 2 "$target")" = 'PK'
actual="$(sha256sum "$target" | cut -d' ' -f1)"
echo "ARB BFC 2023-12-19 SHA-256: $actual"
if [ "$actual" != "$expected" ]; then
  echo "SHA-256 ARB BFC inattendu: $actual != $expected" >&2
  exit 1
fi
