# Validation record

## GPU readout investigation

The former GPU percentage was computed by differencing `busy_ms()`. Inspection
of the pinned runtime shows that this value is an extrapolation: average sampled
pass time multiplied by total pass count. As new samples arrive, it can revise
its estimate for earlier work. Its delta therefore is not hardware utilization
and can generate values above 100 percent or below zero. The display was first
changed to estimated GPU milliseconds per guest frame, then removed at the
owner's request because no accurate hardware percentage is available through
the browser. No renderer, shader, timing,
audio or compiled game changes were made for this correction.

Read-only inspection of the owner's active hosted session confirmed scale 1,
701 x 507 presentation pixels at device pixel ratio 1, the worker build, one MOJO
browser instance, and no runtime errors. Across a roughly 102-second observation
interval, the heap stayed at 256 MiB and the audio underrun counter did not
increase; the page reported approximately 60 guest frames/s. These checks found
no hidden supersampling or additional active game instance. They do not establish
that every scene or browser has identical GPU utilization to an earlier run.

## Fullscreen sizing

The former fullscreen path retained the windowed 78%-height limit for its backing
buffer. Fullscreen now takes the stage's full dimensions and actual device pixel
ratio, while the windowed layout retains its previous sizing. The game renderer
still fits the whole 4:3 image with side bars where needed. The internal resolution
dropdown is unchanged; a smaller fixed window scales that rendered image down.

The actual resize function passed checks for normal window sizing and fullscreen
pixel ratios 1, 2 and 3. A lightweight browser fixture using the production CSS
and resize function verified a 1600 x 900 fullscreen viewport, stage and canvas,
then restoration to the original 1178 x 562 canvas in a 1280 x 720 window. No
second game or audio instance was started for this layout check. No runtime
binary or game-rendering behavior was changed.

2026-11-16. The original native repository and installation remain unchanged.

Before publication, all five Node suites passed: disc hashing/normalization,
stereo audio and ring-buffer behavior, camera and save-card rules, linked-save
file recovery, and private-runtime package integrity/selection. The source and
site publication gates require an exact file list; game Wasm, runtime packages,
disc images, saves, original artwork and raw logs are excluded from the site.

The new public-layout player was exercised through an ordinary static local
server without custom headers. Its isolation service worker enabled the worker
build. The owner's runtime package and original BIN were imported through the
file picker; the Wasm initialized and disc hashes passed. The startup sequence
rendered at approximately 60 guest frames/s with Enhanced selected in the UI
(the actual internal scale was not verified then), with 256 MiB heap, zero interpreted VU calls reported, and no console
warnings/errors observed. The original PNG logo was loaded from a private Blob.
These figures describe this machine and sequence, not a general benchmark.

Earlier owner tests reported stable local gameplay. Hosted gameplay and browser
qualification results will be added after deployment. Firefox, Safari and mobile
are not qualified solely by feature detection. File-system permissions may need
renewal; unsupported browsers retain browser-storage saves and backup downloads.
No complete-playthrough stability claim is made.

## Actual GitHub Pages verification

The public Pages workflow completed successfully for initial commit `c38c41a`.
The HTTPS page returned 200. The actual hosted worker build was exercised in the
desktop Chromium in-app browser, using only local file imports. It reached
Stage 1, accepted keyboard movement, and ran around 60 guest frames/s with Enhanced
selected (actual internal scale was not verified then), with a stable 256 MiB Wasm heap over the observed session. No console
warnings/errors were reported by the browser log interface during these checks.
The original logo was served from an owner-local Blob URL.

The game wrote its card; a backup exported through the hosted UI passed the
native ECC and filesystem validator: 337 written pages, no ECC errors, and the
game's save directory containing three files. After reloading the hosted page,
the runtime and disc were restored from browser storage, both inversion toggles
and Enhanced resolution were remembered, and a second exported card matched the
first byte for byte by SHA-256. This verifies card persistence, not a complete
stage-progression round trip. Backup exports used isolated test data.

The serial fallback was tested on the hosted site and failed auditory
qualification: its short copied-audio queue produced audible breakup, reported
by the owner. The test was stopped. The public player therefore requires the
existing worker runtime and its shared, audio-paced output; it does not silently
switch to the experimental serial host. A browser unable to enable isolation
gets an actionable startup message. No serial-audio stability claim is made.
Physical controllers, actual Edge/Firefox/Safari clients, long playthroughs and
auditory fidelity still require separate testing; Chromium results do not certify
those platforms. The public site is usable with an owner-prepared runtime and
does not distribute the game itself.

## Resolution handoff correction

A subsequent fullscreen investigation confirmed a launcher defect: Ultra was
selected and Module.ENV contained scale 4, but libc had cached its environment
before those settings were supplied. The running renderer's VRAM buffer was
4,194,304 bytes, confirming scale 1. Earlier statements based on the dropdown
alone did not establish an enhanced internal rendering resolution.

The launcher now holds an Emscripten preRun dependency until Play supplies the
resolution and HUD settings, before C++ constructors can cache the environment.
It then waits for runtime initialization before audio or main starts. The existing
private JavaScript/Wasm and AudioWorklet are unchanged. A regression test exercises
all four choices with constructor-time environment caching, including selection
after runtime loading. The UI distinguishes the active resolution from a choice
saved for the next launch.

With the unchanged owner runtime, the corrected local player was checked with
Ultra selected after runtime loading: libc's cached environment included
PS2_SCALE=4 and PS2_HUD_UPSCALE=1, and the renderer allocated a 67,108,864-byte
VRAM buffer (4 MiB times scale squared), confirming scale 4. Fullscreen used a
2560 x 1440 canvas for a 2560 x 1440 viewport at DPR 1 and retained scale 4.
Stage 1 displayed with the complete image and side bars. These checks verify
the actual renderer scale rather than relying on canvas size or the dropdown.

## Simplified preparation and single-file import

Preparation now has independent Windows x64 and Ubuntu 24.04 x64 helper downloads.
They wrap the existing pinned builder; no EE/VU host, renderer, AudioWorklet or
gameplay backend was changed. The Windows executable was compiled locally,
passed its bundled-source checks and an actual Windows-to-WSL argument/bootstrap
check (including spaces, Unicode and shell punctuation). Its controls and disc
picker were inspected without starting tool installation or gameplay. A clean
Windows installation/WSL installer round trip has not been qualified here.

An actual owner disc was validated by the helper driver and the existing private
runtime reused to create a 124,836,112-byte, owner-local single-import game file.
All four JS/Wasm components were compared byte for byte with the working private
package: identical. Importing that one file at an isolated local browser origin
validated the included disc and enabled Play without a separate disc picker.
After reload, Play became available without choosing either file again. IndexedDB
contained one 10,832,019-byte runtime and one 114,003,968-byte disc, avoiding a
duplicate cached disc. No game was started for this setup verification.

Automated tests cover package integrity, unchanged component extraction, separate
runtime caching, malformed disc descriptors, preservation of prior output after
an invalid disc, and strict helper archive/source manifests. Both setup downloads
contain only independent source and tooling, and are scanned as nested archives.
The helper may perform the existing builder's native headless discovery on a
fresh build; a new clean-machine full compilation was not repeated in this check.
That helper-only release did not provide browser-only disc-to-runtime compilation. Manual and older
runtime-only imports remain supported, and the header logo behavior is unchanged.

## Browser-only preparation — 2026-11-16

An isolated prototype and then the production frontend accepted the owner's
verified BIN, translated its executable with the existing recompiler, compiled
private EE/VU modules entirely in browser workers, and reached Stage 1. No
installer, external compiler process or prepared-file import was used in that
flow. Reload restored the disc and modules and enabled Play without running or
requesting the compiler again. The preparation context used a blank in-memory
card; the actual game's existing IDBFS/linked-save path was retained. Its card
was confirmed formatted. The earlier private `.mojo` package was also imported
and launched successfully through the compatibility path.

The six captured VU images produced eight compiled entries, including two jump
targets. The fresh game instance registered those entries and reported zero
interpreted VU calls. A prototype completed 3,600 frames with a 24.75-second
steady window at 60 frames/s and no added audio underruns. Integrated tests also
completed 3,600 frames at Original and Ultra/HUD settings without runtime errors.
Ultra allocated the expected 64 MiB scaled VRAM buffer. Under the same scripted
Ultra segment, browser preparation averaged about 39.2 guest frames/s and the
established runtime about 38.6, with no added audio underruns in either measured
window. Shared-machine startup timing varied. Subsequent quiet Original controls
both advanced 600 frames in 10.00 seconds, again with no added underruns; the
browser-prepared instance reported no runtime errors or interpreted VU calls.
These are short Chromium checks, not controlled cross-device benchmarks or a
complete playthrough. Speaker output was muted through a test gain node while
the original shared AudioWorklet continued processing.

The current generic host and both translators are built without a disc, ELF,
translated game source or captured VU program as an input. The public artifact
gate checks an exact tool allowlist, pinned compiler payloads, hashes, source
provenance, private-content patterns and absence of linked game-unit symbols.
Game bytes and resumable compilation objects remain in browser storage. The
generic host includes a narrowly scoped Emscripten 6.0.11 startup patch: await
dynamic-library synchronization inside a promising boundary before starting
each pthread. Processor POD layout checks guard the older browser compiler's
interface with that host. Worker scheduling, rendering and shared audio retain
the established implementation.

The embedded test browser declined requestFullscreen permission. Fullscreen
code was unchanged; the existing sizing/ratio regression checks still pass.
Actual OS fullscreen and other browser engines were not newly qualified here.
The player continues to gate unsupported WebGPU/JSPI/isolation capabilities.

Nested-archive Gitleaks scanning initially reported eight generic-key matches in
the pinned compiler archive. All were upstream SIMDe float16 enum comparisons,
not credentials. The repository scan configuration retains the default rules
and excepts only those three exact comparison values at that one compiler path.
A Brotli-compressed control at the same path confirmed the enum was excluded
while a synthetic GitHub token was still detected. The actual release archive
then passed. No credential rule or archive path was broadly disabled.
