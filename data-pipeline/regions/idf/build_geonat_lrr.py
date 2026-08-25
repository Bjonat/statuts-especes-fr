#!/usr/bin/env python3
"""Listes rouges régionales Île-de-France via export GeoNat'îdF — multi-groupes."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import unicodedata
from collections import defaultdict
from datetime import date
from pathlib import Path

LANDING_URL = "https://www.arb-idf.fr/nos-ressources/publications/"
SOURCE_URL = "https://geonature.arb-idf.fr/geonature/api/media/exports/schedules/Statuts_des_taxons_STyt8fLcp03L11.csv"
GEONAT_LANDING = "https://geonature.arb-idf.fr/table-diffusion-statuts-taxons-franciliens"
PRODUCER = "Agence régionale de la biodiversité Île-de-France / GeoNat'îdF / CSRPN Île-de-France"
EXPECTED_SHA256 = "1466cacc15e65384ed66c67f6266ae6fcd1d27d45fee8367e133f1d23f4b8d62"
REALM_BY_KINGDOM = {"animalia": "fauna", "plantae": "flora"}
VALID_LRR_CATEGORY = re.compile(r"^(?:EX|EW|RE|CR\*?|EN|VU|NT|LC|DD|NE|NA[A-Z]{0,3})$")

SOURCES = [
    {
        "key": "amphibiens",
        "id": "arb-idf-lrr-amphibiens-2023",
        "name": "Liste rouge Amphibiens Île-de-France",
        "version": "ARB 2023 via GeoNat'îdF",
        "year": 2023,
        "realm": "fauna",
        "match": lambda row: (row.get("grp2inpn") or "") == "Amphibiens",
    },
    {
        "key": "reptiles",
        "id": "arb-idf-lrr-reptiles-2023",
        "name": "Liste rouge Reptiles Île-de-France",
        "version": "ARB 2023 via GeoNat'îdF",
        "year": 2023,
        "realm": "fauna",
        "match": lambda row: (row.get("grp2inpn") or "") == "Reptiles",
    },
    {
        "key": "oiseaux",
        "id": "arb-idf-lrr-oiseaux-nicheurs-2018",
        "name": "Liste rouge Oiseaux nicheurs Île-de-France",
        "version": "ARB 2018 via GeoNat'îdF",
        "year": 2018,
        "realm": "fauna",
        "match": lambda row: (row.get("grp2inpn") or "") == "Oiseaux",
    },
    {
        "key": "chiropteres",
        "id": "arb-idf-lrr-chiropteres-2017",
        "name": "Liste rouge Chiroptères Île-de-France",
        "version": "ARB 2017 via GeoNat'îdF",
        "year": 2017,
        "realm": "fauna",
        "match": lambda row: (row.get("grp3inpn") or "") == "Chiroptères",
    },
    {
        "key": "odonates",
        "id": "arb-idf-lrr-odonates-2014",
        "name": "Liste rouge Odonates Île-de-France",
        "version": "Natureparif/ARB 2014 via GeoNat'îdF",
        "year": 2014,
        "realm": "fauna",
        "match": lambda row: (row.get("grp3inpn") or "") == "Odonates",
    },
    {
        "key": "rhopaloceres",
        "id": "arb-idf-lrr-rhopaloceres-zygenes-2016",
        "name": "Liste rouge Rhopalocères et zygènes Île-de-France",
        "version": "Natureparif/ARB 2016 via GeoNat'îdF",
        "year": 2016,
        "realm": "fauna",
        "match": lambda row: (row.get("grp3inpn") or "") == "Lépidoptères",
    },
    {
        "key": "orthopteroides",
        "id": "arb-idf-lrr-orthopteroides-2018",
        "name": "Liste rouge Orthoptéroïdes Île-de-France",
        "version": "ARB 2018 (fascicule 2022) via GeoNat'îdF",
        "year": 2018,
        "realm": "fauna",
        "match": lambda row: (row.get("grp3inpn") or "") == "Orthoptères"
        or (row.get("ordre") or "") in {"Mantodea", "Phasmida"},
    },
    {
        "key": "flore",
        "id": "arb-idf-lrr-flore-vasculaire-2014",
        "name": "Liste rouge Flore vasculaire Île-de-France",
        "version": "CBNBP/ARB 2014 via GeoNat'îdF",
        "year": 2014,
        "realm": "flora",
        "match": lambda row: (row.get("regne") or "").casefold() == "plantae",
    },
]


def normalize(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = text.replace("×", "x")
    return re.sub(r"\s+", " ", text).strip().casefold()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_rows(path: Path):
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle, delimiter=";"))


def taxref_lookup(path: Path, wanted_codes: set[int], wanted_names: set[str]):
    by_cd_nom: dict[int, tuple[int, str | None]] = {}
    by_name = defaultdict(set)
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        for row in reader:
            cd_nom_raw = str(row.get("CD_NOM") or "").strip()
            cd_ref_raw = str(row.get("CD_REF") or "").strip()
            if not cd_nom_raw.isdigit() or not cd_ref_raw.isdigit():
                continue
            realm = REALM_BY_KINGDOM.get(normalize(row.get("REGNE")))
            cd_nom = int(cd_nom_raw)
            cd_ref = int(cd_ref_raw)
            if cd_nom in wanted_codes:
                by_cd_nom[cd_nom] = (cd_ref, realm)
            if realm and wanted_names:
                for field in ("LB_NOM", "NOM_COMPLET", "NOM_VALIDE"):
                    label = row.get(field)
                    if label and normalize(label) in wanted_names:
                        by_name[normalize(label)].add((cd_ref, realm))
    return by_cd_nom, by_name


def resolve(row, by_cd_nom, by_name):
    code = str(row.get("cd_nom") or "").strip()
    if code.isdigit() and int(code) in by_cd_nom:
        cd_ref, realm = by_cd_nom[int(code)]
        if realm:
            return cd_ref, realm, "cd_nom"
        return None, None, "excluded_realm"
    for field in ("nomvalide", "lbnom"):
        label = row.get(field)
        if not label:
            continue
        candidates = by_name.get(normalize(label), set())
        if len(candidates) == 1:
            cd_ref, realm = next(iter(candidates))
            return cd_ref, realm, "name"
        if len(candidates) > 1:
            return None, None, "ambiguous"
    return None, None, "unmatched"


def filter_rows(rows, source):
    selected = []
    for row in rows:
        category = str(row.get("lrr") or "").strip().upper()
        if not VALID_LRR_CATEGORY.fullmatch(category):
            continue
        if not source["match"](row):
            continue
        selected.append({**row, "_category": category})
    return selected


def build_package(source, rows, source_path: Path, by_cd_nom, by_name, checked_at: str):
    stats = {
        "rows": len(rows),
        "matched": 0,
        "cd_nom": 0,
        "name": 0,
        "excluded_realm": 0,
        "unmatched": 0,
        "ambiguous": 0,
        "unexpectedRealm": 0,
        "unresolvedSample": [],
        "values": {},
    }
    values = defaultdict(int)
    statuses = []
    seen = set()
    expected_realm = source["realm"]

    for row in rows:
        cd_ref, realm, mode = resolve(row, by_cd_nom, by_name)
        if cd_ref is None or realm is None:
            stats[mode] += 1
            if len(stats["unresolvedSample"]) < 30:
                stats["unresolvedSample"].append({
                    "code": row.get("cd_nom"),
                    "taxon": row.get("nomvalide") or row.get("lbnom"),
                    "category": row["_category"],
                    "reason": mode,
                })
            continue
        if realm != expected_realm:
            stats["unexpectedRealm"] += 1
            continue
        stats["matched"] += 1
        stats[mode] += 1
        values[row["_category"]] += 1
        key = (cd_ref, row["_category"])
        if key in seen:
            continue
        seen.add(key)
        statuses.append({
            "cdRef": cd_ref,
            "region": "IDF",
            "category": "red_list_regional",
            "label": "Liste rouge régionale",
            "value": row["_category"],
            "sourceId": source["id"],
            "scope": "regional",
        })

    candidates = stats["matched"] + stats["unmatched"] + stats["ambiguous"]
    stats["matchRate"] = round(stats["matched"] / candidates, 6) if candidates else 1.0
    stats["values"] = dict(sorted(values.items()))
    covered_refs = sorted({status["cdRef"] for status in statuses})
    return {
        "schemaVersion": 1,
        "source": {
            "id": source["id"],
            "name": source["name"],
            "producer": PRODUCER,
            "version": source["version"],
            "publicationYear": source["year"],
            "official": True,
            "checkedAt": checked_at,
            "sha256": sha256(source_path),
            "landingPage": LANDING_URL,
            "sourceUrl": SOURCE_URL,
            "mirrorLandingPage": GEONAT_LANDING,
        },
        "replaces": [
            {"region": "IDF", "category": "red_list_regional", "realm": expected_realm, "cdRefs": covered_refs},
        ],
        "statuses": sorted(statuses, key=lambda status: (status["cdRef"], status["value"])),
        "diagnostics": stats,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--taxref", required=True)
    parser.add_argument("--source", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--checked-at", default=date.today().isoformat())
    parser.add_argument("--min-match-rate", type=float, default=0.97)
    args = parser.parse_args()

    source_path = Path(args.source)
    digest = sha256(source_path)
    if digest != EXPECTED_SHA256:
        raise SystemExit(f"SHA-256 GeoNat'îdF inattendu: {digest}")

    rows = read_rows(source_path)
    parsed = {source["key"]: filter_rows(rows, source) for source in SOURCES}
    codes: set[int] = set()
    names: set[str] = set()
    for selected in parsed.values():
        for row in selected:
            code = str(row.get("cd_nom") or "").strip()
            if code.isdigit():
                codes.add(int(code))
            for field in ("nomvalide", "lbnom"):
                if row.get(field):
                    names.add(normalize(row[field]))

    by_cd_nom, by_name = taxref_lookup(Path(args.taxref), codes, names)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    total = 0
    for source in SOURCES:
        package = build_package(source, parsed[source["key"]], source_path, by_cd_nom, by_name, args.checked_at)
        diagnostics = package["diagnostics"]
        print(json.dumps({"source": source["id"], **diagnostics}, ensure_ascii=False, indent=2))
        if diagnostics["matchRate"] < args.min_match_rate:
            raise SystemExit(
                f"{source['id']}: taux de raccord TAXREF insuffisant "
                f"{diagnostics['matchRate']:.2%} < {args.min_match_rate:.2%}"
            )
        if not package["statuses"]:
            raise SystemExit(f"{source['id']}: aucun statut produit")
        output = out_dir / f"idf-lrr-{source['key']}.json"
        output.write_text(json.dumps(package, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        total += len(package["statuses"])
        print(f"Paquet écrit: {output} - {len(package['statuses'])} statuts")
    print(f"Île-de-France LRR: {len(SOURCES)} paquets, {total} statuts")


if __name__ == "__main__":
    main()
