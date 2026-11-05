#pragma once

#include <memory>
#include <string>

namespace bureau::js {
class Host;

/** Loopback CDP and the bundle's source map. Its transport keeps running
 * while a breakpoint has stopped the JavaScript thread. */
class Inspector {
 public:
  static std::unique_ptr<Inspector> fromEnvironment(const std::string& bundle);
  ~Inspector();
  std::string sourceUrl() const;
  void start(Host& host);

 private:
  struct Impl;
  explicit Inspector(std::unique_ptr<Impl> impl);
  std::unique_ptr<Impl> impl_;
};
}  // namespace bureau::js
