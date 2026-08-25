#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

REALM_BY_KINGDOM = {"animalia": "fauna", "plantae": "flora"}


def normalize(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(char for char in text if not unicodedata.combining(char))
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


def wanted(rows):
    codes = set()
    names = set()
    relevant = []
    for row in rows:
        zdet = str(row.get("zdet") or "").strip()
        condition = str(row.get("cond_zdet") or "").strip()
        if not zdet and not condition:
            continue
        relevant.append(row)
        code = str(row.get("cd_nom") or "").strip()
        if code.isdigit():
            codes.add(int(code))
        for field in ("nomvalide", "lbnom"):
            if row.get(field):
                names.add(normalize(row[field]))
    return relevant, codes, names


def taxref_lookup(path: Path, wanted_codes: set[int], wanted_names: set[str]):
    by_cd_nom = {}
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
            if realm:
                for field in ("LB_NOM", "NOM_COMPLET", "NOM_VALIDE"):
                    label = row.get(field)
                    key = normalize(label)
                    if label and key in wanted_names:
                        by_name[key].add((cd_ref, realm))
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


def build_package(taxref_path: Path, source_path: Path, checked_at: str):
    rows = read_rows(source_path)
    relevant, codes, names = wanted(rows)
    by_cd_nom, by_name = taxref_lookup(taxref_path, codes, names)

    stats = Counter()
    stats["rows_source"] = len(rows)
    stats["rows_znieff"] = len(relevant)
    zdet_values = Counter()
    statuses = []
    seen = set()
    unresolved = []

    for row in relevant:
        zdet_raw = str(row.get("zdet") or "").strip()
        condition = str(row.get("cond_zdet") or "").strip()
        zdet_values[zdet_raw or "<condition-only>"] += 1
        cd_ref, realm, mode = resolve(row, by_cd_nom, by_name)
        if cd_ref is None or realm is None:
            stats[mode] += 1
            if len(unresolved) < 50:
                unresolved.append({
                    "cd_nom": row.get("cd_nom"),
                    "taxon": row.get("nomvalide") or row.get("lbnom"),
                    "zdet": zdet_raw,
                    "reason": mode,
                })
            continue
        stats["matched"] += 1
        stats[mode] += 1
        stats[realm] += 1

        key = (cd_ref, realm)
        if key in seen:
            continue
        seen.add(key)
        value = "Oui sous condition" if condition or "condition" in normalize(zdet_raw) else "Oui"
        statuses.append({
            "cdRef": cd_ref,
            "region": "IDF",
            "category": "znieff",
            "label": "Déterminante ZNIEFF",
            "value": value,
            "sourceId": "arb-idf-geonat-statuts-znieff-2026",
            "scope": "regional",
            "_realm": realm,
        })

    candidates = stats["matched"] + stats["unmatched"] + stats["ambiguous"]
    match_rate = stats["matched"] / candidates if candidates else 1.0
    replacements = []
    for realm in ("flora", "fauna"):
        refs = sorted({status["cdRef"] for status in statuses if status["_realm"] == realm})
        if refs:
            replacements.append({
                "region": "IDF",
                "category": "znieff",
                "realm": realm,
                "cdRefs": refs,
            })
    public_statuses = [
        {key: value for key, value in status.items() if key != "_realm"}
        for status in statuses
    ]
    diagnostics = {
        **dict(stats),
        "matchRate": round(match_rate, 6),
        "zdetValues": dict(sorted(zdet_values.items())),
        "unresolvedSample": unresolved,
    }
    return {
        "schemaVersion": 1,
        "source": {
            "id": "arb-idf-geonat-statuts-znieff-2026",
            "name": "Espèces déterminantes ZNIEFF Île-de-France",
            "producer": "Agence régionale de la biodiversité Île-de-France / GeoNat'îdF / CSRPN Île-de-France",
            "version": "export GeoNat'îdF vérifié 2026-08-21",
            "publicationYear": 2026,
            "official": True,
            "checkedAt": checked_at,
            "sha256": sha256(source_path),
        },
        "replaces": replacements,
        "statuses": sorted(public_statuses, key=lambda status: (status["cdRef"], status["value"])),
        "diagnostics": diagnostics,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--taxref", required=True)
    parser.add_argument("--source", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--checked-at", default=date.today().isoformat())
    parser.add_argument("--min-match-rate", type=float, default=0.97)
    args = parser.parse_args()

    package = build_package(Path(args.taxref), Path(args.source), args.checked_at)
    diagnostics = package["diagnostics"]
    print(json.dumps(diagnostics, ensure_ascii=False, indent=2))
    if diagnostics["matchRate"] < args.min_match_rate:
        raise SystemExit(
            f"Taux de raccord TAXREF insuffisant: {diagnostics['matchRate']:.2%} < {args.min_match_rate:.2%}"
        )
    if not package["statuses"]:
        raise SystemExit("Aucun statut ZNIEFF Île-de-France produit")
    output = Path(args.out)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(package, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Paquet régional écrit: {output} - {len(package['statuses'])} statuts")


if __name__ == "__main__":
    main()
