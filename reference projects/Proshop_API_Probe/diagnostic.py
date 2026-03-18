#!/usr/bin/env python3
"""
diagnostic.py — ProShop API permission & connectivity tester

• Reads credentials, scope, and endpoints from config.ini
• Begins a session and prints sanitized session info
• Probes GraphQL access with minimal and module-specific queries
• Optional NCR test (disabled by default)

Usage (Windows CMD/PowerShell):
  python diagnostic.py                 # run probes (default)
  python diagnostic.py --mode probes   # same as default
  python diagnostic.py --mode ncr      # run a tiny NCR totalRecords test
  python diagnostic.py --verbose       # show JSON bodies on success

config.ini expected structure:
[proshop]
tenant_url      = https://est.adionsystems.com
login_endpoint  = /api/beginsession
graphql_endpoint= /api/graphql
username        = admin@esttool.com
password        = YOUR_PASSWORD_HERE
scope           = nonconformancereports:r workorders:r parts:r
"""

import argparse
import configparser
import json
import sys
from typing import Dict, Any

import requests


def load_config() -> configparser.ConfigParser:
    cfg = configparser.ConfigParser()
    read_files = cfg.read('config.ini')
    if not read_files:
        print("ERROR: config.ini not found in current directory.", file=sys.stderr)
        print("Create a config.ini like the example included with this script.", file=sys.stderr)
        sys.exit(2)
    return cfg


def get_setting(cfg: configparser.ConfigParser, section: str, key: str, default: str = None) -> str:
    if cfg.has_option(section, key):
        return cfg.get(section, key)
    if default is not None:
        return default
    print(f"ERROR: Missing [{section}] {key} in config.ini", file=sys.stderr)
    sys.exit(2)


def beginsession(cfg: configparser.ConfigParser) -> Dict[str, Any]:
    tenant = get_setting(cfg, 'proshop', 'tenant_url').rstrip('/')
    login  = get_setting(cfg, 'proshop', 'login_endpoint', '/api/beginsession')
    user   = get_setting(cfg, 'proshop', 'username')
    pwd    = get_setting(cfg, 'proshop', 'password')
    scope  = get_setting(cfg, 'proshop', 'scope', '').strip()

    payload = {"username": user, "password": pwd, "scope": scope}
    url = f"{tenant}{login}"
    r = requests.post(url, json=payload, headers={"Accept": "application/json"}, timeout=30)
    print("BeginSession status:", r.status_code)

    try:
        body = r.json()
        print("BeginSession body:", json.dumps(body, indent=2))
    except Exception:
        print("BeginSession raw body:", r.text)

    r.raise_for_status()

    # Defensive: ensure expected structure
    ar = r.json().get("authorizationResult", {})
    token = ar.get("token")
    if not token:
        print("ERROR: No token returned from beginsession.", file=sys.stderr)
        sys.exit(3)

    # Sanity summary (sanitized)
    user_group = ar.get("userGroup", "")
    user_name  = ar.get("userName", user)
    print(f"Session user: {user_name} | userGroup: {user_group!r}")
    if user_group in ("", None):
        print("NOTE: userGroup is empty. This often means the user has no group-based permissions.")
    return {"tenant": tenant, "graphql": get_setting(cfg, 'proshop', 'graphql_endpoint', '/api/graphql'),
            "token": token, "scope": scope, "user": user, "user_group": user_group}


def gql(tenant: str, graphql_path: str, token: str, query: str, variables: Dict[str, Any] = None,
        verbose: bool = False) -> Dict[str, Any]:
    url = f"{tenant}{graphql_path}"
    r = requests.post(url,
                      json={"query": query, "variables": variables or {}},
                      headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
                      timeout=30)
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


def probe_minimal(tenant: str, graphql_path: str, token: str, verbose: bool = False) -> None:
    print("Probing minimal GraphQL (__typename)...")
    try:
        _ = gql(tenant, graphql_path, token, "query { __typename }", verbose=verbose)
        print("[OK] Minimal GraphQL (__typename)")
    except RuntimeError as e:
        print(f"[BLOCKED] Minimal GraphQL -> {e}")


def probe_modules(tenant: str, graphql_path: str, token: str, verbose: bool = False) -> None:
    tests = [
        ("Parts",        "query { parts(pageSize: 1) { totalRecords } }"),
        ("Work Orders",  "query { workOrders(pageSize: 1) { totalRecords } }"),
        ("NCRs",         "query { nonConformanceReports(pageSize: 1) { totalRecords } }"),
    ]
    print("Probing module access:")
    for name, q in tests:
        try:
            _ = gql(tenant, graphql_path, token, q, verbose=verbose)
            print(f"[OK] {name}")
        except RuntimeError as e:
            print(f"[BLOCKED] {name} -> {e}")


def tiny_ncr_test(tenant: str, graphql_path: str, token: str, verbose: bool = False) -> None:
    print("Running tiny NCR totalRecords test...")
    try:
        data = gql(
            tenant,
            graphql_path,
            token,
            "query { nonConformanceReports(pageSize: 1) { totalRecords } }",
            verbose=verbose
        )
        total = data["nonConformanceReports"]["totalRecords"]
        print(f"[OK] NCR totalRecords = {total}")
    except Exception as e:
        print(f"[FAILED] NCR totalRecords test -> {e}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Diagnose ProShop API auth & permissions.")
    ap.add_argument("--mode", choices=["probes", "ncr"], default="probes",
                    help="probes = minimal + module probes (default), ncr = tiny NCR test only")
    ap.add_argument("--verbose", action="store_true", help="print JSON bodies on success")
    args = ap.parse_args()

    cfg = load_config()
    sess = beginsession(cfg)
    tenant = sess["tenant"]
    graphql_path = sess["graphql"]
    token = sess["token"]

    if args.mode == "probes":
        probe_minimal(tenant, graphql_path, token, verbose=args.verbose)
        probe_modules(tenant, graphql_path, token, verbose=args.verbose)
        print("\nIf modules are BLOCKED but minimal is OK: this is a server-side permission/scope issue.")
        print("• Ensure the user is assigned to a group with View rights for Parts, Work Orders, and NCRs.")
        print("• If API scopes are enforced, include: parts:r workorders:r nonconformancereports:r")
    elif args.mode == "ncr":
        tiny_ncr_test(tenant, graphql_path, token, verbose=args.verbose)


if __name__ == "__main__":
    try:
        main()
    except requests.HTTPError as http_err:
        print("HTTPError:", http_err, file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print("Error:", e, file=sys.stderr)
        sys.exit(1)
