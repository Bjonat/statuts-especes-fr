#!/usr/bin/env bash
# Télécharge les LRR Normandie unifiées ANBDD — SHA-256 fail-closed.
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <target-dir>" >&2
  exit 2
fi

target_dir="$1"
landing='https://www.normandie.developpement-durable.gouv.fr/les-listes-rouges-dans-le-monde-et-en-normandie-a6663.html'
mkdir -p "$target_dir"

UA='Mozilla/5.0 (compatible; statuts-especes-fr-pipeline/1.0)'

download() {
  local filename="$1"
  local url="$2"
  local expected="$3"
  local path="$target_dir/$filename"
  curl --fail --location --retry 4 --retry-all-errors --connect-timeout 30 --max-time 180 \
    -A "$UA" --silent --show-error "$url" -o "$path"
  if [ "$(head -c 2 "$path")" != 'PK' ]; then
    echo "Échec: $filename — fichier non XLSX ($landing)" >&2
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

download 'oiseaux-2024.xlsx' \
  'https://www.anbdd.fr/wp-content/uploads/2025/01/LR_Oiseaux_Nicheurs-_Normandie_2024_telechargement.xlsx' \
  'ed7b70e2bb8b87a61779e5d8800f37ab0142b2af6adc60939bb3dcc3995cc319'

download 'rhopaloceres.xlsx' \
  'https://www.anbdd.fr/wp-content/uploads/2022/05/LR_RHOPALO_tableau-de-synthese_ANBDD.xlsx' \
  '975e63b1057826be3d3edeb36c222d7ff0c26663322226ee010fe5c4dcae6bbe'

download 'mammiferes-2022.xlsx' \
  'https://www.anbdd.fr/wp-content/uploads/2022/11/Tableau_Liste_Rouge_Mammiferes_Normandie_2022-VF.xlsx' \
  '9771d796d403784f240faff836cd1e2308f4014b69f3d90145911aa6de5a04ef'

download 'orthopteres-2022.xlsx' \
  'https://www.anbdd.fr/wp-content/uploads/2023/05/Liste_Rouge_ORTHO_Normandie_ANBDD_2022.xlsx' \
  '362e053c0d38a9fa7fd5278ca64824d97b6aac2d19a6137253e65011562eea06'

download 'amphibiens-2022.xlsx' \
  'https://www.anbdd.fr/wp-content/uploads/2022/09/Tableau-LR-Amphibiens-Normandie-2022.xlsx' \
  '5db2c37e826fdf2d44a9b67f75d0123d06b970ce9d23c1cb8b06a9f064f2bd1d'

download 'odonates.xlsx' \
  'https://www.anbdd.fr/wp-content/uploads/2022/09/LR_ODONATES_tableau-de-synthese_pour_ANBDD_VF.xlsx' \
  '78563f972a4a385a36d527194224b545d756fd7da4ceba449ef9ec21d7e585fa'

# Page WordPress ANBDD qui sert le XLSX reptiles (redirige vers le binaire).
download 'reptiles-2022.xlsx' \
  'https://www.anbdd.fr/publication/liste-rouge-des-reptiles-de-normandie/tableau-lr-reptiles-normandie-2022/' \
  'e9f718febb0366d32137c8e70956a28bb6d714c3891bfac1dd140b7d26008287'
