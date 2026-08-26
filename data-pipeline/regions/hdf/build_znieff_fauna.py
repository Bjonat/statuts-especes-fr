#!/usr/bin/env python3
"""ZNIEFF faune Hauts-de-France via les listes historiques Picardie et Nord-Pas-de-Calais."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import unicodedata
import zipfile
from collections import Counter
from datetime import date
from pathlib import Path
from xml.etree import ElementTree as ET

LANDING_URL = "https://www.hauts-de-france.developpement-durable.gouv.fr/Inventaire-des-ZNIEFF-terrestres"
PRODUCER = "DREAL Hauts-de-France / CSRPN Hauts-de-France"
REGION = "HDF"

NS = {
    "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
    "table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
    "text": "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
}
TABLE_NS = NS["table"]

SOURCES = [
    {
        "key": "picardie",
        "filename": "picardie.ods",
        "sheet": "ZNIEFF_Liste_Faune_Picardie",
        "sha256": "9190695d4be256d84abaf2b781010e64890fcc38322828b12190bc093f7124fd",
        "id": "dreal-hdf-znieff-fauna-picardie-2020",
        "name": "Espèces déterminantes ZNIEFF faune Picardie",
        "version": "2019 - amendée en 2020",
        "publicationYear": 2020,
        "sourceUrl": "https://www.hauts-de-france.developpement-durable.gouv.fr/IMG/ods/znieff_especesdeterminantes_faune_picardie.ods",
        "scopeLabel": "Picardie",
        "regionCode": "22",
        "expectedRows": 449,
        "expectedInvalidRows": 0,
        "minStatuses": 430,
        "outName": "hdf-znieff-fauna-picardie.json",
    },
    {
        "key": "npdc",
        "filename": "npdc.ods",
        "sheet": "ZNIEFF_Liste_Faune_NPdC",
        "sha256": "16172bc5fb5a9d05fb6482273baf1e8bf5f93846a52451ff249a29f194828631",
        "id": "dreal-hdf-znieff-fauna-npdc-2014-2015",
        "name": "Espèces déterminantes ZNIEFF faune Nord-Pas-de-Calais",
        "version": "2014-2015",
        "publicationYear": 2015,
        "sourceUrl": "https://www.hauts-de-france.developpement-durable.gouv.fr/IMG/ods/znieff_especesdeterminantes_faune_npdc.ods",
        "scopeLabel": "Nord-Pas-de-Calais",
        "regionCode": "31",
        "expectedRows": 379,
        "expectedInvalidRows": 1,
        "minStatuses": 360,
        "outName": "hdf-znieff-fauna-npdc.json",
    },
]


def clean(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "").replace("\xa0", " ")).strip()


def normalize(value: object) -> str:
    text = unicodedata.normalize("NFKD", clean(value))
    text = "".join(char for char in text if not unicodedata.combining(char))
    return text.casefold()


def normalize_header(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", "_", normalize(value)).strip("_")


def as_int(value: object) -> int | None:
    text = clean(value)
    if not text:
        return None
    if re.fullmatch(r"\d+(?:\.0+)?", text):
        return int(float(text))
    return None


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def cell_text(cell: ET.Element) -> str:
    parts = []
    for paragraph in cell.findall(".//text:p", NS):
        text = "".join(paragraph.itertext()).strip()
        if text:
            parts.append(text)
    if parts:
        return " ".join(parts)
    return clean(cell.attrib.get(f"{{{NS['office']}}}value", ""))


def iter_table_rows(table: ET.Element):
    table_tag = f"{{{TABLE_NS}}}"
    for row in table.findall("table:table-row", NS):
        values: list[str] = []
        for cell in row:
            if cell.tag not in {table_tag + "table-cell", table_tag + "covered-table-cell"}:
                continue
            repeat = min(int(cell.attrib.get(table_tag + "number-columns-repeated", "1")), 80)
            values.extend([cell_text(cell)] * repeat)
            if len(values) >= 80:
                break
        values = values[:80]
        while values and not values[-1]:
            values.pop()
        if not any(clean(value) for value in values):
            continue
        row_repeat = min(int(row.attrib.get(table_tag + "number-rows-repeated", "1")), 1000)
        for _ in range(row_repeat):
            yield values


def read_ods_rows(path: Path, sheet_name: str) -> list[dict[str, str]]:
    with zipfile.ZipFile(path) as archive:
        root = ET.fromstring(archive.read("content.xml"))
    spreadsheet = root.find("office:body/office:spreadsheet", NS)
    if spreadsheet is None:
        raise SystemExit(f"{path.name}: classeur ODS sans tableur")

    table = None
    table_tag = f"{{{TABLE_NS}}}table"
    name_attr = f"{{{TABLE_NS}}}name"
    for candidate in list(spreadsheet):
        if candidate.tag == table_tag and candidate.attrib.get(name_attr) == sheet_name:
            table = candidate
            break
    if table is None:
        raise SystemExit(f"{path.name}: feuille absente ({sheet_name})")

    rows = list(iter_table_rows(table))
    if not rows:
        raise SystemExit(f"{path.name}: feuille vide ({sheet_name})")
    headers = [normalize_header(value) for value in rows[0]]
    required = {
        "cd_ref",
        "groupe",
        "nom_s_cite",
        "regne",
        "code_insee_region",
        "libelle_de_la_region",
        "commentaire",
    }
    missing = required - set(headers)
    if missing:
        raise SystemExit(f"{path.name}: colonnes manquantes {sorted(missing)}")

    records = []
    for values in rows[1:]:
        padded = values + [""] * max(0, len(headers) - len(values))
        records.append({headers[index]: clean(padded[index]) for index in range(len(headers))})
    return records


def validate_source_contract(source: dict, rows: list[dict[str, str]]) -> tuple[list[dict], list[dict]]:
    if len(rows) != source["expectedRows"]:
        raise SystemExit(
            f"{source['id']}: volume source inattendu {len(rows)} != {source['expectedRows']}"
        )

    valid = []
    invalid = []
    seen_source_refs: set[int] = set()
    for row in rows:
        if row.get("libelle_de_la_region") != source["scopeLabel"]:
            raise SystemExit(
                f"{source['id']}: portée inattendue {row.get('libelle_de_la_region')!r}"
            )
        if row.get("code_insee_region") != source["regionCode"]:
            raise SystemExit(
                f"{source['id']}: code région inattendu {row.get('code_insee_region')!r}"
            )

        source_ref = as_int(row.get("cd_ref"))
        if source_ref is None:
            invalid.append(row)
            continue
        if normalize(row.get("regne")) != "animalia":
            raise SystemExit(f"{source['id']}: règne non Animalia pour CD_REF {source_ref}")
        if row.get("commentaire"):
            raise SystemExit(
                f"{source['id']}: commentaire inattendu sur une ligne publiable: {row.get('commentaire')}"
            )
        if source_ref in seen_source_refs:
            raise SystemExit(f"{source['id']}: CD_REF source dupliqué {source_ref}")
        seen_source_refs.add(source_ref)
        valid.append({
            "sourceRef": source_ref,
            "sourceNom": as_int(row.get("cd_nom")),
            "taxon": row.get("nom_s_cite", ""),
            "group": row.get("groupe", ""),
        })

    if len(invalid) != source["expectedInvalidRows"]:
        raise SystemExit(
            f"{source['id']}: lignes hors TAXREF inattendues {len(invalid)} != {source['expectedInvalidRows']}"
        )
    if invalid:
        comments = [normalize(row.get("commentaire")) for row in invalid]
        if any("hors taxref" not in comment for comment in comments):
            raise SystemExit(f"{source['id']}: ligne sans CD_REF non explicitement marquée hors TaxRef")
    return valid, invalid


def resolve_taxref(path: Path, rows_by_source: dict[str, list[dict]]) -> dict[int, tuple[int, str]]:
    wanted = set()
    for rows in rows_by_source.values():
        for row in rows:
            wanted.add(row["sourceRef"])
            if row["sourceNom"] is not None:
                wanted.add(row["sourceNom"])

    resolved: dict[int, tuple[int, str]] = {}
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        for row in reader:
            cd_nom = as_int(row.get("CD_NOM"))
            if cd_nom is None or cd_nom not in wanted:
                continue
            cd_ref = as_int(row.get("CD_REF"))
            if cd_ref is None:
                continue
            resolved[cd_nom] = (cd_ref, normalize(row.get("REGNE")))
    return resolved


def build_package(source: dict, rows: list[dict], invalid: list[dict], resolved: dict, checked_at: str) -> dict:
    statuses = []
    seen_current_refs: set[int] = set()
    unresolved = []
    group_counts: Counter = Counter()
    remapped = 0
    collisions = 0

    for row in rows:
        match = resolved.get(row["sourceRef"])
        if match is None and row["sourceNom"] is not None:
            match = resolved.get(row["sourceNom"])
        if match is None:
            unresolved.append({"sourceRef": row["sourceRef"], "taxon": row["taxon"]})
            continue
        current_ref, realm = match
        if realm != "animalia":
            unresolved.append({"sourceRef": row["sourceRef"], "taxon": row["taxon"], "reason": realm or "unknown-realm"})
            continue
        if current_ref != row["sourceRef"]:
            remapped += 1
        if current_ref in seen_current_refs:
            collisions += 1
            continue
        seen_current_refs.add(current_ref)
        group_counts[row["group"]] += 1
        statuses.append({
            "cdRef": current_ref,
            "region": REGION,
            "category": "znieff",
            "label": "Déterminante ZNIEFF",
            "value": "Oui",
            "sourceId": source["id"],
            "scope": "partial",
            "scopeLabel": source["scopeLabel"],
        })

    candidates = len(rows)
    match_rate = len(statuses) / candidates if candidates else 1.0
    return {
        "schemaVersion": 1,
        "source": {
            "id": source["id"],
            "name": source["name"],
            "producer": PRODUCER,
            "version": source["version"],
            "publicationYear": source["publicationYear"],
            "official": True,
            "checkedAt": checked_at,
            "sha256": source["sha256"],
            "landingPage": LANDING_URL,
            "sourceUrl": source["sourceUrl"],
        },
        "replaces": [{
            "region": REGION,
            "category": "znieff",
            "realm": "fauna",
            "cdRefs": sorted(seen_current_refs),
        }],
        "statuses": sorted(statuses, key=lambda status: status["cdRef"]),
        "diagnostics": {
            "rowsSource": source["expectedRows"],
            "rowsWithSourceRef": len(rows),
            "sourceRowsOutsideTaxref": len(invalid),
            "matched": len(statuses),
            "unmatched": len(unresolved),
            "remappedToTaxref18": remapped,
            "remapCollisions": collisions,
            "matchRate": round(match_rate, 6),
            "groups": dict(sorted(group_counts.items())),
            "unresolvedSample": unresolved[:30],
            "excludedSourceRows": [
                {
                    "taxon": row.get("nom_s_cite", ""),
                    "group": row.get("groupe", ""),
                    "comment": row.get("commentaire", ""),
                }
                for row in invalid[:10]
            ],
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

    input_dir = Path(args.input_dir)
    out_dir = Path(args.out_dir)
    rows_by_source: dict[str, list[dict]] = {}
    invalid_by_source: dict[str, list[dict]] = {}

    for source in SOURCES:
        path = input_dir / source["filename"]
        digest = sha256(path)
        if digest != source["sha256"]:
            raise SystemExit(f"{source['filename']}: SHA-256 inattendu {digest}")
        raw_rows = read_ods_rows(path, source["sheet"])
        valid, invalid = validate_source_contract(source, raw_rows)
        rows_by_source[source["key"]] = valid
        invalid_by_source[source["key"]] = invalid

    resolved = resolve_taxref(Path(args.taxref), rows_by_source)
    out_dir.mkdir(parents=True, exist_ok=True)

    total = 0
    for source in SOURCES:
        package = build_package(
            source,
            rows_by_source[source["key"]],
            invalid_by_source[source["key"]],
            resolved,
            args.checked_at,
        )
        diagnostics = package["diagnostics"]
        print(json.dumps({"source": source["id"], **diagnostics}, ensure_ascii=False, indent=2))
        if diagnostics["matchRate"] < args.min_match_rate:
            raise SystemExit(
                f"{source['id']}: raccord TAXREF {diagnostics['matchRate']:.2%} < {args.min_match_rate:.2%}"
            )
        if len(package["statuses"]) < source["minStatuses"]:
            raise SystemExit(
                f"{source['id']}: volume produit anormalement faible {len(package['statuses'])} < {source['minStatuses']}"
            )
        output = out_dir / source["outName"]
        output.write_text(json.dumps(package, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        total += len(package["statuses"])
        print(f"Paquet écrit: {output} - {len(package['statuses'])} statuts")

    print(f"HDF ZNIEFF faune historique: {len(SOURCES)} paquets, {total} statuts")


if __name__ == "__main__":
    main()
