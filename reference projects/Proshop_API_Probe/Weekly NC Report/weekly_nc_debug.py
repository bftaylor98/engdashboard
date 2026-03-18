#!/usr/bin/env python3
"""
weekly_nc_debug.py — ProShop API: NCR fetch + built-in diagnostics

This script is a complete, self-contained replacement for a "weekly_nc.py" style
reporter. It:
  • Reads tenant URL, endpoints, username, password, and scope from config.ini
  • Authenticates via /api/beginsession and prints sanitized session details
  • Probes GraphQL minimal health and module access (Parts, Work Orders, NCRs)
  • Optionally fetches NCRs with simple pagination
  • Includes verbose logging and retry logic

USAGE (Windows / CMD / PowerShell):
  python weekly_nc_debug.py                      # run probes + list NCR total (default)
  python weekly_nc_debug.py --fetch              # actually fetch and print NCR IDs
  python weekly_nc_debug.py --since-hours 168    # limit NCRs by createdTime (last 7 days)
  python weekly_nc_debug.py --verbose            # print JSON bodies on success
  python weekly_nc_debug.py --mode probes        # probes only (no fetch)
  python weekly_nc_debug.py --mode ncr           # tiny NCR totalRecords test only

The script requires a config.ini in the same folder:
[proshop]
tenant_url       = https://est.adionsystems.com
login_endpoint   = /api/beginsession
graphql_endpoint = /api/graphql
username         = admin@esttool.com
password         = REPLACE_ME
scope            = nonconformancereports:r workorders:r parts:r users:r toolpots:r
"""

import argparse
import configparser
import datetime as dt
import json
import sys
import time
from typing import Any, Dict, List, Optional, Tuple

import requests


# --------------------------- Config helpers ---------------------------

def load_config(path: str = "config.ini") -> configparser.ConfigParser:
    cfg = configparser.ConfigParser()
    read_files = cfg.read(path)
    if not read_files:
        print(f"ERROR: {path} not found in current directory.", file=sys.stderr)
        sys.exit(2)
    return cfg


def get_setting(cfg: configparser.ConfigParser, section: str, key: str, default: Optional[str] = None) -> str:
    if cfg.has_option(section, key):
        return cfg.get(section, key)
    if default is not None:
        return default
    print(f"ERROR: Missing [{section}] {key} in config.ini", file=sys.stderr)
    sys.exit(2)


# --------------------------- HTTP / GraphQL ---------------------------

def make_request_with_retry(method: str, url: str, retries: int = 3, backoff: float = 0.8, **kwargs) -> requests.Response:
    last_exc = None
    for attempt in range(1, retries + 1):
        try:
            resp = requests.request(method, url, **kwargs)
            return resp
        except requests.RequestException as e:
            last_exc = e
            if attempt == retries:
                break
            time.sleep(backoff * attempt)
    raise last_exc  # type: ignore


def beginsession(cfg: configparser.ConfigParser, verbose: bool = False) -> Tuple[str, Dict[str, Any]]:
    tenant = get_setting(cfg, 'proshop', 'tenant_url').rstrip('/')
    login  = get_setting(cfg, 'proshop', 'login_endpoint', '/api/beginsession')
    user   = get_setting(cfg, 'proshop', 'username')
    pwd    = get_setting(cfg, 'proshop', 'password')
    scope  = get_setting(cfg, 'proshop', 'scope', '').strip()

    payload = {"username": user, "password": pwd, "scope": scope}
    url = f"{tenant}{login}"
    r = make_request_with_retry('POST', url, json=payload, headers={"Accept": "application/json"}, timeout=30)

    print("BeginSession status:", r.status_code)
    try:
        body = r.json()
        if verbose:
            print("BeginSession body:", json.dumps(body, indent=2))
        ar = body.get("authorizationResult", {})
    except Exception:
        print("BeginSession raw body:", r.text)
        r.raise_for_status()
        raise

    r.raise_for_status()

    token = ar.get("token")
    if not token:
        print("ERROR: No token returned from beginsession.", file=sys.stderr)
        sys.exit(3)

    # Sanity summary (sanitized)
    user_group = ar.get("userGroup", "")
    user_name  = ar.get("userName", user)
    print(f"Session user: {user_name} | userGroup: {repr(user_group)}")
    if user_group in ("", None):
        print("NOTE: userGroup is empty. This often means the user has no group-based permissions.")
    return token, ar


def gql(cfg: configparser.ConfigParser, token: str, query: str, variables: Dict[str, Any] = None,
        verbose: bool = False) -> Dict[str, Any]:
    tenant = get_setting(cfg, 'proshop', 'tenant_url').rstrip('/')
    graphql_path = get_setting(cfg, 'proshop', 'graphql_endpoint', '/api/graphql')
    url = f"{tenant}{graphql_path}"

    r = make_request_with_retry(
        'POST',
        url,
        json={"query": query, "variables": variables or {}},
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        timeout=30
    )
    print("GraphQL status:", r.status_code)

    try:
        body = r.json()
    except Exception:
        print("GraphQL raw body:", r.text)
        r.raise_for_status()
        raise

    if verbose:
        print("GraphQL body:", json.dumps(body, indent=2))

    errs = body.get("errors")
    if isinstance(errs, list) and len(errs) > 0:
        print("GraphQL errors:", errs)
        raise RuntimeError(errs)

    return body.get("data", {})


# --------------------------- Probes ---------------------------

def probe_minimal(cfg: configparser.ConfigParser, token: str, verbose: bool = False) -> None:
    print("Probing minimal GraphQL (__typename)...")
    try:
        _ = gql(cfg, token, "query { __typename }", verbose=verbose)
        print("[OK] Minimal GraphQL (__typename)")
    except RuntimeError as e:
        print(f"[BLOCKED] Minimal GraphQL -> {e}")


def probe_modules(cfg: configparser.ConfigParser, token: str, verbose: bool = False) -> None:
    tests = [
        ("Parts",        "query { parts(pageSize: 1) { totalRecords } }"),
        ("Work Orders",  "query { workOrders(pageSize: 1) { totalRecords } }"),
        ("NCRs",         "query { nonConformanceReports(pageSize: 1) { totalRecords } }"),
    ]
    print("Probing module access:")
    for name, q in tests:
        try:
            _ = gql(cfg, token, q, verbose=verbose)
            print(f"[OK] {name}")
        except RuntimeError as e:
            print(f"[BLOCKED] {name} -> {e}")


def tiny_ncr_test(cfg: configparser.ConfigParser, token: str, verbose: bool = False) -> None:
    print("Running tiny NCR totalRecords test...")
    try:
        data = gql(cfg, token, "query { nonConformanceReports(pageSize: 1) { totalRecords } }", verbose=verbose)
        total = data["nonConformanceReports"]["totalRecords"]
        print(f"[OK] NCR totalRecords = {total}")
    except Exception as e:
        print(f"[FAILED] NCR totalRecords test -> {e}")


# --------------------------- NCR fetching ---------------------------

NCR_PAGE_SIZE = 100

def parse_proshop_time(ts: str) -> dt.datetime:
    """
    ProShop sometimes returns 'YYYY-mm-ddTHHMMSSZ' (no colons).
    This parser matches that, and returns an aware UTC datetime.
    """
    # Example: 2025-09-30T110525Z
    d = dt.datetime.strptime(ts, "%Y-%m-%dT%H%M%SZ")
    return d.replace(tzinfo=dt.timezone.utc)


def fetch_ncr_page(cfg: configparser.ConfigParser, token: str, page: int, verbose: bool = False) -> Dict[str, Any]:
    query = """
    query NCRPage($pageSize: Int!, $pageNumber: Int!) {
      nonConformanceReports(pageSize: $pageSize, pageNumber: $pageNumber) {
        totalRecords
        results {
          id
          ncr
          createdTime
          title
          status
        }
      }
    }
    """
    variables = {"pageSize": NCR_PAGE_SIZE, "pageNumber": page}
    return gql(cfg, token, query, variables, verbose=verbose)


def fetch_all_ncrs(cfg: configparser.ConfigParser, token: str, since_dt: Optional[dt.datetime] = None,
                   verbose: bool = False) -> List[Dict[str, Any]]:
    page = 1
    results: List[Dict[str, Any]] = []
    total = None

    while True:
        data = fetch_ncr_page(cfg, token, page, verbose=verbose)
        ncrs = data["nonConformanceReports"]
        if total is None:
            total = ncrs["totalRecords"]
            print(f"[INFO] NCR totalRecords reported by server: {total}")

        batch = ncrs["results"]
        if not batch:
            break

        if since_dt:
            for item in batch:
                try:
                    ct = parse_proshop_time(item["createdTime"])
                except Exception:
                    # If format changes, skip filter and include the record
                    results.append(item)
                    continue
                if ct >= since_dt:
                    results.append(item)
        else:
            results.extend(batch)

        print(f"[INFO] Fetched page {page} ({len(batch)} items) — accumulated {len(results)}")
        if len(batch) < NCR_PAGE_SIZE:
            break

        page += 1
        # Be kind to the API
        time.sleep(0.1)

    return results


# --------------------------- CLI ---------------------------

def main() -> None:
    ap = argparse.ArgumentParser(description="ProShop weekly NCR reporter with diagnostics.")
    ap.add_argument("--mode", choices=["probes", "ncr"], default="probes",
                    help="probes = minimal + module probes (default), ncr = tiny NCR test only")
    ap.add_argument("--fetch", action="store_true", help="fetch and print NCR IDs after probes")
    ap.add_argument("--since-hours", type=int, default=None,
                    help="optional filter: only NCRs created within the last N hours")
    ap.add_argument("--verbose", action="store_true", help="print JSON bodies on success")
    args = ap.parse_args()

    cfg = load_config("config.ini")
    print("[debug] Using config from: config.ini")
    print("[debug] tenant_url:", get_setting(cfg, 'proshop', 'tenant_url'))
    print("[debug] username  :", get_setting(cfg, 'proshop', 'username'))
    print("[debug] scope     :", repr(get_setting(cfg, 'proshop', 'scope', '')))

    token, auth = beginsession(cfg, verbose=args.verbose)

    if args.mode == "probes":
        probe_minimal(cfg, token, verbose=args.verbose)
        probe_modules(cfg, token, verbose=args.verbose)
        print("\nIf modules are BLOCKED but minimal is OK: this is a server-side permission/scope issue.")
        print("• Ensure the user is assigned to a group with View rights for Parts, Work Orders, and NCRs.")
        print("• If API scopes are enforced, include: parts:r workorders:r nonconformancereports:r")
    elif args.mode == "ncr":
        tiny_ncr_test(cfg, token, verbose=args.verbose)

    if args.fetch:
        if args.since_hours is not None:
            since_dt = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=args.since_hours)
            print(f"[INFO] Fetching NCRs since {since_dt.isoformat()} (last {args.since_hours} hours)")
        else:
            since_dt = None

        try:
            ncrs = fetch_all_ncrs(cfg, token, since_dt=since_dt, verbose=args.verbose)
            print(f"[RESULT] NCRs returned: {len(ncrs)}")
            if ncrs:
                print("[RESULT] First 10 NCR IDs:", [n.get("ncr") or n.get("id") for n in ncrs[:10]])
        except RuntimeError as e:
            print("[ERROR] NCR fetch blocked ->", e)


if __name__ == "__main__":
    try:
        main()
    except requests.HTTPError as http_err:
        print("HTTPError:", http_err, file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print("Error:", e, file=sys.stderr)
        sys.exit(1)
