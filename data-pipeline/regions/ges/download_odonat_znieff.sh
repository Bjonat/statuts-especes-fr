#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <target.xlsx>" >&2
  exit 2
fi

target="$1"
direct='https://www.grand-est.developpement-durable.gouv.fr/IMG/xlsx/listes_edz_aee_faunev2_2_juin2026.xlsx'
mirror='https://www.odonat-grandest.fr/wp-content/uploads/2026/08/listes_especes-determinantes-znieff_grand-est_juin2026.xlsx'
expected='a130de0436237ebde5b4fcee582ac8890bdadeed679cda96d4896f9082866c1f'

mkdir -p "$(dirname "$target")"
direct_ok=false
if curl --fail --location --retry 2 --silent --show-error "$direct" -o "$target"; then
  if [ "$(head -c 2 "$target")" = 'PK' ]; then
    direct_ok=true
  elif grep -aq 'Maintenance en cours' "$target"; then
    echo '::warning::DREAL Grand Est en maintenance ; utilisation du miroir institutionnel ODONAT.'
  else
    echo '::warning::La DREAL Grand Est n’a pas renvoyé un XLSX exploitable ; utilisation du miroir ODONAT.'
  fi
else
  echo '::warning::Téléchargement DREAL Grand Est impossible ; utilisation du miroir ODONAT.'
fi

if [ "$direct_ok" != true ]; then
  curl --fail --location --retry 3 --silent --show-error "$mirror" -o "$target"
  test "$(head -c 2 "$target")" = 'PK'
fi

actual="$(sha256sum "$target" | cut -d' ' -f1)"
echo "Grand Est ZNIEFF faune SHA-256: $actual"
if [ "$actual" != "$expected" ]; then
  echo "SHA-256 Grand Est inattendu: $actual != $expected" >&2
  exit 1
fi
