// Game-independent bridge. Prepared game modules exist only in the player's browser.
#include "ps2/generated.hpp"
#include "ps2/system.hpp"
#include <cstddef>
#include <cstdio>
#include <cstdlib>
#include <dlfcn.h>
#include <emscripten.h>
#include <initializer_list>
#include <stdexcept>

// Compare the POD interface across the host and the browser compiler, rather
// than depending on their different C++ standard-library implementations.
extern "C" EMSCRIPTEN_KEEPALIVE unsigned mojo_layout() {
    unsigned value=2166136261u;
    for (unsigned part : {sizeof(ps2::Cpu), alignof(ps2::Cpu), sizeof(ps2::Reg128),
         sizeof(ps2::Vu0Regs), sizeof(ps2::UnitInfo), offsetof(ps2::Cpu,pc),
         offsetof(ps2::Cpu,f), offsetof(ps2::Cpu,vu0), offsetof(ps2::Cpu,cop0)})
        value=(value^part)*16777619u;
    return value;
}

extern "C" EMSCRIPTEN_KEEPALIVE int mojo_load_game(int kind) {
    // dlopen records the module in shared native state so pthread startup can
    // populate each worker's table. JS loadDynamicLibrary alone cannot do that.
    auto handle=dlopen(kind?"/prepared-vu.wasm":"/prepared-ee.wasm",RTLD_NOW|RTLD_GLOBAL|RTLD_NODELETE);
    if (!handle) { std::fprintf(stderr,"Local preparation: %s\n",dlerror()); return 0; }
    const auto layout=reinterpret_cast<unsigned(*)()>(dlsym(handle,"mojo_prepared_layout"));
    if (!layout || layout()!=mojo_layout()) { std::fprintf(stderr,"Local module interface mismatch\n"); return 0; }
    return 1;
}

extern "C" EMSCRIPTEN_KEEPALIVE void mojo_render_options(int scale,int hud) {
    char text[16]; std::snprintf(text,sizeof(text),"%d",scale);
    setenv("PS2_SCALE",text,1); setenv("PS2_HUD_UPSCALE",hud?"1":"0",1);
}

void register_generated_code() {
    const auto install=reinterpret_cast<void(*)()>(dlsym(RTLD_DEFAULT,"mojo_install_ee"));
    if (!install) throw std::runtime_error("No prepared game module is loaded");
    install();
    if (EM_ASM_INT({ return Module.prepareCapture ? 1 : 0; })) {
        ps2::g_options.on_vu_program=[](const std::string &name,const std::uint8_t *code,std::size_t size) {
            const std::string path="/capture/"+name;
            if (auto file=std::fopen(path.c_str(),"wb")) {
                std::fwrite(code,1,size,file); std::fclose(file);
            }
        };
    }
}

void register_generated_vu() {
    const auto install=reinterpret_cast<void(*)()>(dlsym(RTLD_DEFAULT,"mojo_install_vu"));
    if (install) install();
}
