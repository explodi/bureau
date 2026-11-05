# Commits are fixed so a clean checkout builds the same native libraries.
include(FetchContent)
find_package(Git REQUIRED)

FetchContent_Declare(bureau_yoga
  GIT_REPOSITORY https://github.com/facebook/yoga.git
  GIT_TAG 042f5013152eb81c1552dec945b88f7b95ca350f
  PATCH_COMMAND ${CMAKE_COMMAND}
    "-DGIT_EXECUTABLE=${GIT_EXECUTABLE}"
    "-DSOURCE_DIR=<SOURCE_DIR>"
    "-DPATCH_DIR=${CMAKE_CURRENT_LIST_DIR}"
    -P "${CMAKE_CURRENT_LIST_DIR}/patch_yoga.cmake"
  SOURCE_SUBDIR yoga)
FetchContent_Declare(bureau_freetype
  GIT_REPOSITORY https://github.com/freetype/freetype.git
  GIT_TAG 42608f77f20749dd6ddc9e0536788eaad70ea4b5)
FetchContent_Declare(bureau_harfbuzz
  GIT_REPOSITORY https://github.com/harfbuzz/harfbuzz.git
  GIT_TAG 7497c4147469fd4102a7229222586ad5c743c5a1)
FetchContent_Declare(bureau_unibreak
  GIT_REPOSITORY https://github.com/adah1972/libunibreak.git
  GIT_TAG 304585d8e2d63187507368d612c3d5fff1486368)
FetchContent_Declare(bureau_stb
  GIT_REPOSITORY https://github.com/nothings/stb.git
  GIT_TAG 2c980bb59875b0d32144a71867fbdebb2f77cd20)
# The SVG parser alone: Bureau fills the shapes itself (src/view/vector.cpp).
# Its src/ holds no CMakeLists, so it is fetched, never built.
FetchContent_Declare(bureau_nanosvg
  GIT_REPOSITORY https://github.com/memononen/nanosvg.git
  GIT_TAG 239e102ec2c691f2902e20ace2ed36ee4a35cfe6
  SOURCE_SUBDIR src)

set(FT_DISABLE_ZLIB ON CACHE BOOL "" FORCE)
set(FT_DISABLE_BZIP2 ON CACHE BOOL "" FORCE)
set(FT_DISABLE_PNG ON CACHE BOOL "" FORCE)
set(FT_DISABLE_HARFBUZZ ON CACHE BOOL "" FORCE)
set(FT_DISABLE_BROTLI ON CACHE BOOL "" FORCE)
set(HB_HAVE_FREETYPE ON CACHE BOOL "" FORCE)
# HarfBuzz's CMake port uses its own iOS switch to link CoreText frameworks.
set(HB_IOS ${IOS})
# And it finds them for the one SDK a project configures with. Bureau shapes with
# HarfBuzz's own OpenType shaper, so a project of several SDKs goes without.
if(BUREAU_APPLE_ANY_SDK)
  set(HB_HAVE_CORETEXT OFF CACHE BOOL "" FORCE)
endif()
set(HB_BUILD_SUBSET OFF CACHE BOOL "" FORCE)
set(HB_BUILD_UTILS OFF CACHE BOOL "" FORCE)

FetchContent_MakeAvailable(bureau_yoga bureau_freetype bureau_harfbuzz)
FetchContent_MakeAvailable(bureau_unibreak bureau_stb bureau_nanosvg)

add_library(bureau_unibreak_lib STATIC
  ${bureau_unibreak_SOURCE_DIR}/src/eastasianwidthdata.c
  ${bureau_unibreak_SOURCE_DIR}/src/eastasianwidthdef.c
  ${bureau_unibreak_SOURCE_DIR}/src/emojidata.c
  ${bureau_unibreak_SOURCE_DIR}/src/emojidef.c
  ${bureau_unibreak_SOURCE_DIR}/src/graphemebreak.c
  ${bureau_unibreak_SOURCE_DIR}/src/graphemebreakdata.c
  ${bureau_unibreak_SOURCE_DIR}/src/indicconjunctbreakdata.c
  ${bureau_unibreak_SOURCE_DIR}/src/linebreak.c
  ${bureau_unibreak_SOURCE_DIR}/src/linebreakdata.c
  ${bureau_unibreak_SOURCE_DIR}/src/linebreakdef.c
  ${bureau_unibreak_SOURCE_DIR}/src/unibreakbase.c
  ${bureau_unibreak_SOURCE_DIR}/src/unibreakdef.c
  ${bureau_unibreak_SOURCE_DIR}/src/wordbreak.c
  ${bureau_unibreak_SOURCE_DIR}/src/wordbreakdata.c)
target_include_directories(bureau_unibreak_lib PUBLIC
  ${bureau_unibreak_SOURCE_DIR}/src)

add_library(bureau_stb_headers INTERFACE)
target_include_directories(bureau_stb_headers INTERFACE
  ${bureau_stb_SOURCE_DIR})

add_library(bureau_nanosvg_headers INTERFACE)
target_include_directories(bureau_nanosvg_headers INTERFACE
  ${bureau_nanosvg_SOURCE_DIR}/src)

