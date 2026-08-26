#!/usr/bin/env bash
# Télécharge les LRR CVL (PDF) avec retries agressifs — hôte ARB parfois lent.
set -euo pipefail

OUT_DIR="${1:?usage: download_lrr.sh <output-dir>}"
mkdir -p "$OUT_DIR"

UA='Mozilla/5.0 (compatible; statuts-especes-fr-pipeline/1.0)'

download_pdf() {
  local name="$1" url="$2"
  local target="$OUT_DIR/$name"
  echo "Téléchargement $name…"
  curl --fail --location --retry 6 --retry-delay 5 --retry-all-errors \
    --connect-timeout 30 --max-time 180 \
    -A "$UA" "$url" -o "$target"
  if [ "$(head -c 4 "$target")" != '%PDF' ]; then
    echo "Échec: $name — signature PDF invalide" >&2
    exit 1
  fi
  echo "OK $name ($(wc -c < "$target") octets) SHA-256: $(sha256sum "$target" | cut -d' ' -f1)"
}

download_pdf odonates-2022.pdf \
  'https://www.biodiversite-centrevaldeloire.fr/sites/default/files/content/ressources/pdf/2025-01/LRodonatesRCVL2022-VF2ok.pdf'

download_pdf papillons-2024.pdf \
  'https://www.biodiversite-centrevaldeloire.fr/sites/default/files/content/ressources/pdf/listes%20rouges/LRR-papillons_2024_vf-4.pdf'

download_pdf coleopteres-2025.pdf \
  'https://www.laboratoireecoentomologie.com/wp-content/uploads/2026/02/Chapelin-Viscardi-et-al.-2025.-LRR-CVdL-Gyrins-dytiques-donacies.pdf'
