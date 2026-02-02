#!/usr/bin/env bash
# Helper script to generate a self-signed certificate for staging/local tests.
# Usage:
#   ./setup/generate_self_signed_cert.sh --domain dashboard.brand.at \
#       --san www.dashboard.brand.at --days 30 --force

set -euo pipefail

SSL_DIR="ssl"
DOMAIN=""
DAYS="365"
declare -a ALT_NAMES=()
FORCE="false"

print_help() {
  cat <<'EOF'
Generate a self-signed TLS certificate for local/staging usage.

Required:
  --domain <domain>          Primary domain for CN and SAN entry.

Optional:
  --san <domain>             Additional SAN entry (can be repeated).
  --days <n>                 Certificate validity in days (default: 365).
  --ssl-dir <path>           Target SSL directory (default: ./ssl).
  --force                    Overwrite existing privkey.pem/fullchain.pem.
  -h|--help                  Show this message.

NOTE: Use real certificates (e.g., Let's Encrypt) for production traffic.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)
      DOMAIN="${2:-}"
      shift 2
      ;;
    --san)
      ALT_NAMES+=("${2:-}")
      shift 2
      ;;
    --days)
      DAYS="${2:-}"
      shift 2
      ;;
    --ssl-dir)
      SSL_DIR="${2:-}"
      shift 2
      ;;
    --force)
      FORCE="true"
      shift
      ;;
    -h|--help)
      print_help
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      print_help
      exit 1
      ;;
  esac
done

if [[ -z "$DOMAIN" ]]; then
  echo "Error: --domain is required." >&2
  print_help
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "Error: openssl is required but not found." >&2
  exit 1
fi

mkdir -p "$SSL_DIR"
KEY_PATH="$SSL_DIR/privkey.pem"
CERT_PATH="$SSL_DIR/fullchain.pem"

if [[ "$FORCE" != "true" && ( -f "$KEY_PATH" || -f "$CERT_PATH" ) ]]; then
  echo "Error: $KEY_PATH or $CERT_PATH already exists. Use --force to overwrite." >&2
  exit 1
fi

# Build SAN list: ensure primary domain is first.
SAN_ENTRIES=("$DOMAIN")
for name in "${ALT_NAMES[@]}"; do
  if [[ -n "$name" && "$name" != "$DOMAIN" ]]; then
    SAN_ENTRIES+=("$name")
  fi
done

TEMP_CONF="$(mktemp)"
trap 'rm -f "$TEMP_CONF"' EXIT

{
  echo "[req]"
  echo "default_bits = 2048"
  echo "prompt = no"
  echo "default_md = sha256"
  echo "req_extensions = v3_req"
  echo "distinguished_name = dn"
  echo
  echo "[dn]"
  echo "CN = $DOMAIN"
  echo
  echo "[v3_req]"
  echo "subjectAltName = @alt_names"
  echo
  echo "[alt_names]"
  idx=1
  for name in "${SAN_ENTRIES[@]}"; do
    echo "DNS.$idx = $name"
    idx=$((idx + 1))
  done
} > "$TEMP_CONF"

openssl req \
  -x509 \
  -nodes \
  -days "$DAYS" \
  -newkey rsa:2048 \
  -keyout "$KEY_PATH" \
  -out "$CERT_PATH" \
  -config "$TEMP_CONF" \
  -extensions v3_req >/dev/null

chmod 600 "$KEY_PATH" "$CERT_PATH"

echo "Generated self-signed certificate:"
echo "  Key : $KEY_PATH"
echo "  Cert: $CERT_PATH"
echo "Domains: ${SAN_ENTRIES[*]}"
