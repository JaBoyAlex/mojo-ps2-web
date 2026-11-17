# Compose the qualified worker host with a game-independent dynamic bridge.
set(MOJO_WEB_CMAKE "${CMAKE_CURRENT_LIST_DIR}/target.cmake")
include("${MOJO_WEB_CMAKE}")
foreach(t ps2runtime ps2game ps2web)
  target_compile_options(${t} PRIVATE -fvisibility=default)
endforeach()
target_link_options(ps2web PRIVATE
  -sMAIN_MODULE=1 -sMODULARIZE -sEXPORT_ES6 -sJSPI_EXPORTS=main,mojo_load_game
  "-sEXPORTED_RUNTIME_METHODS=callMain,HEAPU8,ENV,FS,IDBFS,addRunDependency,removeRunDependency")
