// Cooperative fallback: the same compiled game/runtime/GS, without worker queues.
#include "ps2/disc.hpp"
#include "ps2/system.hpp"
#include "ps2/state_request.hpp"
#include "ps2/video.hpp"
#include <emscripten.h>
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <vector>

void register_generated_code();
void register_generated_vu();
EM_ASYNC_JS(int, read_local, (double offset, void *out, int size), {
    try {
        const bytes = new Uint8Array(await Module.localDisc.slice(offset, offset + size).arrayBuffer());
        HEAPU8.set(bytes, out);
        return bytes.length;
    } catch(e) { console.error(e); return 0; }
});
EM_ASYNC_JS(void, frame_wait, (double until), {
    if (Module.onFrame) Module.onFrame();
    while (Module.paused) await new Promise(resolve => { Module.resumeFrame = resolve; });
    const delay = until - performance.now();
    await new Promise(resolve => setTimeout(resolve, Math.max(0, delay)));
});
EM_JS(void, audio_push, (const void *p, int frames), {
    if (Module.pushAudio) Module.pushAudio(HEAP16.subarray(p >> 1, (p >> 1) + frames * 2));
});

namespace {
double next_frame = 0;
void vblank() {
    ps2::present_frame();
    const double now = emscripten_get_now();
    if (next_frame == 0 || now - next_frame > 200) next_frame = now;
    next_frame += ps2::g_options.pal ? 20.0 : 1000.0 / 59.94;
    frame_wait(next_frame);
}
}
extern "C" {
EMSCRIPTEN_KEEPALIVE void ps2web_pad(int pad,int buttons,int lx,int ly,int rx,int ry) {
    ps2::set_pad_buttons(buttons,pad);
    const int axes[] = {rx,ry,lx,ly};
    for (int i=0;i<4;++i) ps2::set_pad_axis(i,axes[i],pad);
}
EMSCRIPTEN_KEEPALIVE void ps2web_pad_connected(int p,int on) { ps2::set_pad_connected(p,on); }
EMSCRIPTEN_KEEPALIVE void ps2web_resize(int w,int h) { ps2::resize_window(w,h); }
EMSCRIPTEN_KEEPALIVE double ps2web_frames() { return ps2::frames_run(); }
EMSCRIPTEN_KEEPALIVE double ps2web_primitives() { return ps2::primitives_drawn(); }
EMSCRIPTEN_KEEPALIVE double ps2web_gpu_ms() { return ps2::gpu_busy_ms(); }
EMSCRIPTEN_KEEPALIVE double ps2web_vu_interpreted() { return ps2::vu1_interpreted_calls(); }
EMSCRIPTEN_KEEPALIVE double ps2web_idle_ms(int) { return 0; }
EMSCRIPTEN_KEEPALIVE int ps2web_audio_ring() { return 0; }
EMSCRIPTEN_KEEPALIVE double ps2web_audio_queued_ms() { return EM_ASM_DOUBLE({return Module.queuedAudioMs || 0;}); }
EMSCRIPTEN_KEEPALIVE int ps2web_quick_state(int load) { return ps2::request_state_operation(load != 0,"/memcard/quick.p2s",nullptr); }
EMSCRIPTEN_KEEPALIVE void ps2web_video_options(int flags) { ps2::set_video_options(flags); }
EMSCRIPTEN_KEEPALIVE void ps2web_stream(int) {}
EMSCRIPTEN_KEEPALIVE void ps2web_pause(int on) { EM_ASM({Module.paused=!!$0; if (!$0 && Module.resumeFrame) {const f=Module.resumeFrame; Module.resumeFrame=null; f();}},on); }
}
int main(int argc,char **argv) {
    ps2::g_options.memcard_path="/memcard/Mcd001.ps2";
    ps2::g_options.on_memcard_saved=[] { EM_ASM({Module.ps2CardSaved?.();}); };
    ps2::g_options.on_vblank=vblank;
    for (int i=2;i<argc;++i) {
        const std::string a=argv[i];
        if (a=="--press" && i+1<argc) { ps2::Press p; if(ps2::parse_press(argv[++i],p)) ps2::g_options.presses.push_back(p); }
        else if(a=="--frames" && i+1<argc) ps2::g_options.max_frames=std::strtoull(argv[++i],nullptr,10);
    }
    register_generated_code(); register_generated_vu();
    ps2::set_audio_sink([](const std::int16_t *p,std::size_t n) { audio_push(p,n); });
    const auto size=static_cast<std::uint64_t>(EM_ASM_DOUBLE({return Module.localDisc.size;}));
    if (!ps2::disc::open("disc",size,[](std::uint64_t at,void *out,std::size_t n)->std::size_t {return read_local(at,out,n);})) return 1;
    ps2::init_graphics();
    ps2::WindowTarget target; target.kind=ps2::WindowTarget::Canvas; target.selector="#canvas";
    target.width=EM_ASM_INT({return Module.canvas.width;}); target.height=EM_ASM_INT({return Module.canvas.height;});
    if(!ps2::attach_window(target)) { EM_ASM({Module.onAbort('WebGPU surface unavailable');}); return 1; }
    std::uint32_t entry=0;
    if(!ps2::load_elf("/game/core.elf",entry)) return 1;
    ps2::boot(entry,{"cdrom0:\\SLUS_207.41;1"});
    ps2::run();
    EM_ASM({Module.onHalt(UTF8ToString($0));},ps2::halt_reason().c_str());
    return 0;
}
