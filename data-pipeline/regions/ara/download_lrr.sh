#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <target-dir>" >&2
  exit 2
fi

target_dir="$1"
mkdir -p "$target_dir"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
acquisition_cli="$here/../../acquisition-cli.mjs"

# Défauts = registre `dreal-ara-lrr-vertebres-2024` / ressource ODS. Substitutions : tests uniquement.
ARA_LRR_OISEAUX_MAMM_URL="${ARA_LRR_OISEAUX_MAMM_URL:-https://www.auvergne-rhone-alpes.developpement-durable.gouv.fr/IMG/ods/2024-lrr-oisx_mamm_web-dreal.ods}"
ARA_LRR_OISEAUX_MAMM_SHA256="${ARA_LRR_OISEAUX_MAMM_SHA256:-3308ae670319c729f248d444ddfb08b621a02cbc52610c3e4ad2a548eefacd7b}"
ARA_LRR_CURL_RETRY="${ARA_LRR_CURL_RETRY:-4}"

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

inspect_received_ods() {
  local file="$1"
  local head
  head="$(head -c 512 "$file" || true)"
  if printf '%s' "$head" | grep -qiE '<!doctype html|<html'; then
    type_ok=false
    detected_kind=html
    if grep -aqi 'maintenance en cours' "$file"; then
      reason_code=maintenance_page
    else
      reason_code=unexpected_type
    fi
    return
  fi
  if ! unzip -tqq "$file" >/dev/null 2>&1; then
    type_ok=false
    detected_kind=unknown
    reason_code=unexpected_type
    return
  fi
  local mime
  mime="$(unzip -p "$file" mimetype 2>/dev/null | tr -d '\r\n' || true)"
  if [ "$mime" = "application/vnd.oasis.opendocument.spreadsheet" ]; then
    type_ok=true
    detected_kind=ods
    reason_code=
    return
  fi
  type_ok=false
  detected_kind=zip
  reason_code=unexpected_type
}

download_oiseaux_mammiferes_ods() {
  local filename='oiseaux-mammiferes.ods'
  local url="$ARA_LRR_OISEAUX_MAMM_URL"
  local expected="$ARA_LRR_OISEAUX_MAMM_SHA256"
  local target="$target_dir/$filename"
  local temp
  temp="$(mktemp "$target_dir/.${filename}.XXXXXX")"

  cleanup_temp() {
    rm -f "$temp"
  }
  trap cleanup_temp EXIT

  local fetch_ok=true
  local reason_code=network_error
  local type_ok=false
  local detected_kind=
  local actual_sha=

  if ! curl --fail --location --retry "$ARA_LRR_CURL_RETRY" --retry-all-errors --connect-timeout 30 --max-time 180 \
    --silent --show-error "$url" -o "$temp"; then
    fetch_ok=false
  elif [ ! -s "$temp" ]; then
    fetch_ok=false
    reason_code=empty_body
  fi

  local cli_args=(
    --fetch-ok "$fetch_ok"
    --expected-kind ods
    --expected-sha256 "$expected"
    --sha-policy pinned
  )

  if [ "$fetch_ok" = true ]; then
    actual_sha="$(sha256sum "$temp" | cut -d' ' -f1)"
    inspect_received_ods "$temp"
    cli_args+=(--type-ok "$type_ok" --detected-kind "$detected_kind" --actual-sha256 "$actual_sha")
  fi
  if [ -n "${reason_code:-}" ]; then
    cli_args+=(--reason-code "$reason_code")
  fi

  local message
  if message="$(node "$acquisition_cli" "${cli_args[@]}")"; then
    echo "$message"
    mv -f "$temp" "$target"
    trap - EXIT
    echo "$filename SHA-256: $actual_sha"
    return 0
  fi

  echo "$message" >&2
  exit 1
}

if [ "${ARA_LRR_SKIP_XLSX:-0}" != 1 ]; then
  download 'vertebres-amph-rept-chiro.xlsx' \
    'https://www.biodiversite-auvergne-rhone-alpes.fr/wp-content/uploads/2023/03/LR_AURA2024_Chauves-souris_reptiles_amphibiens.xlsx' \
    'ae49929b0a3d226fa392850c4fa95d928d5f374f179a01fd9ea5f71feac1a581'
fi

download_oiseaux_mammiferes_ods

echo "ARA LRR sources téléchargées dans $target_dir"
