#!/usr/bin/env python3
"""
CSV 카탈로그 파일을 liquor_data.json에 병합/변환하는 유틸리티 스크립트입니다.
사용법:
  python tools/csv_to_catalog.py tools/catalog_template.csv --output liquor_data.json
"""

import argparse
import csv
import json
from datetime import datetime
from pathlib import Path


REQUIRED_COLUMNS = {
    "product_id",
    "name",
    "category",
    "volume_ml",
    "price",
    "stock_status",
    "listing_label",
    "pairing_item",
    "affiliate_link",
    "market_source_url",
    "source_title",
    "price_checked_on",
    "price_note",
    "image",
}


def parse_row(row: dict, existing: dict | None = None) -> dict:
    volume_raw = str(row.get("volume_ml", "")).strip()
    price_raw = str(row.get("price", "")).strip().replace(",", "")
    vol = int(volume_raw) if volume_raw.isdigit() else 750
    listing_label = str(row.get("listing_label", "데일리샷 픽업가")).strip() or "데일리샷 픽업가"

    base = dict(existing) if isinstance(existing, dict) else {}
    base.update(
        {
            "product_id": str(row.get("product_id", "")).strip(),
            "name": str(row.get("name", "")).strip(),
            "category": str(row.get("category", "")).strip(),
            "price": int(float(price_raw)) if price_raw else 0,
            "currency": "KRW",
            "image": str(row.get("image", "")).strip(),
            "stock_status": str(row.get("stock_status", "unknown")).strip() or "unknown",
            "stock_quantity": None,
            "attributes": {
                "volume_ml": vol,
                "listing_label": listing_label,
            },
            "pairing_item": str(row.get("pairing_item", "")).strip(),
            "affiliate_link": str(row.get("affiliate_link", "")).strip(),
            "market_source_url": str(row.get("market_source_url", "")).strip(),
            "source_title": str(row.get("source_title", "판매처 상품 페이지")).strip(),
            "source": "market_research",
            "price_checked_on": str(
                row.get("price_checked_on", datetime.now().strftime("%Y-%m-%d"))
            ).strip(),
            "price_note": str(row.get("price_note", "")).strip(),
        }
    )
    return base


def main() -> None:
    parser = argparse.ArgumentParser(description="CSV 파일을 liquor_data.json으로 병합합니다.")
    parser.add_argument("csv_path", type=Path, help="입력 CSV 파일 경로")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("liquor_data.json"),
        help="출력 JSON 파일 경로 (기본값: liquor_data.json)",
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help="기존 liquor_data.json과 병합하지 않고 CSV 데이터로 전체 교체합니다.",
    )
    args = parser.parse_args()

    existing_map: dict[str, dict] = {}
    if not args.replace and args.output.exists():
        raw_existing = json.loads(args.output.read_text(encoding="utf-8"))
        items = raw_existing.get("items", raw_existing) if isinstance(raw_existing, dict) else raw_existing
        if isinstance(items, list):
            for item in items:
                pid = str(item.get("product_id", "")).strip()
                if pid:
                    existing_map[pid] = item

    with args.csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        missing = REQUIRED_COLUMNS - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"CSV 파일에 필수 컬럼이 누락되었습니다: {', '.join(sorted(missing))}")
        for row in reader:
            pid = str(row.get("product_id", "")).strip()
            if pid:
                existing_map[pid] = parse_row(row, existing_map.get(pid))

    merged_list = list(existing_map.values())
    args.output.write_text(
        json.dumps(merged_list, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"[OK] Merged {len(merged_list)} catalog items into {args.output}")


if __name__ == "__main__":
    main()
