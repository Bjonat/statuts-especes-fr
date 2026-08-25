#!/usr/bin/env python3
"""ZNIEFF Pays de la Loire 2018 — faune + flore (ODS DREAL)."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import unicodedata
import zipfile
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from xml.etree import ElementTree as ET

NS = {
    "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
    "table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
    "text": "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
}
TABLE_NS = NS["table"]
OFFICE_NS = NS["office"]

LANDING_URL = (
    "https://www.pays-de-la-loire.developpement-durable.gouv.fr/"
    "les-listes-des-especes-determinantes-et-habitats-a4613.html"
)
PRODUCER = "DREAL Pays de la Loire / CSRPN Pays de la Loire / partenaires naturalistes"
MAX_VALUE_LENGTH = 80
SEARCHABLE_RANKS = {"ES", "SSES", "VAR", "SVAR", "FO", "CAR", "RACE", "AGES"}
NOISE_CONDITIONS = {
    "coleopteres aquatiques",
    "coléoptères aquatiques",
}

SOURCES = [
    {
        "key": "fauna",
        "filename": "liste_pdl__2018_faune_vf.ods",
        "id": "dreal-pdl-znieff-faune-2018",
        "name": "ZNIEFF Faune Pays de la Loire",
        "version": "2018",
        "year": 2018,
        "realm": "fauna",
        "sheet": "Faune",
        "has_header": True,
        "url": "https://www.pays-de-la-loire.developpement-durable.gouv.fr/IMG/ods/liste_pdl__2018_faune_vf.ods",
        "sha256": "1bd95cf726ddbf5cb17f71c00092eecf3ed7b6e0fa6d7d6216b1a46adc73b91e",
    },
    {
        "key": "flora",
        "filename": "liste_pdl__2018_flore_vf.ods",
        "id": "dreal-pdl-znieff-flore-2018",
        "name": "ZNIEFF Flore Pays de la Loire",
        "version": "2018",
        "year": 2018,
        "realm": "flora",
        "sheet": "Flore",
        "has_header": False,
        "url": "https://www.pays-de-la-loire.developpement-durable.gouv.fr/IMG/ods/liste_pdl__2018_flore_vf.ods",
        "sha256": "2b99b0bf40fa6c3f9ccec4b72a0d991baa792f5919a00a430575106c671f9d37",
    },
]


def clean(value: object) -> str:
    text = str(value or "").replace("\xa0", " ").replace("–", "-").replace("—", "-").replace("‑", "-")
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
    text = clean(value)
    if not text or text == "?":
        return None
    if re.fullmatch(r"\d+(?:\.0+)?", text):
        return int(float(text))
    return None


def cell_text(cell: ET.Element) -> str:
    parts: list[str] = []
    for paragraph in cell.findall(".//text:p", NS):
        value = clean("".join(paragraph.itertext()))
        if value:
            parts.append(value)
    if parts:
        return " | ".join(parts)
    for attribute in (f"{{{OFFICE_NS}}}string-value", f"{{{OFFICE_NS}}}value"):
        if attribute in cell.attrib:
            return clean(cell.attrib[attribute])
    return ""


def row_values(row: ET.Element, max_columns: int = 20) -> list[str]:
    values: list[str] = []
    for cell in list(row):
        if cell.tag not in {f"{{{TABLE_NS}}}table-cell", f"{{{TABLE_NS}}}covered-table-cell"}:
            continue
        repeat = int(cell.attrib.get(f"{{{TABLE_NS}}}number-columns-repeated", "1"))
        value = cell_text(cell)
        values.extend([value] * min(repeat, max_columns - len(values)))
        if len(values) >= max_columns:
            break
    while values and not values[-1]:
        values.pop()
    return values


def read_ods(path: Path) -> dict[str, list[list[str]]]:
    with zipfile.ZipFile(path) as archive:
        if "content.xml" not in archive.namelist():
            raise RuntimeError("ODS invalide : content.xml absent")
        root = ET.fromstring(archive.read("content.xml"))
    spreadsheet = root.find("office:body/office:spreadsheet", NS)
    if spreadsheet is None:
        raise RuntimeError("ODS invalide : feuille de calcul absente")
    sheets: dict[str, list[list[str]]] = {}
    for sheet in spreadsheet.findall("table:table", NS):
        name = clean(sheet.attrib.get(f"{{{TABLE_NS}}}name", ""))
        if not name:
            continue
        rows: list[list[str]] = []
        for row in sheet.findall("table:table-row", NS):
            values = row_values(row)
            if any(value for value in values):
                rows.append(values)
        sheets[name] = rows
    return sheets


def compact_condition(value: object) -> str | None:
    text = clean(value)
    if not text:
        return None
    if normalize(text) in NOISE_CONDITIONS:
        return None
    if len(text) > MAX_VALUE_LENGTH:
        return None
    return text


def parse_fauna(rows: list[list[str]]) -> list[dict]:
    out = []
    for row in rows[1:]:
        code = as_int(row[0] if row else None)
        name = clean(row[1] if len(row) > 1 else "")
        if not code and not name:
            continue
        out.append(
            {
                "code": code,
                "name": name,
                "condition": compact_condition(row[6] if len(row) > 6 else ""),
            }
        )
    return out


def parse_flora(rows: list[list[str]]) -> list[dict]:
    out = []
    for row in rows:
        code = as_int(row[0] if row else None)
        name = clean(row[1] if len(row) > 1 else "")
        if not code and not name:
            continue
        # col6 = argumentaire (ignore), col7 = restrictions CSRPN
        out.append(
            {
                "code": code,
                "name": name,
                "condition": compact_condition(row[7] if len(row) > 7 else ""),
            }
        )
    return out


def parse_source(source: dict, path: Path) -> list[dict]:
    sheets = read_ods(path)
    sheet_name = source["sheet"]
    if sheet_name not in sheets:
        raise RuntimeError(f"{path.name}: feuille absente {sheet_name}")
    rows = sheets[sheet_name]
    if source["key"] == "fauna":
        return parse_fauna(rows)
    return parse_flora(rows)


def strip_authorship(name: str) -> str:
    text = clean(name)
    text = re.sub(r"\s*\([^)]*\)\s*$", "", text)
    text = re.sub(r",\s*\d{4}\s*$", "", text)
    return clean(text)


def taxref_lookup(path: Path, wanted_codes: set[int], wanted_names: set[str], realms: set[str]):
    by_cd_nom: dict[int, tuple[int, str, str]] = {}
    by_name: dict[str, set[tuple[int, str, str]]] = defaultdict(set)
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        for row in reader:
            cd_nom_raw = clean(row.get("CD_NOM"))
            cd_ref_raw = clean(row.get("CD_REF"))
            if not cd_nom_raw.isdigit() or not cd_ref_raw.isdigit():
                continue
            realm = {"animalia": "fauna", "plantae": "flora"}.get(normalize(row.get("REGNE")))
            if realm not in realms:
                continue
            cd_nom = int(cd_nom_raw)
            cd_ref = int(cd_ref_raw)
            rank = clean(row.get("RANG")).upper()
            entry = (cd_ref, realm, rank)
            if cd_nom in wanted_codes:
                by_cd_nom[cd_nom] = entry
            for field in ("LB_NOM", "NOM_COMPLET", "NOM_VALIDE"):
                label = clean(row.get(field))
                if not label:
                    continue
                for key in {normalize(label), normalize(strip_authorship(label))}:
                    if key in wanted_names:
                        by_name[key].add(entry)
    return by_cd_nom, by_name


def resolve(candidate, by_cd_nom, by_name, expected_realm: str):
    code = candidate["code"]
    if code and code in by_cd_nom:
        cd_ref, realm, rank = by_cd_nom[code]
        if realm != expected_realm:
            return None, "excluded_realm"
        if rank and rank not in SEARCHABLE_RANKS:
            return None, "excluded_rank"
        return cd_ref, "cd_nom"
    name = candidate["name"]
    if name:
        keys = [normalize(name), normalize(strip_authorship(name))]
        for key in keys:
            matches = {
                entry
                for entry in by_name.get(key, set())
                if entry[1] == expected_realm and (not entry[2] or entry[2] in SEARCHABLE_RANKS)
            }
            if len(matches) == 1:
                return next(iter(matches))[0], "name"
            species = {entry for entry in matches if entry[2] == "ES"}
            if len(species) == 1:
                return next(iter(species))[0], "name"
            if len({entry[0] for entry in matches}) == 1 and matches:
                return next(iter(matches))[0], "name"
            if len(matches) > 1:
                return None, "ambiguous"
    return None, "unmatched"


def build_package(source, input_dir: Path, by_cd_nom, by_name, checked_at: str):
    path = input_dir / source["filename"]
    digest = sha256(path)
    if digest != source["sha256"]:
        raise RuntimeError(f"{source['id']}: SHA-256 inattendu {digest}")
    candidates = parse_source(source, path)
    stats = Counter()
    unresolved = []
    statuses = []
    seen = set()
    for candidate in candidates:
        stats["rows"] += 1
        cd_ref, mode = resolve(candidate, by_cd_nom, by_name, source["realm"])
        if cd_ref is None:
            stats[mode] += 1
            if len(unresolved) < 40:
                unresolved.append({"code": candidate["code"], "taxon": candidate["name"], "reason": mode})
            continue
        stats["matched"] += 1
        stats[mode] += 1
        records = [
            {
                "cdRef": cd_ref,
                "region": "PDL",
                "category": "znieff",
                "label": "Déterminante ZNIEFF",
                "value": "Oui",
                "sourceId": source["id"],
                "scope": "regional",
            }
        ]
        if candidate.get("condition"):
            records.append(
                {
                    "cdRef": cd_ref,
                    "region": "PDL",
                    "category": "znieff",
                    "label": "Condition de déterminance",
                    "value": candidate["condition"],
                    "sourceId": source["id"],
                    "scope": "regional",
                }
            )
        for record in records:
            key = (record["cdRef"], record["label"], record["value"])
            if key in seen:
                continue
            seen.add(key)
            statuses.append(record)

    candidates_n = stats["matched"] + stats["unmatched"] + stats["ambiguous"]
    match_rate = round(stats["matched"] / candidates_n, 6) if candidates_n else 1.0
    covered = sorted({status["cdRef"] for status in statuses})
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
            "sha256": digest,
            "landingPage": LANDING_URL,
            "sourceUrl": source["url"],
        },
        "replaces": [{"region": "PDL", "category": "znieff", "realm": source["realm"], "cdRefs": covered}],
        "statuses": sorted(statuses, key=lambda status: (status["cdRef"], status["label"], status["value"])),
        "diagnostics": {
            **{key: int(value) for key, value in stats.items()},
            "matchRate": match_rate,
            "unresolvedSample": unresolved,
            "withCondition": sum(1 for status in statuses if status["label"] == "Condition de déterminance"),
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

    wanted_codes: set[int] = set()
    wanted_names: set[str] = set()
    realms: set[str] = set()
    for source in SOURCES:
        path = Path(args.input_dir) / source["filename"]
        for candidate in parse_source(source, path):
            realms.add(source["realm"])
            if candidate["code"]:
                wanted_codes.add(candidate["code"])
            if candidate["name"]:
                wanted_names.add(normalize(candidate["name"]))
                wanted_names.add(normalize(strip_authorship(candidate["name"])))

    by_cd_nom, by_name = taxref_lookup(Path(args.taxref), wanted_codes, wanted_names, realms)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    total = 0
    for source in SOURCES:
        package = build_package(source, Path(args.input_dir), by_cd_nom, by_name, args.checked_at)
        diagnostics = package["diagnostics"]
        print(json.dumps({"source": source["id"], **diagnostics}, ensure_ascii=False, indent=2))
        if diagnostics["matchRate"] < args.min_match_rate:
            raise SystemExit(
                f"{source['id']}: taux de raccord TAXREF insuffisant "
                f"{diagnostics['matchRate']:.2%} < {args.min_match_rate:.2%}"
            )
        if not package["statuses"]:
            raise SystemExit(f"{source['id']}: aucun statut produit")
        if "url" in package["source"]:
            raise SystemExit(f"{source['id']}: champ url interdit")
        long_values = [status for status in package["statuses"] if len(status["value"]) > MAX_VALUE_LENGTH]
        if long_values:
            raise SystemExit(f"{source['id']}: valeurs > {MAX_VALUE_LENGTH}")
        output = out_dir / f"pdl-znieff-{source['key']}.json"
        output.write_text(json.dumps(package, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        total += len(package["statuses"])
        print(f"Paquet écrit: {output} — {len(package['statuses'])} statuts")
    print(f"PDL ZNIEFF: {len(SOURCES)} paquets, {total} statuts")


if __name__ == "__main__":
    main()
