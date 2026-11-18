#!/usr/bin/env bash
# Materialise a calibration scenario as a fresh git repository.
#   calibration/scaffold.sh <scenario> [variant] <dest>
# Copies scenarios/<scenario>/repo (plus overlays/<variant>), then makes the number of commits
# given by `commits:` in expect.yaml, so mode detection sees the intended history.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
scenario="$1"; shift
variant=""; if [ $# -eq 2 ]; then variant="$1"; shift; fi
dest="$1"
src="$here/scenarios/$scenario"
[ -d "$src/repo" ] || { echo "unknown scenario: $scenario" >&2; exit 2; }
mkdir -p "$dest"
cp -R "$src/repo/." "$dest/"
if [ -n "$variant" ]; then
  [ -d "$src/overlays/$variant" ] || { echo "unknown variant: $variant" >&2; exit 2; }
  cp -R "$src/overlays/$variant/." "$dest/"
fi
commits="$(sed -n 's/^commits: *\([0-9]*\).*/\1/p' "$src/expect.yaml")"
cd "$dest"
git init -q
git add -A
for i in $(seq 1 "${commits:-1}"); do
  git -c user.email=calibration@example.invalid -c user.name=calibration commit -q --allow-empty -m "c$i"
done
echo "$dest: $scenario${variant:+ + $variant}, $commits commits"
