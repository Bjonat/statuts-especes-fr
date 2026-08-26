#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <target-dir>" >&2
  exit 2
fi

target_dir="$1"
mkdir -p "$target_dir"

download() {
  local filename="$1"
  local url="$2"
  local expected="$3"
  local path="$target_dir/$filename"
  curl --fail --location --retry 4 --retry-all-errors --connect-timeout 30 --max-time 180 \
    --silent --show-error "$url" -o "$path"
  local actual
  actual="$(sha256sum "$path" | cut -d' ' -f1)"
  echo "$filename SHA-256: $actual"
  if [ "$actual" != "$expected" ]; then
    echo "SHA-256 inattendu pour $filename: $actual != $expected" >&2
    exit 1
  fi
}

download 'alsace-mammiferes-2014.xlsx' \
  'https://www.grand-est.developpement-durable.gouv.fr/IMG/xlsx/liste_rouge_alsace_mammiferes_2014_tableau.xlsx' \
  'be6cbc009ae804b27d360b63d009dd37c7eaf8b416a5316e4978f76886f21e90'

download 'ca-flore-2018.xlsx' \
  'https://www.grand-est.developpement-durable.gouv.fr/IMG/xlsx/liste_rouge_champagne_ardenne_flore_2018_validee_uicn.xlsx' \
  '2017e3dbc1650223f0b6ff847178f2dd9a2c7d49b328369ad297801e62f4818c'

echo "GES LRR historiques téléchargées dans $target_dir"
