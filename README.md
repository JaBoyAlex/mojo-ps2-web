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

1. Open the [player](https://jaboyalex.github.io/mojo-ps2-web/) in a current desktop
   Chrome or Edge with WebGPU and WebAssembly JSPI available.
2. Choose your legally obtained USA MOJO! PS2 ISO or BIN image.
3. Leave the tab open while the browser validates the disc and prepares the game.
   First setup takes several minutes. Completed compilation work can be reused
   after an interrupted setup.
4. Select **Play MOJO!**. Later visits use the private browser cache, provided
   the browser profile and its site data remain available.

When preparation tools change, the remembered disc is reused for an automatic
rebuild. Save data is stored separately from prepared game modules.

No installation or external preparation application is required. The browser
uses the existing EE recompiler and vector translator, compiles private modules
locally, and loads them into the existing WebGPU host with EE/VU workers and
its shared AudioWorklet. The compiler worker is terminated after preparation;
later launches do not load the browser compiler. Preparation uses a disposable
blank card and cannot alter the player's saved progress.

The site supplies only a generic host and independent open-source tools. It
never supplies or uploads the disc, executable, translated source, prepared game
modules or saves. Only USA PS2 SLUS_207.41, SYSTEM.CNF VER 1.02 with the exact
supported disc and ELF hashes is accepted. Third-party software notices are in
[third-party-notices.txt](web/third-party-notices.txt).

Existing private `.mojo` imports remain supported under **Other setup options**.
The [local preparation guide](https://jaboyalex.github.io/mojo-ps2-web/prepare.html)
provides the optional Windows/Ubuntu helper and developer build instructions.
An existing remembered `.mojo` runtime continues to use its established build.
`?setup=browser` selects browser preparation without deleting that older cache.

Automatic browser storage and linked save files behave as before. Export a save
backup before clearing site data, moving devices or switching browser profiles.
Higher rendering resolutions demand more GPU time; Original is the default.

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

The public frontend prepares private EE/VU modules inside browser workers. A
generic shared-memory host loads them using the threaded native library loader;
POD layout checks guard its interface with the browser compiler. A disposable
preparation frame discovers vector programs using an in-memory blank card.
The pinned SDK patch awaits its dynamic-library synchronization before starting
each pthread. Audio processing, rendering and gameplay scheduling retain the
existing worker host. Private `.mojo` packages remain available through the
original Blob loader. Unknown VU programs retain the upstream runtime fallback;
unknown EE blocks still halt. No new CPU emulator was added.

GitHub Pages cannot directly set the worker isolation headers. An application-
scoped, same-origin service worker adds them locally and reloads once. The
public player requires that isolation for its qualified worker audio path. The
experimental single-thread host is not selected by the public player. No game
content is fetched from a remote server or put in the service worker cache.

## Public build and deployment

```sh
python scripts/build_preparer.py --windows  # Windows: builds both independent helper downloads
source userdata/emsdk/emsdk_env.sh          # Ubuntu: activate Emscripten 6.0.11
python3 scripts/build_browser_tools.py --sdk userdata/emsdk
python3 scripts/build_site.py
python3 scripts/verify_publication.py
python3 scripts/serve_web.py --directory dist --port 8622
```

The Windows preparation-download CI job compiles the small independent helper
and packages both optional downloads from an exact source list. An independent
Ubuntu job builds the generic host and translators with pinned Emscripten 6.0.11,
then verifies the pinned browser compiler payloads. Neither job has game inputs.
The site job downloads only those independent tools, scans them and assembles the site.
The public build copies an exact allowlist and generates an empty-card template
from the open-source formatter. It never reads `userdata/web-dist` or a game.
The Pages workflow runs tests and publication scans, uploads only `dist`, and
deploys through GitHub's official Pages actions. Repository Pages settings must
use GitHub Actions. Private runtime generation never runs in hosted CI.

## Validation status

The earlier local worker build was owner-tested and reported stable gameplay.
Local native regression completed 3,100 frames with the original executable
unchanged. Browser-only preparation and cached launch have reached Stage 1 in
Chromium with the original shared AudioWorklet and no interpreted VU calls.
Import hashes, audio rings, camera mapping, card formatting, save-file
reconnection and recovery have automated tests. Consult `docs/VALIDATION.md` for
the actual hosted checks and their limits. No broad-browser or complete
playthrough qualification is implied by compilation or a short playtest.

## Licenses and scope

Independently authored files use MIT; see LICENSE. The fetched native builder and
ps2-native-recomp retain their MIT notices, including upstream formatter credits.
Emscripten and the Dawn browser port retain their own upstream licenses. No rights
to MOJO! game code, graphics, music or trademarks are granted. This unofficial
project is not affiliated with the original creators or Sony.
