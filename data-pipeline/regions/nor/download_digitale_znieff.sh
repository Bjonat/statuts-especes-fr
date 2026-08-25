#!/usr/bin/env bash
# Télécharge le catalogue Digitale CBNHDF (SHA-256 fail-closed) pour ZNIEFF HN.
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <target.xlsx>" >&2
  exit 2
fi

target="$1"
url='https://www.cbnhdf.fr/system/files/2026-05/DIGITALE_BS-BIF-FVF_PV_4.0_20260331.xlsx'
landing='https://www.cbnhdf.fr/je-telecharge'
expected='71ae71b770f7b3911349e501caaaa65ac7dba8172d12b96ef4b90d5056995c95'

mkdir -p "$(dirname "$target")"
curl --fail --location --retry 3 --silent --show-error "$url" -o "$target"

if [ "$(head -c 2 "$target")" != 'PK' ]; then
  echo "Échec: fichier non XLSX ($landing)" >&2
  exit 1
fi

actual="$(sha256sum "$target" | cut -d' ' -f1)"
echo "CBNHDF Digitale SHA-256: $actual"
if [ "$actual" != "$expected" ]; then
  echo "SHA-256 Digitale inattendu: $actual != $expected" >&2
  exit 1
fi
