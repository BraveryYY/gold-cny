"""Selected monthly gold quantity series from official sources."""

import csv
import json
import math
import re
import sys
from calendar import monthrange
from html.parser import HTMLParser
from io import BytesIO
from urllib.parse import urlencode, urljoin, urlsplit
from urllib.request import Request, urlopen
from xml.etree import ElementTree
from zipfile import BadZipFile, ZipFile


IMF_API = "https://api.imf.org/external/sdmx/3.0/data/dataflow/IMF.STA"
IL_KEY = {"INDICATOR": "RGV_REVS", "UNIT": "FTO", "FREQUENCY": "M"}
IRFCL_KEY = {"INDICATOR": "IRFCLDT1_IRFCL56V_FTO", "SECTOR": "S1XS1311", "FREQUENCY": "M"}
COUNTRY_CODES = {
    "AT": "AUT", "CH": "CHE", "CN": "CHN", "DE": "DEU", "ES": "ESP",
    "FR": "FRA", "GB": "GBR", "IN": "IND", "IT": "ITA", "JP": "JPN",
    "KZ": "KAZ", "LB": "LBN", "NL": "NLD", "PL": "POL", "PT": "PRT",
    "RU": "RUS", "SA": "SAU", "TR": "TUR", "US": "USA", "UZ": "UZB",
}
IRFCL_COUNTRIES = {"AT", "ES", "FR", "IT", "NL", "RU"}
SAFE_INDEX = "https://www.safe.gov.cn/safe/gfcbzc/index.html"
US_GOLD_API = "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/gold_reserve"
PT_SERIES = "M.N.PT.W1.S121.S1.LE.A.FA.R.F11._Z.XGO.XAU._Z.N.ALL"
UZ_GOLD_WORKBOOK = "https://cbu.uz/sdmx/public/IR_Uzbekistan_MCD_STA.xlsx"
TONNES_PER_OUNCE = 31.1034768 / 1_000_000
SOURCE_ERRORS = (OSError, ValueError, KeyError, IndexError, TypeError, BadZipFile, ElementTree.ParseError)


def _get(url, accept):
    request = Request(url, headers={"Accept": accept, "User-Agent": "gold-cny-reserve-updater/1.0"})
    with urlopen(request, timeout=25) as response:
        return response.read()


def _validate_month_range(start, end):
    for month in (start, end):
        if not re.fullmatch(r"[0-9]{4}-(?:0[1-9]|1[0-2])", month):
            raise ValueError(f"Invalid report month {month!r}")
    span = (int(end[:4]) - int(start[:4])) * 12 + int(end[5:]) - int(start[5:])
    if not 0 <= span <= 12:
        raise ValueError("Expected no more than 13 consecutive reporting months")


def _series_key(series, dimensions):
    positions = series.split(":")
    if len(positions) != len(dimensions):
        raise ValueError("Unexpected IMF series dimensions")
    return {
        dimension["id"]: dimension["values"][int(position)]["id"]
        for position, dimension in zip(positions, dimensions)
    }


def _parse_imf(document, areas, expected, start, end):
    data = document["data"]
    if not data["dataSets"]:
        raise ValueError("IMF response did not contain a dataset")
    rows = {}
    for dataset in data["dataSets"]:
        structure = data["structures"][dataset["structure"]]
        dimensions = structure["dimensions"]
        series_dimensions = sorted(dimensions["series"], key=lambda dim: dim["keyPosition"])
        time_dimension, = dimensions["observation"]
        first_measure = structure["measures"]["observation"][0]["id"]
        if time_dimension["id"] != "TIME_PERIOD" or first_measure != "OBS_VALUE":
            raise ValueError("Unexpected IMF observation format")
        periods = time_dimension["values"]
        for key, series in dataset.get("series", {}).items():
            codes = _series_key(key, series_dimensions)
            country = codes.pop("COUNTRY")
            if country not in areas or codes != expected:
                raise ValueError("IMF response returned an unexpected country, measure, or unit")
            for key, observation in series["observations"].items():
                period = periods[int(key)]
                month = period.get("id", period.get("value", "")).replace("-M", "-")
                if not re.fullmatch(r"[0-9]{4}-(?:0[1-9]|1[0-2])", month):
                    raise ValueError("Unexpected IMF month format")
                if not start <= month <= end or observation[0] is None:
                    continue
                ounces = float(observation[0])
                if not math.isfinite(ounces) or ounces < 0:
                    continue
                tonnes = round(ounces * TONNES_PER_OUNCE, 6)
                series_rows = rows.setdefault(country, {})
                if month in series_rows and series_rows[month] != tonnes:
                    raise ValueError("IMF response contained conflicting country observations")
                series_rows[month] = tonnes
    return rows


def _imf(dataflow, areas, series, start, end):
    keys = ".".join(["+".join(sorted(areas)), *series.values()])
    query = urlencode({
        "c[TIME_PERIOD]": f"ge:{start[:4]}-M{start[5:]}+le:{end[:4]}-M{end[5:]}",
        "format": "jsondata",
    })
    url = f"{IMF_API}/{dataflow}/+/{keys}?{query}"
    result = _get(url, "application/vnd.sdmx.data+json;version=2.0.0")
    return _parse_imf(json.loads(result), areas, series, start, end)


class _SafeTable(HTMLParser):
    def __init__(self, page):
        super().__init__()
        self.links = {}
        self.rows = []
        self.row = None
        self.cell = None
        self.columns = 1
        self.feed(page)

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == "a":
            match = re.fullmatch(r"官方储备资产\s*[（(]([0-9]{4})[）)]", attrs.get("title") or "")
            if match:
                link = urlsplit(urljoin(SAFE_INDEX, attrs.get("href") or ""))
                if (link.scheme == "https" and link.netloc == "www.safe.gov.cn"
                        and re.fullmatch(r"/safe/[0-9]{4}/[0-9]{4}/[0-9]+\.html", link.path)):
                    self.links[match[1]] = link.geturl()
        elif tag == "tr":
            self.row = []
        elif tag in {"td", "th"} and self.row is not None:
            self.cell = []
            span = attrs.get("colspan") or "1"
            self.columns = int(span) if re.fullmatch(r"[1-9][0-9]?", span) else 1

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag in {"td", "th"} and self.cell is not None:
            self.row.extend(["".join(self.cell).strip()] * self.columns)
            self.cell = None
        elif tag == "tr" and self.row is not None:
            self.rows.append(self.row)
            self.row = None


def _safe_rows(page, year):
    months = None
    result = {}
    rows = _SafeTable(page).rows
    for index, row in enumerate(rows):
        if row and "项目" in row[0]:
            months = [cell.replace(".", "-") for cell in row]
            continue
        if not months or not row or "黄金" not in row[0] or "Gold" not in row[0]:
            continue
        quantities = rows[index + 1]
        if len(months) != len(quantities):
            raise ValueError("SAFE month columns do not match the gold quantity row")
        for month, quantity in zip(months, quantities):
            match = re.fullmatch(r"([0-9]+(?:\.[0-9]+)?)\s*万盎司", quantity)
            if re.fullmatch(rf"{year}-(?:0[1-9]|1[0-2])", month) and match:
                tonnes = round(float(match[1]) * 10_000 * TONNES_PER_OUNCE, 6)
                if month in result and result[month] != tonnes:
                    raise ValueError("SAFE returned conflicting values for the same month")
                result[month] = tonnes
    if not result:
        raise ValueError("SAFE gold quantities not found")
    return result


def _safe(start, end):
    pages = _SafeTable(_get(SAFE_INDEX, "text/html").decode("utf-8")).links
    if not pages:
        raise ValueError("The SAFE index did not contain yearly reserve reports")
    rows = {}
    for year in range(int(start[:4]), int(end[:4]) + 1):
        if str(year) in pages:
            page = _get(pages[str(year)], "text/html").decode("utf-8")
            rows.update(_safe_rows(page, year))
    return {month: tonnes for month, tonnes in rows.items() if start <= month <= end}


def _month_end(month):
    last_day = monthrange(int(month[:4]), int(month[5:]))[1]
    return f"{month}-{last_day:02}"


def _us_treasury(start, end):
    query = urlencode({
        "filter": f"record_date:gte:{start}-01,record_date:lte:{_month_end(end)}",
        "fields": "record_date,src_line_nbr,fine_troy_ounce_qty",
        "page[size]": "200",
    })
    result = json.loads(_get(f"{US_GOLD_API}?{query}", "application/json"))
    if result["meta"]["total-pages"] > 1:
        raise ValueError("The Treasury response was paginated")
    reports = {}
    for row in result["data"]:
        date = row["record_date"]
        month = date[:7]
        if not start <= month <= end or date != _month_end(month):
            continue
        ounces = float(row["fine_troy_ounce_qty"])
        line = int(row["src_line_nbr"])
        report = reports.setdefault(month, {})
        if line in report or not math.isfinite(ounces) or ounces < 0:
            raise ValueError("Invalid Treasury source line")
        report[line] = ounces
    return {
        month: round(sum(report.values()) * TONNES_PER_OUNCE, 6)
        for month, report in reports.items()
        if report.keys() == set(range(1, 9))
    }


def _portugal_ecb(start, end):
    query = urlencode({"startPeriod": start, "endPeriod": end, "format": "csvdata"})
    url = f"https://data-api.ecb.europa.eu/service/data/RAS/{PT_SERIES}?{query}"
    data = _get(url, "text/csv").decode("utf-8")
    rows = {}
    reader = csv.DictReader(data.splitlines())
    required = {"KEY", "TIME_PERIOD", "OBS_VALUE", "UNIT_MEASURE", "UNIT_MULT"}
    if not required.issubset(reader.fieldnames or []):
        raise ValueError("The ECB response was not the expected reserve CSV")
    for row in reader:
        if row["KEY"] != f"RAS.{PT_SERIES}" or row["UNIT_MEASURE"] != "XGO" or row["UNIT_MULT"] != "6":
            raise ValueError("Unexpected ECB monetary gold series or unit")
        month = row["TIME_PERIOD"]
        if start <= month <= end and row["OBS_VALUE"]:
            millions = float(row["OBS_VALUE"])
            if math.isfinite(millions) and millions >= 0:
                rows[month] = round(millions * 1_000_000 * TONNES_PER_OUNCE, 6)
    return rows


def _uzbek_workbook(data, start, end):
    namespace = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with ZipFile(BytesIO(data)) as workbook:
        strings = [
            "".join(node.text or "" for node in item.findall(".//s:t", namespace))
            for item in ElementTree.fromstring(workbook.read("xl/sharedStrings.xml"))
        ]
        rows = ElementTree.fromstring(workbook.read("xl/worksheets/sheet1.xml"))
    table = {}
    for row in rows.findall("s:sheetData/s:row", namespace):
        cells = {}
        for cell in row:
            content = cell.findtext("s:v", None, namespace)
            if content is not None:
                column = re.sub(r"[0-9]+$", "", cell.attrib["r"])
                cells[column] = strings[int(content)] if cell.get("t") == "s" else content
        table[row.attrib["r"]] = cells
    if ("Gold" not in table["18"].get("A", "")
            or "volume in millions of fine troy ounces" not in table["19"].get("A", "")):
        raise ValueError("The CBU workbook did not contain the expected gold quantity row")
    results = {}
    for column, month in table["4"].items():
        quantity = table["19"].get(column, "")
        if start <= month <= end and re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", quantity):
            results[month] = round(float(quantity) * 1_000_000 * TONNES_PER_OUNCE, 6)
    return results


def _uzbek_cbu(start, end):
    data = _get(UZ_GOLD_WORKBOOK, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    return _uzbek_workbook(data, start, end)


def fetch_reserves(countries, start, end):
    """Return verified monthly tonnes for the requested ISO 3166-1 alpha-2 countries."""
    _validate_month_range(start, end)
    codes = set(countries)
    if codes - COUNTRY_CODES.keys():
        raise ValueError(f"Unsupported country codes: {sorted(codes - COUNTRY_CODES.keys())}")
    if not codes:
        return {}
    rows = {}
    successful = False
    for dataflow, countries, series in (
        ("IL", codes - IRFCL_COUNTRIES, IL_KEY),
        ("IRFCL", codes & IRFCL_COUNTRIES, IRFCL_KEY),
    ):
        if not countries:
            continue
        mapping = {COUNTRY_CODES[code]: code for code in countries}
        try:
            observations = _imf(dataflow, mapping.keys(), series, start, end)
            rows.update({mapping[area]: months for area, months in observations.items()})
            successful = True
        except SOURCE_ERRORS as exc:
            print(f"Warning: IMF {dataflow} unavailable: {exc}", file=sys.stderr)
    for code, name, fetch in (
        ("CN", "SAFE", _safe),
        ("US", "U.S. Treasury", _us_treasury),
        ("PT", "ECB Portugal", _portugal_ecb),
        ("UZ", "Central Bank of Uzbekistan", _uzbek_cbu),
    ):
        if code not in codes:
            continue
        try:
            result = fetch(start, end)
            if result:
                rows.setdefault(code, {}).update(result)
            successful = True
        except SOURCE_ERRORS as exc:
            print(f"Warning: {name} unavailable: {exc}", file=sys.stderr)
    if not successful:
        raise RuntimeError("None of the official reserve sources could be read")
    return rows


def fetch_global_holdings(area_codes, start, end):
    """Return comparable IMF holdings for an explicit roster of reporting economies."""
    _validate_month_range(start, end)
    areas = set(area_codes)
    if not areas or any(not re.fullmatch(r"[A-Z]{3}", area) for area in areas):
        raise ValueError("Expected an explicit roster of IMF alpha-3 economy codes")
    return _imf("IL", areas, IL_KEY, start, end)
