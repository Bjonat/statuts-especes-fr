#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <target.ods>" >&2
  exit 2
fi

target="$1"
direct='https://www.auvergne-rhone-alpes.developpement-durable.gouv.fr/IMG/ods/2023-06_listes_especes_determinantes_znieff_aura_internet.ods'
archive='https://web.archive.org/web/20260513033231/https://www.auvergne-rhone-alpes.developpement-durable.gouv.fr/IMG/ods/2023-06_listes_especes_determinantes_znieff_aura_internet.ods'
expected='ab505dcac9297257e8432743c4f60f5a41a7c3f527880d917d6b55f65ddf4f86'

mkdir -p "$(dirname "$target")"
direct_ok=false
if curl --fail --location --retry 2 --silent --show-error "$direct" -o "$target"; then
  if unzip -t "$target" >/dev/null 2>&1; then
    direct_ok=true
  elif grep -aq 'Maintenance en cours' "$target"; then
    echo '::warning::DREAL ARA en maintenance ; utilisation de la capture officielle archivée du 13/05/2026.'
  else
    echo '::warning::La DREAL ARA n’a pas renvoyé un ODS exploitable ; utilisation de la capture archivée vérifiée.'
  fi
else
  echo '::warning::Téléchargement DREAL ARA impossible ; utilisation de la capture archivée vérifiée.'
fi

if [ "$direct_ok" != true ]; then
  curl --fail --location --retry 3 --silent --show-error "$archive" -o "$target"
  unzip -t "$target" >/dev/null
fi

actual="$(sha256sum "$target" | cut -d' ' -f1)"
echo "ARA ZNIEFF ODS SHA-256: $actual"
if [ "$actual" != "$expected" ]; then
  echo "SHA-256 ARA inattendu: $actual != $expected" >&2
  exit 1
fi
