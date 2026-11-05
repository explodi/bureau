// A figure in a TextFormat (primitives/types.ts), as a Text writes a bound
// or counted value: the game's English figures (formatprice.ts).
#pragma once

#include <string>

#include <nlohmann/json.hpp>

namespace bureau {

/** `value` as `format` (decimals, prefix, suffix, grouped, money, compact)
 * writes it. */
std::string formatFigure(double value, const nlohmann::json& format);

}  // namespace bureau
