#!/usr/bin/env python3
from __future__ import annotations

import csv
import hashlib
import io
import json
import re
import sys
import urllib.request
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

USER_AGENT = "Mozilla/5.0 (compatible; statuts-especes-fr/1.0; +https://github.com/Bjonat/statuts-especes-fr)"


def download(url: str) -> bytes:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "*/*",
            "Cache-Control": "no-cache",
        },
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read()


def text_signature(data: bytes) -> str:
    head = data[:512].lstrip().lower()
    if head.startswith(b"<!doctype html") or head.startswith(b"<html"):
        return "html"
    if data.startswith(b"PK\x03\x04"):
        return "zip"
    if data.startswith(bytes.fromhex("D0CF11E0A1B11AE1")):
        return "xls"
    return "text-or-binary"


def col_index(cell_ref: str) -> int:
    match = re.match(r"([A-Z]+)", cell_ref or "")
    if not match:
        return 0
    result = 0
    for char in match.group(1):
        result = result * 26 + ord(char) - 64
    return result - 1


def xlsx_preview(data: bytes, max_rows: int = 8) -> dict:
    ns_main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    ns_rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    ns_pkg = "http://schemas.openxmlformats.org/package/2006/relationships"
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        names = set(archive.namelist())
        shared: list[str] = []
        if "xl/sharedStrings.xml" in names:
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in root.findall(f"{{{ns_main}}}si"):
                shared.append("".join(node.text or "" for node in item.iter(f"{{{ns_main}}}t")))

        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        rel_targets = {
            node.attrib["Id"]: node.attrib["Target"]
            for node in rels.findall(f"{{{ns_pkg}}}Relationship")
        }
        sheets = []
        for sheet in workbook.find(f"{{{ns_main}}}sheets") or []:
            rid = sheet.attrib.get(f"{{{ns_rel}}}id")
            target = rel_targets.get(rid or "", "")
            if target.startswith("/"):
                path = target.lstrip("/")
            elif target.startswith("xl/"):
                path = target
            else:
                path = f"xl/{target}"
            sheets.append((sheet.attrib.get("name", "?"), path))

        preview = []
        for sheet_name, path in sheets[:6]:
            if path not in names:
                preview.append({"sheet": sheet_name, "error": f"missing {path}"})
                continue
            root = ET.fromstring(archive.read(path))
            sheet_data = root.find(f"{{{ns_main}}}sheetData")
            rows = []
            for row in list(sheet_data or [])[:max_rows]:
                values: list[str] = []
                for cell in row.findall(f"{{{ns_main}}}c"):
                    index = col_index(cell.attrib.get("r", "A1"))
                    while len(values) <= index:
                        values.append("")
                    cell_type = cell.attrib.get("t")
                    value_node = cell.find(f"{{{ns_main}}}v")
                    inline = cell.find(f"{{{ns_main}}}is")
                    value = ""
                    if cell_type == "inlineStr" and inline is not None:
                        value = "".join(node.text or "" for node in inline.iter(f"{{{ns_main}}}t"))
                    elif value_node is not None and value_node.text is not None:
                        raw = value_node.text
                        if cell_type == "s" and raw.isdigit() and int(raw) < len(shared):
                            value = shared[int(raw)]
                        else:
                            value = raw
                    values[index] = value
                if any(value.strip() for value in values):
                    rows.append(values[:30])
            preview.append({"sheet": sheet_name, "rows": rows})
        return {"sheets": [name for name, _ in sheets], "preview": preview}


def ods_preview(data: bytes, max_rows: int = 8) -> dict:
    ns = {
        "table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
        "text": "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
        "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
    }
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        root = ET.fromstring(archive.read("content.xml"))
    spreadsheet = root.find("office:body/office:spreadsheet", ns)
    sheets = []
    preview = []
    for table in list(spreadsheet or [])[:10]:
        if table.tag != f"{{{ns['table']}}}table":
            continue
        name = table.attrib.get(f"{{{ns['table']}}}name", "?")
        sheets.append(name)
        rows = []
        for row in table.findall("table:table-row", ns):
            values = []
            repeat_rows = int(row.attrib.get(f"{{{ns['table']}}}number-rows-repeated", "1"))
            if repeat_rows > 50 and not values:
                continue
            for cell in row.findall("table:table-cell", ns):
                repeat = min(int(cell.attrib.get(f"{{{ns['table']}}}number-columns-repeated", "1")), 30)
                text = " ".join((node.text or "").strip() for node in cell.findall(".//text:p", ns)).strip()
                values.extend([text] * repeat)
                if len(values) >= 30:
                    break
            values = values[:30]
            if any(value for value in values):
                rows.append(values)
            if len(rows) >= max_rows:
                break
        preview.append({"sheet": name, "rows": rows})
    return {"sheets": sheets, "preview": preview}


def csv_preview(data: bytes, max_rows: int = 8) -> dict:
    text = None
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin1"):
        try:
            text = data.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        raise RuntimeError("CSV non décodable")
    sample = text[:20000]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=";,\t|")
        delimiter = dialect.delimiter
    except csv.Error:
        delimiter = ";"
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    rows = []
    for row in reader:
        if any(str(value).strip() for value in row):
            rows.append(row[:40])
        if len(rows) >= max_rows:
            break
    return {"delimiter": delimiter, "preview": rows}


def inspect_resource(kind: str, data: bytes) -> dict:
    signature = text_signature(data)
    if signature == "html":
        title = re.search(rb"<title[^>]*>(.*?)</title>", data[:50000], re.I | re.S)
        title_text = re.sub(rb"\s+", b" ", title.group(1)).decode("utf-8", "replace") if title else "HTML"
        raise RuntimeError(f"page HTML reçue à la place du fichier ({title_text[:160]})")
    if kind == "xlsx":
        if signature != "zip":
            raise RuntimeError(f"signature invalide pour XLSX: {signature}")
        return xlsx_preview(data)
    if kind == "ods":
        if signature != "zip":
            raise RuntimeError(f"signature invalide pour ODS: {signature}")
        return ods_preview(data)
    if kind == "csv":
        return csv_preview(data)
    if kind == "xls":
        if signature != "xls":
            raise RuntimeError(f"signature invalide pour XLS: {signature}")
        return {"signature": "xls-binary", "preview": "inspection détaillée via xlrd dans le connecteur"}
    return {"signature": signature}


def is_known_maintenance(message: str) -> bool:
    lowered = message.casefold()
    return "page html reçue" in lowered and "maintenance en cours" in lowered


def main() -> None:
    manifest_path = Path(sys.argv[1] if len(sys.argv) > 1 else "data-pipeline/regions/ready-sources.json")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    failures = []
    unavailable = []
    inspected = 0
    for source in manifest["sources"]:
        resources = source.get("resources", [])
        if not resources:
            print(f"::notice::{source['id']}: découverte de ressource encore requise ({source.get('resourceDiscovery', 'non précisé')})")
            continue
        for index, resource in enumerate(resources, 1):
            url = resource["url"]
            label = f"{source['id']}#{index}"
            try:
                data = download(url)
                digest = hashlib.sha256(data).hexdigest()
                report = inspect_resource(resource["kind"], data)
                inspected += 1
                print(f"\n### {label}")
                print(json.dumps({
                    "region": source["region"],
                    "kind": resource["kind"],
                    "group": resource.get("group"),
                    "realm": resource.get("realm"),
                    "bytes": len(data),
                    "sha256": digest,
                    "url": url,
                    **report,
                }, ensure_ascii=False, indent=2))
            except Exception as exc:
                message = str(exc)
                if is_known_maintenance(message):
                    unavailable.append((label, message))
                    print(f"::warning::{label}: source officiellement identifiée mais momentanément indisponible ({message})")
                else:
                    failures.append((label, message))
                    print(f"::error::{label}: {message}")

    print(
        f"\n{inspected} ressource(s) READY inspectée(s), "
        f"{len(unavailable)} indisponible(s) pour maintenance connue, {len(failures)} échec(s) réel(s)."
    )
    if unavailable:
        print("\nIndisponibilités non bloquantes :")
        for label, message in unavailable:
            print(f"- {label}: {message}")
    if failures:
        print("\nÉchecs bloquants :")
        for label, message in failures:
            print(f"- {label}: {message}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
