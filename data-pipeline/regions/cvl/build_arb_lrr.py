#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import subprocess
import unicodedata
from collections import defaultdict
from datetime import date
from pathlib import Path

UICN = r"(?:RE|CR\*?|EN|VU|NT|LC|DD|NA|NE)"
SCIENTIFIC_ROW = re.compile(
    rf"(?P<name>[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+(?:\s+[a-zà-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+){{1,3}})\s+(?P<category>{UICN})(?=\s|$)"
)
BINOMIAL = re.compile(
    r"[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+(?:\s+[a-zà-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+){1,3}"
)
RANK_MARKERS = {
    "subsp.", "subsp", "ssp.", "ssp", "var.", "var", "f.", "f", "fo.", "fo",
    "subvar.", "subvar", "nothosubsp.", "nothosubsp",
}

SOURCES = {
    "odonates": {
        "id": "arb-cvl-lrr-odonates-2022",
        "name": "Liste rouge des Odonates Centre-Val de Loire",
        "version": "2022",
        "publicationYear": 2022,
        "minimumRows": 60,
    },
    "papillons": {
        "id": "arb-cvl-lrr-papillons-2024",
        "name": "Liste rouge des Papillons de jour et Zygènes Centre-Val de Loire",
        "version": "2024",
        "publicationYear": 2024,
        "minimumRows": 130,
    },
}


def normalize(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = text.replace("×", "x").replace("’", "'")
    return re.sub(r"\s+", " ", text).strip().casefold()


def core_name(value: object) -> str:
    tokens = str(value or "").replace("×", "x").strip().split()
    if len(tokens) < 2:
        return normalize(value)
    keep = tokens[:2]
    if len(tokens) >= 4 and tokens[2].casefold() in RANK_MARKERS:
        keep.extend(tokens[2:4])
    return normalize(" ".join(keep))


def header_value(row: dict[str, str], *names: str) -> str:
    lowered = {str(key).strip().casefold(): value for key, value in row.items()}
    for name in names:
        if name.casefold() in lowered:
            return str(lowered[name.casefold()] or "").strip()
    return ""


def taxref_lookup(path: Path):
    accepted: defaultdict[str, set[int]] = defaultdict(set)
    exact: defaultdict[str, set[int]] = defaultdict(set)
    bare: defaultdict[str, set[int]] = defaultdict(set)
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        for row in reader:
            if header_value(row, "REGNE").casefold() != "animalia":
                continue
            cd_ref_raw = header_value(row, "CD_REF")
            if not cd_ref_raw.isdigit():
                continue
            cd_ref = int(cd_ref_raw)
            cd_nom_raw = header_value(row, "CD_NOM")
            is_accepted = cd_nom_raw.isdigit() and int(cd_nom_raw) == cd_ref
            for field in ("LB_NOM", "NOM_COMPLET", "NOM_VALIDE"):
                label = header_value(row, field)
                if not label:
                    continue
                key = normalize(label)
                exact[key].add(cd_ref)
                if is_accepted:
                    accepted[key].add(cd_ref)
            lb_nom = header_value(row, "LB_NOM")
            if lb_nom:
                bare[core_name(lb_nom)].add(cd_ref)
    return accepted, exact, bare


def resolve_taxon(name: str, accepted, exact, bare):
    candidates = accepted.get(normalize(name), set())
    if len(candidates) == 1:
        return next(iter(candidates)), "accepted"
    candidates = exact.get(normalize(name), set())
    if len(candidates) == 1:
        return next(iter(candidates)), "exact"
    candidates = bare.get(core_name(name), set())
    if len(candidates) == 1:
        return next(iter(candidates)), "core"
    if len(candidates) > 1:
        return None, "ambiguous"
    return None, "unmatched"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def pdf_text(path: Path) -> str:
    try:
        result = subprocess.run(
            ["pdftotext", "-layout", str(path), "-"],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("pdftotext introuvable; installer poppler-utils") from exc
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f"échec pdftotext pour {path.name}: {exc.stderr.decode('utf-8', 'replace')}") from exc
    return result.stdout.decode("utf-8", "replace")


def table_section(text: str) -> str:
    normalized = text.casefold()
    marker = "liste par catégories de menace"
    index = normalized.rfind(marker)
    if index < 0:
        marker = "liste des espèces par catégories de menace"
        index = normalized.rfind(marker)
    if index < 0:
        raise RuntimeError("tableau final 'Liste par catégories de menace' introuvable")
    return text[index:]


def parse_rows(text: str):
    rows = []
    seen = set()
    suspicious = []
    for raw_line in table_section(text).splitlines():
        line = re.sub(r"\s+$", "", raw_line)
        match = SCIENTIFIC_ROW.search(line)
        if match:
            name = re.sub(r"\s+", " ", match.group("name")).strip()
            category = match.group("category")
            key = (normalize(name), category)
            if key not in seen:
                seen.add(key)
                rows.append((name, category))
            continue
        if BINOMIAL.search(line) and re.search(rf"\b{UICN}\b", line):
            suspicious.append(re.sub(r"\s+", " ", line).strip())
    return rows, suspicious[:50]


def build_one(kind: str, pdf_path: Path, accepted, exact, bare, checked_at: str):
    metadata = SOURCES[kind]
    rows, suspicious = parse_rows(pdf_text(pdf_path))
    if len(rows) < metadata["minimumRows"]:
        raise RuntimeError(
            f"{kind}: seulement {len(rows)} lignes UICN extraites; minimum attendu {metadata['minimumRows']}"
        )

    statuses = []
    seen_statuses = set()
    stats = {
        "rowsParsed": len(rows),
        "accepted": 0,
        "exact": 0,
        "core": 0,
        "unmatched": 0,
        "ambiguous": 0,
        "categories": {},
    }
    unresolved = []
    categories: defaultdict[str, int] = defaultdict(int)

    for taxon_name, category in rows:
        categories[category] += 1
        cd_ref, mode = resolve_taxon(taxon_name, accepted, exact, bare)
        stats[mode] += 1
        if cd_ref is None:
            unresolved.append({"taxon": taxon_name, "category": category, "reason": mode})
            continue
        key = (cd_ref, category)
        if key in seen_statuses:
            continue
        seen_statuses.add(key)
        statuses.append({
            "cdRef": cd_ref,
            "region": "CVL",
            "category": "red_list_regional",
            "label": "Liste rouge régionale",
            "value": category,
            "sourceId": metadata["id"],
            "scope": "regional",
        })

    matched = stats["accepted"] + stats["exact"] + stats["core"]
    match_rate = matched / len(rows) if rows else 0
    stats["matched"] = matched
    stats["matchRate"] = round(match_rate, 6)
    stats["categories"] = dict(sorted(categories.items()))
    stats["unresolvedSample"] = unresolved[:50]
    stats["suspiciousUnparsedLines"] = suspicious

    covered_refs = sorted({status["cdRef"] for status in statuses})
    package = {
        "schemaVersion": 1,
        "source": {
            "id": metadata["id"],
            "name": metadata["name"],
            "producer": "Observatoire régional de la biodiversité / ARB Centre-Val de Loire / CSRPN Centre-Val de Loire",
            "version": metadata["version"],
            "publicationYear": metadata["publicationYear"],
            "official": True,
            "checkedAt": checked_at,
            "sha256": sha256(pdf_path),
        },
        "replaces": [
            {
                "region": "CVL",
                "category": "red_list_regional",
                "realm": "fauna",
                "cdRefs": covered_refs,
            }
        ],
        "statuses": sorted(statuses, key=lambda status: status["cdRef"]),
        "diagnostics": stats,
    }
    return package


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--taxref", required=True)
    parser.add_argument("--odonates", required=True)
    parser.add_argument("--papillons", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--checked-at", default=date.today().isoformat())
    parser.add_argument("--min-match-rate", type=float, default=0.97)
    args = parser.parse_args()

    accepted, exact, bare = taxref_lookup(Path(args.taxref))
    output_dir = Path(args.out_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    inputs = {
        "odonates": Path(args.odonates),
        "papillons": Path(args.papillons),
    }
    total = 0
    for kind, pdf_path in inputs.items():
        package = build_one(kind, pdf_path, accepted, exact, bare, args.checked_at)
        diagnostics = package["diagnostics"]
        print(json.dumps({"source": package["source"]["id"], **diagnostics}, ensure_ascii=False, indent=2))
        if diagnostics["matchRate"] < args.min_match_rate:
            raise SystemExit(
                f"{kind}: taux de correspondance TAXREF insuffisant: "
                f"{diagnostics['matchRate']:.2%} < {args.min_match_rate:.2%}"
            )
        output = output_dir / f"cvl-lrr-{kind}.json"
        output.write_text(json.dumps(package, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        total += len(package["statuses"])
        print(f"Paquet écrit: {output} - {len(package['statuses'])} statuts")

    print(f"Centre-Val de Loire: {len(inputs)} paquets, {total} statuts LRR")


if __name__ == "__main__":
    main()
