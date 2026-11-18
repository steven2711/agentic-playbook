#!/usr/bin/env bash
set -euo pipefail
# Fails if any route imports the database module directly, then runs the suite.
if grep -rn "lib/db" src/routes/; then echo "route imports db" >&2; exit 1; fi
curl -sf localhost:3000/orders/00000000-0000-0000-0000-000000000001/total >/dev/null || true
npm test
