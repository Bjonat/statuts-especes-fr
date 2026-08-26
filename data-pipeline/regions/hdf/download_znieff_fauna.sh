#!/usr/bin/env bash
# Télécharge les deux listes faune ZNIEFF historiques Hauts-de-France — SHA-256 fail-closed.
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <target-dir>" >&2
  exit 2
fi

target_dir="$1"
landing='https://www.hauts-de-france.developpement-durable.gouv.fr/Inventaire-des-ZNIEFF-terrestres'
mkdir -p "$target_dir"

download() {
  local filename="$1"
  local url="$2"
  local expected="$3"
  local path="$target_dir/$filename"

  curl --fail --location --retry 4 --retry-all-errors --connect-timeout 30 --max-time 180 \
    --silent --show-error --user-agent 'statuts-especes-fr/1.0' "$url" -o "$path"

  if [ "$(head -c 2 "$path")" != 'PK' ]; then
    echo "Échec: $filename — fichier non ODS ($landing)" >&2
    exit 1
  fi
  unzip -tq "$path" >/dev/null

  local actual
  actual="$(sha256sum "$path" | cut -d' ' -f1)"
  echo "$filename SHA-256: $actual"
  if [ "$actual" != "$expected" ]; then
    echo "SHA-256 DREAL HDF inattendu pour $filename: $actual != $expected" >&2
    exit 1
  fi
}

download 'picardie.ods' \
  'https://www.hauts-de-france.developpement-durable.gouv.fr/IMG/ods/znieff_especesdeterminantes_faune_picardie.ods' \
  '9190695d4be256d84abaf2b781010e64890fcc38322828b12190bc093f7124fd'

download 'npdc.ods' \
  'https://www.hauts-de-france.developpement-durable.gouv.fr/IMG/ods/znieff_especesdeterminantes_faune_npdc.ods' \
  '16172bc5fb5a9d05fb6482273baf1e8bf5f93846a52451ff249a29f194828631'

echo "ZNIEFF faune Picardie + Nord-Pas-de-Calais téléchargées dans $target_dir"
