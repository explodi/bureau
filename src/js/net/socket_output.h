#pragma once

#include <cstddef>
#include <cstdint>
#include <deque>
#include <string>
#include <string_view>

namespace bureau::net {

/** Ordered output shared by both socket implementations. A slow reader must
 * neither hold the thread writing to it nor accumulate unlimited output. */
class SocketOutput {
 public:
  enum class Flush { Pending, Drained, Failed };

  static constexpr std::size_t kMaxQueuedBytes = 64 * 1024 * 1024;
  static constexpr std::size_t kBytesPerFlush = 1024 * 1024;
  /** How long a reader may take nothing before it counts as gone. The queue
   * cap bounds the memory a reader that never comes back can hold until then. */
  static constexpr std::int64_t kStalledMs = 300'000;

  bool append(std::string_view bytes, std::int64_t nowMs) {
    if (bytes.size() > kMaxQueuedBytes - queuedBytes_) return false;
    if (bytes.empty()) return true;
    if (chunks_.empty()) lastProgressMs_ = nowMs;
    chunks_.emplace_back(bytes);
    queuedBytes_ += bytes.size();
    return true;
  }

  /** `send` returns bytes written, zero to retry on a later poll, or -1 on
   * failure. Both byte and syscall budgets keep a ready socket's turn short. */
  template <typename Send>
  Flush flush(Send send, std::int64_t nowMs) {
    std::size_t budget = kBytesPerFlush;
    for (int calls = 0; calls < 16 && budget > 0; ++calls) {
      if (chunks_.empty()) return Flush::Drained;
      const auto bytes = std::string_view(chunks_.front()).substr(offset_);
      const auto wrote = send(bytes.substr(0, budget));
      if (wrote < 0) return Flush::Failed;
      if (wrote == 0) {
        const bool stalled = nowMs - lastProgressMs_ >= kStalledMs;
        return stalled ? Flush::Failed : Flush::Pending;
      }
      const auto count = static_cast<std::size_t>(wrote);
      lastProgressMs_ = nowMs;
      offset_ += count;
      queuedBytes_ -= count;
      budget -= count;
      if (offset_ == chunks_.front().size()) {
        chunks_.pop_front();
        offset_ = 0;
      }
    }
    return chunks_.empty() ? Flush::Drained : Flush::Pending;
  }

 private:
  std::deque<std::string> chunks_;
  std::size_t offset_ = 0;
  std::size_t queuedBytes_ = 0;
  std::int64_t lastProgressMs_ = 0;
};

}  // namespace bureau::net
