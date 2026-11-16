#!/usr/bin/env bash
set -euo pipefail
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
echo 'Prepare MOJO! — your disc and prepared game stay on this computer.'
read -r -p 'Path to your MOJO! USA ISO, BIN or CUE: ' disc
read -r -p 'Save prepared file to (Enter for Downloads/MOJO-runtime.mojo): ' output
output=${output:-$HOME/Downloads/MOJO-runtime.mojo}
[[ -f "$disc" ]] || { echo 'Disc image not found.' >&2; exit 2; }
echo 'Setting up the required Ubuntu build tools...'
sudo bash "$here/prepare.sh" install
run_id=$(python3 -c 'import uuid; print(uuid.uuid4().hex)')
read -r expected < "$here/bundle-hashes.txt"
exec bash "$here/prepare.sh" build "$disc" "$output" "$here/sources.zip" "$expected" "$run_id"
