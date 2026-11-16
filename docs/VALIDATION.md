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
