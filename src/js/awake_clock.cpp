// LEAN_AND_MEAN and NOMINMAX before any include: <windows.h> pulls in less
// and leaves std::min and std::max alone.
#if defined(_WIN32)
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#endif

#include "awake_clock.h"

#include <chrono>

#if defined(__APPLE__)
#include <time.h>
#endif

namespace bureau::js {

#if defined(__APPLE__)

std::int64_t awakeNanoseconds() {
  return static_cast<std::int64_t>(clock_gettime_nsec_np(CLOCK_UPTIME_RAW));
}

#elif defined(_WIN32)

namespace {

using UnbiasedTime = VOID(WINAPI*)(PULONGLONG);

/** Windows 10's precise unbiased interrupt time, in 100 ns units, leaves out
 * sleep and hibernation; looked up rather than linked, since only mincore.lib
 * names it. */
UnbiasedTime unbiasedTime() {
  const HMODULE kernel = GetModuleHandleW(L"kernelbase.dll");
  if (kernel == nullptr) return nullptr;
  return reinterpret_cast<UnbiasedTime>(
      GetProcAddress(kernel, "QueryUnbiasedInterruptTimePrecise"));
}

}  // namespace

std::int64_t awakeNanoseconds() {
  static const UnbiasedTime read = unbiasedTime();
  if (read == nullptr) {
    return std::chrono::duration_cast<std::chrono::nanoseconds>(
               std::chrono::steady_clock::now().time_since_epoch())
        .count();
  }
  ULONGLONG hundreds = 0;
  read(&hundreds);
  return static_cast<std::int64_t>(hundreds) * 100;
}

#else

// CLOCK_MONOTONIC, which stops while Linux and Android suspend.
std::int64_t awakeNanoseconds() {
  return std::chrono::duration_cast<std::chrono::nanoseconds>(
             std::chrono::steady_clock::now().time_since_epoch())
      .count();
}

#endif

}  // namespace bureau::js
