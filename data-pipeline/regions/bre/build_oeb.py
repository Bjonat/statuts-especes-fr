#!/usr/bin/env python3
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

REALM_BY_KINGDOM = {"animalia": "fauna", "plantae": "flora"}


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


def row_value(row: dict[str, str], *names: str) -> str:
    by_name = {str(key).strip().casefold(): str(value or "").strip() for key, value in row.items()}
    for name in names:
        value = by_name.get(name.casefold(), "")
        if value:
            return value
    return ""


def read_csv(path: Path):
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin1"):
        try:
            handle = path.open("r", encoding=encoding, newline="")
            sample = handle.read(16000)
            handle.seek(0)
            try:
                delimiter = csv.Sniffer().sniff(sample, delimiters=";\t,|").delimiter
            except csv.Error:
                delimiter = ";"
            return handle, csv.DictReader(handle, delimiter=delimiter)
        except UnicodeDecodeError:
            try:
                handle.close()
            except Exception:
                pass
    raise RuntimeError(f"Impossible de décoder {path}")


def taxref_lookup(path: Path):
    by_cd_nom: dict[int, tuple[int, str | None]] = {}
    accepted_names = defaultdict(set)
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        for row in reader:
            cd_nom_raw = row_value(row, "CD_NOM")
            cd_ref_raw = row_value(row, "CD_REF")
            if not cd_nom_raw.isdigit() or not cd_ref_raw.isdigit():
                continue
            kingdom = normalize(row_value(row, "REGNE"))
            realm = REALM_BY_KINGDOM.get(kingdom)
            cd_nom = int(cd_nom_raw)
            cd_ref = int(cd_ref_raw)
            by_cd_nom[cd_nom] = (cd_ref, realm)
            if realm:
                for field in ("LB_NOM", "NOM_COMPLET", "NOM_VALIDE"):
                    label = row_value(row, field)
                    if label:
                        accepted_names[normalize(label)].add((cd_ref, realm))
    return by_cd_nom, accepted_names


def resolve(row: dict[str, str], code_fields: tuple[str, ...], name_fields: tuple[str, ...], by_cd_nom, accepted_names):
    code = row_value(row, *code_fields)
    if code.isdigit():
        mapped = by_cd_nom.get(int(code))
        if mapped:
            cd_ref, realm = mapped
            if realm:
                return cd_ref, realm, "cd_nom"
            return None, None, "excluded_realm"

    for field in name_fields:
        name = row_value(row, field)
        if not name:
            continue
        candidates = accepted_names.get(normalize(name), set())
        if len(candidates) == 1:
            cd_ref, realm = next(iter(candidates))
            return cd_ref, realm, "name"
        if len(candidates) > 1:
            return None, None, "ambiguous"
    return None, None, "unmatched"


def diagnostics_template():
    return {
        "rows": 0,
        "matched": 0,
        "cd_nom": 0,
        "name": 0,
        "excluded_realm": 0,
        "unmatched": 0,
        "ambiguous": 0,
        "flora": 0,
        "fauna": 0,
        "unresolvedSample": [],
    }


def finalize_diagnostics(stats):
    candidates = stats["matched"] + stats["unmatched"] + stats["ambiguous"]
    stats["matchRate"] = round(stats["matched"] / candidates, 6) if candidates else 1.0
    return stats


def build_znieff(taxref_path: Path, csv_path: Path, checked_at: str):
    by_cd_nom, accepted_names = taxref_lookup(taxref_path)
    stats = diagnostics_template()
    statuses = []
    seen = set()
    years = set()
    groups = set()

    handle, reader = read_csv(csv_path)
    try:
        for row in reader:
            stats["rows"] += 1
            cd_ref, realm, mode = resolve(
                row,
                ("CD_NOM",),
                ("NOM_SCIEN_VALIDE", "NOM_SCIENTIFIQUE_TAXREF"),
                by_cd_nom,
                accepted_names,
            )
            if mode == "excluded_realm":
                stats[mode] += 1
                continue
            if cd_ref is None or realm is None:
                stats[mode] += 1
                if len(stats["unresolvedSample"]) < 50:
                    stats["unresolvedSample"].append({
                        "taxon": row_value(row, "NOM_SCIEN_VALIDE", "NOM_FRANCAIS"),
                        "code": row_value(row, "CD_NOM"),
                        "reason": mode,
                    })
                continue
            stats["matched"] += 1
            stats[mode] += 1
            stats[realm] += 1
            year = row_value(row, "ANNEE_EVALUATION")
            if year:
                years.add(year)
            group = row_value(row, "GROUP1_INPN", "GROUP2_INPN", "LISTE_ZNIEFF")
            if group:
                groups.add(group)
            key = (cd_ref, realm)
            if key in seen:
                continue
            seen.add(key)
            statuses.append({
                "cdRef": cd_ref,
                "region": "BRE",
                "category": "znieff",
                "label": "Déterminante ZNIEFF",
                "value": "Oui",
                "sourceId": "oeb-bretagne-znieff-csv-2026-01-29",
                "scope": "regional",
            })
    finally:
        handle.close()

    finalize_diagnostics(stats)
    stats["years"] = sorted(years)
    stats["groups"] = sorted(groups)
    return {
        "schemaVersion": 1,
        "source": {
            "id": "oeb-bretagne-znieff-csv-2026-01-29",
            "name": "Espèces déterminantes ZNIEFF Bretagne",
            "producer": "Observatoire de l'environnement en Bretagne / CSRPN Bretagne",
            "version": "CSV 29/01/2026 - évaluations 2004-2020",
            "publicationYear": 2026,
            "official": True,
            "checkedAt": checked_at,
            "sha256": sha256(csv_path),
        },
        "replaces": [
            {"region": "BRE", "category": "znieff", "realm": "flora"},
            {"region": "BRE", "category": "znieff", "realm": "fauna"},
        ],
        "statuses": sorted(statuses, key=lambda status: (status["cdRef"], status["category"])),
        "diagnostics": stats,
    }


def build_lrr(taxref_path: Path, csv_path: Path, checked_at: str):
    by_cd_nom, accepted_names = taxref_lookup(taxref_path)
    stats = diagnostics_template()
    statuses = []
    seen = set()
    years = defaultdict(int)
    groups = defaultdict(int)
    values = defaultdict(int)

    handle, reader = read_csv(csv_path)
    try:
        for row in reader:
            result = row_value(row, "RESULTAT_EVALUATION").upper()
            if not result:
                continue
            stats["rows"] += 1
            cd_ref, realm, mode = resolve(
                row,
                ("CODE_NOM_TAXREF", "CD_NOM"),
                ("NOM_SCIENTIFIQUE_TAXREF", "NOM_SCIEN_VALIDE"),
                by_cd_nom,
                accepted_names,
            )
            if mode == "excluded_realm":
                stats[mode] += 1
                continue
            if cd_ref is None or realm is None:
                stats[mode] += 1
                if len(stats["unresolvedSample"]) < 50:
                    stats["unresolvedSample"].append({
                        "taxon": row_value(row, "NOM_SCIENTIFIQUE_TAXREF", "NOM_VERNACULAIRE"),
                        "code": row_value(row, "CODE_NOM_TAXREF"),
                        "reason": mode,
                    })
                continue
            stats["matched"] += 1
            stats[mode] += 1
            stats[realm] += 1
            year = row_value(row, "ANNEE_EVALUATION") or "inconnu"
            group = row_value(row, "GROUPE_ESPECE") or "inconnu"
            years[year] += 1
            groups[group] += 1
            values[result] += 1
            key = (cd_ref, realm, result)
            if key in seen:
                continue
            seen.add(key)
            statuses.append({
                "cdRef": cd_ref,
                "region": "BRE",
                "category": "red_list_regional",
                "label": "Liste rouge régionale",
                "value": result,
                "sourceId": "oeb-bretagne-lrr-csv-2026-01-29",
                "scope": "regional",
            })
    finally:
        handle.close()

    finalize_diagnostics(stats)
    stats["years"] = dict(sorted(years.items()))
    stats["groups"] = dict(sorted(groups.items()))
    stats["values"] = dict(sorted(values.items()))
    return {
        "schemaVersion": 1,
        "source": {
            "id": "oeb-bretagne-lrr-csv-2026-01-29",
            "name": "Listes rouges régionales Bretagne",
            "producer": "Observatoire de l'environnement en Bretagne / observatoires régionaux faune-flore",
            "version": "CSV 29/01/2026 - données mises à jour OEB 2025",
            "publicationYear": 2026,
            "official": True,
            "checkedAt": checked_at,
            "sha256": sha256(csv_path),
        },
        "replaces": [
            {"region": "BRE", "category": "red_list_regional", "realm": "flora"},
            {"region": "BRE", "category": "red_list_regional", "realm": "fauna"},
        ],
        "statuses": sorted(statuses, key=lambda status: (status["cdRef"], status["value"])),
        "diagnostics": stats,
    }


def write_package(package, output: Path, min_match_rate: float):
    diagnostics = package["diagnostics"]
    print(json.dumps({"source": package["source"]["id"], **diagnostics}, ensure_ascii=False, indent=2))
    if diagnostics["matchRate"] < min_match_rate:
        raise SystemExit(
            f"{package['source']['id']}: taux de raccord TAXREF insuffisant "
            f"{diagnostics['matchRate']:.2%} < {min_match_rate:.2%}"
        )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(package, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Paquet écrit: {output} - {len(package['statuses'])} statuts")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--taxref", required=True)
    parser.add_argument("--znieff", required=True)
    parser.add_argument("--lrr", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--checked-at", default=date.today().isoformat())
    parser.add_argument("--min-match-rate", type=float, default=0.97)
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    write_package(
        build_znieff(Path(args.taxref), Path(args.znieff), args.checked_at),
        out_dir / "bre-znieff.json",
        args.min_match_rate,
    )
    write_package(
        build_lrr(Path(args.taxref), Path(args.lrr), args.checked_at),
        out_dir / "bre-lrr.json",
        args.min_match_rate,
    )


if __name__ == "__main__":
    main()
