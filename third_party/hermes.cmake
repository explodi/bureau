file(READ ${CMAKE_CURRENT_LIST_DIR}/hermes.pin.json bureau_hermes_pin)
string(JSON bureau_hermes_version GET "${bureau_hermes_pin}" version)
string(JSON bureau_hermes_commit GET "${bureau_hermes_pin}" commit)
set(bureau_hermes_artifact release)
if(BUREAU_INSPECTOR)
  set(bureau_hermes_artifact debug)
endif()
# A player's VM is lean: bytecode only. The full one also compiles source,
# which the control channel's `eval` needs: the debugger's, and the release
# one a benchmark drives the game with.
option(BUREAU_HERMES_COMPILER "Link the release VM that compiles source" OFF)
set(bureau_hermes_full_vm OFF)
if(BUREAU_INSPECTOR OR BUREAU_HERMES_COMPILER)
  set(bureau_hermes_full_vm ON)
endif()
set(bureau_hermes_base
  "${CMAKE_CURRENT_LIST_DIR}/hermes/${bureau_hermes_version}")

if(APPLE)
  set(bureau_hermes_root "${bureau_hermes_base}/${bureau_hermes_artifact}/destroot")
  set(bureau_hermes_compiler "${bureau_hermes_root}/bin/hermesc")
  set(bureau_hermes_framework_dir "${bureau_hermes_root}/Library/Frameworks/macosx")
  if(IOS)
    if(TVOS AND CMAKE_OSX_SYSROOT MATCHES "[Ss]imulator")
      set(bureau_hermes_slice tvos-arm64_x86_64-simulator)
    elseif(TVOS)
      set(bureau_hermes_slice tvos-arm64)
    elseif(CMAKE_OSX_SYSROOT MATCHES "[Ss]imulator")
      set(bureau_hermes_slice ios-arm64_x86_64-simulator)
    else()
      set(bureau_hermes_slice ios-arm64)
    endif()
    set(bureau_hermes_framework_dir
      "${bureau_hermes_root}/Library/Frameworks/universal/hermesvm.xcframework/${bureau_hermes_slice}")
  endif()
  if(EXISTS "${bureau_hermes_compiler}")
    add_library(bureau_hermes INTERFACE)
    target_include_directories(bureau_hermes SYSTEM INTERFACE "${bureau_hermes_root}/include")
    target_link_libraries(bureau_hermes INTERFACE
      "-F${bureau_hermes_framework_dir}" "-framework hermesvm")
  endif()
elseif((CMAKE_SYSTEM_NAME STREQUAL "Linux" AND CMAKE_SYSTEM_PROCESSOR MATCHES "^(x86_64|amd64|AMD64)$")
    OR (ANDROID AND ANDROID_ABI STREQUAL "arm64-v8a"))
  # Linux's VM and Android's are built from the pinned source over a static
  # ICU of their own (build_hermes.ts); Android's, on a Mac or Linux, by the
  # host's compiler.
  set(bureau_hermes_target linux-x86_64)
  if(ANDROID)
    set(bureau_hermes_target android-arm64)
  endif()
  set(bureau_hermes_compiler_host linux64-bin)
  if(CMAKE_HOST_APPLE)
    set(bureau_hermes_compiler_host osx-bin)
  endif()
  set(bureau_hermes_source "${bureau_hermes_base}/source/hermes-${bureau_hermes_commit}")
  set(bureau_hermes_root "${bureau_hermes_base}/${bureau_hermes_target}/${bureau_hermes_artifact}")
  set(bureau_hermes_compiler "${bureau_hermes_base}/compiler/package/hermesc/${bureau_hermes_compiler_host}/hermesc")
  set(bureau_hermes_vm hermesvmlean_a)
  if(bureau_hermes_full_vm)
    set(bureau_hermes_vm hermesvm_a)
  endif()
  if(EXISTS "${bureau_hermes_root}/lib/lib${bureau_hermes_vm}.a")
    set(bureau_icu_root "${bureau_hermes_base}/${bureau_hermes_target}/icu")
    set(BUREAU_ICU_DATA_LIBRARY "${bureau_icu_root}/lib/libicudata.a" CACHE FILEPATH
      "Static PIC ICU data archive (full data by default)")
    foreach(bureau_icu_archive "${bureau_icu_root}/lib/libicuuc.a"
        "${bureau_icu_root}/lib/libicui18n.a" "${BUREAU_ICU_DATA_LIBRARY}")
      if(NOT EXISTS "${bureau_icu_archive}")
        message(FATAL_ERROR "Static PIC ICU is missing: deno task bureau:hermes (${bureau_icu_archive})")
      endif()
    endforeach()
    find_package(Threads REQUIRED)
    add_library(bureau_hermes INTERFACE)
    target_include_directories(bureau_hermes SYSTEM INTERFACE
      "${bureau_hermes_source}/API" "${bureau_hermes_source}/API/jsi"
      "${bureau_hermes_source}/public" "${bureau_hermes_source}/include"
      "${bureau_hermes_root}/include" "${bureau_icu_root}/include")
    target_link_libraries(bureau_hermes INTERFACE
      "$<LINK_GROUP:RESCAN,${bureau_hermes_root}/lib/lib${bureau_hermes_vm}.a,${bureau_hermes_root}/jsi/libjsi.a,${bureau_hermes_root}/external/boost/boost_1_86_0/libs/context/libboost_context.a,${bureau_icu_root}/lib/libicuuc.a,${bureau_icu_root}/lib/libicui18n.a,${BUREAU_ICU_DATA_LIBRARY}>"
      Threads::Threads ${CMAKE_DL_LIBS} m)
    if(NOT ANDROID)
      target_link_options(bureau_hermes INTERFACE -static-libstdc++ -static-libgcc)
    endif()
  endif()
elseif(WIN32 AND CMAKE_SYSTEM_PROCESSOR MATCHES "^(AMD64|x86_64)$")
  # The pin's commit built with MSVC on the dynamic runtime, over Windows's
  # own ICU, which no folder carries: icuuc and icuin,
  # in every Windows 10 since version 1703. Proton's Wine has only 1903's
  # icu.dll, so Proton cannot load the library; Linux has its own build.
  set(bureau_hermes_source "${bureau_hermes_base}/source/hermes-${bureau_hermes_commit}")
  set(bureau_hermes_root "${bureau_hermes_base}/windows-x86_64/${bureau_hermes_artifact}")
  set(bureau_hermes_compiler "${bureau_hermes_base}/compiler/package/hermesc/win64-bin/hermesc.exe")
  set(bureau_hermes_vm hermesvmlean_a)
  if(bureau_hermes_full_vm)
    set(bureau_hermes_vm hermesvm_a)
  endif()
  if(EXISTS "${bureau_hermes_root}/lib/${bureau_hermes_vm}.lib")
    add_library(bureau_hermes INTERFACE)
    target_include_directories(bureau_hermes SYSTEM INTERFACE
      "${bureau_hermes_source}/API" "${bureau_hermes_source}/API/jsi"
      "${bureau_hermes_source}/public" "${bureau_hermes_source}/include"
      "${bureau_hermes_root}/include")
    target_link_libraries(bureau_hermes INTERFACE
      "${bureau_hermes_root}/lib/${bureau_hermes_vm}.lib"
      "${bureau_hermes_root}/jsi/jsi.lib"
      "${bureau_hermes_root}/external/boost/boost_1_86_0/libs/context/boost_context.lib"
      icuuc icuin)
    # As the VM was built (build_hermes.ts): a dllexport class in a header
    # would export its inline members from every library including it.
    target_compile_definitions(bureau_hermes INTERFACE HERMES_EXPORT= SHERMES_EXPORT=)
  endif()
endif()
