#!/usr/bin/env bash
# Télécharge les listes rouges unifiées Grand Est (ODONAT) — SHA-256 fail-closed.
set -euo pipefail

OUT_DIR="${1:?usage: download_odonat_lrr.sh <output-dir>}"
mkdir -p "$OUT_DIR"

BASE='https://www.odonat-grandest.fr/telechargements/Listes_rouges'
LANDING='https://www.grand-est.developpement-durable.gouv.fr/listes-rouges-grand-est-a22124.html'
UA='Mozilla/5.0 (compatible; statuts-especes-fr-pipeline/1.0)'

download() {
  local name="$1" remote="$2" expected="$3"
  local target="$OUT_DIR/$name"
  local url="$BASE/$remote"
  echo "Téléchargement $name…"
  curl --fail --location --retry 3 -A "$UA" "$url" -o "$target"
  if head -c 512 "$target" | grep -Eqi 'Maintenance en cours|<!doctype html|<html'; then
    echo "Échec: $name — page HTML/maintenance ($LANDING / $url)" >&2
    exit 1
  fi
  if ! head -c 2 "$target" | grep -q 'PK'; then
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

download amphibiens-reptiles.xlsx \
  LISTE_ROUGE_AMPHIBIA_REPTILIA.xlsx \
  0c284571af56c70c31b956994fd0b880c62a1088a267bae6a8eb048f2cbb7d40

download mollusques.xlsx \
  LISTE_ROUGE_MOLLUSQUES.xlsx \
  4f87fbaf6a4d9b0541ba73db1a24331df40e41aeae347cdc0cf32441c7512a16

download odonates.xlsx \
  LISTE_ROUGE_ODONATES.xlsx \
  9756dfc768502c78526bfa13cf5d7e4c25fbb36a66e2de2ca166fba754e8604a

download orthopteres.xlsx \
  LISTE_ROUGE_ORTHOPTERES_v1_0.xlsx \
  a7737aa5fd8c8a782e7f5b8e3967912705c4b87bb4daff1a9a6b60313f3bee71

download oiseaux-nicheurs.xlsx \
  LISTE_ROUGE_OISEAUX_NICHEURS_v1.0.xlsx \
  e1ae86e45082c11bba9c7b22392cb8adc7efd10697e01b0eab22ce95b09fb07c

download branchiopodes.xlsx \
  LISTE_ROUGE_BRANCHIOPODES.xlsx \
  0839fe5311c37d1f7557d9890086ac9c83c401f8cfe5362869c836856a50f5e3

download decapodes.xlsx \
  LISTE_ROUGE_DECAPODES.xlsx \
  7405bb352198c20f0103662dbeb2084fa1890d72ff8dac454386a414205deefe

download papillons.xlsx \
  LISTE_ROUGE_PAPILLONS_JOUR.xlsx \
  42ed23a590156e41fb272f429803b4cd2ca13076da6fa2f8dc03592ce2640859

download poissons.xlsx \
  LISTE_ROUGE_POISSONS.xlsx \
  326f5846535a4e12abcbc063a9398650280bb98ed9ff4e048b7705991778d5c4
