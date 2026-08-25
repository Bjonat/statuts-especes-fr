#!/usr/bin/env python3
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

SOURCE_ID = "dreal-ara-znieff-2023-06"
SOURCE_SHA256 = "ab505dcac9297257e8432743c4f60f5a41a7c3f527880d917d6b55f65ddf4f86"
SOURCE_URL = "https://www.auvergne-rhone-alpes.developpement-durable.gouv.fr/IMG/ods/2023-06_listes_especes_determinantes_znieff_aura_internet.ods"
LANDING_URL = "https://www.auvergne-rhone-alpes.developpement-durable.gouv.fr/les-especes-et-habitats-determinantes-des-znieff-a19735.html"
ARCHIVE_URL = "https://web.archive.org/web/20260513033231/https://www.auvergne-rhone-alpes.developpement-durable.gouv.fr/IMG/ods/2023-06_listes_especes_determinantes_znieff_aura_internet.ods"

CURRENT_ZONES = [
    "Continentale - Massif central",
    "Continentale - Plaine rhodanienne",
    "Alpine",
    "Méditerranéenne",
]
LEGACY_ZONES = [
    "Auvergne",
    "Rhône-Alpes - Continentale",
    "Rhône-Alpes - Alpine",
    "Rhône-Alpes - Méditerranéenne",
]
SKIP_SHEETS = {
    "lisez-moi",
    "carte",
    "liste des communes",
    "habitats naturels - liste non revisee",
}


def normalize(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = text.replace("×", "x").replace("–", "-").replace("—", "-").replace("‑", "-")
    return re.sub(r"\s+", " ", text).strip().casefold()


def clean(value: object) -> str:
    text = str(value or "").replace("\xa0", " ").replace("–", "-").replace("—", "-").replace("‑", "-")
    return re.sub(r"\s+", " ", text).strip()


def semantic_status_key(value: object) -> str:
    key = normalize(value)
    # Césures typographiques internes du tableur, sans signification métier.
    return (
        key.replace("complemen-taire", "complementaire")
        .replace("determi-nante", "determinante")
        .replace("determi-nant", "determinant")
    )


def canonical_status_value(value: object) -> str:
    cleaned = clean(value)
    key = semantic_status_key(cleaned)
    if key == "complementaire":
        return "Complémentaire"
    if key == "determinante":
        return "Déterminante"
    if key == "non determinante":
        return "Non déterminante"
    return (
        cleaned.replace("Complémen-taire", "Complémentaire")
        .replace("complémen-taire", "complémentaire")
        .replace("Détermi-nante", "Déterminante")
        .replace("détermi-nante", "déterminante")
        .replace("Détermi-nant", "Déterminant")
        .replace("détermi-nant", "déterminant")
    )


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


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


def row_values(row: ET.Element, max_columns: int = 40) -> list[str]:
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


def realm_from_kingdom(value: object) -> str | None:
    kingdom = normalize(value)
    if kingdom == "animalia":
        return "fauna"
    if kingdom == "plantae":
        return "flora"
    return None


def taxref_lookup(path: Path, wanted_codes: set[int], wanted_names: set[str]):
    by_cd_nom: dict[int, tuple[int, str | None, str]] = {}
    by_name: dict[str, set[tuple[int, str | None, str]]] = defaultdict(set)

    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        for row in reader:
            cd_nom_raw = clean(row.get("CD_NOM"))
            cd_ref_raw = clean(row.get("CD_REF"))
            if not cd_nom_raw.isdigit() or not cd_ref_raw.isdigit():
                continue
            cd_nom = int(cd_nom_raw)
            cd_ref = int(cd_ref_raw)
            kingdom = clean(row.get("REGNE"))
            realm = realm_from_kingdom(kingdom)
            entry = (cd_ref, realm, kingdom)
            if cd_nom in wanted_codes:
                by_cd_nom[cd_nom] = entry
            if wanted_names:
                for field in ("LB_NOM", "NOM_COMPLET", "NOM_VALIDE"):
                    value = clean(row.get(field))
                    if not value:
                        continue
                    key = normalize(value)
                    if key in wanted_names:
                        by_name[key].add(entry)
    return by_cd_nom, by_name


def resolve_taxon(code: str, scientific_name: str, by_cd_nom, by_name):
    if code.isdigit():
        entry = by_cd_nom.get(int(code))
        if entry:
            cd_ref, realm, kingdom = entry
            if realm:
                return cd_ref, realm, "code", kingdom
            return cd_ref, None, "unsupported_realm", kingdom

    key = normalize(scientific_name)
    if key:
        candidates = by_name.get(key, set())
        supported = {entry for entry in candidates if entry[1] is not None}
        if len(supported) == 1:
            cd_ref, realm, kingdom = next(iter(supported))
            return cd_ref, realm, "name", kingdom
        if len(supported) > 1:
            return None, None, "ambiguous", ""
        if len(candidates) == 1:
            cd_ref, _realm, kingdom = next(iter(candidates))
            return cd_ref, None, "unsupported_realm", kingdom
    return None, None, "unmatched", ""


def classify_status(value: str) -> str:
    key = semantic_status_key(value)
    if not key:
        return "blank"
    if key.startswith("non determinante") or key.startswith("non determinant"):
        return "negative"
    if key.startswith("determinante") or key.startswith("determinant"):
        return "determining"
    if key.startswith("complementaire"):
        return "complementary"
    if "pas de liste" in key or "aucune liste" in key or "liste non disponible" in key:
        return "unavailable"
    return "unknown"


def compact_zone_label(value: str) -> str:
    key = normalize(value).replace("mediter-raneenne", "mediterraneenne")
    if "massif central" in key:
        return CURRENT_ZONES[0]
    if "plaine rhodanienne" in key:
        return CURRENT_ZONES[1]
    if key == "alpine" or key.endswith(" - alpine"):
        return CURRENT_ZONES[2] if "rhone-alpes" not in key else LEGACY_ZONES[2]
    if "mediterr" in key:
        return CURRENT_ZONES[3] if "rhone-alpes" not in key else LEGACY_ZONES[3]
    if key == "auvergne":
        return LEGACY_ZONES[0]
    if "rhone-alpes" in key and "continentale" in key:
        return LEGACY_ZONES[1]
    return clean(value)


def find_header(rows: list[list[str]]) -> tuple[int, int, int | None, int | None]:
    for index, row in enumerate(rows[:20]):
        normalized = [normalize(value) for value in row]
        code_col = next(
            (
                i
                for i, value in enumerate(normalized)
                if "cd_nom" in value or "cd nom" in value or "code ref taxref" in value or "cd_ref" in value
            ),
            None,
        )
        if code_col is None:
            continue
        name_col = next((i for i, value in enumerate(normalized) if "nom scientifique" in value), None)
        zone_col = next((i for i, value in enumerate(normalized) if "zones biogeographiques" in value), None)
        return index, code_col, name_col, zone_col
    raise RuntimeError("En-tête taxonomique introuvable")


def looks_like_zone(value: str) -> bool:
    key = normalize(value).replace("mediter-raneenne", "mediterraneenne")
    if key.startswith("rapport") or "http://" in key or "https://" in key or "www." in key:
        return False
    return any(token in key for token in ("massif central", "plaine rhodanienne", "alpine", "mediterr", "auvergne", "rhone-alpes"))


def zone_labels(rows: list[list[str]], header_index: int, zone_col: int) -> list[str]:
    for row in rows[header_index + 1 : header_index + 5]:
        raw = [row[i] if i < len(row) else "" for i in range(zone_col, zone_col + 4)]
        if sum(looks_like_zone(value) for value in raw) >= 3:
            return [compact_zone_label(value) for value in raw]
    return CURRENT_ZONES.copy()


def status_record(cd_ref: int, realm: str, sheet: str, value: str, zones: list[str], all_zones: list[str]):
    is_regional = len(zones) == len(all_zones) and set(zones) == set(all_zones)
    record = {
        "cdRef": cd_ref,
        "region": "ARA",
        "category": "znieff",
        "label": f"Statut ZNIEFF - {sheet}",
        "value": canonical_status_value(value),
        "sourceId": SOURCE_ID,
        "scope": "regional" if is_regional else "partial",
        "_realm": realm,
    }
    if not is_regional:
        prefix = "Zone biogéographique" if len(zones) == 1 else "Zones biogéographiques"
        record["scopeLabel"] = f"{prefix} : {', '.join(zones)}"
    return record


def parse_zoned_sheet(sheet: str, rows: list[list[str]], by_cd_nom, by_name, diagnostics):
    header_index, code_col, name_col, zone_col = find_header(rows)
    if zone_col is None:
        raise RuntimeError(f"{sheet}: colonne des zones biogéographiques introuvable")
    zones = zone_labels(rows, header_index, zone_col)
    if len(zones) != 4 or any(not zone for zone in zones):
        raise RuntimeError(f"{sheet}: zones biogéographiques invalides: {zones}")

    statuses = []
    evaluated: dict[str, set[int]] = {"flora": set(), "fauna": set()}
    sheet_stats = diagnostics["sheets"].setdefault(sheet, {
        "rows": 0,
        "matched": 0,
        "unsupportedRealm": 0,
        "unmatched": 0,
        "ambiguous": 0,
        "zones": zones,
        "values": Counter(),
        "emitted": 0,
    })

    for row in rows[header_index + 1 :]:
        code = clean(row[code_col] if code_col < len(row) else "")
        if not code.isdigit():
            continue
        scientific_name = clean(row[name_col] if name_col is not None and name_col < len(row) else "")
        sheet_stats["rows"] += 1
        cd_ref, realm, mode, kingdom = resolve_taxon(code, scientific_name, by_cd_nom, by_name)
        if mode == "unsupported_realm":
            sheet_stats["unsupportedRealm"] += 1
            diagnostics["unsupportedKingdoms"][kingdom or "inconnu"] += 1
            continue
        if cd_ref is None or realm is None:
            sheet_stats[mode] += 1
            if len(diagnostics["unresolvedSample"]) < 80:
                diagnostics["unresolvedSample"].append({"sheet": sheet, "code": code, "name": scientific_name, "reason": mode})
            continue
        sheet_stats["matched"] += 1
        diagnostics["resolutionModes"][mode] += 1

        raw_values = [clean(row[i] if i < len(row) else "") for i in range(zone_col, zone_col + 4)]
        classes = [classify_status(value) for value in raw_values]
        unknown = [(zones[i], raw_values[i]) for i, kind in enumerate(classes) if kind == "unknown"]
        if unknown:
            diagnostics["unknownStatusCells"].extend(
                {"sheet": sheet, "cdRef": cd_ref, "zone": zone, "value": value} for zone, value in unknown
            )
            continue

        if any(kind in {"determining", "complementary", "negative"} for kind in classes):
            evaluated[realm].add(cd_ref)

        grouped: dict[str, list[str]] = defaultdict(list)
        for zone, value, kind in zip(zones, raw_values, classes):
            if kind in {"determining", "complementary"}:
                canonical_value = canonical_status_value(value)
                grouped[canonical_value].append(zone)
                sheet_stats["values"][canonical_value] += 1

        for value, matching_zones in grouped.items():
            statuses.append(status_record(cd_ref, realm, sheet, value, matching_zones, zones))
            sheet_stats["emitted"] += 1

    return statuses, evaluated


def parse_fish_sheet(sheet: str, rows: list[list[str]], by_cd_nom, by_name, diagnostics):
    header_index, code_col, name_col, _zone_col = find_header(rows)
    header = [normalize(value) for value in rows[header_index]]
    determining_col = next((i for i, value in enumerate(header) if "espece determinante" in value), None)
    complementary_col = next((i for i, value in enumerate(header) if "espece complementaire" in value), None)
    if determining_col is None or complementary_col is None:
        raise RuntimeError(f"{sheet}: colonnes déterminante/complémentaire introuvables")

    statuses = []
    evaluated: dict[str, set[int]] = {"flora": set(), "fauna": set()}
    sheet_stats = diagnostics["sheets"].setdefault(sheet, {
        "rows": 0,
        "matched": 0,
        "unsupportedRealm": 0,
        "unmatched": 0,
        "ambiguous": 0,
        "zones": ["Auvergne-Rhône-Alpes"],
        "values": Counter(),
        "emitted": 0,
    })

    for row in rows[header_index + 1 :]:
        code = clean(row[code_col] if code_col < len(row) else "")
        if not code.isdigit():
            continue
        scientific_name = clean(row[name_col] if name_col is not None and name_col < len(row) else "")
        sheet_stats["rows"] += 1
        cd_ref, realm, mode, kingdom = resolve_taxon(code, scientific_name, by_cd_nom, by_name)
        if mode == "unsupported_realm":
            sheet_stats["unsupportedRealm"] += 1
            diagnostics["unsupportedKingdoms"][kingdom or "inconnu"] += 1
            continue
        if cd_ref is None or realm is None:
            sheet_stats[mode] += 1
            if len(diagnostics["unresolvedSample"]) < 80:
                diagnostics["unresolvedSample"].append({"sheet": sheet, "code": code, "name": scientific_name, "reason": mode})
            continue
        sheet_stats["matched"] += 1
        diagnostics["resolutionModes"][mode] += 1

        determining = normalize(row[determining_col] if determining_col < len(row) else "") in {"x", "oui", "1"}
        complementary = normalize(row[complementary_col] if complementary_col < len(row) else "") in {"x", "oui", "1"}
        if determining and complementary:
            raise RuntimeError(f"{sheet}: taxon {cd_ref} simultanément déterminant et complémentaire")
        evaluated[realm].add(cd_ref)
        if not determining and not complementary:
            continue
        value = "Déterminante" if determining else "Complémentaire"
        statuses.append({
            "cdRef": cd_ref,
            "region": "ARA",
            "category": "znieff",
            "label": f"Statut ZNIEFF - {sheet}",
            "value": value,
            "sourceId": SOURCE_ID,
            "scope": "regional",
            "_realm": realm,
        })
        sheet_stats["values"][value] += 1
        sheet_stats["emitted"] += 1
    return statuses, evaluated


def merge_evaluated(target: dict[str, set[int]], incoming: dict[str, set[int]]) -> None:
    for realm in ("flora", "fauna"):
        target[realm].update(incoming[realm])


def source_candidates(sheets: dict[str, list[list[str]]]):
    codes: set[int] = set()
    names: set[str] = set()
    for sheet, rows in sheets.items():
        sheet_key = normalize(sheet)
        if sheet_key in SKIP_SHEETS or not rows:
            continue
        try:
            header_index, code_col, name_col, _zone_col = find_header(rows)
        except RuntimeError:
            continue
        for row in rows[header_index + 1 :]:
            code = clean(row[code_col] if code_col < len(row) else "")
            if code.isdigit():
                codes.add(int(code))
            if name_col is not None and name_col < len(row):
                name = clean(row[name_col])
                if name:
                    names.add(normalize(name))
    return codes, names


def serialize_diagnostics(diagnostics: dict) -> dict:
    result = dict(diagnostics)
    result["resolutionModes"] = dict(sorted(diagnostics["resolutionModes"].items()))
    result["unsupportedKingdoms"] = dict(sorted(diagnostics["unsupportedKingdoms"].items()))
    result["sheets"] = {
        name: {
            **stats,
            **({"values": dict(sorted(stats["values"].items()))} if "values" in stats else {}),
        }
        for name, stats in diagnostics["sheets"].items()
    }
    return result


def build_package(taxref_path: Path, ods_path: Path, checked_at: str, min_match_rate: float):
    digest = sha256(ods_path)
    if digest != SOURCE_SHA256:
        raise SystemExit(f"SHA-256 ARA inattendu: {digest} != {SOURCE_SHA256}")

    sheets = read_ods(ods_path)
    wanted_codes, wanted_names = source_candidates(sheets)
    by_cd_nom, by_name = taxref_lookup(taxref_path, wanted_codes, wanted_names)

    diagnostics = {
        "sourceSha256": digest,
        "sheetCount": len(sheets),
        "sheets": {},
        "resolutionModes": Counter(),
        "unsupportedKingdoms": Counter(),
        "unresolvedSample": [],
        "unknownStatusCells": [],
    }
    statuses = []
    evaluated: dict[str, set[int]] = {"flora": set(), "fauna": set()}

    parsed_sheets = 0
    for sheet, rows in sheets.items():
        sheet_key = normalize(sheet)
        if sheet_key in SKIP_SHEETS or not rows:
            continue
        try:
            _header_index, _code_col, _name_col, zone_col = find_header(rows)
        except RuntimeError:
            diagnostics["sheets"][sheet] = {"skipped": "aucun en-tête taxonomique reconnu"}
            continue

        if zone_col is not None:
            sheet_statuses, sheet_evaluated = parse_zoned_sheet(sheet, rows, by_cd_nom, by_name, diagnostics)
        elif "poisson" in sheet_key or "ecr" in sheet_key:
            sheet_statuses, sheet_evaluated = parse_fish_sheet(sheet, rows, by_cd_nom, by_name, diagnostics)
        else:
            diagnostics["sheets"][sheet] = {"skipped": "schéma taxonomique sans zones non pris en charge"}
            continue
        parsed_sheets += 1
        statuses.extend(sheet_statuses)
        merge_evaluated(evaluated, sheet_evaluated)

    if not parsed_sheets:
        raise SystemExit("Aucun onglet d'espèces ARA exploitable")
    if diagnostics["unknownStatusCells"]:
        sample = diagnostics["unknownStatusCells"][:20]
        raise SystemExit(f"Valeurs ZNIEFF ARA inconnues ({len(diagnostics['unknownStatusCells'])}): {sample}")

    matched = sum(stats.get("matched", 0) for stats in diagnostics["sheets"].values() if isinstance(stats, dict))
    unresolved = sum(
        stats.get("unmatched", 0) + stats.get("ambiguous", 0)
        for stats in diagnostics["sheets"].values()
        if isinstance(stats, dict)
    )
    match_rate = matched / (matched + unresolved) if matched + unresolved else 1.0
    diagnostics["matched"] = matched
    diagnostics["unresolved"] = unresolved
    diagnostics["matchRate"] = round(match_rate, 6)
    diagnostics["evaluatedRefs"] = {realm: len(refs) for realm, refs in evaluated.items()}
    diagnostics["statusCount"] = len(statuses)
    diagnostics["parsedSheets"] = parsed_sheets
    if match_rate < min_match_rate:
        raise SystemExit(f"Taux de raccord TAXREF ARA insuffisant: {match_rate:.2%} < {min_match_rate:.2%}")

    replacements = [
        {"region": "ARA", "category": "znieff", "realm": realm, "cdRefs": sorted(refs)}
        for realm, refs in evaluated.items()
        if refs
    ]

    seen = set()
    clean_statuses = []
    for status in statuses:
        public = {key: value for key, value in status.items() if key != "_realm"}
        key = tuple((field, json.dumps(public.get(field), ensure_ascii=False, sort_keys=True)) for field in sorted(public))
        if key in seen:
            continue
        seen.add(key)
        clean_statuses.append(public)
    clean_statuses.sort(key=lambda item: (item["cdRef"], item["label"], item["value"], item.get("scopeLabel", "")))

    package = {
        "schemaVersion": 1,
        "source": {
            "id": SOURCE_ID,
            "name": "Espèces déterminantes ZNIEFF Auvergne-Rhône-Alpes",
            "producer": "DREAL Auvergne-Rhône-Alpes / CSRPN Auvergne-Rhône-Alpes",
            "version": "ODS 2023-06 (archive officielle capturée le 13/05/2026)",
            "publicationYear": 2023,
            "official": True,
            "checkedAt": checked_at,
            "sha256": digest,
            "landingPage": LANDING_URL,
            "sourceUrl": SOURCE_URL,
            "archiveUrl": ARCHIVE_URL,
        },
        "replaces": replacements,
        "statuses": clean_statuses,
        "diagnostics": serialize_diagnostics(diagnostics),
    }
    return package


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--taxref", required=True)
    parser.add_argument("--ods", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--checked-at", default=date.today().isoformat())
    parser.add_argument("--min-match-rate", type=float, default=0.97)
    args = parser.parse_args()

    package = build_package(Path(args.taxref), Path(args.ods), args.checked_at, args.min_match_rate)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(package, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps(package["diagnostics"], ensure_ascii=False, indent=2))
    print(f"Paquet écrit: {out} - {len(package['statuses'])} statuts, {sum(len(rule['cdRefs']) for rule in package['replaces'])} références évaluées")


if __name__ == "__main__":
    main()
