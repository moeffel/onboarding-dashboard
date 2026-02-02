#!/usr/bin/env python3
"""
Post-deployment validation helper.

Supports:
- Health endpoint check (expects JSON and key/value pairs).
- Security header validation via HEAD/GET.
"""

from __future__ import annotations

import argparse
import json
import ssl
import sys
import urllib.error
import urllib.request
from typing import Dict, List, Optional

try:
    import certifi
except ImportError:  # pragma: no cover - optional dependency
    certifi = None  # type: ignore[assignment]


DEFAULT_HEADERS = [
    "content-security-policy",
    "strict-transport-security",
    "x-frame-options",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run post-deployment health + header checks.")
    parser.add_argument(
        "--health-url",
        help="HTTPS URL of the health endpoint (expects JSON).",
    )
    parser.add_argument(
        "--expect-field",
        action="append",
        dest="expected_fields",
        help="Expected key=value pair in health JSON (default: status=ok). Can be set multiple times.",
    )
    parser.add_argument(
        "--headers-url",
        help="HTTPS URL to probe for security headers (HEAD request).",
    )
    parser.add_argument(
        "--required-header",
        action="append",
        dest="required_headers",
        help="Required header name (case-insensitive). Defaults to CSP, HSTS, X-Frame-Options.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=5.0,
        help="Timeout per request in seconds (default: 5).",
    )
    parser.add_argument(
        "--insecure",
        action="store_true",
        help="Skip TLS verification (ONLY for staging/self-signed).",
    )
    args = parser.parse_args()
    if not args.health_url and not args.headers_url:
        parser.error("At least one of --health-url or --headers-url must be provided.")
    return args


def ssl_context(insecure: bool) -> ssl.SSLContext:
    if insecure:
        return ssl._create_unverified_context()
    if certifi is not None:
        return ssl.create_default_context(cafile=certifi.where())
    return ssl.create_default_context()


def parse_expected_fields(raw: Optional[List[str]]) -> Dict[str, str]:
    if not raw:
        return {"status": "ok"}
    expected: Dict[str, str] = {}
    for item in raw:
        if "=" not in item:
            raise ValueError(f"Invalid --expect-field value: '{item}' (use key=value).")
        key, value = item.split("=", maxsplit=1)
        key = key.strip()
        value = value.strip()
        if not key:
            raise ValueError(f"Invalid --expect-field value: '{item}' (empty key).")
        expected[key] = value
    return expected


def fetch_json(url: str, context: ssl.SSLContext, timeout: float) -> Dict[str, object]:
    request = urllib.request.Request(url, headers={"User-Agent": "post-deploy-check/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=timeout, context=context) as resp:
            data = resp.read().decode("utf-8", errors="replace")
            return json.loads(data)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Health endpoint did not return valid JSON: {exc}") from exc
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"Health endpoint returned HTTP {exc.code}: {exc.reason}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Health endpoint request failed: {exc.reason}") from exc


def validate_health(url: str, expected_fields: Dict[str, str], context: ssl.SSLContext, timeout: float) -> None:
    payload = fetch_json(url, context, timeout)
    for key, expected in expected_fields.items():
        actual = payload.get(key)
        if actual is None:
            raise RuntimeError(f"Health JSON missing key '{key}'. Full payload: {payload}")
        if str(actual) != expected:
            raise RuntimeError(
                f"Health JSON mismatch for '{key}': expected '{expected}', got '{actual}'. Full payload: {payload}"
            )
    print(f"Health check passed for {url} with payload {payload}.")


def fetch_headers(url: str, context: ssl.SSLContext, timeout: float) -> Dict[str, str]:
    request = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "post-deploy-check/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=timeout, context=context) as resp:
            return {k.lower(): v for k, v in resp.headers.items()}
    except urllib.error.HTTPError as exc:
        if exc.code == 405:
            # Fallback to GET if HEAD not allowed
            try:
                req_get = urllib.request.Request(url, method="GET", headers={"User-Agent": "post-deploy-check/1.0"})
                with urllib.request.urlopen(req_get, timeout=timeout, context=context) as resp:
                    return {k.lower(): v for k, v in resp.headers.items()}
            except Exception as inner_exc:  # pragma: no cover - fallback path
                raise RuntimeError(f"Header check failed after HEAD 405: {inner_exc}") from inner_exc
        raise RuntimeError(f"Header request returned HTTP {exc.code}: {exc.reason}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Header request failed: {exc.reason}") from exc


def validate_headers(url: str, required: List[str], context: ssl.SSLContext, timeout: float) -> None:
    headers = fetch_headers(url, context, timeout)
    missing = [header for header in required if header not in headers]
    if missing:
        raise RuntimeError(f"Missing required headers ({missing}) for {url}. Got: {headers}")
    print(f"Header check passed for {url}. Found headers: {', '.join(required)}")


def main() -> int:
    args = parse_args()
    expected_fields = parse_expected_fields(args.expected_fields)
    required_headers = (
        [h.lower() for h in args.required_headers] if args.required_headers else DEFAULT_HEADERS
    )
    context = ssl_context(args.insecure)

    if args.health_url:
        validate_health(args.health_url, expected_fields, context, args.timeout)

    if args.headers_url:
        validate_headers(args.headers_url, required_headers, context, args.timeout)

    print("Post-deployment checks completed successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
