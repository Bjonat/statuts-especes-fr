#!/usr/bin/env python3
"""ZNIEFF espèces déterminantes Centre-Val de Loire — tableur DREAL avril 2026."""
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

import xlrd

SOURCE_ID = "dreal-cvl-znieff-2026-04"
SOURCE_URL = (
    "https://www.centre-val-de-loire.developpement-durable.gouv.fr/"
    "IMG/xls/listes_dz_cvl_actual_avril_2026.xls"
)
LANDING_URL = (
    "https://www.centre-val-de-loire.developpement-durable.gouv.fr/"
    "habitats-et-especes-determinantes-a4278.html"
)
PRODUCER = "DREAL Centre-Val de Loire / CSRPN Centre-Val de Loire"
EXPECTED_SHA256 = "6018854543765120bed896317671aed73c22b145416a29fa6040cca3a19c18c5"
MAX_VALUE_LENGTH = 80
REALM_BY_KINGDOM = {"animalia": "fauna", "plantae": "flora"}

# Habitats hors périmètre taxons ; Fonge hors fauna/flora PWA.
SKIP_SHEETS = {"Synthèse", "Habitats", "Fonge"}
FLORA_SHEETS = {"Flore vasculaire", "Bryophytes"}
FAUNA_SHEETS = {
    "Mammif",
    "Oiseaux",
    "Amphib-Rept",
    "Poissons",
    "Odonates",
    "Orthoptères",
    "Lépido",
    "Coléo",
    "Hétéroptères",
    "Autres Insectes",
    "Crustacés",
    "Mollusques",
}


def clean(value: object) -> str:
    text = str(value or "").replace("\xa0", " ").replace("–", "-").replace("—", "-")
    return re.sub(r"\s+", " ", text).strip()


def normalize(value: object) -> str:
    text = unicodedata.normalize("NFKD", clean(value))
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = text.replace("×", "x")
    return text.casefold()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def as_int(value: object) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    text = clean(value)
    if re.fullmatch(r"\d+(?:\.0+)?", text):
        return int(float(text))
    return None


def compact_condition(value: object) -> str | None:
    text = clean(value)
    if not text:
        return None
    if len(text) > MAX_VALUE_LENGTH:
        return None
    return text


def find_header(sheet) -> tuple[int, dict[str, int]]:
    for row_index in range(min(5, sheet.nrows)):
        values = [clean(sheet.cell_value(row_index, column)) for column in range(sheet.ncols)]
        if "CD_NOM" in values:
            return row_index, {name: index for index, name in enumerate(values) if name}
    raise RuntimeError(f"En-tête CD_NOM introuvable: {sheet.name}")


def read_species_rows(path: Path) -> list[dict]:
    workbook = xlrd.open_workbook(str(path))
    rows: list[dict] = []
    for sheet_name in workbook.sheet_names():
        if sheet_name in SKIP_SHEETS:
            continue
        if sheet_name not in FLORA_SHEETS and sheet_name not in FAUNA_SHEETS:
            raise RuntimeError(f"Feuille espèces inattendue: {sheet_name}")
        expected_realm = "flora" if sheet_name in FLORA_SHEETS else "fauna"
        sheet = workbook.sheet_by_name(sheet_name)
        header_row, columns = find_header(sheet)
        for row_index in range(header_row + 1, sheet.nrows):
            get = lambda key: sheet.cell_value(row_index, columns[key]) if key in columns else ""
            code = as_int(get("CD_NOM"))
            name = clean(get("Nom(s) cité(s)"))
            if not code and not name:
                continue
            department = clean(get("Département"))
            condition = compact_condition(get("Condition déterminance"))
            rows.append(
                {
                    "sheet": sheet_name,
                    "expected_realm": expected_realm,
                    "code": code,
                    "name": name,
                    "department": department,
                    "condition": condition,
                    "condition_raw": clean(get("Condition déterminance")),
                }
            )
    return rows


def taxref_lookup(path: Path, wanted_codes: set[int], wanted_names: set[str]):
    by_cd_nom: dict[int, tuple[int, str]] = {}
    by_name: dict[str, set[tuple[int, str]]] = defaultdict(set)
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        for row in reader:
            cd_nom_raw = clean(row.get("CD_NOM"))
            cd_ref_raw = clean(row.get("CD_REF"))
            if not cd_nom_raw.isdigit() or not cd_ref_raw.isdigit():
                continue
            realm = REALM_BY_KINGDOM.get(normalize(row.get("REGNE")))
            if not realm:
                continue
            cd_nom = int(cd_nom_raw)
            cd_ref = int(cd_ref_raw)
            if cd_nom in wanted_codes:
                by_cd_nom[cd_nom] = (cd_ref, realm)
            for field in ("LB_NOM", "NOM_COMPLET", "NOM_VALIDE"):
                label = row.get(field)
                if label and normalize(label) in wanted_names:
                    by_name[normalize(label)].add((cd_ref, realm))
    return by_cd_nom, by_name


def resolve(row: dict, by_cd_nom, by_name):
    code = row.get("code")
    if code and code in by_cd_nom:
        return (*by_cd_nom[code], "cd_nom")
    if row.get("name"):
        candidates = by_name.get(normalize(row["name"]), set())
        if len(candidates) == 1:
            cd_ref, realm = next(iter(candidates))
            return cd_ref, realm, "name"
        if len(candidates) > 1:
            return None, None, "ambiguous"
    return None, None, "unmatched"


def build_package(taxref_path: Path, source_path: Path, checked_at: str):
    digest = sha256(source_path)
    if digest != EXPECTED_SHA256:
        raise SystemExit(f"SHA-256 ZNIEFF CVL inattendu: {digest}")

    rows = read_species_rows(source_path)
    codes = {row["code"] for row in rows if row["code"]}
    names = {normalize(row["name"]) for row in rows if row["name"]}
    by_cd_nom, by_name = taxref_lookup(taxref_path, codes, names)

    stats = Counter()
    stats["rows"] = len(rows)
    sheet_counts = Counter()
    omitted_conditions = Counter()
    statuses = []
    seen = set()
    unresolved = []

    for row in rows:
        sheet_counts[row["sheet"]] += 1
        if row["condition_raw"] and not row["condition"]:
            omitted_conditions[row["condition_raw"][:80]] += 1
            stats["omittedLongConditions"] += 1

        cd_ref, realm, mode = resolve(row, by_cd_nom, by_name)
        if cd_ref is None or realm is None:
            stats[mode] += 1
            if len(unresolved) < 40:
                unresolved.append(
                    {
                        "sheet": row["sheet"],
                        "code": row["code"],
                        "taxon": row["name"],
                        "reason": mode,
                    }
                )
            continue
        if realm != row["expected_realm"]:
            stats["unexpectedRealm"] += 1
            continue
        stats["matched"] += 1
        stats[mode] += 1
        stats[realm] += 1

        scope = "regional"
        scope_label = None
        if row["department"]:
            scope = "partial"
            scope_label = row["department"]

        det_key = (cd_ref, realm, "Déterminante ZNIEFF", "Oui", scope, scope_label or "")
        if det_key not in seen:
            seen.add(det_key)
            status = {
                "cdRef": cd_ref,
                "region": "CVL",
                "category": "znieff",
                "label": "Déterminante ZNIEFF",
                "value": "Oui",
                "sourceId": SOURCE_ID,
                "scope": scope,
                "_realm": realm,
            }
            if scope_label:
                status["scopeLabel"] = scope_label
            statuses.append(status)

        if row["condition"]:
            cond_key = (
                cd_ref,
                realm,
                "Condition de déterminance",
                row["condition"],
                scope,
                scope_label or "",
            )
            if cond_key not in seen:
                seen.add(cond_key)
                status = {
                    "cdRef": cd_ref,
                    "region": "CVL",
                    "category": "znieff",
                    "label": "Condition de déterminance",
                    "value": row["condition"],
                    "sourceId": SOURCE_ID,
                    "scope": scope,
                    "_realm": realm,
                }
                if scope_label:
                    status["scopeLabel"] = scope_label
                statuses.append(status)

    candidates = stats["matched"] + stats["unmatched"] + stats["ambiguous"]
    match_rate = stats["matched"] / candidates if candidates else 1.0
    replacements = []
    for realm in ("flora", "fauna"):
        refs = sorted({status["cdRef"] for status in statuses if status["_realm"] == realm})
        if refs:
            replacements.append(
                {"region": "CVL", "category": "znieff", "realm": realm, "cdRefs": refs}
            )
    public_statuses = [
        {key: value for key, value in status.items() if key != "_realm"} for status in statuses
    ]
    return {
        "schemaVersion": 1,
        "source": {
            "id": SOURCE_ID,
            "name": "Espèces déterminantes ZNIEFF Centre-Val de Loire",
            "producer": PRODUCER,
            "version": "avril 2026",
            "publicationYear": 2026,
            "official": True,
            "checkedAt": checked_at,
            "sha256": digest,
            "landingPage": LANDING_URL,
            "sourceUrl": SOURCE_URL,
        },
        "replaces": replacements,
        "statuses": sorted(
            public_statuses, key=lambda status: (status["cdRef"], status["label"], status["value"])
        ),
        "diagnostics": {
            **dict(stats),
            "matchRate": round(match_rate, 6),
            "sheetCounts": dict(sorted(sheet_counts.items())),
            "omittedLongConditionSample": dict(omitted_conditions.most_common(10)),
            "unresolvedSample": unresolved,
        },
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
        raise SystemExit("Aucun statut ZNIEFF CVL produit")
    if len(package["statuses"]) < 500:
        raise SystemExit(f"Volume ZNIEFF CVL anormalement faible: {len(package['statuses'])}")
    output = Path(args.out)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(package, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Paquet régional écrit: {output} - {len(package['statuses'])} statuts")


if __name__ == "__main__":
    main()
