#!/usr/bin/env bash
# Only open-source tools and builder sources are downloaded. Game inputs stay local.
set -euo pipefail
umask 077
packages=(ca-certificates curl git unzip cmake ninja-build python3 clang-19 libc++-19-dev libc++abi-19-dev libx11-dev libxext-dev libxrandr-dev libxcursor-dev libxi-dev libxfixes-dev libasound2-dev libpulse-dev libudev-dev libvulkan1 mesa-vulkan-drivers)
check_ubuntu() {
  . /etc/os-release
  if [[ "$ID" != ubuntu || "$VERSION_ID" != 24.04 ]]; then
    echo 'This helper requires Ubuntu 24.04, including Ubuntu-24.04 on Windows WSL2.' >&2
    exit 2
  fi
}
missing_packages() {
  for package in "${packages[@]}"; do
    [[ "$(dpkg-query -W -f='${Status}' "$package" 2>/dev/null || true)" == 'install ok installed' ]] || printf '%s\n' "$package"
  done
}
check_ubuntu
[[ "$(uname -m)" == x86_64 ]] || { echo 'Automatic preparation currently supports x64 computers.' >&2; exit 2; }
case "${1:-}" in
  install)
    [[ $EUID == 0 ]] || { echo 'The tool-install step needs Ubuntu administrator access.' >&2; exit 2; }
    mapfile -t missing < <(missing_packages)
    if (( ${#missing[@]} )); then
      echo 'Installing the required build tools in Ubuntu...'
      apt-get update
      DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${missing[@]}"
    fi
    exit 0;;
  check)
    missing_packages
    exit 0;;
  build) shift;;
  *) echo 'Usage: prepare.sh install | check | build DISC OUTPUT SOURCES_ZIP SHA256 RUN_ID' >&2; exit 2;;
esac
[[ $# == 5 && "$5" =~ ^[a-f0-9]{32}$ && "$4" =~ ^[a-f0-9]{64}$ ]] || { echo 'Invalid preparation arguments.' >&2; exit 2; }
local_path() { if [[ "$1" =~ ^[A-Za-z]:\\ ]]; then wslpath -u "$1"; else printf '%s\n' "$1"; fi; }
disc=$(local_path "$1"); output=$(local_path "$2"); sources=$(local_path "$3"); expected=$4; run_id=$5
state="${XDG_DATA_HOME:-$HOME/.local/share}/mojo-web-preparer"
mkdir -p "$state" "${XDG_CACHE_HOME:-$HOME/.cache}/mojo-web-preparer"
exec 9>"$state/preparation.lock"
flock -n 9 || { echo 'Another MOJO preparation is still running. Wait for it to finish before retrying.' >&2; exit 2; }
pid_file="${XDG_CACHE_HOME:-$HOME/.cache}/mojo-web-preparer/$run_id.pid"
cancel_file="${XDG_CACHE_HOME:-$HOME/.cache}/mojo-web-preparer/$run_id.cancel"
printf '%s\n' "$$" > "$pid_file"
trap 'rm -f -- "$pid_file" "$cancel_file"' EXIT
[[ ! -f "$cancel_file" ]] || exit 130
root="$state/source"
echo 'Opening the verified preparation tools...'
python3 - "$sources" "$root" "$expected" <<'PY'
import hashlib,json,pathlib,stat,sys,zipfile
archive,root,expected=pathlib.Path(sys.argv[1]),pathlib.Path(sys.argv[2]),sys.argv[3]
if hashlib.sha256(archive.read_bytes()).hexdigest()!=expected: raise SystemExit('Preparation source checksum mismatch.')
root.mkdir(parents=True,exist_ok=True)
root=root.resolve()
with zipfile.ZipFile(archive) as z:
    manifest=json.loads(z.read('source-manifest.json'))['files']
    if set(z.namelist()) != set(manifest)|{'source-manifest.json'}: raise SystemExit('Unexpected file in preparation source.')
    for name,expected in manifest.items():
        target=(root/name).resolve()
        if not target.is_relative_to(root) or name.startswith('/') or '..' in pathlib.PurePosixPath(name).parts: raise SystemExit('Unsafe source path.')
        entry=z.getinfo(name)
        if stat.S_ISLNK(entry.external_attr>>16): raise SystemExit('Linked source is not allowed.')
        data=z.read(name)
        if hashlib.sha256(data).hexdigest()!=expected: raise SystemExit('Damaged preparation source.')
        target.parent.mkdir(parents=True,exist_ok=True)
        if not target.exists() or target.read_bytes()!=data: target.write_bytes(data)
PY
cd "$root"
if python3 scripts/prepare_local.py --game "$disc" --output "$output" --reuse-only; then
  exit 0
else
  result=$?
  [[ $result == 3 ]] || exit "$result"
fi
sdk="$root/userdata/emsdk"
if [[ ! -f "$sdk/emsdk_env.sh" ]]; then
  echo 'Downloading the pinned Emscripten 6.0.11 build tools...'
  git clone --depth 1 --branch 6.0.11 https://github.com/emscripten-core/emsdk.git "$sdk"
fi
if [[ ! -f "$sdk/upstream/emscripten/emcc.py" ]]; then "$sdk/emsdk" install 6.0.11; fi
"$sdk/emsdk" activate 6.0.11
set +u
source "$sdk/emsdk_env.sh"
set -u
python3 scripts/prepare_local.py --game "$disc" --output "$output"
