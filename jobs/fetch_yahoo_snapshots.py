#!/usr/bin/env python3
"""Fetch Stage 1 Yahoo EOD data and write the dashboard snapshot JSON.

This is a Stage 1 prototype data job. It produces the public indicator field
shape from real Yahoo daily candles, but it is not the final proprietary
indicator engine.
"""

from __future__ import annotations

import argparse
import http.cookiejar
import json
import math
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import HTTPCookieProcessor, Request, build_opener


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = ROOT / "public" / "data" / "latest.json"
SOURCE = "Yahoo Finance chart endpoint"
INDICATOR_ENGINE = "prototype-yahoo-v0"
YAHOO_HOSTS = ("query1.finance.yahoo.com", "query2.finance.yahoo.com")
COOKIE_JAR = http.cookiejar.CookieJar()
OPENER = build_opener(HTTPCookieProcessor(COOKIE_JAR))


@dataclass(frozen=True)
class SymbolDefinition:
    symbol: str
    display_name: str
    region: str
    asset_class: str
    public_demo: bool
    supported_from_stage: int = 1


STAGE_1_SYMBOLS = [
    SymbolDefinition("^HSI", "Hang Seng Index", "HK", "index", True),
    SymbolDefinition("^HSCE", "Hang Seng China Enterprises", "HK", "index", True),
    SymbolDefinition("^GSPC", "S&P 500", "US", "index", True),
    SymbolDefinition("^IXIC", "Nasdaq Composite", "US", "index", True),
    SymbolDefinition("^NDX", "Nasdaq 100", "US", "index", True),
    SymbolDefinition("0700.HK", "Tencent", "HK", "hk-stock", True),
    SymbolDefinition("9988.HK", "Alibaba HK", "HK", "hk-stock", True),
    SymbolDefinition("3690.HK", "Meituan", "HK", "hk-stock", False),
    SymbolDefinition("0005.HK", "HSBC", "HK", "hk-stock", False),
    SymbolDefinition("1299.HK", "AIA", "HK", "hk-stock", False),
    SymbolDefinition("AAPL", "Apple", "US", "us-stock", True),
    SymbolDefinition("MSFT", "Microsoft", "US", "us-stock", False),
    SymbolDefinition("NVDA", "Nvidia", "US", "us-stock", True),
    SymbolDefinition("AMZN", "Amazon", "US", "us-stock", False),
    SymbolDefinition("META", "Meta Platforms", "US", "us-stock", False),
    SymbolDefinition("TSLA", "Tesla", "US", "us-stock", False),
    SymbolDefinition("BTC-USD", "Bitcoin", "CRYPTO", "crypto", True),
    SymbolDefinition("ETH-USD", "Ethereum", "CRYPTO", "crypto", True),
    SymbolDefinition("GC=F", "Gold Futures", "GLOBAL", "commodity", True),
    SymbolDefinition("CL=F", "WTI Crude Oil", "GLOBAL", "commodity", True),
    SymbolDefinition("GBPHKD=X", "GBP/HKD", "FX", "fx", False),
    SymbolDefinition("AUDHKD=X", "AUD/HKD", "FX", "fx", False),
    SymbolDefinition("CADHKD=X", "CAD/HKD", "FX", "fx", False),
]


def yahoo_headers() -> dict[str, str]:
    return {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36"
        ),
        "Accept": "application/json,text/plain,*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Connection": "keep-alive",
        "Origin": "https://finance.yahoo.com",
        "Referer": "https://finance.yahoo.com/",
    }


def fetch_chart(symbol: str, range_: str = "1y", interval: str = "1d") -> dict[str, Any]:
    encoded = quote(symbol, safe="")
    last_error: Exception | None = None

    for host in YAHOO_HOSTS:
        url = (
            f"https://{host}/v8/finance/chart/{encoded}"
            f"?range={range_}&interval={interval}&includePrePost=false&events=div%7Csplit"
        )
        request = Request(url, headers=yahoo_headers())

        try:
            with OPENER.open(request, timeout=30) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            last_error = error
            if error.code == 429:
                time.sleep(2)
                continue

    if last_error:
        raise last_error
    raise ValueError(f"Unable to fetch chart for {symbol}")


def parse_prices(payload: dict[str, Any]) -> list[dict[str, Any]]:
    result = payload.get("chart", {}).get("result", [None])[0]
    if not result:
        raise ValueError("Yahoo payload has no chart result")

    timestamps = result.get("timestamp") or []
    quote_data = result.get("indicators", {}).get("quote", [{}])[0]
    closes = quote_data.get("close") or []

    prices: list[dict[str, Any]] = []
    for timestamp, close in zip(timestamps, closes):
        if close is None or not math.isfinite(float(close)):
            continue
        prices.append(
            {
                "date": datetime.fromtimestamp(timestamp, tz=timezone.utc).date().isoformat(),
                "close": round(float(close), 4),
            }
        )

    if len(prices) < 40:
        raise ValueError(f"Not enough daily candles: {len(prices)}")

    return prices[-180:]


def average(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def rolling_pr_values(closes: list[float], lookback: int = 120) -> list[float]:
    values: list[float] = []
    for index, close in enumerate(closes):
        window = closes[max(0, index - lookback + 1) : index + 1]
        low = min(window)
        high = max(window)
        values.append(50.0 if high == low else max(0.0, min(100.0, ((close - low) / (high - low)) * 100)))
    return values


def moving_average(closes: list[float], length: int) -> float:
    window = closes[-length:] if len(closes) >= length else closes
    return average(window)


def price_position(price: float, dividers: dict[str, float]) -> str:
    if price >= dividers["month"] and price >= dividers["quarter"]:
        return "高於月及季分界"
    if price >= dividers["month"]:
        return "高於月分界"
    if price >= dividers["week"]:
        return "低於月分界但高於週分界"
    return "低於週及月分界"


def status_from(price: float, pr_value: float, sma1: float, dividers: dict[str, float]) -> str:
    if price >= dividers["month"] and pr_value >= sma1 and pr_value >= 65:
        return "強勢"
    if price >= dividers["month"] and pr_value >= sma1:
        return "改善中"
    if price >= dividers["week"] and pr_value >= 40:
        return "中性"
    if pr_value >= sma1:
        return "轉弱"
    return "弱勢"


def signal_from(pr_values: list[float], sma1: float, status: str) -> str:
    pr_value = pr_values[-1]
    previous_pr = pr_values[-2] if len(pr_values) > 1 else pr_value
    if previous_pr < sma1 <= pr_value:
        return "動能改善"
    if status in {"強勢", "改善中"}:
        return "維持強勢"
    if status == "弱勢":
        return "等待修復"
    return "等待確認"


def coach_summary(status: str) -> str:
    if status in {"強勢", "改善中"}:
        return "圖表節奏偏向改善，重點是價格能否守在月分界上方，並讓 PR 值維持高於 SMA1。"
    if status == "中性":
        return "圖表暫時屬於中性修復，重點是價格能否進一步站回月分界，而不是只看單日升跌。"
    return "圖表仍需要確認，重點不是單日反彈，而是能否重新站回關鍵分界並延續。"


def build_snapshot(definition: SymbolDefinition) -> dict[str, Any]:
    prices = parse_prices(fetch_chart(definition.symbol))
    closes = [point["close"] for point in prices]
    price = closes[-1]
    previous = closes[-2] if len(closes) > 1 else price
    pr_values = rolling_pr_values(closes)
    pr_value = round(pr_values[-1], 1)
    sma1 = round(average(pr_values[-10:]), 1)
    dividers = {
        "week": round(moving_average(closes, 5), 4),
        "month": round(moving_average(closes, 21), 4),
        "quarter": round(moving_average(closes, 63), 4),
        "year": round(moving_average(closes, 180), 4),
    }
    status = status_from(price, pr_value, sma1, dividers)

    return {
        "definition": {
            "symbol": definition.symbol,
            "displayName": definition.display_name,
            "region": definition.region,
            "assetClass": definition.asset_class,
            "publicDemo": definition.public_demo,
            "supportedFromStage": definition.supported_from_stage,
        },
        "prices": prices,
        "indicator": {
            "symbol": definition.symbol,
            "asOf": prices[-1]["date"],
            "price": round(price, 4),
            "dailyChangePct": round(((price - previous) / previous) * 100, 2) if previous else 0,
            "prValue": pr_value,
            "sma1": sma1,
            "prMinusSma": round(pr_value - sma1, 1),
            "dividers": dividers,
            "pricePosition": price_position(price, dividers),
            "distanceToMonthPct": round(((price - dividers["month"]) / dividers["month"]) * 100, 2) if dividers["month"] else 0,
            "status": status,
            "rank": 0,
            "signal": signal_from(pr_values, sma1, status),
        },
        "coachSummary": coach_summary(status),
        "newsSummary": "Stage 1 暫未接入新聞來源；正式版本會按 symbol 生成週度新聞重點。",
        "fundamentalsSummary": "Stage 1 暫未接入基本面來源；正式版本會加入市值、估值、盈利及增長資料。",
    }


def write_payload(snapshots: list[dict[str, Any]], failed: list[dict[str, str]], output_path: Path) -> None:
    ranked = sorted(snapshots, key=lambda item: item["indicator"]["prValue"], reverse=True)
    ranks = {item["definition"]["symbol"]: index + 1 for index, item in enumerate(ranked)}
    for item in snapshots:
        item["indicator"]["rank"] = ranks[item["definition"]["symbol"]]

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": SOURCE,
        "indicatorEngine": INDICATOR_ENGINE,
        "snapshots": snapshots,
        "failed": failed,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch Stage 1 Yahoo snapshots.")
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH)
    parser.add_argument("--sleep", type=float, default=0.25, help="Seconds to sleep between Yahoo requests.")
    parser.add_argument("--symbols", help="Comma-separated subset for smoke tests, e.g. AAPL,^HSI.")
    args = parser.parse_args()

    requested_symbols = {value.strip() for value in args.symbols.split(",") if value.strip()} if args.symbols else None
    definitions = [definition for definition in STAGE_1_SYMBOLS if requested_symbols is None or definition.symbol in requested_symbols]

    snapshots: list[dict[str, Any]] = []
    failed: list[dict[str, str]] = []

    for definition in definitions:
        try:
            snapshots.append(build_snapshot(definition))
            print(f"fetched {definition.symbol}", file=sys.stderr)
        except (HTTPError, URLError, TimeoutError, ValueError, KeyError, TypeError) as error:
            failed.append({"symbol": definition.symbol, "error": str(error)})
            print(f"failed {definition.symbol}: {error}", file=sys.stderr)
        time.sleep(args.sleep)

    if not snapshots:
        print("No snapshots fetched; refusing to write an empty payload.", file=sys.stderr)
        return 1

    write_payload(snapshots, failed, args.output)
    print(f"wrote {len(snapshots)} snapshots to {args.output}", file=sys.stderr)
    if failed:
        print(f"{len(failed)} symbols failed", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
