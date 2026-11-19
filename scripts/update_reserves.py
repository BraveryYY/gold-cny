"""Merge newly reported gold holdings and aggregate monthly global reserve changes."""

import argparse
import csv
from datetime import date, datetime
import io
import json
import math
from pathlib import Path
import re
import sys
from urllib.parse import urlencode, urljoin
from urllib.request import urlopen
from xml.etree import ElementTree
from zipfile import BadZipFile, ZipFile
from zoneinfo import ZoneInfo

from reserve_sources import fetch_global_holdings, fetch_reserves


ROOT = Path(__file__).resolve().parent.parent
MONTHS_IN_YEAR = 12
GRAMS_PER_TROY_OUNCE = 31.1034768
PINK_SHEET_URL = "https://www.worldbank.org/en/research/commodity-markets"
FRED_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv"
SPREADSHEET = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
RELATIONSHIP_ID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"


def shift_month(month, offset):
    year, number = map(int, month.split("-"))
    year, remainder = divmod(year * 12 + number - 1 + offset, 12)
    return f"{year:04d}-{remainder + 1:02d}"


def month_range(first, last):
    month = first
    while month <= last:
        yield month
        month = shift_month(month, 1)


def read_url(url):
    with urlopen(url, timeout=25) as response:
        return response.read()


def gold_prices(workbook, wanted_months):
    with ZipFile(io.BytesIO(workbook)) as archive:
        sheets = ElementTree.fromstring(archive.read("xl/workbook.xml"))
        price_sheet = next(sheet for sheet in sheets.findall("s:sheets/s:sheet", SPREADSHEET)
                           if sheet.get("name") == "Monthly Prices")
        relationships = ElementTree.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        target = next(link.get("Target") for link in relationships if link.get("Id") == price_sheet.get(RELATIONSHIP_ID))
        sheet_path = target.lstrip("/") if target.startswith("/") else f"xl/{target}"
        strings = ["".join(entry.itertext()) for entry in ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))]
        rows = ElementTree.fromstring(archive.read(sheet_path)).findall("s:sheetData/s:row", SPREADSHEET)

    result = {}
    gold_column = None
    for row in rows:
        cells = {}
        for cell in row:
            value = cell.findtext("s:v", namespaces=SPREADSHEET)
            if value is None:
                continue
            column = re.sub(r"\d+$", "", cell.get("r"))
            cells[column] = strings[int(value)].strip() if cell.get("t") == "s" else value
        if gold_column is None:
            gold_column = next((column for column, value in cells.items() if value == "Gold"), None)
        month = cells.get("A", "").strip().replace("M", "-")
        if month in wanted_months and cells.get(gold_column, "") not in ("", "..", "."):
            value = float(cells[gold_column])
            if math.isfinite(value) and value > 0:
                result[month] = value
    if gold_column is None:
        raise ValueError("Pink Sheet gold column not found")
    return result


def fetch_benchmarks(months):
    links = read_url(PINK_SHEET_URL).decode()
    workbook_link = re.search(r'https://thedocs\.worldbank\.org/[^"<>\s]+/CMO-Historical-Data-Monthly\.xlsx', links)
    if not workbook_link:
        raise ValueError("Pink Sheet monthly workbook link not found")
    dollars = gold_prices(read_url(urljoin(PINK_SHEET_URL, workbook_link.group())), set(months))
    query = urlencode({"id": "EXCHUS", "cosd": min(months) + "-01", "coed": max(months) + "-01"})
    rates = csv.DictReader(io.StringIO(read_url(f"{FRED_URL}?{query}").decode()))
    result = {}
    for row in rates:
        month = row["observation_date"][:7]
        value = row["EXCHUS"]
        if month in dollars and value not in ("", "."):
            rate = float(value)
            if math.isfinite(rate) and rate > 0:
                result[month] = round(dollars[month] * rate / GRAMS_PER_TROY_OUNCE, 4)
    return result


def merge_reserves(snapshot, reports, first, last):
    months = snapshot["months"]
    countries = snapshot["countries"]
    valid_months = set(month_range(max(first, months[0]), last))
    verified = {
        country["code"]: {month: value for month, value in reports.get(country["code"], {}).items()
                          if month in valid_months and math.isfinite(value) and value > 0}
        for country in countries
    }
    latest = max((month for values in verified.values() for month in values), default=months[-1])
    new_months = list(month_range(shift_month(months[-1], 1), latest))
    months.extend(new_months)
    snapshot["benchmark"].extend([None] * len(new_months))
    positions = {month: i for i, month in enumerate(months)}
    updates = 0
    for country in countries:
        holdings = country["holdings"]
        holdings.extend([None] * len(new_months))
        for month, value in verified[country["code"]].items():
            index = positions[month]
            if holdings[index] is None:
                holdings[index] = value
                updates += 1
    return updates


def merge_flows(snapshot, reports, first, last):
    by_month = {row["month"]: row for row in snapshot["months"]}
    for month in month_range(shift_month(first, 1), last):
        previous = shift_month(month, -1)
        changes = {
            area: reports[area][month] - reports[area][previous]
            for area in snapshot["areas"]
            if area in reports and month in reports[area] and previous in reports[area]
        }
        if not changes or not set(by_month.get(month, {}).get("reporters", [])) <= changes.keys():
            continue
        by_month[month] = {
            "month": month,
            "purchases": round(sum(value for value in changes.values() if value > 0), 4),
            "sales": round(-sum(value for value in changes.values() if value < 0), 4),
            "reporters": sorted(changes),
        }
    latest = max(by_month)
    snapshot["months"] = [by_month.get(month, {"month": month, "purchases": None, "sales": None, "reporters": []})
                          for month in month_range(shift_month(latest, 1 - MONTHS_IN_YEAR), latest)]


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def save_if_changed(path, snapshot, original, rows_key):
    if snapshot == original:
        return
    lines = ["{"]
    for name, rows in snapshot.items():
        if name == rows_key:
            lines.append(f'  "{name}": [')
            lines.append(",\n".join("    " + json.dumps(row, ensure_ascii=False, allow_nan=False) for row in rows))
            lines.append("  ],")
        else:
            lines.append(f'  "{name}": {json.dumps(rows, ensure_ascii=False, allow_nan=False)},')
    lines[-1] = lines[-1].removesuffix(",")
    lines.append("}")
    temporary = path.with_suffix(".tmp")
    temporary.write_text("\n".join(lines) + "\n", encoding="utf-8")
    temporary.replace(path)


def try_source(name, fetch, *args):
    try:
        return fetch(*args)
    except (OSError, ValueError, KeyError, RuntimeError, StopIteration, csv.Error, ElementTree.ParseError, BadZipFile) as error:
        print(f"{name}: {error}", file=sys.stderr)
        return None


def main(today):
    last = shift_month(today.strftime("%Y-%m"), -1)
    first = shift_month(last, -3)
    reserves_path = ROOT / "central-bank-reserves.json"
    flows_path = ROOT / "global-gold-flows.json"
    reserves = load_json(reserves_path)
    flows = load_json(flows_path)

    reports = try_source("Country reserves", fetch_reserves, [row["code"] for row in reserves["countries"]], first, last)
    global_reports = try_source("Global reserve flows", fetch_global_holdings, flows["areas"], first, last)
    if reports is None and global_reports is None:
        raise RuntimeError("No official reserve source could be reached")
    if reports is not None:
        updates = merge_reserves(reserves, reports, first, last)
        print(f"New confirmed country-month records: {updates}")
    if global_reports:
        merge_flows(flows, global_reports, first, last)

    missing = [month for month, price in zip(reserves["months"], reserves["benchmark"]) if price is None and month <= last]
    if missing:
        benchmarks = try_source("Monthly gold price benchmarks", fetch_benchmarks, missing) or {}
        reserves["benchmark"] = [value if value is not None else benchmarks.get(month)
                                  for month, value in zip(reserves["months"], reserves["benchmark"])]
    save_if_changed(reserves_path, reserves, load_json(reserves_path), "countries")
    save_if_changed(flows_path, flows, load_json(flows_path), "months")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--today", type=date.fromisoformat, default=datetime.now(ZoneInfo("Asia/Shanghai")).date())
    main(parser.parse_args().today)
