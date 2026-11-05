# A game whose one Xcode project builds for macOS, iOS and tvOS, each app picking its
# SDK after configuring. It is not part of Bureau's own build:
#
#   cmake -S tests/apple_any_sdk -B build-any-sdk -G Xcode
#   xcodebuild -project build-any-sdk/any_sdk.xcodeproj -target any_sdk_macos CODE_SIGNING_ALLOWED=NO
#   xcodebuild -project build-any-sdk/any_sdk.xcodeproj -target any_sdk_ios -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO
#   xcodebuild -project build-any-sdk/any_sdk.xcodeproj -target any_sdk_tvos -sdk appletvsimulator CODE_SIGNING_ALLOWED=NO
cmake_minimum_required(VERSION 3.24)
project(any_sdk LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(CMAKE_XCODE_ATTRIBUTE_SUPPORTED_PLATFORMS
  "macosx iphoneos iphonesimulator appletvos appletvsimulator")
set(CMAKE_XCODE_ATTRIBUTE_ALLOW_TARGET_PLATFORM_SPECIALIZATION YES)
set(CMAKE_XCODE_ATTRIBUTE_IPHONEOS_DEPLOYMENT_TARGET 17.0)
set(CMAKE_XCODE_ATTRIBUTE_TVOS_DEPLOYMENT_TARGET 17.0)
set(CMAKE_XCODE_ATTRIBUTE_MACOSX_DEPLOYMENT_TARGET 14.0)
set_property(GLOBAL PROPERTY XCODE_EMIT_EFFECTIVE_PLATFORM_NAME ON)

set(BUREAU_APPLE_ANY_SDK ON)
set(BUREAU_BACKENDS OFF)
add_subdirectory(../.. bureau)

function(any_sdk_app target sdk platforms family)
  add_executable(${target} MACOSX_BUNDLE main.cpp)
  target_link_libraries(${target} PRIVATE bureau_js)
  set_target_properties(${target} PROPERTIES
    MACOSX_BUNDLE_GUI_IDENTIFIER "dev.bureau.anysdk.${sdk}"
    XCODE_ATTRIBUTE_SDKROOT ${sdk}
    XCODE_ATTRIBUTE_SUPPORTED_PLATFORMS "${platforms}"
    XCODE_ATTRIBUTE_TARGETED_DEVICE_FAMILY "${family}")
  bureau_hermes_by_sdk(${target})
endfunction()

any_sdk_app(any_sdk_macos macosx macosx "")
any_sdk_app(any_sdk_ios iphoneos "iphoneos iphonesimulator" 1)
any_sdk_app(any_sdk_tvos appletvos "appletvos appletvsimulator" 3)
