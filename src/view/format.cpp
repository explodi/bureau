#include "format.h"

#include <algorithm>
#include <charconv>
#include <cmath>
#include <cstdint>
#include <optional>

namespace bureau {
namespace {

struct Decimal {
  std::string digits;
  int point;
};

Decimal decimalOf(double value) {
  // JSON's shortest-roundtrip conversion also runs on the macOS 12 floor.
  const std::string text = nlohmann::json(std::abs(value)).dump();
  const auto exponentAt = text.find('e');
  const std::string coefficient = text.substr(0, exponentAt);
  int exponent = 0;
  if (exponentAt != std::string::npos) {
    std::string power = text.substr(exponentAt + 1);
    if (power.front() == '+') power.erase(0, 1);
    std::from_chars(power.data(), power.data() + power.size(), exponent);
  }
  const auto pointAt = coefficient.find('.');
  Decimal decimal{coefficient, static_cast<int>(pointAt == std::string::npos
                                                 ? coefficient.size() : pointAt) + exponent};
  std::erase(decimal.digits, '.');
  while (decimal.digits.size() > 1 && decimal.digits.back() == '0') {
    decimal.digits.pop_back();
  }
  return decimal;
}

void increment(std::string& digits) {
  for (size_t at = digits.size(); at > 0; --at) {
    if (digits[at - 1] != '9') {
      ++digits[at - 1];
      return;
    }
    digits[at - 1] = '0';
  }
  digits.insert(0, "1");
}

std::string withPoint(std::string digits, int decimals) {
  if (decimals == 0) return digits;
  const size_t minimum = static_cast<size_t>(decimals) + 1;
  if (digits.size() < minimum) digits.insert(0, minimum - digits.size(), '0');
  digits.insert(digits.size() - decimals, ".");
  return digits;
}

/** The format tables round decimal digits, as format.ts does before grouping. */
std::string roundedDecimal(double value, int decimals) {
  const Decimal decimal = decimalOf(value);
  const int cut = decimal.point + decimals;
  std::string kept = cut > 0 ? decimal.digits.substr(0, cut) : "0";
  if (cut > static_cast<int>(kept.size())) kept.resize(cut, '0');
  if (cut >= 0 && cut < static_cast<int>(decimal.digits.size()) &&
      decimal.digits[cut] >= '5') increment(kept);
  const auto nonzero = kept.find_first_not_of('0');
  kept = nonzero == std::string::npos ? "0" : kept.substr(nonzero);
  return withPoint(kept, decimals);
}

std::string grouped(double value, int decimals) {
  const std::string digits = roundedDecimal(value, decimals);
  const auto point = digits.find('.');
  const size_t whole = point == std::string::npos ? digits.size() : point;
  std::string result;
  for (size_t index = 0; index < digits.size(); ++index) {
    if (index > 0 && index < whole && (whole - index) % 3 == 0) result += ',';
    result += digits[index];
  }
  return result;
}

std::string number(double value) {
  if (std::isnan(value)) return "NaN";
  if (std::isinf(value)) return value < 0 ? "-Infinity" : "Infinity";
  if (value == 0) return "0";
  const Decimal decimal = decimalOf(value);
  std::string digits = decimal.digits;
  const int point = decimal.point;
  const std::string sign = value < 0 ? "-" : "";
  if (point > 0 && point <= 21) {
    if (point >= static_cast<int>(digits.size())) digits.resize(point, '0');
    else digits.insert(point, ".");
    return sign + digits;
  }
  if (point <= 0 && point > -6) return sign + "0." + std::string(-point, '0') + digits;
  if (digits.size() > 1) digits.insert(1, ".");
  const int exponent = point - 1;
  return sign + digits + "e" + (exponent >= 0 ? "+" : "") + std::to_string(exponent);
}

/** toFixed rounds the exact binary value; decimal table formatting does not. */
std::string fixed(double value, int decimals) {
  if (!std::isfinite(value) || std::abs(value) >= 1e21) return number(value);
  int exponent = 0;
  const double fraction = std::frexp(std::abs(value), &exponent);
  std::string digits = std::to_string(static_cast<std::uint64_t>(std::ldexp(fraction, 53)));
  const auto multiply = [&](int factor) {
    int carry = 0;
    for (size_t at = digits.size(); at > 0; --at) {
      const int product = (digits[at - 1] - '0') * factor + carry;
      digits[at - 1] = static_cast<char>('0' + product % 10);
      carry = product / 10;
    }
    if (carry) digits.insert(0, 1, static_cast<char>('0' + carry));
  };
  for (int place = 0; place < decimals; ++place) multiply(5);
  const int binaryShift = exponent - 53 + decimals;
  for (int bit = 0; bit < binaryShift; ++bit) multiply(2);
  int remainder = 0;
  for (int bit = 0; bit < -binaryShift; ++bit) {
    remainder = 0;
    for (char& digit : digits) {
      const int dividend = remainder * 10 + digit - '0';
      digit = static_cast<char>('0' + dividend / 2);
      remainder = dividend % 2;
    }
  }
  const auto first = digits.find_first_not_of('0');
  digits = first == std::string::npos ? "0" : digits.substr(first);
  if (remainder != 0) increment(digits);
  return std::string(value < 0 ? "-" : "") + withPoint(digits, decimals);
}

std::string money(double value, int decimals) {
  const bool negative = value < 0 && roundedDecimal(value, decimals) != roundedDecimal(0, decimals);
  return std::string(negative ? "-" : "") + "$" + grouped(value, decimals);
}

}  // namespace

std::string formatFigure(double value, const nlohmann::json& format) {
  const auto option = [&](const char* key) -> const nlohmann::json* {
    if (!format.is_object()) return nullptr;
    const auto found = format.find(key);
    return found == format.end() || found->is_null() ? nullptr : &*found;
  };
  const auto truthy = [&](const char* key) {
    const auto* found = option(key);
    return found != nullptr && found->is_boolean() && found->get<bool>();
  };
  std::optional<int> decimals;
  if (const auto* found = option("decimals"); found && found->is_number()) {
    decimals = std::clamp(found->get<int>(), 0, 100);
  }
  std::string body;
  if (!std::isfinite(value)) {
    body = number(value);
  } else if (truthy("money") && truthy("compact")) {
    const double magnitude = std::abs(value);
    const std::string sign = value < 0 ? "-" : "";
    if (magnitude >= 1e9) body = sign + "$" + grouped(magnitude / 1e9, 2) + "b";
    else if (magnitude >= 1e6) body = sign + "$" + grouped(magnitude / 1e6, 2) + "m";
    else body = money(value, magnitude < 1 ? 2 : 0);
  } else if (truthy("money")) {
    body = money(value, decimals.value_or(std::abs(value) < 1 ? 2 : 0));
  } else if (truthy("grouped")) {
    const int places = decimals.value_or(0);
    const std::string digits = grouped(value, places);
    const bool negative = value < 0 && digits != grouped(0, places);
    body = (negative ? "-" : "") + digits;
  } else {
    body = decimals ? fixed(value, *decimals) : number(value);
  }
  const auto* prefix = option("prefix");
  const auto* suffix = option("suffix");
  return (prefix && prefix->is_string() ? prefix->get<std::string>() : "") + body +
         (suffix && suffix->is_string() ? suffix->get<std::string>() : "");
}

}  // namespace bureau
