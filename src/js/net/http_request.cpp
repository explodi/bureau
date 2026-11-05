#include "http_request.h"

#include <algorithm>
#include <cctype>

namespace bureau::net {

namespace {

constexpr std::string_view kHeaderEnd = "\r\n\r\n";

char lowered(char character) {
  return static_cast<char>(std::tolower(static_cast<unsigned char>(character)));
}

bool equalIgnoringCase(std::string_view left, std::string_view right) {
  return left.size() == right.size() &&
         std::equal(left.begin(), left.end(), right.begin(),
                    [](char a, char b) { return lowered(a) == lowered(b); });
}

std::string_view trimmed(std::string_view text) {
  const auto notSpace = [](char character) {
    return std::isspace(static_cast<unsigned char>(character)) == 0;
  };
  const auto begin = std::find_if(text.begin(), text.end(), notSpace);
  const auto end = std::find_if(text.rbegin(), text.rend(), notSpace).base();
  return begin < end
             ? text.substr(static_cast<std::size_t>(begin - text.begin()),
                           static_cast<std::size_t>(end - begin))
             : std::string_view();
}

}  // namespace

std::optional<std::string> HttpRequest::header(std::string_view name) const {
  for (const auto& [key, value] : headers) {
    if (equalIgnoringCase(key, name)) return value;
  }
  return std::nullopt;
}

bool HttpRequest::headerIs(std::string_view name,
                           std::string_view value) const {
  const auto found = header(name);
  return found && equalIgnoringCase(*found, value);
}

/** The `Content-Length` a head declares, or zero when it declares none or
 * something that is not a length. */
std::size_t declaredBodyLength(std::string_view head) {
  std::string_view rest = head;
  while (!rest.empty()) {
    const auto next = rest.find("\r\n");
    const std::string_view line =
        next == std::string_view::npos ? rest : rest.substr(0, next);
    rest = next == std::string_view::npos ? std::string_view()
                                          : rest.substr(next + 2);
    const auto colon = line.find(':');
    if (colon == std::string_view::npos) continue;
    if (!equalIgnoringCase(trimmed(line.substr(0, colon)), "content-length")) {
      continue;
    }
    const auto value = trimmed(line.substr(colon + 1));
    std::size_t length = 0;
    for (const char digit : value) {
      if (digit < '0' || digit > '9') return 0;
      length = length * 10 + static_cast<std::size_t>(digit - '0');
    }
    return length;
  }
  return 0;
}

std::optional<std::size_t> requestLength(std::string_view bytes) {
  const auto end = bytes.find(kHeaderEnd);
  if (end == std::string_view::npos) return std::nullopt;
  const auto headersEnd = end + kHeaderEnd.size();
  const auto bodyLength = declaredBodyLength(bytes.substr(0, end));
  if (bytes.size() < headersEnd + bodyLength) return std::nullopt;
  return headersEnd + bodyLength;
}

std::optional<HttpRequest> parseRequest(std::string_view bytes) {
  const auto length = requestLength(bytes);
  if (!length) return std::nullopt;

  const auto headersEnd = bytes.find(kHeaderEnd) + kHeaderEnd.size();
  std::string_view head = bytes.substr(0, headersEnd - kHeaderEnd.size());

  const auto lineEnd = head.find("\r\n");
  const std::string_view requestLine =
      lineEnd == std::string_view::npos ? head : head.substr(0, lineEnd);

  // `METHOD target VERSION`, and anything else is not a request line.
  const auto firstSpace = requestLine.find(' ');
  if (firstSpace == std::string_view::npos) return std::nullopt;
  const auto secondSpace = requestLine.find(' ', firstSpace + 1);
  if (secondSpace == std::string_view::npos) return std::nullopt;

  HttpRequest request;
  request.method = std::string(requestLine.substr(0, firstSpace));
  request.target = std::string(
      requestLine.substr(firstSpace + 1, secondSpace - firstSpace - 1));
  if (request.method.empty() || request.target.empty()) return std::nullopt;

  std::string_view rest = lineEnd == std::string_view::npos
                              ? std::string_view()
                              : head.substr(lineEnd + 2);
  while (!rest.empty()) {
    const auto next = rest.find("\r\n");
    const std::string_view line =
        next == std::string_view::npos ? rest : rest.substr(0, next);
    rest = next == std::string_view::npos ? std::string_view()
                                          : rest.substr(next + 2);

    const auto colon = line.find(':');
    // A header line with no colon is not a header; skipping it is friendlier
    // than refusing the whole request over a stray line.
    if (colon == std::string_view::npos) continue;
    request.headers.emplace_back(std::string(trimmed(line.substr(0, colon))),
                                 std::string(trimmed(line.substr(colon + 1))));
  }
  request.body = std::string(bytes.substr(headersEnd, *length - headersEnd));

  return request;
}

}  // namespace bureau::net
