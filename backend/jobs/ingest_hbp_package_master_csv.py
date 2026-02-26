#!/usr/bin/env python3
"""
PM-JAY HBP Package Master ingestion (CSV -> Supabase).

This ingests the official HBP package master into the Supabase table:
  public.insurance_package_rates

It is intentionally NOT part of database migrations (no seed data in DDL).
Run this as an explicit ingestion step whenever you update the source file.

CSV format:
  - First row is a title line ("HBP 2022 Package Master")
  - Second row is the header (27 columns)
  - Data starts from row 3

Usage:
  source ~/python/bin/activate
  cd backend

  python jobs/ingest_hbp_package_master_csv.py \
    --file /home/btwitsvoid/Downloads/HBP_2022_Package_Master1.csv \
    --scheme-code PMJAY \
    --replace

Environment (required):
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY   (required for bulk upsert; bypasses RLS)

Notes:
  - `insurance_package_rates` has UNIQUE(scheme_id, package_code).
    We map `package_code` to the HBP 2022 "Procedure Code HBP 2022" (unique per row),
    not the grouped "Package Code HBP 2022" (which repeats for stratified packages).
  - The source CSV contains repeated procedure codes across specialties.
    We store the first occurrence as the canonical row and append the additional
    specialties to `special_conditions` ("Also listed under: ...").
"""

from __future__ import annotations

import argparse
import csv
import logging
import os
import re
import sys
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

# Add parent directory to path for imports (backend/)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.supabase_service import SupabaseService

logger = logging.getLogger(__name__)

_WS_RE = re.compile(r"\s+")
_NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")
_UNDERSCORE_RE = re.compile(r"_+")


def _clean(value: Any) -> str:
    if value is None:
        return ""
    s = str(value).replace("\n", " ").strip()
    return _WS_RE.sub(" ", s)


def _normalize(text: str) -> str:
    """Normalize free text into a search-friendly underscore format."""
    value = (text or "").strip().lower()
    if not value:
        return ""
    value = _NON_ALNUM_RE.sub("_", value)
    value = _UNDERSCORE_RE.sub("_", value).strip("_")
    return value


def _parse_bool(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    s = str(value).strip().lower()
    return s in {"y", "yes", "true", "1"}


def _parse_int(value: Any) -> int:
    if value is None:
        return 0
    s = str(value).strip()
    if not s:
        return 0
    try:
        return int(float(s))
    except Exception:
        return 0


@dataclass(frozen=True)
class CsvColumns:
    specialty: int
    proc_code_2022: int
    package_name: int
    proc_name: int
    proc_price: int
    implants_flag: int
    level_of_care: int
    los: int
    day_care: int
    remarks: int


def _find_header_and_columns(path: str) -> Tuple[CsvColumns, List[str]]:
    """Find the header row (2nd record) and map required columns by name."""
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        first = next(reader, None)
        if first is None:
            raise ValueError("Empty CSV file")
        header = next(reader, None)
        if header is None:
            raise ValueError("CSV missing header row")

    normalized = [_clean(h) for h in header]

    def col(name: str) -> int:
        try:
            return normalized.index(name)
        except ValueError as e:
            raise ValueError(f"Missing required header column: {name!r}") from e

    # Column names after normalization (newlines removed).
    cols = CsvColumns(
        specialty=col("Specialty"),
        proc_code_2022=col("Procedure Code HBP 2022"),
        package_name=col("AB PM-JAY Package Name"),
        proc_name=col("AB PM-JAY Procedure Name"),
        proc_price=col("Procedure Price"),
        implants_flag=col("Implants/ High End Consumables (Y/ N)"),
        level_of_care=col("Level of Care"),
        los=col("LoS (Indicative)"),
        day_care=col("Day Care (Y/ N)"),
        remarks=col("Remarks"),
    )
    return cols, normalized


def _get_scheme_id(client, scheme_code: str) -> str:
    res = client.table("insurance_schemes").select("id").eq("scheme_code", scheme_code.upper()).limit(1).execute()
    if not res.data:
        raise ValueError(f"Scheme not found in Supabase: {scheme_code}")
    return res.data[0]["id"]


def _build_record(row: List[str], cols: CsvColumns, data_source: str) -> Optional[Dict[str, Any]]:
    code = _clean(row[cols.proc_code_2022] if cols.proc_code_2022 < len(row) else "")
    if not code:
        return None

    category = _clean(row[cols.specialty] if cols.specialty < len(row) else "") or "Other"
    package_name = _clean(row[cols.package_name] if cols.package_name < len(row) else "")
    variant = _clean(row[cols.proc_name] if cols.proc_name < len(row) else "")
    level = _clean(row[cols.level_of_care] if cols.level_of_care < len(row) else "")

    rate_inr = _parse_int(row[cols.proc_price] if cols.proc_price < len(row) else "")
    includes_implants = _parse_bool(row[cols.implants_flag] if cols.implants_flag < len(row) else "")

    los = _clean(row[cols.los] if cols.los < len(row) else "")
    day_care_raw = _clean(row[cols.day_care] if cols.day_care < len(row) else "")
    remarks = _clean(row[cols.remarks] if cols.remarks < len(row) else "")

    procedure_name = package_name or variant or f"Package {code}"

    notes: List[str] = []
    if variant and variant != procedure_name:
        notes.append(variant)
    if los and los.upper() != "NA":
        notes.append(f"LoS (indicative): {los}")
    if day_care_raw and day_care_raw.upper() != "NA":
        notes.append(f"Day care: {'Yes' if _parse_bool(day_care_raw) else 'No'}")
    if remarks and remarks.upper() != "NA":
        notes.append(f"Remarks: {remarks}")

    special_conditions = "\n".join(notes).strip() or None
    normalized = _normalize(f"{procedure_name} {variant}".strip())

    return {
        "package_code": code,
        "procedure_name": procedure_name,
        "procedure_name_normalized": normalized or None,
        "category": category,
        "sub_category": level or None,
        "rate_inr": rate_inr,
        "rate_display": (f"Rs. {rate_inr:,}" if rate_inr else None),
        "includes_implants": includes_implants,
        "special_conditions": special_conditions,
        "data_source": data_source,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest PM-JAY HBP package master CSV into Supabase.")
    parser.add_argument("--file", required=True, help="Path to HBP package master .csv")
    parser.add_argument("--scheme-code", default="PMJAY", help="Scheme code in insurance_schemes (default: PMJAY)")
    parser.add_argument("--data-source", default="HBP 2022 Package Master (CSV)", help="Stored in data_source column")
    parser.add_argument("--batch-size", type=int, default=400, help="Upsert batch size (default: 400)")
    parser.add_argument("--replace", action="store_true", help="Delete existing rates for this scheme before ingest")
    parser.add_argument("--dry-run", action="store_true", help="Parse only; do not write to Supabase")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

    if not os.path.exists(args.file):
        logger.error("File not found: %s", args.file)
        return 2

    cols, header = _find_header_and_columns(args.file)
    logger.info("CSV header detected (%d cols). Example: %s", len(header), header[:6])

    records_by_code: Dict[str, Dict[str, Any]] = {}
    categories_by_code: Dict[str, set[str]] = {}

    with open(args.file, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        _ = next(reader, None)  # title row
        _ = next(reader, None)  # header row

        for row in reader:
            rec = _build_record(row, cols, data_source=args.data_source)
            if not rec:
                continue

            code = rec["package_code"]
            categories_by_code.setdefault(code, set()).add(rec.get("category") or "Other")
            if code not in records_by_code:
                records_by_code[code] = rec

    # Merge repeated specialties into special_conditions so we don't lose context.
    multi_cat = 0
    for code, cats in categories_by_code.items():
        if len(cats) <= 1:
            continue
        multi_cat += 1
        canonical = records_by_code.get(code)
        if not canonical:
            continue
        primary = canonical.get("category") or "Other"
        others = sorted([c for c in cats if c and c != primary])
        if not others:
            continue
        extra = f"Also listed under: {', '.join(others[:8])}"
        if canonical.get("special_conditions"):
            canonical["special_conditions"] = canonical["special_conditions"].rstrip() + "\n" + extra
        else:
            canonical["special_conditions"] = extra

    records = list(records_by_code.values())
    logger.info("Parsed %d unique procedure codes (%d with multiple specialties)", len(records), multi_cat)

    if args.dry_run:
        for sample in records[:3]:
            logger.info(
                "Sample: %s",
                {k: sample.get(k) for k in ["package_code", "procedure_name", "category", "rate_inr", "sub_category"]},
            )
        return 0

    client = SupabaseService.get_service_client()
    if not client:
        logger.error("Supabase service client not available. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
        return 2

    scheme_id = _get_scheme_id(client, args.scheme_code)
    logger.info("Using scheme_code=%s scheme_id=%s", args.scheme_code, scheme_id)

    # Attach scheme_id only for write mode.
    for rec in records:
        rec["scheme_id"] = scheme_id

    if args.replace:
        logger.info("Deleting existing package rates for scheme_id=%s ...", scheme_id)
        client.table("insurance_package_rates").delete().eq("scheme_id", scheme_id).execute()

    total = len(records)
    batch_size = max(1, args.batch_size)
    for i in range(0, total, batch_size):
        batch = records[i : i + batch_size]
        client.table("insurance_package_rates").upsert(batch, on_conflict="scheme_id,package_code").execute()
        logger.info("Upsert progress: %d/%d", min(i + batch_size, total), total)

    logger.info("Done. Upserted %d rows into insurance_package_rates.", total)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
