"""Add the browser target to a private copy of the pinned framework."""
from pathlib import Path


def apply(engine):
    engine = Path(engine)
    path = engine / 'CMakeLists.txt'
    text = path.read_text(encoding='utf-8')
    if 'MOJO_WEB_CMAKE' not in text:
        start = text.index('    if(EMSCRIPTEN)\n        set(PS2_WEB_ELF')
        end = text.index('\n    add_executable(ps2run', start)
        text = text[:start] + '''    if(EMSCRIPTEN)
        include("${MOJO_WEB_CMAKE}")
        return()
    endif()
''' + text[end:]
        text = text.replace('-sWASM_LEGACY_EXCEPTIONS=0 -pthread)', '-sWASM_LEGACY_EXCEPTIONS=0)')
        marker = 'if(EMSCRIPTEN)\n    add_compile_options'
        text = text.replace(marker, '''option(MOJO_WEB_THREADS "Browser EE/VU workers" ON)
if(EMSCRIPTEN AND MOJO_WEB_THREADS)
    add_compile_options(-pthread)
    add_link_options(-pthread)
endif()
if(EMSCRIPTEN)
    add_compile_options''', 1)
        path.write_text(text, encoding='utf-8')
    # The upstream VU emitter assumes a shared imported memory. The fallback
    # needs the same SIMD program with the non-shared memory import flag.
    path = engine / 'runtime/src/vu_jit.cpp'
    if path.is_file():
        text = path.read_text(encoding='utf-8')
        marker = '    is.byte(0x02);\n    is.byte(0x03);'
        text = text.replace(marker, '''    is.byte(0x02);
#if defined(__EMSCRIPTEN__) && !defined(__EMSCRIPTEN_PTHREADS__)
    is.byte(0x01);  // bounded, non-shared memory
#else
    is.byte(0x03);  // bounded, shared memory
#endif''')
        path.write_text(text, encoding='utf-8')
    path = engine / 'host/web.cpp'
    text = path.read_text(encoding='utf-8')
    if 'mojo_pause' not in text:
        # Disc reads are fulfilled from a validated local Blob, never HTTP.
        start = text.index('    fetch(target,')
        end = text.index('\n});', start)
        text = text[:start] + '''    Module.localDisc.slice(offset, offset + size).arrayBuffer().then((buffer) => {
        if (buffer.byteLength !== size) throw new Error('Short local disc read');
        HEAPU8.set(new Uint8Array(buffer), out);
        finish(3);
    }).catch((e) => { console.error(e); finish(4); });''' + text[end:]
        text = text.replace('AudioRing g_audio;', 'AudioRing g_audio;\nstd::atomic<bool> mojo_pause{false};')
        text = text.replace('void pace() {', '''void pace() {
    while (mojo_pause.load()) { g_next_frame = 0; usleep(10000); }''')
        text = text.replace('while (audio_queued_ms() > 80.0)', 'while (g_audio.active.load() && !mojo_pause.load() && audio_queued_ms() > 80.0)')
        # A renderer running at 30 Hz still needs audio/input serviced during GPU waits.
        text += '''
extern "C" EMSCRIPTEN_KEEPALIVE void ps2web_pause(int paused) {
    mojo_pause.store(paused != 0);
    if (paused) g_audio.active.store(0);
}
'''
        # Runtime VU capture must never send commercial programs to a server.
        a = text.index('    ps2::g_options.on_vu_program = ')
        b = text.index('    if (!EM_ASM_INT', a)
        text = text[:a] + text[b:]
        a = text.index('EM_JS(int, ps2web_save_program,')
        b = text.index('\nEM_JS(double, ps2web_disc_size', a)
        text = text[:a] + text[b:]
        path.write_text(text, encoding='utf-8')
