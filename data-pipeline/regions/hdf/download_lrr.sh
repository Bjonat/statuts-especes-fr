#!/usr/bin/env bash
# Télécharge les listes rouges régionales unifiées Hauts-de-France (IRPN) — SHA-256 fail-closed.
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <target-dir>" >&2
  exit 2
fi

target_dir="$1"
landing='https://irpn.drealnpdc.fr/listes-rouges/listes-rouges-regionales/'
mkdir -p "$target_dir"

download() {
  local filename="$1"
  local url="$2"
  local expected="$3"
  local path="$target_dir/$filename"
  curl --fail --location --retry 4 --retry-all-errors --connect-timeout 30 --max-time 180 \
    --silent --show-error "$url" -o "$path"
  if head -c 512 "$path" | grep -Eqi '<!doctype html|<html'; then
    echo "Échec: $filename — page HTML au lieu d'un tableur ($landing)" >&2
    exit 1
  fi
  local actual
  actual="$(sha256sum "$path" | cut -d' ' -f1)"
  echo "$filename SHA-256: $actual"
  if [ "$actual" != "$expected" ]; then
    echo "SHA-256 inattendu pour $filename: $actual != $expected" >&2
    exit 1
  fi
}

download 'oiseaux.xlsx' \
  'https://irpn.drealnpdc.fr/wp-content/uploads/2024/04/LRR_oiseaux_nicheurs_HdF_synthese.xlsx' \
  '72cd2b60ed47120ab08f722bfdd4256d69bdba424722499dc3062a5e0705879a'

download 'papillons.xlsx' \
  'https://irpn.drealnpdc.fr/wp-content/uploads/2024/03/LRR_papillons-de-jour_synthese_mars-1.xlsx' \
  '9cea00c3bd53fcbda1f2cee2fd42312efe0b1fcbf7ddc21e8708c62c643090d7'

download 'mollusques.ods' \
  'https://irpn.drealnpdc.fr/wp-content/uploads/2025/02/LRR_mollusques_HdF_synthese.ods' \
  'bc30243f569fc7e9b1807c8cdc8c653da20458a81e81be1a6768c36a88ae3ee1'

download 'poissons.ods' \
  'https://irpn.drealnpdc.fr/wp-content/uploads/2025/09/LRR_poissons_ecrevisses_eau-douce_HDF.ods' \
  'a1202ece93abf61268bdfcaa1bdda0a83c05ae8f29f0032955323dc2e6d14df0'

download 'orthopteres.xlsx' \
  'http://www.picardie-nature.org/IMG/xlsx/lrr_orthopteres-mantodea_phasmida.xlsx' \
  'ee2263c415105457826952c87e15e36830f4a4640a9e65b71e5209009ffb6e7b'

download 'coccinelles.xlsx' \
  'http://www.picardie-nature.org/IMG/xlsx/lrr_coccinelles_synthese_septembre.xlsx' \
  '6be17093692130b2833e4d54d9e7ec051356c132a6231da6fea567608798f565'

echo "IRPN Hauts-de-France LRR sources téléchargées dans $target_dir"
