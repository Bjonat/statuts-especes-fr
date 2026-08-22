#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <target.xlsx>" >&2
  exit 2
fi

target="$1"
dreal='https://www.bourgogne-franche-comte.developpement-durable.gouv.fr/IMG/xlsx/260303_sp_statuts_bfc.xlsx'
witness='https://www.arb-bfc.fr/content/uploads/2024/06/231219_sp_statuts_bfc_a_diffuser.xlsx'
expected_witness='0912139a6f6b6902d6be22e383471b971782502e155b5ae83526bddacbcac073'

mkdir -p "$(dirname "$target")"

if curl --fail --location --retry 2 --silent --show-error "$dreal" -o "$target"; then
  if [ "$(head -c 2 "$target")" = 'PK' ]; then
    actual="$(sha256sum "$target" | cut -d' ' -f1)"
    echo "DREAL BFC SHA-256: $actual"
    if [ "$actual" = "$expected_witness" ]; then
      echo '::warning::Le frontal DREAL renvoie encore le millésime ARB 2023-12-19.'
      exit 0
    fi
    echo "Tableur DREAL 03/03/2026 disponible (SHA-256 $actual)." >&2
    echo "L’adaptateur reste verrouillé sur le témoin de schéma 2023 ; valider le millésime 2026 avant publication." >&2
    exit 3
  fi
  if grep -aq 'Maintenance en cours' "$target"; then
    echo '::warning::DREAL BFC en maintenance ; téléchargement du témoin de schéma ARB 2023-12-19.'
  else
    echo '::warning::La DREAL BFC n’a pas renvoyé un XLSX exploitable ; téléchargement du témoin ARB 2023-12-19.'
  fi
else
  echo '::warning::Téléchargement DREAL BFC impossible ; téléchargement du témoin ARB 2023-12-19.'
fi

curl --fail --location --retry 3 --silent --show-error "$witness" -o "$target"
test "$(head -c 2 "$target")" = 'PK'
actual="$(sha256sum "$target" | cut -d' ' -f1)"
echo "ARB BFC 2023-12-19 SHA-256: $actual"
if [ "$actual" != "$expected_witness" ]; then
  echo "SHA-256 ARB BFC inattendu: $actual != $expected_witness" >&2
  exit 1
fi
