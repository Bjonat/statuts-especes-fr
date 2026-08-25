#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import unicodedata
from collections import defaultdict
from datetime import date
from pathlib import Path

REALM_BY_KINGDOM = {"animalia": "fauna", "plantae": "flora"}
MAX_VALUE_LENGTH = 80
RESPONSABILITE_SOURCE_ID = "oeb-bretagne-responsabilite-csv-2026-07-29"
RESPONSABILITE_SHA256 = "38965de26b6c462d5a366b92b9c80bd586b88ff7273603d591367f49c02a7240"
# Les oiseaux ont deux évaluations distinctes (nicheurs / migrateurs) sur les mêmes taxons.
PARTIAL_RESPONSABILITE_GROUPS = {"Oiseaux nicheurs", "Oiseaux migrateurs"}
EXPLICITE_BY_CODE = {
    "1": "mineure",
    "2": "modérée",
    "3": "élevée",
    "4": "très élevée",
    "5": "majeure",
    "NA": "non évaluée car marginale ou exotique",
}


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
    lowered = {str(key).strip().casefold(): str(value or "").strip() for key, value in row.items()}
    for name in names:
        value = lowered.get(name.casefold(), "")
        if value:
            return value
    return ""


def read_csv_rows(path: Path) -> list[dict[str, str]]:
    data = path.read_bytes()
    text = None
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin1"):
        try:
            text = data.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        raise RuntimeError(f"Impossible de décoder {path}")
    try:
        delimiter = csv.Sniffer().sniff(text[:16000], delimiters=";\t,|").delimiter
    except csv.Error:
        delimiter = ";"
    return list(csv.DictReader(io.StringIO(text), delimiter=delimiter))


def wanted_from_rows(rows: list[dict[str, str]], code_fields: tuple[str, ...], name_fields: tuple[str, ...]):
    codes: set[int] = set()
    names: set[str] = set()
    for row in rows:
        code = row_value(row, *code_fields)
        if code.isdigit():
            codes.add(int(code))
        for field in name_fields:
            name = row_value(row, field)
            if name:
                names.add(normalize(name))
    return codes, names


def taxref_lookup(path: Path, wanted_codes: set[int], wanted_names: set[str]):
    by_cd_nom: dict[int, tuple[int, str | None]] = {}
    accepted_names = defaultdict(set)
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        for row in reader:
            cd_nom_raw = str(row.get("CD_NOM") or "").strip()
            cd_ref_raw = str(row.get("CD_REF") or "").strip()
            if not cd_nom_raw.isdigit() or not cd_ref_raw.isdigit():
                continue
            cd_nom = int(cd_nom_raw)
            kingdom = normalize(row.get("REGNE"))
            realm = REALM_BY_KINGDOM.get(kingdom)
            if cd_nom in wanted_codes:
                by_cd_nom[cd_nom] = (int(cd_ref_raw), realm)
            if realm and wanted_names:
                for field in ("LB_NOM", "NOM_COMPLET", "NOM_VALIDE"):
                    label = row.get(field)
                    if not label:
                        continue
                    key = normalize(label)
                    if key in wanted_names:
                        accepted_names[key].add((int(cd_ref_raw), realm))
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


def targeted_replacements(statuses, category: str):
    replacements = []
    for realm in ("flora", "fauna"):
        refs = sorted({status["cdRef"] for status in statuses if status.get("_realm") == realm})
        if refs:
            replacements.append({"region": "BRE", "category": category, "realm": realm, "cdRefs": refs})
    return replacements


def clean_statuses(statuses):
    return [{key: value for key, value in status.items() if key != "_realm"} for status in statuses]


def build_znieff(rows, by_cd_nom, accepted_names, csv_path: Path, checked_at: str):
    stats = diagnostics_template()
    statuses = []
    seen = set()
    years = set()
    groups = set()

    for row in rows:
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
            "_realm": realm,
        })

    finalize_diagnostics(stats)
    stats["years"] = sorted(years)
    stats["groups"] = sorted(groups)
    replacements = targeted_replacements(statuses, "znieff")
    public_statuses = clean_statuses(statuses)
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
        "replaces": replacements,
        "statuses": sorted(public_statuses, key=lambda status: (status["cdRef"], status["category"])),
        "diagnostics": stats,
    }


def build_lrr(rows, by_cd_nom, accepted_names, csv_path: Path, checked_at: str):
    stats = diagnostics_template()
    statuses = []
    seen = set()
    years = defaultdict(int)
    groups = defaultdict(int)
    values = defaultdict(int)

    for row in rows:
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
            "_realm": realm,
        })

    finalize_diagnostics(stats)
    stats["years"] = dict(sorted(years.items()))
    stats["groups"] = dict(sorted(groups.items()))
    stats["values"] = dict(sorted(values.items()))
    replacements = targeted_replacements(statuses, "red_list_regional")
    public_statuses = clean_statuses(statuses)
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
        "replaces": replacements,
        "statuses": sorted(public_statuses, key=lambda status: (status["cdRef"], status["value"])),
        "diagnostics": stats,
    }


def compact_value(value: str) -> str | None:
    text = re.sub(r"\s+", " ", value).strip()
    if not text or len(text) > MAX_VALUE_LENGTH:
        return None
    return text


def responsabilite_value(row: dict[str, str]) -> str | None:
    code = row_value(row, "RESULTAT_EVALUATION").upper()
    if not code:
        return None
    explicit = row_value(row, "RESULTAT_EXPLICITE")
    if explicit:
        return compact_value(explicit)
    mapped = EXPLICITE_BY_CODE.get(code)
    if mapped:
        return compact_value(mapped)
    return compact_value(code)


def build_responsabilite(rows, by_cd_nom, accepted_names, csv_path: Path, checked_at: str):
    digest = sha256(csv_path)
    if digest != RESPONSABILITE_SHA256:
        raise RuntimeError(f"{RESPONSABILITE_SOURCE_ID}: SHA-256 inattendu {digest}")

    stats = diagnostics_template()
    statuses = []
    seen = set()
    years = defaultdict(int)
    groups = defaultdict(int)
    values = defaultdict(int)

    for row in rows:
        if row_value(row, "TYPE_EVALUATION").casefold() != "responsabilité biologique régionale":
            continue
        value = responsabilite_value(row)
        if not value:
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
        values[value] += 1

        if group in PARTIAL_RESPONSABILITE_GROUPS:
            scope = "partial"
            scope_label = group
        else:
            scope = "regional"
            scope_label = None

        key = (cd_ref, realm, value, scope, scope_label or "")
        if key in seen:
            continue
        seen.add(key)
        status = {
            "cdRef": cd_ref,
            "region": "BRE",
            "category": "regional_responsibility",
            "label": "Responsabilité biologique régionale",
            "value": value,
            "sourceId": RESPONSABILITE_SOURCE_ID,
            "scope": scope,
            "_realm": realm,
        }
        if scope_label:
            status["scopeLabel"] = scope_label
        statuses.append(status)

    finalize_diagnostics(stats)
    stats["years"] = dict(sorted(years.items()))
    stats["groups"] = dict(sorted(groups.items()))
    stats["values"] = dict(sorted(values.items()))
    replacements = targeted_replacements(statuses, "regional_responsibility")
    public_statuses = clean_statuses(statuses)
    return {
        "schemaVersion": 1,
        "source": {
            "id": RESPONSABILITE_SOURCE_ID,
            "name": "Responsabilité biologique régionale Bretagne",
            "producer": "Observatoire de l'environnement en Bretagne / observatoires régionaux faune-flore / CSRPN Bretagne",
            "version": "CSV data.gouv 29/07/2026 - mise à jour OEB 2025",
            "publicationYear": 2025,
            "official": True,
            "checkedAt": checked_at,
            "sha256": digest,
            "landingPage": "https://bretagne-environnement.fr/article/indicateurs-responsabilite-biologique-regionale-bretagne-especes",
            "sourceUrl": "https://www.data.gouv.fr/api/1/datasets/r/b1d4b313-965a-4bc1-945d-32332befa07a",
        },
        "replaces": replacements,
        "statuses": sorted(
            public_statuses,
            key=lambda status: (status["cdRef"], status.get("scopeLabel", ""), status["value"]),
        ),
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
    if not package["statuses"]:
        raise SystemExit(f"{package['source']['id']}: aucun statut produit")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(package, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Paquet écrit: {output} - {len(package['statuses'])} statuts")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--taxref", required=True)
    parser.add_argument("--znieff", required=True)
    parser.add_argument("--lrr", required=True)
    parser.add_argument("--responsabilite", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--checked-at", default=date.today().isoformat())
    parser.add_argument("--min-match-rate", type=float, default=0.97)
    args = parser.parse_args()

    znieff_path = Path(args.znieff)
    lrr_path = Path(args.lrr)
    responsabilite_path = Path(args.responsabilite)
    znieff_rows = read_csv_rows(znieff_path)
    lrr_rows = read_csv_rows(lrr_path)
    responsabilite_rows = read_csv_rows(responsabilite_path)

    z_codes, z_names = wanted_from_rows(znieff_rows, ("CD_NOM",), ("NOM_SCIEN_VALIDE", "NOM_SCIENTIFIQUE_TAXREF"))
    l_codes, l_names = wanted_from_rows(lrr_rows, ("CODE_NOM_TAXREF", "CD_NOM"), ("NOM_SCIENTIFIQUE_TAXREF", "NOM_SCIEN_VALIDE"))
    r_codes, r_names = wanted_from_rows(
        responsabilite_rows,
        ("CODE_NOM_TAXREF", "CD_NOM"),
        ("NOM_SCIENTIFIQUE_TAXREF", "NOM_SCIEN_VALIDE"),
    )
    by_cd_nom, accepted_names = taxref_lookup(
        Path(args.taxref),
        z_codes | l_codes | r_codes,
        z_names | l_names | r_names,
    )

    out_dir = Path(args.out_dir)
    write_package(
        build_znieff(znieff_rows, by_cd_nom, accepted_names, znieff_path, args.checked_at),
        out_dir / "bre-znieff.json",
        args.min_match_rate,
    )
    write_package(
        build_lrr(lrr_rows, by_cd_nom, accepted_names, lrr_path, args.checked_at),
        out_dir / "bre-lrr.json",
        args.min_match_rate,
    )
    write_package(
        build_responsabilite(responsabilite_rows, by_cd_nom, accepted_names, responsabilite_path, args.checked_at),
        out_dir / "bre-responsabilite.json",
        args.min_match_rate,
    )


if __name__ == "__main__":
    main()
