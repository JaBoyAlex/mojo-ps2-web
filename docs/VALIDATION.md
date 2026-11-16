# Validation record

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
rendered at approximately 60 guest frames/s at Enhanced (1280 x 896) internal
resolution, with 256 MiB heap, zero interpreted VU calls reported, and no console
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
Stage 1, accepted keyboard movement, and ran around 60 guest frames/s at Enhanced
resolution with a stable 256 MiB Wasm heap over the observed session. No console
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
