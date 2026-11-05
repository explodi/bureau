#include "inspect.h"

#include "host.h"
#include "net/base64.h"
#include "net/handshake.h"
#include "net/http_request.h"
#include "net/websocket_frame.h"
#include "net/socket.h"

#include <nlohmann/json.hpp>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <map>
#include <optional>
#include <thread>
#include <vector>

namespace bureau::js {
namespace {
using Json = nlohmann::json;
using net::Opcode;

std::string response(std::string_view body, std::string_view type,
                     std::string_view status = "200 OK") {
  return "HTTP/1.1 " + std::string(status) + "\r\nContent-Type: " +
         std::string(type) + "\r\nContent-Length: " +
         std::to_string(body.size()) + "\r\nConnection: close\r\n\r\n" +
         std::string(body);
}
}  // namespace

struct Inspector::Impl {
  std::unique_ptr<net::Listener> listener;
  std::string directory;
  std::string bundleSource;
  std::string bundleScriptId;
  Host* host = nullptr;
  std::atomic<bool> stopped{false};
  std::thread worker;

  struct Client {
    struct Resource {
      std::string bytes;
      size_t position = 0;
    };
    std::unique_ptr<net::Connection> socket;
    std::string input;
    std::string fragments;
    bool websocket = false;
    bool finished = false;
    bool contextAnnounced = false;
    std::map<std::string, Resource> resources;
    unsigned nextResource = 1;
    std::optional<int64_t> debuggerEnableRequest;
  };

  std::string origin() const {
    return "http://127.0.0.1:" + std::to_string(listener->port());
  }

  /** The embedder supplies context discovery and source streams; Hermes
   * handles the runtime and debugger requests. */
  bool inspectorCommand(Client& client, const std::string& text) {
    const Json command = Json::parse(text, nullptr, false);
    if (!command.is_object() || !command.contains("id")) return false;
    const auto method = command.find("method");
    if (method == command.end() || !method->is_string()) return false;
    if (*method == "Debugger.enable" && command["id"].is_number_integer()) {
      client.debuggerEnableRequest = command["id"].get<int64_t>();
    }
    if (*method == "Runtime.enable" && !client.contextAnnounced) {
      client.contextAnnounced = true;
      client.socket->write(net::encodeText(
          Json{{"method", "Runtime.executionContextCreated"},
               {"params", {{"context", {{"id", Host::executionContextId},
                                        {"origin", origin()}, {"name", "Bureau"},
                                        {"auxData", {{"isDefault", true}}}}}}}}.dump()));
    }
    if (*method == "Runtime.disable") client.contextAnnounced = false;
    const bool load = *method == "Network.loadNetworkResource";
    const bool read = *method == "IO.read";
    const bool close = *method == "IO.close";
    const bool getSource = *method == "Debugger.getScriptSource";
    if (!load && !read && !close && !getSource) return false;
    const auto reply = [&](Json result) {
      client.socket->write(net::encodeText(
          Json{{"id", command["id"]}, {"result", std::move(result)}}.dump()));
    };
    const auto invalid = [&] {
      client.socket->write(net::encodeText(
          Json{{"id", command["id"]},
               {"error", {{"code", -32602},
                          {"message", "Invalid resource parameters"}}}}
              .dump()));
      return true;
    };
    const Json params = command.value("params", Json::object());
    if (!params.is_object()) return invalid();
    if (getSource) {
      if (!params.contains("scriptId") || !params["scriptId"].is_string())
        return invalid();
      if (params["scriptId"] != bundleScriptId) return false;
      reply({{"scriptSource", bundleSource}});
      return true;
    }
    if (load) {
      if (!params.contains("url") || !params["url"].is_string()) return invalid();
      const std::string url = params["url"];
      // Only the two published debugging artifacts are resources, never a
      // proxy for arbitrary URLs or files on the developer's machine.
      const bool source = url == origin() + "/bundle.lowered.js";
      const bool map = url == origin() + "/bundle.lowered.js.map";
      if (!source && !map) {
        reply({{"resource", {{"success", false}, {"httpStatusCode", 404}}}});
        return true;
      }
      const std::string path = map ? "/bundle.lowered.js.map" : "/bundle.lowered.js";
      std::ifstream file(directory + path, std::ios::binary);
      if (!file.good()) {
        reply({{"resource", {{"success", false}, {"httpStatusCode", 404}}}});
        return true;
      }
      const std::string handle =
          "bureau-source-" + std::to_string(client.nextResource++);
      client.resources.emplace(handle, Client::Resource{
          std::string{std::istreambuf_iterator<char>{file}, {}}, 0});
      reply({{"resource", {{"success", true}, {"httpStatusCode", 200},
                           {"headers", {{"Content-Type", map ? "application/json"
                                                              : "text/javascript"}}},
                           {"stream", handle}}}});
      return true;
    }
    if (!params.contains("handle") || !params["handle"].is_string())
      return invalid();
    const auto found = client.resources.find(params["handle"].get<std::string>());
    if (found == client.resources.end()) return invalid();
    if (close) {
      client.resources.erase(found);
      reply(Json::object());
      return true;
    }
    auto& resource = found->second;
    for (const char* key : {"offset", "size"}) {
      if (params.contains(key) &&
          (!params[key].is_number_integer() || params[key].get<int64_t>() < 0))
        return invalid();
    }
    if (params.contains("offset")) {
      resource.position =
          std::min(resource.bytes.size(), params["offset"].get<size_t>());
    }
    const size_t requested = params.value("size", size_t{65536});
    const size_t length = std::min(
        {requested, size_t{65536}, resource.bytes.size() - resource.position});
    const auto* bytes = reinterpret_cast<const std::uint8_t*>(
        resource.bytes.data() + resource.position);
    resource.position += length;
    // Base64 keeps chunks valid even when a byte boundary splits UTF-8.
    // DevTools consumes the final bytes before a separate empty EOF reply.
    reply({{"base64Encoded", true}, {"data", net::base64(bytes, length)},
           {"eof", length == 0 && resource.position == resource.bytes.size()}});
    return true;
  }

  void http(Client& client, const net::HttpRequest& request) {
    const auto requestOrigin = request.header("Origin");
    const bool allowedOrigin = !requestOrigin ||
        requestOrigin->starts_with("devtools://") || *requestOrigin == origin();
    if (!allowedOrigin || request.method != "GET") {
      client.socket->write(response("", "text/plain", "403 Forbidden"));
    } else if (request.target == "/devtools/page/bureau") {
      const auto upgrade = net::upgradeResponse(request);
      if (upgrade) {
        client.socket->write(*upgrade);
        client.websocket = true;
        return;
      }
      client.socket->write(response("", "text/plain", "400 Bad Request"));
    } else if (request.target == "/json" || request.target == "/json/list") {
      const std::string endpoint = "127.0.0.1:" +
          std::to_string(listener->port()) + "/devtools/page/bureau";
      const Json targets = Json::array({{
          {"id", "bureau"}, {"type", "node"}, {"title", "Bureau · Hermes"},
          {"url", origin() + "/bundle.lowered.js"},
          {"webSocketDebuggerUrl", "ws://" + endpoint},
          {"devtoolsFrontendUrl", "devtools://devtools/bundled/js_app.html?ws=" + endpoint}}});
      client.socket->write(response(targets.dump(), "application/json"));
    } else if (request.target == "/json/version") {
      client.socket->write(response(
          R"({"Browser":"Bureau Hermes","Protocol-Version":"1.3"})",
          "application/json"));
    } else if (request.target == "/bundle.lowered.js" ||
               request.target == "/bundle.lowered.js.map") {
      std::ifstream file(directory + request.target, std::ios::binary);
      if (file.good()) {
        const std::string body{std::istreambuf_iterator<char>{file}, {}};
        client.socket->write(response(body, request.target.ends_with(".map")
            ? "application/json" : "text/javascript"));
      } else {
        client.socket->write(response("", "text/plain", "404 Not Found"));
      }
    } else {
      client.socket->write(response("", "text/plain", "404 Not Found"));
    }
    client.finished = true;
  }

  void receive(Client& client) {
    const auto bytes = client.socket->read();
    if (!bytes) {
      client.finished = true;
      return;
    }
    client.input += *bytes;
    if (client.input.size() > 16 * 1024 * 1024) {
      client.socket->close();
      client.finished = true;
      return;
    }
    if (!client.websocket) {
      const auto request = net::parseRequest(client.input);
      if (!request) return;
      client.input.erase(0, *net::requestLength(client.input));
      http(client, *request);
    }
    if (!client.websocket) return;
    while (const auto decoded = net::decodeFrame(client.input)) {
      client.input.erase(0, decoded->bytesConsumed);
      const auto& frame = decoded->frame;
      if (frame.opcode == Opcode::Close) {
        client.finished = true;
        return;
      }
      if (frame.opcode == Opcode::Ping) {
        client.socket->write(net::encodeFrame(Opcode::Pong, frame.payload));
        continue;
      }
      if (frame.opcode != Opcode::Text && frame.opcode != Opcode::Continuation) continue;
      client.fragments += frame.payload;
      if (client.fragments.size() > 16 * 1024 * 1024) {
        client.finished = true;
        return;
      }
      if (!frame.fin) continue;
      if (!inspectorCommand(client, client.fragments)) {
        host->debuggerCommand(std::move(client.fragments));
      }
      client.fragments.clear();
    }
  }

  void run() {
    std::vector<Client> clients;
    while (!stopped.load()) {
      while (auto socket = listener->accept()) {
        clients.push_back({std::move(socket), {}, {}, false, false, false, {}, 1, {}});
      }
      for (auto& client : clients) {
        if (!client.finished) receive(client);
        client.socket->flush();
      }
      for (auto message : host->takeDebuggerMessages()) {
        Json event = Json::parse(message, nullptr, false);
        if (event.is_object() && event.value("method", "") == "Debugger.scriptParsed") {
          auto& params = event["params"];
          const std::string url = params.value("url", "");
          if (url.ends_with("/bundle.lowered.js") || url == "bundle.lowered.js") {
            bundleScriptId = params.value("scriptId", std::string());
            params["url"] = origin() + "/bundle.lowered.js";
            params["sourceMapURL"] = origin() + "/bundle.lowered.js.map";
            params["endLine"] =
                std::count(bundleSource.begin(), bundleSource.end(), '\n');
            const size_t lastLine = bundleSource.rfind('\n');
            params["endColumn"] = lastLine == std::string::npos
                ? bundleSource.size() : bundleSource.size() - lastLine - 1;
            message = event.dump();
          }
        }
        const std::string frame = net::encodeText(message);
        for (auto& client : clients) {
          if (!client.websocket || client.finished) continue;
          const bool enabling = client.debuggerEnableRequest &&
              event.is_object() && event.contains("id") &&
              event["id"] == *client.debuggerEnableRequest;
          if (!enabling) {
            client.socket->write(frame);
            continue;
          }
          client.debuggerEnableRequest.reset();
          Json reply = event;
          if (reply.contains("result") && reply["result"].is_object()) {
            // Chrome waits for this identity before installing UI breakpoints.
            reply["result"]["debuggerId"] =
                "bureau:" + std::to_string(listener->port());
          }
          client.socket->write(net::encodeText(reply.dump()));
        }
      }
      std::erase_if(clients, [this](Client& client) {
        if (!client.finished || !client.socket->flush()) return false;
        if (client.websocket) {
          host->debuggerCommand(R"({"id":0,"method":"Debugger.resume"})");
          host->debuggerCommand(R"({"id":0,"method":"Debugger.disable"})");
        }
        return true;
      });
      std::this_thread::sleep_for(std::chrono::milliseconds(8));
    }
    host->debuggerCommand(R"({"id":0,"method":"Debugger.resume"})");
  }
};

std::unique_ptr<Inspector> Inspector::fromEnvironment(const std::string& bundle) {
#if BUREAU_ENABLE_DEBUGGER
  const char* requested = std::getenv("BUREAU_INSPECT_PORT");
  if (!requested) return nullptr;
  char* end = nullptr;
  const long port = std::strtol(requested, &end, 10);
  if (*requested == '\0' || *end != '\0' || port < 0 || port > 65535) {
    std::fprintf(stderr, "BUREAU_INSPECT_PORT must be 0 or a TCP port\n");
    return nullptr;
  }
  auto impl = std::make_unique<Impl>();
  impl->listener = net::listenLoopback(static_cast<uint16_t>(port));
  if (!impl->listener) {
    std::fprintf(stderr, "Cannot listen for Hermes DevTools on port %ld\n", port);
    return nullptr;
  }
  impl->directory = std::filesystem::path(bundle).parent_path().string();
  std::ifstream source(impl->directory + "/bundle.lowered.js", std::ios::binary);
  impl->bundleSource.assign(std::istreambuf_iterator<char>{source}, {});
  std::fprintf(stderr, "[Hermes DevTools] %s/json/list\n", impl->origin().c_str());
  return std::unique_ptr<Inspector>(new Inspector(std::move(impl)));
#else
  (void)bundle;
  return nullptr;
#endif
}

Inspector::Inspector(std::unique_ptr<Impl> impl) : impl_(std::move(impl)) {}
Inspector::~Inspector() {
  impl_->stopped.store(true);
  if (impl_->worker.joinable()) impl_->worker.join();
}
std::string Inspector::sourceUrl() const { return impl_->origin() + "/bundle.lowered.js"; }
void Inspector::start(Host& host) {
  impl_->host = &host;
  impl_->worker = std::thread([this] { impl_->run(); });
}
}  // namespace bureau::js
