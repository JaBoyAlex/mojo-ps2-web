# MOJO!-Web

Public player: https://jaboyalex.github.io/mojo-ps2-web/

The page backdrop is original, static vector artwork of floating tracks and
rolling marbles. It contains no extracted game artwork or animation loop.

One resolution dropdown between Save location and Camera selects Original,
Enhanced, High or Ultra rendering independently of display size and fullscreen.
The choice is remembered and applies when Play starts the game. After starting,
the launcher shows the active resolution; changing it requires reloading and
selecting Play again. An optional
owner-provided PNG can be included with `--logo /path/to/logo.png`; it appears in
the top-left corner after runtime import without publishing original artwork.

The **Upscale HUD / 2D artwork** checkbox below resolution enables the existing
native reconstruction shader at Enhanced resolution or higher. It defaults to
Off, remembers the preference, and applies at the next game start.

Fullscreen uses the complete display-sized canvas at the display's pixel ratio.
The game keeps its original 4:3 aspect ratio, so widescreen displays have side
bars instead of cropped or stretched gameplay. Internal rendering resolution
remains controlled by the dropdown: fullscreen scales the whole rendered image
to fit, and does not automatically increase the game's rendering resolution.

A browser player derived from the existing MOJO! native recompilation. The native
project remains separate and unchanged. Public hosting contains independently
authored launcher code and tools; each player prepares the translated game
runtime locally from their own verified disc. No game code, assets, BIOS, compiled
game Wasm or runtime packages are hosted or uploaded to CI.

## Play

Prepare `MOJO-runtime.mojo` locally, import it into the public player, then import
your verified MOJO! USA BIN or ISO. The browser can remember both. Only the USA
PS2 SLUS_207.41, SYSTEM.CNF VER 1.02 disc with the exact supported ISO and ELF
SHA-256 values is accepted. Selecting a disc does not upload it.

The extra preparation step keeps translated commercial code off the public host.
A site that serves game-specific Wasm would distribute that code even if it also
asks for a disc. Runtime packages must remain on the owner's device.

## Local preparation

On Ubuntu 24.04 (including WSL2), install the native build prerequisites:

```sh
sudo apt-get install cmake ninja-build python3 clang-19 libc++-19-dev libc++abi-19-dev libx11-dev libxext-dev libxrandr-dev libxcursor-dev libxi-dev libxfixes-dev libasound2-dev libpulse-dev libudev-dev
git clone --depth 1 --branch 6.0.11 https://github.com/emscripten-core/emsdk.git userdata/emsdk
userdata/emsdk/emsdk install 6.0.11
userdata/emsdk/emsdk activate 6.0.11
source userdata/emsdk/emsdk_env.sh
python3 scripts/build_web.py --game '/path/to/Mojo! (USA).cue'
```

With an already explored, exact-disc native engine:

```sh
python3 scripts/build_web.py --game '/path/to/disc.cue' --seed-engine '/path/to/native/engine' --skip-explore
```

This regenerates the game's C++ and compiles both variants. The seed's disc must
match the supported hash. `--skip-explore` reuses existing coverage; it is not a
complete playthrough guarantee. The resulting `userdata/MOJO-runtime.mojo` is
private and ignored by Git. Never upload or share it.

## Controls and saves

Keyboard and standard gamepads; independent right-stick X/Y inversion; fullscreen,
focus pause/resume and browser audio. New erased cards use the native formatter.
Browser saves persist per origin. Chrome/Edge can remember a writable .ps2 file,
load it before boot and update it after in-game saves. Reconnect if the browser
renews permission. A browser recovery copy protects progress after a failed file
write. Existing cards are not silently reformatted. Export localhost saves before
moving to the public site; those are different browser storage origins.

## Architecture

`scripts/native_source.py` fetches an immutable, SHA-256-verified snapshot of the
native project's shared patches. `scripts/build_web.py` retains the pinned
ps2-native-recomp engine, ahead-of-time EE/VU translation, WebGPU compute renderer,
IOP interpreter and high-level PS2 services. The original native repository is
not edited. Updating shared fixes means reviewing and updating one source pin.

The public frontend loads the user's private runtime through local Blob URLs.
It verifies package integrity, selects the worker or single-thread variant and
stores it in IndexedDB if available. Unknown VU programs retain the upstream
runtime fallback. Unknown EE blocks still halt; no new CPU emulator was added.

GitHub Pages cannot directly set the worker isolation headers. An application-
scoped, same-origin service worker adds them locally and reloads once. The
public player requires that isolation for its qualified worker audio path. The
experimental single-thread host is not selected by the public player. No game
content is fetched from a remote server or put in the service worker cache.

## Public build and deployment

```sh
python3 scripts/build_site.py
python3 scripts/verify_publication.py
python3 scripts/serve_web.py --directory dist --port 8622
```

The public build copies an exact allowlist and generates an empty-card template
from the open-source formatter. It never reads `userdata/web-dist` or a game.
The Pages workflow runs tests and publication scans, uploads only `dist`, and
deploys through GitHub's official Pages actions. Repository Pages settings must
use GitHub Actions. Private runtime generation never runs in hosted CI.

## Validation status

The earlier local worker build was owner-tested and reported stable gameplay.
Local native regression completed 3,100 frames with the original executable
unchanged. Import hashes, audio rings, camera mapping, card formatting, save-file
reconnection and recovery have automated tests. This does not establish the
new public loader's hosted compatibility. Consult `docs/VALIDATION.md` for the
actual publication checks and any remaining limits. No broad-browser or complete
playthrough qualification is implied by compilation or a short playtest.

## Licenses and scope

Independently authored files use MIT; see LICENSE. The fetched native builder and
ps2-native-recomp retain their MIT notices, including upstream formatter credits.
Emscripten and the Dawn browser port retain their own upstream licenses. No rights
to MOJO! game code, graphics, music or trademarks are granted. This unofficial
project is not affiliated with the original creators or Sony.
