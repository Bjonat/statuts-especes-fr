#!/usr/bin/env python3
"""ZNIEFF flore / bryophytes Hauts-de-France via catalogues Digitale CBNHDF."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import unicodedata
from collections import Counter
from datetime import date
from pathlib import Path

from openpyxl import load_workbook

LANDING_URL = "https://www.cbnhdf.fr/je-telecharge"
DREAL_LANDING = (
    "https://www.hauts-de-france.developpement-durable.gouv.fr/"
    "les-zones-naturelles-d-interet-ecologique-faunistique-et-a11760.html"
)
PRODUCER = "Conservatoire botanique national des Hauts-de-France / CSRPN"
TERRITORY = "HDF"
SCOPE_LABEL = "Hauts-de-France"
VALUE_BY_CODE = {
    "Oui": "Oui",
    "(Oui)": "Oui (disparu/présumé)",
    "pp": "Oui (pro parte)",
}
REALM_BY_KINGDOM = {"animalia": "fauna", "plantae": "flora"}
MAX_VALUE_LENGTH = 80

SOURCES = [
    {
        "key": "flora",
        "filename": "digitale-flora.xlsx",
        "sheet": "REG-DIGITALE-BS-BIF-FVF-PV_4.0",
        "id": "cbnhdf-digitale-znieff-hdf-flora-2026-03-31",
        "name": "Espèces déterminantes ZNIEFF flore Hauts-de-France",
        "version": "Digitale BS-BIF-FVF-PV 4.0 (2026-03-31)",
        "sha256": "71ae71b770f7b3911349e501caaaa65ac7dba8172d12b96ef4b90d5056995c95",
        "sourceUrl": "https://www.cbnhdf.fr/system/files/2026-05/DIGITALE_BS-BIF-FVF_PV_4.0_20260331.xlsx",
        "min_statuses": 800,
    },
    {
        "key": "bryophytes",
        "filename": "digitale-bryophytes.xlsx",
        "sheet": "REG-DIGITALE-BS-BIF-FVF-MH_4.0",
        "id": "cbnhdf-digitale-znieff-hdf-bryophytes-2026-03-31",
        "name": "Espèces déterminantes ZNIEFF bryophytes Hauts-de-France",
        "version": "Digitale BS-BIF-FVF-MH 4.0 (2026-03-31)",
        "sha256": "810cc4cc9458721710a826d009884698fcf9b06d059af41153197c12470cb3bc",
        "sourceUrl": "https://www.cbnhdf.fr/system/files/2026-05/DIGITALE_BS-BIF-FVF_MH_4.0_20260331.xlsx",
        "min_statuses": 250,
    },
]


def clean(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "").replace("\xa0", " ")).strip()


def normalize(value: object) -> str:
    text = unicodedata.normalize("NFKD", clean(value))
    text = "".join(char for char in text if not unicodedata.combining(char))
    return text.casefold()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def as_int(value: object) -> int | None:
    text = clean(value)
    if not text:
        return None
    try:
        return int(float(text))
    except ValueError:
        return None


def read_rows(path: Path, sheet_name: str) -> list[dict[str, object]]:
    workbook = load_workbook(path, read_only=True, data_only=True)
    if sheet_name not in workbook.sheetnames:
        workbook.close()
        raise SystemExit(f"Feuille absente: {sheet_name}")
    worksheet = workbook[sheet_name]
    iterator = worksheet.iter_rows(values_only=True)
    header = [clean(value) for value in next(iterator)]
    required = {"CH_Territoire", "CH_DetermZNIEFF", "CD_REF_TAXREF"}
    if not required.issubset(set(header)):
        workbook.close()
        raise SystemExit(f"Colonnes manquantes: {sorted(required - set(header))}")
    rows = []
    for values in iterator:
        row = {header[index]: values[index] if index < len(values) else None for index in range(len(header))}
        rows.append(row)
    workbook.close()
    return rows


def taxref_lookup(path: Path, wanted_codes: set[int]):
    by_cd_ref: dict[int, str | None] = {}
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        for row in reader:
            cd_ref_raw = clean(row.get("CD_REF"))
            if not cd_ref_raw.isdigit():
                continue
            cd_ref = int(cd_ref_raw)
            if cd_ref not in wanted_codes:
                continue
            realm = REALM_BY_KINGDOM.get(normalize(row.get("REGNE")))
            by_cd_ref[cd_ref] = realm
    return by_cd_ref


def build_package(source, taxref_path: Path, input_dir: Path, checked_at: str):
    source_path = input_dir / source["filename"]
    digest = sha256(source_path)
    if digest != source["sha256"]:
        raise SystemExit(f"SHA-256 Digitale inattendu: {digest}")

    rows = read_rows(source_path, source["sheet"])
    selected = []
    raw_codes = Counter()
    for row in rows:
        if clean(row.get("CH_Territoire")) != TERRITORY:
            continue
        code = clean(row.get("CH_DetermZNIEFF"))
        raw_codes[code or "<vide>"] += 1
        value = VALUE_BY_CODE.get(code)
        if not value or len(value) > MAX_VALUE_LENGTH:
            continue
        cd_ref = as_int(row.get("CD_REF_TAXREF"))
        if cd_ref is None:
            continue
        selected.append(
            {
                "cd_ref": cd_ref,
                "value": value,
                "name": clean(row.get("CH_NomCompletTAXREF") or row.get("CH_NomComp")),
            }
        )

    by_cd_ref = taxref_lookup(taxref_path, {row["cd_ref"] for row in selected})
    stats = Counter()
    values = Counter()
    statuses = []
    seen = set()
    unresolved = []
    for row in selected:
        realm = by_cd_ref.get(row["cd_ref"])
        if realm is None:
            stats["unmatched"] += 1
            if len(unresolved) < 40:
                unresolved.append({"cd_ref": row["cd_ref"], "taxon": row["name"], "reason": "unmatched"})
            continue
        if realm != "flora":
            stats["excluded_realm"] += 1
            continue
        stats["matched"] += 1
        values[row["value"]] += 1
        key = (row["cd_ref"], row["value"])
        if key in seen:
            continue
        seen.add(key)
        statuses.append(
            {
                "cdRef": row["cd_ref"],
                "region": "HDF",
                "category": "znieff",
                "label": "Déterminante ZNIEFF",
                "value": row["value"],
                "sourceId": source["id"],
                "scope": "partial",
                "scopeLabel": SCOPE_LABEL,
            }
        )

    candidates = stats["matched"] + stats["unmatched"]
    match_rate = stats["matched"] / candidates if candidates else 1.0
    covered_refs = sorted({status["cdRef"] for status in statuses})
    return {
        "schemaVersion": 1,
        "source": {
            "id": source["id"],
            "name": source["name"],
            "producer": PRODUCER,
            "version": source["version"],
            "publicationYear": 2026,
            "official": True,
            "checkedAt": checked_at,
            "sha256": digest,
            "landingPage": LANDING_URL,
            "sourceUrl": source["sourceUrl"],
            "mirrorLandingPage": DREAL_LANDING,
        },
        "replaces": [
            {"region": "HDF", "category": "znieff", "realm": "flora", "cdRefs": covered_refs},
        ],
        "statuses": sorted(statuses, key=lambda status: (status["cdRef"], status["value"])),
        "diagnostics": {
            **dict(stats),
            "matchRate": round(match_rate, 6),
            "rawDetermValues": dict(sorted(raw_codes.items())),
            "values": dict(sorted(values.items())),
            "unresolvedSample": unresolved,
        },
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--taxref", required=True)
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--checked-at", default=date.today().isoformat())
    parser.add_argument("--min-match-rate", type=float, default=0.97)
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    total = 0
    for source in SOURCES:
        package = build_package(source, Path(args.taxref), Path(args.input_dir), args.checked_at)
        diagnostics = package["diagnostics"]
        print(json.dumps({"source": source["id"], **diagnostics}, ensure_ascii=False, indent=2))
        if diagnostics["matchRate"] < args.min_match_rate:
            raise SystemExit(f"{source['id']}: raccord insuffisant {diagnostics['matchRate']:.2%}")
        if len(package["statuses"]) < source["min_statuses"]:
            raise SystemExit(
                f"{source['id']}: volume trop faible {len(package['statuses'])} < {source['min_statuses']}"
            )
        output = out_dir / f"hdf-znieff-{source['key']}.json"
        output.write_text(json.dumps(package, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        total += len(package["statuses"])
        print(f"Paquet écrit: {output} - {len(package['statuses'])} statuts")
    print(f"HDF Digitale ZNIEFF: {len(SOURCES)} paquets, {total} statuts")


if __name__ == "__main__":
    main()
