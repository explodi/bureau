cmake_minimum_required(VERSION 3.24)
project(bureau VERSION 0.1.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(CMAKE_C_VISIBILITY_PRESET hidden)
set(CMAKE_CXX_VISIBILITY_PRESET hidden)
set(CMAKE_VISIBILITY_INLINES_HIDDEN ON)

option(BUREAU_BUILD_TESTS "Build Bureau's tests" ${PROJECT_IS_TOP_LEVEL})
option(BUREAU_BACKENDS "Build the Metal, Vulkan, Direct3D and OpenGL backends" ON)
option(BUREAU_INSPECTOR "Debug the UI's TSX in Chrome DevTools" OFF)

if(MSVC)
  # UTF-8 sources.
  add_compile_options(/utf-8)
endif()

include(third_party/dependencies.cmake)
find_package(Threads REQUIRED)

# Layout, text, input and painting: display lists from a stream of commits.
add_library(bureau_core STATIC
  src/tree/tree.cpp src/text/font.cpp
  src/text/paragraph.cpp src/style/tokens.cpp src/labels/labels.cpp
  src/labels/streets.cpp
  src/view/atlas.cpp src/view/images.cpp src/view/plot.cpp src/view/vector.cpp
  src/view/anim.cpp
  src/view/format.cpp src/view/view.cpp src/view/view_layout.cpp
  src/view/view_paint.cpp src/view/view_input.cpp src/view/view_host.cpp
  src/backends/quads.cpp)
target_include_directories(bureau_core PUBLIC
  include src src/tree src/text src/style src/labels src/view third_party)
target_compile_definitions(bureau_core PRIVATE JSON_NOEXCEPTION)
target_link_libraries(bureau_core PUBLIC
  yogacore freetype harfbuzz bureau_unibreak_lib bureau_stb_headers
  bureau_nanosvg_headers)
if(APPLE)
  target_link_libraries(bureau_core PUBLIC "-framework CoreText")
endif()
if(MSVC)
  target_compile_options(bureau_core PRIVATE /W4 /EHs-c-)
else()
  target_compile_options(bureau_core PRIVATE
    -Wall -Wextra -Wpedantic -Werror -fno-exceptions)
endif()

# The UI's thread: Hermes, the view's half of __native, and Ui, what a game holds.
include(third_party/hermes.cmake)
# On Apple, Hermes is a framework: a game's build runs from here and ships a copy.
set(BUREAU_HERMES_FRAMEWORKS "${bureau_hermes_framework_dir}" CACHE INTERNAL "")
if(TARGET bureau_hermes)
  add_library(bureau_js STATIC
    src/js/host.cpp src/js/inspect.cpp src/js/ui.cpp src/js/view_bridge.cpp
    src/js/net/base64.cpp src/js/net/handshake.cpp src/js/net/http_request.cpp
    src/js/net/websocket_frame.cpp)
  if(WIN32)
    target_sources(bureau_js PRIVATE src/js/net/socket_win32.cpp)
    target_link_libraries(bureau_js PRIVATE ws2_32)
  else()
    target_sources(bureau_js PRIVATE src/js/net/socket_posix.cpp)
  endif()
  target_include_directories(bureau_js PRIVATE src/js src/js/net)
  target_compile_definitions(bureau_js PRIVATE
    BUREAU_ENABLE_DEBUGGER=$<BOOL:${BUREAU_INSPECTOR}>)
  if(BUREAU_INSPECTOR)
    target_compile_definitions(bureau_js PRIVATE HERMES_ENABLE_DEBUGGER=1)
  endif()
  if(MSVC)
    # JSI's errors arrive as C++ exceptions.
    target_compile_options(bureau_js PRIVATE /W4 /EHsc)
  else()
    target_compile_options(bureau_js PRIVATE -Wall -Wextra -Wpedantic -Werror)
  endif()
  target_link_libraries(bureau_js PUBLIC bureau_core bureau_hermes)
endif()

# A game takes the one its renderer needs: each draws Bureau's display lists into
# the game's own passes.
if(BUREAU_BACKENDS)
  if(APPLE)
    enable_language(OBJCXX)
    add_library(bureau_metal STATIC src/backends/metal.mm)
    target_compile_options(bureau_metal PRIVATE -fobjc-arc)
    target_link_libraries(bureau_metal PUBLIC bureau_core
      "-framework Metal" "-framework Foundation")
  endif()
  if(WIN32)
    add_library(bureau_d3d11 STATIC src/backends/d3d11.cpp)
    target_link_libraries(bureau_d3d11 PUBLIC bureau_core d3d11 d3dcompiler)
    target_include_directories(bureau_d3d11 PRIVATE src/backends)
    add_library(bureau_d3d12 STATIC src/backends/d3d12.cpp)
    target_link_libraries(bureau_d3d12 PUBLIC bureau_core d3d12 d3dcompiler)
    target_include_directories(bureau_d3d12 PRIVATE src/backends)
  endif()
  add_library(bureau_opengl STATIC src/backends/opengl.cpp)
  target_link_libraries(bureau_opengl PUBLIC bureau_core)
  # The headers only, unless a game's target already gives them. Nothing links a
  # loader: the game hands over vkGetInstanceProcAddr.
  if(NOT TARGET Vulkan::Headers)
    FetchContent_Declare(bureau_vulkan_headers
      GIT_REPOSITORY https://github.com/KhronosGroup/Vulkan-Headers.git
      GIT_TAG 9fbc2a782ee3f8a4db64e7d991e23da75e893f44)
    FetchContent_MakeAvailable(bureau_vulkan_headers)
  endif()
  add_library(bureau_vulkan STATIC src/backends/vulkan.cpp)
  target_include_directories(bureau_vulkan PRIVATE src/backends)
  target_compile_definitions(bureau_vulkan PUBLIC VK_NO_PROTOTYPES)
  target_link_libraries(bureau_vulkan PUBLIC bureau_core Vulkan::Headers)
endif()

if(BUREAU_BUILD_TESTS)
  enable_testing()
  find_program(DENO_EXECUTABLE deno REQUIRED
    DOC "Deno, which turns the kit's tokens into their JSON")
  set(BUREAU_TOKENS_JSON ${CMAKE_CURRENT_BINARY_DIR}/tokens.json)
  add_custom_target(bureau_tokens
    COMMAND ${DENO_EXECUTABLE} run --allow-read --allow-write --allow-env
      ${CMAKE_CURRENT_SOURCE_DIR}/tools/tokens.ts ${BUREAU_TOKENS_JSON}
    WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
    COMMENT "Generating Bureau's tokens"
    VERBATIM)

  add_executable(bureau_tests
    tests/tree_test.cpp tests/font_test.cpp tests/labels_test.cpp
    tests/streets_test.cpp tests/tokens_test.cpp tests/paragraph_test.cpp
    tests/view_test.cpp tests/atlas_test.cpp tests/plot_test.cpp
    tests/vector_test.cpp tests/quads_test.cpp)
  target_include_directories(bureau_tests PRIVATE
    ${bureau_freetype_BINARY_DIR}/include
    ${bureau_freetype_SOURCE_DIR}/include
    ${bureau_harfbuzz_SOURCE_DIR}/src)
  target_compile_definitions(bureau_tests PRIVATE
    BUREAU_FONT_DIR="${CMAKE_CURRENT_SOURCE_DIR}/assets/fonts"
    BUREAU_PUBLIC_DIR="${CMAKE_CURRENT_SOURCE_DIR}/assets"
    BUREAU_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/tests/fixtures"
    BUREAU_TOKENS_JSON="${BUREAU_TOKENS_JSON}")
  add_dependencies(bureau_tests bureau_tokens)
  target_link_libraries(bureau_tests PRIVATE bureau_core)
  add_test(NAME bureau_tests COMMAND bureau_tests)

  if(TARGET bureau_d3d11)
    add_executable(bureau_d3d_tests tests/backends/d3d_test.cpp)
    target_link_libraries(bureau_d3d_tests PRIVATE bureau_d3d11 bureau_d3d12 dxgi)
    add_test(NAME bureau_d3d_tests COMMAND bureau_d3d_tests)
  endif()
  if(TARGET bureau_vulkan)
    add_executable(bureau_vulkan_tests tests/backends/vulkan_test.cpp)
    target_link_libraries(bureau_vulkan_tests PRIVATE bureau_vulkan ${CMAKE_DL_LIBS})
    add_test(NAME bureau_vulkan_tests COMMAND bureau_vulkan_tests)
  endif()
  if(TARGET bureau_metal)
    add_executable(bureau_metal_tests tests/backends/metal_test.mm)
    target_compile_options(bureau_metal_tests PRIVATE -fobjc-arc)
    target_link_libraries(bureau_metal_tests PRIVATE bureau_metal)
    add_test(NAME bureau_metal_tests COMMAND bureau_metal_tests)
  endif()
  # A context with no window: CGL on a Mac, EGL where Linux has it.
  find_library(BUREAU_EGL EGL)
  find_library(BUREAU_GL GL)
  find_path(BUREAU_GLEXT GL/glext.h)
  set(bureau_linux_gl FALSE)
  if(CMAKE_SYSTEM_NAME STREQUAL "Linux" AND BUREAU_EGL AND BUREAU_GL AND BUREAU_GLEXT)
    set(bureau_linux_gl TRUE)
  endif()
  if(TARGET bureau_opengl AND (APPLE OR bureau_linux_gl))
    add_executable(bureau_opengl_tests tests/backends/opengl_test.cpp)
    target_link_libraries(bureau_opengl_tests PRIVATE bureau_opengl)
    if(APPLE)
      target_link_libraries(bureau_opengl_tests PRIVATE "-framework OpenGL")
    else()
      target_link_libraries(bureau_opengl_tests PRIVATE ${BUREAU_EGL} ${BUREAU_GL})
    endif()
    add_test(NAME bureau_opengl_tests COMMAND bureau_opengl_tests)
  endif()

  if(TARGET bureau_js)
    add_custom_command(OUTPUT "${CMAKE_CURRENT_BINARY_DIR}/scheduler.hbc"
      COMMAND "${bureau_hermes_compiler}" -O -emit-binary
        -out "${CMAKE_CURRENT_BINARY_DIR}/scheduler.hbc"
        "${CMAKE_CURRENT_SOURCE_DIR}/tests/scheduler.js"
      DEPENDS tests/scheduler.js)
    add_custom_target(bureau_js_fixture
      DEPENDS "${CMAKE_CURRENT_BINARY_DIR}/scheduler.hbc")
    add_executable(bureau_js_tests tests/js_host_test.cpp)
    add_dependencies(bureau_js_tests bureau_js_fixture)
    target_compile_definitions(bureau_js_tests PRIVATE
      BUREAU_ENABLE_DEBUGGER=$<BOOL:${BUREAU_INSPECTOR}>
      BUREAU_LITERAL_BUNDLE="${CMAKE_CURRENT_SOURCE_DIR}/bundles/literal/bundle.hbc"
      BUREAU_CLOSURE_BUNDLE="${CMAKE_CURRENT_SOURCE_DIR}/bundles/closure/bundle.hbc"
      BUREAU_UNICODE_BUNDLE="${CMAKE_CURRENT_SOURCE_DIR}/bundles/unicode/bundle.hbc"
      BUREAU_SCHEDULER_BUNDLE="${CMAKE_CURRENT_BINARY_DIR}/scheduler.hbc")
    target_link_libraries(bureau_js_tests PRIVATE bureau_js)
    set_target_properties(bureau_js_tests PROPERTIES BUILD_RPATH
      "${bureau_hermes_framework_dir}")
    add_test(NAME bureau_js_tests COMMAND bureau_js_tests)

    add_executable(bureau_ui_tests tests/ui_test.cpp)
    add_dependencies(bureau_ui_tests bureau_tokens)
    target_compile_definitions(bureau_ui_tests PRIVATE
      BUREAU_HELLO_BUNDLE="${CMAKE_CURRENT_SOURCE_DIR}/bundles/hello/bundle.hbc"
      BUREAU_TOKENS_JSON="${BUREAU_TOKENS_JSON}"
      BUREAU_ASSETS_DIR="${CMAKE_CURRENT_SOURCE_DIR}/assets")
    target_link_libraries(bureau_ui_tests PRIVATE bureau_js)
    set_target_properties(bureau_ui_tests PROPERTIES BUILD_RPATH
      "${bureau_hermes_framework_dir}")
    add_test(NAME bureau_ui_tests COMMAND bureau_ui_tests)
  endif()
endif()
