# Included inside the pinned framework's browser-only branch.
get_filename_component(MOJO_WEB_DIR "${MOJO_WEB_CMAKE}" DIRECTORY)
if(MOJO_WEB_THREADS)
  add_executable(ps2web host/web.cpp)
  target_link_options(ps2web PRIVATE -sPTHREAD_POOL_SIZE=2)
else()
  add_executable(ps2web "${MOJO_WEB_DIR}/single.cpp")
endif()
target_link_libraries(ps2web PRIVATE ps2game ps2runtime)
target_compile_options(ps2game PRIVATE -ffp-contract=off)
target_compile_options(ps2runtime PRIVATE -ffp-contract=off)
option(MOJO_WEB_LTO "Enable LLVM link-time optimization (profile before enabling)" OFF)
if(MOJO_WEB_LTO)
  foreach(t ps2web ps2game ps2runtime)
    target_compile_options(${t} PRIVATE -flto)
    target_link_options(${t} PRIVATE -flto)
  endforeach()
endif()
target_link_options(ps2web PRIVATE
  --profiling-funcs -sJSPI -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=268435456
  -sMAXIMUM_MEMORY=1073741824 -sALLOW_TABLE_GROWTH=1 -lidbfs.js
  -sSTACK_SIZE=16777216 -sENVIRONMENT=web -sFORCE_FILESYSTEM=1
  "-sEXPORTED_FUNCTIONS=_main,_ps2web_pad,_ps2web_pad_connected,_ps2web_resize,_ps2web_gpu_ms,_ps2web_frames,_ps2web_primitives,_ps2web_audio_ring,_ps2web_audio_queued_ms,_ps2web_idle_ms,_ps2web_vu_interpreted,_ps2web_quick_state,_ps2web_video_options,_ps2web_stream,_ps2web_pause"
  "-sEXPORTED_RUNTIME_METHODS=callMain,HEAPU8,ENV,FS,IDBFS,addRunDependency,removeRunDependency"
  --shell-file "${MOJO_WEB_DIR}/shell.html")
set_target_properties(ps2web PROPERTIES SUFFIX ".html" LINK_DEPENDS "${MOJO_WEB_DIR}/shell.html")
