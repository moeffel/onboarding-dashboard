#!/usr/bin/env python3
"""
DNS & HTTPS validation helper for deployment readiness.

Checks:
1. Resolves the given domain and prints all IPv4 addresses.
2. Optionally asserts that the resolved IPs match the expected list.
3. Optionally performs an HTTPS GET request to verify the health endpoint.
"""

from __future__ import annotations

import argparse
import json
import socket
import ssl
import sys
import urllib.error
import urllib.request
from typing import List, Optional

try:
    import certifi
except ImportError:  # pragma: no cover - optional dependency
    certifi = None  # type: ignore[assignment]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate DNS + HTTPS reachability.")
    parser.add_argument(
        "--domain",
        required=True,
        help="Domain/subdomain to resolve.",
    )
    parser.add_argument(
        "--expected-ip",
        action="append",
        dest="expected_ips",
        help="Expected IPv4 address (can be supplied multiple times).",
    )
    parser.add_argument(
        "--https-url",
        help="Optional HTTPS URL to fetch (e.g., https://dashboard.brand.at/api/health).",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=5.0,
        help="Timeout in seconds for DNS resolve and HTTPS request (default: 5s).",
    )
    parser.add_argument(
        "--insecure",
        action="store_true",
        help="Skip TLS verification (ONLY for debugging/self-signed certs).",
    )
    return parser.parse_args()


def resolve_domain(domain: str) -> List[str]:
    try:
        _, _, ips = socket.gethostbyname_ex(domain)
    except socket.gaierror as exc:
        raise RuntimeError(f"DNS resolution failed for {domain}: {exc}") from exc
    unique_ips = sorted(set(ips))
    if not unique_ips:
        raise RuntimeError(f"No IPv4 addresses returned for {domain}.")
    return unique_ips


def assert_expected_ips(resolved: List[str], expected: List[str]) -> None:
    expected_sorted = sorted(set(expected))
    if resolved != expected_sorted:
        raise RuntimeError(
            "Resolved IPs do not match expected.\n"
            f"Resolved: {resolved}\n"
            f"Expected: {expected_sorted}"
        )


def fetch_https(url: str, timeout: float, insecure: bool) -> dict[str, str]:
    context: Optional[ssl.SSLContext]
    if insecure:
        context = ssl._create_unverified_context()
    else:
        if certifi is not None:
            context = ssl.create_default_context(cafile=certifi.where())
        else:
            context = ssl.create_default_context()
    request = urllib.request.Request(url, headers={"User-Agent": "deploy-check/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=timeout, context=context) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return {
                "status": str(resp.status),
                "reason": resp.reason,
                "body": body[:2000],  # limit output
            }
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"HTTPS request failed: {exc.status} {exc.reason}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"HTTPS request error: {exc.reason}") from exc


def main() -> int:
    args = parse_args()

    resolved_ips = resolve_domain(args.domain)
    print(f"Resolved {args.domain} → {', '.join(resolved_ips)}")

    if args.expected_ips:
        assert_expected_ips(resolved_ips, args.expected_ips)
        print("Resolved IPs match expected list.")

    if args.https_url:
        result = fetch_https(args.https_url, args.timeout, args.insecure)
        print("HTTPS response:")
        print(json.dumps(result, indent=2))

    print("DNS/HTTPS validation completed successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
