#!/bin/bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."

# The running site uses npm and pg, not the template workspace's DB migrations.
npm ci --omit=dev --no-audit --no-fund
npm test
