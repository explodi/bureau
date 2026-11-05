// The native goldens in tests/fixtures: what Bureau measured
// when they were blessed. With BUREAU_RECORD_GOLDENS set to a directory, a
// golden test also writes what it measures there, in the fixture's own
// shape, ready to replace the fixture after a deliberate change.
#ifndef BUREAU_TESTS_GOLDENS_H
#define BUREAU_TESTS_GOLDENS_H

#include <cstdlib>
#include <fstream>
#include <functional>
#include <optional>
#include <string>

#include <nlohmann/json.hpp>

namespace goldens {

inline std::string committedPath(const std::string& name) {
  return std::string(BUREAU_FIXTURES_DIR) + "/" + name;
}

inline nlohmann::json read(const std::string& name) {
  std::ifstream file(committedPath(name));
  return nlohmann::json::parse(file);
}

/** The directory a recording run writes to; none in an ordinary run. */
inline std::optional<std::string> recordingDirectory() {
  const char* directory = std::getenv("BUREAU_RECORD_GOLDENS");
  if (directory == nullptr || *directory == '\0') return std::nullopt;
  return std::string(directory);
}

/** Writes a fixture with this test's measurements in it. Two tests may each
 * record their own fields of one fixture, so a recording already written
 * this run is the starting point. */
inline void record(const std::string& name,
                   const std::function<void(nlohmann::json&)>& measure) {
  const auto directory = recordingDirectory();
  if (!directory) return;
  const std::string path = *directory + "/" + name;
  std::ifstream earlier(path);
  nlohmann::json golden =
      earlier.good() ? nlohmann::json::parse(earlier) : read(name);
  earlier.close();
  measure(golden);
  std::ofstream(path) << golden.dump(2) << "\n";
}

}  // namespace goldens

#endif
