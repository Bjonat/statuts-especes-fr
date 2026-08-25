#!/usr/bin/env bash
# Télécharge les tableurs ZNIEFF + LRR PACA (SHA-256 fail-closed).
set -euo pipefail

OUT_DIR="${1:?usage: download_sources.sh <output-dir>}"
mkdir -p "$OUT_DIR"

UA='Mozilla/5.0 (compatible; statuts-especes-fr-pipeline/1.0)'
LANDING='https://www.paca.developpement-durable.gouv.fr/'

download() {
  local name="$1" url="$2" expected="$3" kind="$4"
  local target="$OUT_DIR/$name"
  echo "Téléchargement $name…"
  curl --fail --location --retry 3 -A "$UA" "$url" -o "$target"
  if head -c 512 "$target" | grep -Eqi 'Maintenance en cours|<!doctype html|<html'; then
    echo "Échec: $name — page HTML/maintenance ($LANDING)" >&2
    exit 1
  fi
  case "$kind" in
    xlsx)
      if ! head -c 2 "$target" | grep -q 'PK'; then
        echo "Échec: $name — signature XLSX invalide" >&2
        exit 1
      fi
      ;;
    xls)
      local magic
      magic="$(head -c 8 "$target" | xxd -p)"
      if [[ "$magic" != 'd0cf11e0a1b11ae1' ]]; then
        echo "Échec: $name — signature XLS invalide ($magic)" >&2
        exit 1
      fi
      ;;
  esac
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

download znieff-fauna-2024.xlsx \
  'https://www.paca.developpement-durable.gouv.fr/IMG/xlsx/znieff_faune_janv-2024.xlsx' \
  'd38ffb58944a998ac937146fcdeed606b0e40cd178cdc2bf467726f81a672375' xlsx

download znieff-flora-2016.xls \
  'https://www.paca.developpement-durable.gouv.fr/IMG/xls/znieff_flore_2016.xls' \
  '1c39c39f36ca97659e6b534d7e5a7c385ea3e9e470679c6d360f6e3cc8d6204c' xls

download lrr-oiseaux-2020.xlsx \
  'https://www.paca.developpement-durable.gouv.fr/IMG/xlsx/liste_rouge_avifaune_paca_csrpn_janv2020.xlsx' \
  'c63509fe1ac9a0c444c6771bc5913d4f0749a8adca7f52985859faf155ea8369' xlsx

download lrr-odonates-2017.xlsx \
  'https://www.paca.developpement-durable.gouv.fr/IMG/xlsx/lr_paca_odonates_2017_web.xlsx' \
  'bf80fe46a613e6a1002802b8e919526669ee0bce01e69a901d8264411bf00fc6' xlsx

download lrr-papillons-2024.xlsx \
  'https://www.paca.developpement-durable.gouv.fr/IMG/xlsx/tableau_simplifie_lrr-pap_2024.xlsx' \
  '937ac5296de2dac5118013c63b22fe5cc4564e2520a3d4506a0ece0d2142e973' xlsx

download lrr-flore-2015.xlsx \
  'https://www.paca.developpement-durable.gouv.fr/IMG/xlsx/LR_PACA_Flore_2015_web.xlsx' \
  '99b44c10f572521e83999543abf14a9c38c75d9a56a4c2540c1d6dc72c9a440a' xlsx

download lrr-herpeto-2016.xlsx \
  'https://www.paca.developpement-durable.gouv.fr/IMG/xlsx/lrr_paca_reptiles_amphibiens_2016.xlsx' \
  'fe81c5f6a4e3708838e8bb85e15df389e02970e6ca63c86201a9b9d556790ba9' xlsx

download lrr-orthopteres-2018.xlsx \
  'https://www.paca.developpement-durable.gouv.fr/IMG/xlsx/lr_paca_orthop_2018_web.xlsx' \
  '5d07840fadce9dab531f9317ead43ad0b7f3afb1e2c702ae48583d32687364ad' xlsx
