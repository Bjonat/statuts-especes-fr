#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <target-dir>" >&2
  exit 2
fi

target_dir="$1"
mkdir -p "$target_dir"
path="$target_dir/araignees-2025.xlsx"
url='https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/IMG/xlsx/tableau_final_evaluation.xlsx'
expected='abf2e14d8728c49626b49b38e5f8412659b076001f7befeec464960844f82fb3'
curl --fail --location --retry 4 --retry-all-errors --connect-timeout 30 --max-time 180 \
  --silent --show-error "$url" -o "$path"
actual="$(sha256sum "$path" | cut -d' ' -f1)"
echo "araignees-2025.xlsx SHA-256: $actual"
if [ "$actual" != "$expected" ]; then
  echo "SHA-256 inattendu: $actual != $expected" >&2
  exit 1
fi
echo "NAQ LRR araignées téléchargée dans $target_dir"
