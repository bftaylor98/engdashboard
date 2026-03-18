#!/usr/bin/env python3
"""
Standalone script: scatter plot of $/hr (without material) per work order with linear trendline.
One point per WO; x = order by created date, y = cost per hour.

Requirements:
  - Dashboard app database and API running; auth via scripts/.env.chart or DASHBOARD_AUTH_TOKEN.

Output: chart_2026_price_per_hour.html (open in browser).

Usage:
  pip install requests
  python scripts/wo_price_per_hour_chart.py
"""

import json
import os
import sqlite3
import sys
import webbrowser
from datetime import datetime
from pathlib import Path

try:
    import requests
except ImportError:
    print("Install requests: pip install requests", file=sys.stderr)
    sys.exit(1)

# Config from env (or env file / token file)
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
OUTPUT_HTML = SCRIPT_DIR / "chart_2026_price_per_hour.html"


def _load_env_file(path: Path) -> None:
    """Load KEY=VALUE from path into os.environ (skip comments and empty lines)."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_env_file(SCRIPT_DIR / ".env.chart")
_load_env_file(PROJECT_ROOT / ".env.chart")

DB_PATH = os.environ.get("DB_PATH") or str(PROJECT_ROOT / "database" / "engineering_schedule.db")
API_BASE = os.environ.get("DASHBOARD_API_URL", "http://localhost:3001").rstrip("/")


def _login_for_token() -> str | None:
    """POST /api/auth/login with DASHBOARD_USER and DASHBOARD_PASSWORD; return token or None."""
    user = os.environ.get("DASHBOARD_USER", "").strip()
    password = os.environ.get("DASHBOARD_PASSWORD", "").strip()
    if not user or not password:
        return None
    try:
        r = requests.post(
            f"{API_BASE}/api/auth/login",
            json={"username": user, "password": password},
            headers={"Content-Type": "application/json"},
            timeout=15,
        )
        if r.status_code != 200:
            return None
        data = r.json()
        if data.get("success") and isinstance(data.get("data"), dict):
            return (data["data"].get("token") or "").strip() or None
    except Exception:
        pass
    return None


def _load_token() -> str | None:
    token = os.environ.get("DASHBOARD_AUTH_TOKEN", "").strip()
    if token:
        return token
    for path in (SCRIPT_DIR / ".dashboard-token", PROJECT_ROOT / ".dashboard-token"):
        if path.is_file():
            t = path.read_text(encoding="utf-8").strip()
            if t:
                return t
    return _login_for_token()


AUTH_TOKEN = _load_token()


def get_all_work_orders() -> list[tuple[str, str]]:
    """Return list of (wo_number, created_at) for all WOs, ordered by created_at."""
    if not os.path.isfile(DB_PATH):
        print(f"Database not found: {DB_PATH}", file=sys.stderr)
        return []
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.execute(
        """
        SELECT wo_number, created_at
        FROM engineering_work_orders
        ORDER BY created_at, wo_number
        """
    )
    rows = [(r["wo_number"], r["created_at"]) for r in cur.fetchall()]
    conn.close()
    return rows


def fetch_cost_analysis(wo_number: str, token: str) -> dict | None:
    """GET /api/proshop/cost-analysis?woNumber=X. Returns JSON data or None."""
    url = f"{API_BASE}/api/proshop/cost-analysis"
    params = {"woNumber": wo_number}
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    try:
        r = requests.get(url, params=params, headers=headers, timeout=120)
        if r.status_code != 200:
            return None
        data = r.json()
        if not data.get("success") or not isinstance(data.get("data"), dict):
            return None
        return data["data"]
    except Exception:
        return None


def linear_trendline(x: list[float], y: list[float]) -> tuple[float, float]:
    """Return (slope, intercept) for y = slope * x + intercept."""
    n = len(x)
    if n < 2:
        return 0.0, (y[0] if y else 0.0)
    sx = sum(x)
    sy = sum(y)
    sxx = sum(xi * xi for xi in x)
    sxy = sum(xi * yi for xi, yi in zip(x, y))
    denom = n * sxx - sx * sx
    if abs(denom) < 1e-12:
        return 0.0, sy / n
    slope = (n * sxy - sx * sy) / denom
    intercept = (sy - slope * sx) / n
    return slope, intercept


def main() -> None:
    if not AUTH_TOKEN:
        print(
            "No auth token. Use scripts/.env.chart with DASHBOARD_USER and DASHBOARD_PASSWORD, "
            "or set DASHBOARD_AUTH_TOKEN.",
            file=sys.stderr,
        )
        sys.exit(1)

    wos = get_all_work_orders()
    if not wos:
        print("No work orders found in database.", file=sys.stderr)
        sys.exit(1)

    print(f"Found {len(wos)} work order(s). Fetching cost per hour for each...")

    x_ord: list[float] = []
    y_pph: list[float] = []
    labels: list[str] = []
    skipped = 0
    for i, (wo_number, created_at) in enumerate(wos):
        if (i + 1) % 10 == 0 or i == 0:
            print(f"  {i + 1}/{len(wos)} {wo_number}...")
        data = fetch_cost_analysis(wo_number, AUTH_TOKEN)
        if not data:
            skipped += 1
            continue
        price_per_hour = data.get("pricePerHour")
        if price_per_hour is None:
            cost_wo = data.get("costWithoutMaterial")
            hours = data.get("estimatedHours")
            if cost_wo is not None and hours is not None and hours > 0:
                price_per_hour = cost_wo / hours
            else:
                skipped += 1
                continue
        try:
            val = float(price_per_hour)
        except (TypeError, ValueError):
            skipped += 1
            continue
        if val < 0 or val > 1e7:
            skipped += 1
            continue
        x_ord.append(i + 1)
        y_pph.append(round(val, 2))
        labels.append(f"{wo_number} ({created_at[:10] if created_at else ''})")

    if skipped:
        print(f"Skipped {skipped} WO(s) (no cost data or invalid).")
    if not x_ord:
        print("No $/hr data to plot.")
        sys.exit(1)

    n = len(x_ord)
    slope, intercept = linear_trendline(x_ord, y_pph)
    x_trend = [1, n]
    y_trend = [slope * 1 + intercept, slope * n + intercept]

    x_js = json.dumps(x_ord)
    y_js = json.dumps(y_pph)
    labels_js = json.dumps(labels)
    x_trend_js = json.dumps(x_trend)
    y_trend_js = json.dumps(y_trend)

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Work Orders – $/hr Without Material (Scatter + Trendline)</title>
  <script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
  <style>
    body {{ font-family: system-ui, sans-serif; margin: 1rem 2rem; background: #f8f9fa; }}
    h1 {{ color: #1a1a1a; }}
    .meta {{ color: #555; margin-bottom: 1rem; }}
    #chart {{ width: 100%; max-width: 1200px; height: 560px; background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }}
  </style>
</head>
<body>
  <h1>Cost per Hour (Without Material) by Work Order</h1>
  <p class="meta">One point per work order (order by created date). Total WOs: {len(wos)}, plotted: {n}, skipped: {skipped}. Trendline: linear regression.</p>
  <div id="chart"></div>
  <script>
    const x = {x_js};
    const y = {y_js};
    const labels = {labels_js};
    const text = labels.map((l, i) => l + '<br>$' + y[i].toFixed(2) + '/hr');
    const xTrend = {x_trend_js};
    const yTrend = {y_trend_js};
    Plotly.newPlot('chart', [
      {{
        x: x,
        y: y,
        type: 'scatter',
        mode: 'markers',
        name: 'Work orders',
        marker: {{ size: 10, color: '#2563eb', line: {{ color: '#1d4ed8', width: 1 }} }},
        text: text,
        hoverinfo: 'text'
      }},
      {{
        x: xTrend,
        y: yTrend,
        type: 'scatter',
        mode: 'lines',
        name: 'Trendline',
        line: {{ color: '#dc2626', width: 2, dash: 'dash' }}
      }}
    ], {{
      margin: {{ t: 40, r: 40, b: 60, l: 60 }},
      xaxis: {{ title: 'Work order (by creation order)' }},
      yaxis: {{ title: '$/hr (without material)' }},
      showlegend: true,
      legend: {{ x: 0.02, y: 0.98 }}
    }});
  </script>
</body>
</html>
"""

    OUTPUT_HTML.write_text(html, encoding="utf-8")
    print(f"Wrote {OUTPUT_HTML} ({n} points, trendline added)")
    webbrowser.open(OUTPUT_HTML.as_uri())
    print("Opened in browser.")


if __name__ == "__main__":
    main()
