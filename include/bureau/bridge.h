// For the functions a game adds to `__native`, the object its TypeScript calls
// C++ through (Ui::Options::install).
#pragma once

#include <jsi/jsi.h>
#include <nlohmann/json.hpp>

#include <cstddef>
#include <map>
#include <optional>
#include <string>
#include <utility>

namespace bureau::bridge {

namespace jsi = facebook::jsi;

/** The argument at `index`, or the otherwise when it is absent or another type:
 * TypeScript's types are the contract, and nothing throws into a game for a
 * call they would have refused. */
std::string stringArg(jsi::Runtime& runtime, const jsi::Value* args,
                      size_t count, size_t index);
double numberArg(const jsi::Value* args, size_t count, size_t index,
                 double otherwise = 0);
bool boolArg(const jsi::Value* args, size_t count, size_t index);

jsi::Value jsString(jsi::Runtime& runtime, const std::string& value);

/** A value from JavaScript as JSON, through its own JSON.stringify. */
nlohmann::json jsonOf(jsi::Runtime& runtime, const jsi::Value& value);

void define(jsi::Runtime& runtime, jsi::Object& object, const char* name,
            jsi::HostFunctionType body);

/**
 * What one runtime keeps of the calls in flight: the callbacks their answers
 * resolve, by number. A reload makes a new runtime and a new state; an answer
 * for the old one finds its state gone and is dropped.
 */
struct Pending {
  std::map<int, jsi::Function> callbacks;
  int next = 1;
  int keep(jsi::Function function) {
    const int id = next++;
    callbacks.emplace(id, std::move(function));
    return id;
  }
  std::optional<jsi::Function> take(int id) {
    const auto found = callbacks.find(id);
    if (found == callbacks.end()) return std::nullopt;
    jsi::Function function = std::move(found->second);
    callbacks.erase(found);
    return function;
  }
};

}  // namespace bureau::bridge
