#!/usr/bin/env bash
# Télécharge les LRR CVL (PDF) — SHA-256 fail-closed. Hôte ARB parfois lent.
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <target-dir>" >&2
  exit 2
fi

OUT_DIR="$1"
mkdir -p "$OUT_DIR"

UA='Mozilla/5.0 (compatible; statuts-especes-fr-pipeline/1.0)'
landing='https://www.centre-val-de-loire.developpement-durable.gouv.fr/listes-rouges-en-region-centre-val-de-loire-a1451.html'

download_pdf() {
  local name="$1"
  local url="$2"
  local expected="$3"
  local target="$OUT_DIR/$name"
  echo "Téléchargement $name…"
  curl --fail --location --retry 6 --retry-delay 5 --retry-all-errors \
    --connect-timeout 30 --max-time 180 \
    -A "$UA" "$url" -o "$target"
  if [ "$(head -c 4 "$target")" != '%PDF' ]; then
    echo "Échec: $name — signature PDF invalide ($landing)" >&2
    exit 1
  fi
  local actual
  actual="$(sha256sum "$target" | cut -d' ' -f1)"
  echo "OK $name ($(wc -c < "$target") octets) SHA-256: $actual"
  if [ "$actual" != "$expected" ]; then
    echo "SHA-256 inattendu pour $name: $actual != $expected" >&2
    exit 1
  fi
}

download_pdf odonates-2022.pdf \
  'https://www.biodiversite-centrevaldeloire.fr/sites/default/files/content/ressources/pdf/2025-01/LRodonatesRCVL2022-VF2ok.pdf' \
  '61122d57b365267140e6a2307de522e629fdf50b2f87bef5e2c6a792de142b37'

download_pdf papillons-2024.pdf \
  'https://www.biodiversite-centrevaldeloire.fr/sites/default/files/content/ressources/pdf/listes%20rouges/LRR-papillons_2024_vf-4.pdf' \
  '5fb905e75f6a4765b6c7d2bc39fc7f44c051c521858ebf9070c26d27a9f1a333'

download_pdf coleopteres-2025.pdf \
  'https://www.laboratoireecoentomologie.com/wp-content/uploads/2026/02/Chapelin-Viscardi-et-al.-2025.-LRR-CVdL-Gyrins-dytiques-donacies.pdf' \
  'c7bf0ad76a6c502fb99cf387db3768eda9511164aa5a7fb8aa06a1080d5b300a'
