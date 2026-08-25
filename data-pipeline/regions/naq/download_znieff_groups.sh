#!/usr/bin/env bash
# Télécharge les listes ZNIEFF NAQ hors flore vasculaire (déjà gérée à part).
set -euo pipefail

OUT_DIR="${1:?usage: download_znieff_groups.sh <output-dir>}"
mkdir -p "$OUT_DIR"

UA='Mozilla/5.0 (compatible; statuts-especes-fr-pipeline/1.0)'
LANDING='https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/les-listes-neo-aquitaines-a11234.html'

download() {
  local name="$1" url="$2" expected="$3"
  local target="$OUT_DIR/$name"
  echo "Téléchargement $name…"
  curl --fail --location --retry 3 -A "$UA" "$url" -o "$target"
  if ! head -c 2 "$target" | grep -q 'PK'; then
    if head -c 512 "$target" | grep -Eqi 'Maintenance en cours|<!doctype html|<html'; then
      echo "Échec: $name — page HTML/maintenance à la place du XLSX ($LANDING)" >&2
      exit 1
    fi
    echo "Échec: $name — signature XLSX invalide" >&2
    exit 1
  fi
  local actual
  actual="$(sha256sum "$target" | awk '{print $1}')"
  if [[ "$actual" != "$expected" ]]; then
    echo "Échec: $name — SHA-256 inattendu" >&2
    echo "  attendu: $expected" >&2
    echo "  obtenu : $actual" >&2
    exit 1
  fi
  echo "OK $name SHA-256: $actual"
}

download characees.xlsx \
  'https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/IMG/xlsx/cbn_2023-characees_determinantes_znieff_de_nouvelle-aquitaine.xlsx' \
  '0704cbff931ab70d42e7d738288884dd1ca098ec8d19787d2df013a4e26bcfc1'

download oiseaux-nicheurs.xlsx \
  'https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/IMG/xlsx/20230316_restitutiontableaued_oiseauxnich_synth.xlsx' \
  '93811416ef29b5c34d79a6e7d1cccdd32532a1f13408c238b6b125afe8460659'

download araignees.xlsx \
  'https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/IMG/xlsx/listedeteraraigneesna.xlsx' \
  '5ad2961656e8567e3c0918ae9566895002f86713df5c7c22e8c507ae679a672d'

download amphibiens.xlsx \
  'https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/IMG/xlsx/202409_listeespecesdeterminantesamphibiensnouvelle-aquitaine.xlsx' \
  '9f2e117eb0dd522c0a5efa64dc433d78a6086dd4e3cd16a363d0f62ea1f4b136'

download reptiles.xlsx \
  'https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/IMG/xlsx/202409_listeespecesdeterminantesreptilesnouvelle-aquitaine.xlsx' \
  '1f5511a53ba361a5a69ec79ab3788fce0be2254e427d64c9d6a9ac1a8f070529'

download mollusques.xlsx \
  'https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/IMG/xlsx/tab_mollusques.xlsx' \
  'ed3ea1b162406fe67ca1132a9fb1c0bdcb0a1e34e9019d96f0aa5d5c0ee17b94'

download orthopteres.xlsx \
  'https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/IMG/xlsx/bonifait_duhaze-2026_orthopteres-determinants-znieff-na.xlsx' \
  '9fdcea3444ff414d2bc12b1654dd33a1d6d8041b3766091cc031445727323388'

download oiseaux-marins.xlsx \
  'https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/IMG/xlsx/tableau_dz_oiseaux_marins.xlsx' \
  'aa139c515c210948e7f2acfe0a56f09f8782075cf70bdf3efbbf0aa65bcd5f64'
