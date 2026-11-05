// What Hermes's API asks of fbjni on any __ANDROID__ build (hermes.cpp): a
// ThreadScope that attaches its finalizer thread to Java, so that finalizers
// may release JNI references. Bureau's runtime holds none and links no fbjni
// (build_hermes.ts), so the thread needs no attaching.
#pragma once

namespace facebook::jni {

struct ThreadScope {};

}  // namespace facebook::jni
