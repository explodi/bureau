#include "js/view_bridge.h"

#include <jsi/jsi.h>
#include <nlohmann/json.hpp>

#include <string>
#include <string_view>
#include <vector>

#include "bureau/bridge.h"
#include "view/view.h"

namespace bureau {

namespace jsi = facebook::jsi;
using Json = nlohmann::json;

namespace bridge {

std::string stringArg(jsi::Runtime& runtime, const jsi::Value* args,
                      size_t count, size_t index) {
  if (index >= count || !args[index].isString()) return {};
  return args[index].asString(runtime).utf8(runtime);
}

double numberArg(const jsi::Value* args, size_t count, size_t index,
                 double otherwise) {
  if (index >= count || !args[index].isNumber()) return otherwise;
  return args[index].asNumber();
}

bool boolArg(const jsi::Value* args, size_t count, size_t index) {
  return index < count && args[index].isBool() && args[index].getBool();
}

jsi::Value jsString(jsi::Runtime& runtime, const std::string& value) {
  return jsi::String::createFromUtf8(runtime, value);
}

Json jsonOf(jsi::Runtime& runtime, const jsi::Value& value) {
  if (value.isUndefined() || value.isNull()) return nullptr;
  if (value.isBool()) return value.getBool();
  if (value.isNumber()) return value.asNumber();
  if (value.isString()) return value.asString(runtime).utf8(runtime);
  const auto stringify = runtime.global()
                             .getPropertyAsObject(runtime, "JSON")
                             .getPropertyAsFunction(runtime, "stringify");
  const jsi::Value encoded = stringify.call(runtime, value);
  if (!encoded.isString()) return nullptr;
  return Json::parse(encoded.asString(runtime).utf8(runtime), nullptr, false);
}

void define(jsi::Runtime& runtime, jsi::Object& object, const char* name,
            jsi::HostFunctionType body) {
  object.setProperty(runtime, name,
                     jsi::Function::createFromHostFunction(
                         runtime, jsi::PropNameID::forAscii(runtime, name), 0,
                         std::move(body)));
}

}  // namespace bridge

namespace {

using bridge::boolArg;
using bridge::numberArg;
using bridge::stringArg;
using bridge::jsString;

int nodeArg(const jsi::Value* args, size_t count, size_t index) {
  return static_cast<int>(numberArg(args, count, index, 0));
}

jsi::Value idList(jsi::Runtime& runtime, const std::vector<int>& ids) {
  jsi::Array array(runtime, ids.size());
  for (size_t index = 0; index < ids.size(); ++index) {
    array.setValueAtIndex(runtime, index, jsi::Value(ids[index]));
  }
  return array;
}

}  // namespace

void installViewBridge(jsi::Runtime& runtime, jsi::Object& native, View& view) {
  const auto define = [&](const char* name, jsi::HostFunctionType body) {
    bridge::define(runtime, native, name, std::move(body));
  };

  // The view's calls into React: a node's handler, or the host's own.
  view.setDispatch(
      [&runtime](int node, std::string_view handler, const Json& args) -> Json {
        const auto dispatch =
            runtime.global().getProperty(runtime, "__nativeDispatch");
        if (!dispatch.isObject()) return nullptr;
        const jsi::Value answer =
            dispatch.asObject(runtime).asFunction(runtime).call(
                runtime, jsi::Value(node),
                jsi::String::createFromUtf8(runtime, std::string(handler)),
                jsi::String::createFromUtf8(runtime, args.dump()));
        return bridge::jsonOf(runtime, answer);
      });

  define("commit", [&view](jsi::Runtime& js, const jsi::Value&,
                           const jsi::Value* args, size_t count) {
    if (count < 2 || !args[0].isObject() || !args[1].isObject()) {
      return jsi::Value(false);
    }
    // The operations as an Int32Array, read in place.
    const jsi::Object operations = args[0].asObject(js);
    const jsi::Object buffer = operations.getPropertyAsObject(js, "buffer");
    const size_t offset = static_cast<size_t>(
        operations.getProperty(js, "byteOffset").asNumber());
    const size_t length =
        static_cast<size_t>(operations.getProperty(js, "length").asNumber());
    const uint8_t* bytes = buffer.getArrayBuffer(js).data(js) + offset;
    const jsi::Array strings = args[1].asObject(js).asArray(js);
    std::vector<std::string> values(strings.size(js));
    for (size_t index = 0; index < values.size(); ++index) {
      values[index] = strings.getValueAtIndex(js, index).asString(js).utf8(js);
    }
    return jsi::Value(
        view.commit(reinterpret_cast<const int32_t*>(bytes), length, values));
  });
  define("measure", [&view](jsi::Runtime& js, const jsi::Value&,
                            const jsi::Value* args, size_t count) {
    const int node = nodeArg(args, count, 0);
    const auto rect = view.measure(node);
    if (!rect) return jsi::Value::null();
    jsi::Array array(js, 5);
    array.setValueAtIndex(js, 0, jsi::Value(rect->x));
    array.setValueAtIndex(js, 1, jsi::Value(rect->y));
    array.setValueAtIndex(js, 2, jsi::Value(rect->width));
    array.setValueAtIndex(js, 3, jsi::Value(rect->height));
    array.setValueAtIndex(js, 4, jsi::Value(view.scaleOf(node)));
    return jsi::Value(js, array);
  });
  define("focusables", [&view](jsi::Runtime& js, const jsi::Value&,
                               const jsi::Value* args, size_t count) {
    return idList(
        js, view.focusables(nodeArg(args, count, 0), boolArg(args, count, 1)));
  });
  define("navigable", [&view](jsi::Runtime& js, const jsi::Value&,
                              const jsi::Value* args, size_t count) {
    return idList(js, view.navigable(stringArg(js, args, count, 0),
                                     boolArg(args, count, 1)));
  });
  define("isNavigable", [&view](jsi::Runtime&, const jsi::Value&,
                                const jsi::Value* args, size_t count) {
    return jsi::Value(view.isNavigable(nodeArg(args, count, 0)));
  });
  define("focus", [&view](jsi::Runtime&, const jsi::Value&,
                          const jsi::Value* args, size_t count) {
    view.focus(nodeArg(args, count, 0), boolArg(args, count, 1));
    return jsi::Value::undefined();
  });
  define("blur", [&view](jsi::Runtime&, const jsi::Value&,
                         const jsi::Value* args, size_t count) {
    view.blur(nodeArg(args, count, 0));
    return jsi::Value::undefined();
  });
  define("contains", [&view](jsi::Runtime&, const jsi::Value&,
                             const jsi::Value* args, size_t count) {
    return jsi::Value(
        view.contains(nodeArg(args, count, 0), nodeArg(args, count, 1)));
  });
  define("connected", [&view](jsi::Runtime&, const jsi::Value&,
                              const jsi::Value* args, size_t count) {
    return jsi::Value(view.connected(nodeArg(args, count, 0)));
  });
  define("toolbar", [&view](jsi::Runtime&, const jsi::Value&,
                            const jsi::Value* args, size_t count) {
    return jsi::Value(view.toolbar(nodeArg(args, count, 0)));
  });
  define("scrollIntoView", [&view](jsi::Runtime&, const jsi::Value&,
                                   const jsi::Value* args, size_t count) {
    view.scrollIntoView(nodeArg(args, count, 0));
    return jsi::Value::undefined();
  });
  define("scrollBy", [&view](jsi::Runtime&, const jsi::Value&,
                             const jsi::Value* args, size_t count) {
    view.scrollBy(nodeArg(args, count, 0),
                  static_cast<float>(numberArg(args, count, 1)),
                  static_cast<float>(numberArg(args, count, 2)));
    return jsi::Value::undefined();
  });
  define("horizontalScroller", [&view](jsi::Runtime&, const jsi::Value&,
                                       const jsi::Value* args, size_t count) {
    return jsi::Value(view.horizontalScroller(nodeArg(args, count, 0),
                                              nodeArg(args, count, 1)));
  });
  define("control", [&view](jsi::Runtime& js, const jsi::Value&,
                            const jsi::Value* args, size_t count) {
    return jsString(js, view.control(nodeArg(args, count, 0)).dump());
  });
  define("press", [&view](jsi::Runtime&, const jsi::Value&,
                          const jsi::Value* args, size_t count) {
    view.press(nodeArg(args, count, 0));
    return jsi::Value::undefined();
  });
  define("setControlValue", [&view](jsi::Runtime& js, const jsi::Value&,
                                    const jsi::Value* args, size_t count) {
    view.setControlValue(nodeArg(args, count, 0),
                         stringArg(js, args, count, 1));
    return jsi::Value::undefined();
  });
  define("selectText", [&view](jsi::Runtime&, const jsi::Value&,
                               const jsi::Value* args, size_t count) {
    view.selectText(nodeArg(args, count, 0));
    return jsi::Value::undefined();
  });
  define("measureText", [&view](jsi::Runtime& js, const jsi::Value&,
                                const jsi::Value* args, size_t count) {
    return jsi::Value(view.measureText(stringArg(js, args, count, 0),
                                       stringArg(js, args, count, 1)));
  });
  define("viewport", [&view](jsi::Runtime& js, const jsi::Value&,
                             const jsi::Value*, size_t) {
    const UiRect viewport = view.viewport();
    jsi::Array array(js, 4);
    array.setValueAtIndex(js, 0, jsi::Value(viewport.x));
    array.setValueAtIndex(js, 1, jsi::Value(viewport.y));
    array.setValueAtIndex(js, 2, jsi::Value(viewport.width));
    array.setValueAtIndex(js, 3, jsi::Value(viewport.height));
    return jsi::Value(js, array);
  });
  define("contentExtent", [&view](jsi::Runtime& js, const jsi::Value&,
                                  const jsi::Value* args, size_t count) {
    return jsString(js, view.contentExtent(nodeArg(args, count, 0)).dump());
  });
  define("markNavigable", [&view](jsi::Runtime& js, const jsi::Value&,
                                  const jsi::Value* args, size_t count) {
    view.markNavigable(nodeArg(args, count, 0), stringArg(js, args, count, 1),
                       boolArg(args, count, 2));
    return jsi::Value::undefined();
  });
  define("find", [&view](jsi::Runtime& js, const jsi::Value&,
                         const jsi::Value* args, size_t count) {
    return jsi::Value(view.find(stringArg(js, args, count, 0)));
  });
  define("placeLayer", [&view](jsi::Runtime&, const jsi::Value&,
                               const jsi::Value* args, size_t count) {
    view.placeLayer(nodeArg(args, count, 0),
                    static_cast<float>(numberArg(args, count, 1)),
                    static_cast<float>(numberArg(args, count, 2)));
    return jsi::Value::undefined();
  });
  define("setScale", [&view](jsi::Runtime&, const jsi::Value&,
                             const jsi::Value* args, size_t count) {
    view.setUiScale(static_cast<float>(numberArg(args, count, 0, 1)));
    return jsi::Value::undefined();
  });
  define("setInputMode", [&view](jsi::Runtime& js, const jsi::Value&,
                                 const jsi::Value* args, size_t count) {
    view.setInputMode(stringArg(js, args, count, 0));
    return jsi::Value::undefined();
  });
  define("setGamepadConnected", [&view](jsi::Runtime&, const jsi::Value&,
                                        const jsi::Value* args, size_t count) {
    view.setGamepadConnected(boolArg(args, count, 0));
    return jsi::Value::undefined();
  });
  define("setCancelKey", [&view](jsi::Runtime& js, const jsi::Value&,
                                 const jsi::Value* args, size_t count) {
    view.setCancelKey(stringArg(js, args, count, 0));
    return jsi::Value::undefined();
  });
  define("setLanguage", [&view](jsi::Runtime& js, const jsi::Value&,
                                const jsi::Value* args, size_t count) {
    view.setLanguage(stringArg(js, args, count, 0));
    return jsi::Value::undefined();
  });
  define("setSurface", [&view](jsi::Runtime&, const jsi::Value&,
                               const jsi::Value* args, size_t count) {
    view.setSurface(nodeArg(args, count, 0));
    return jsi::Value::undefined();
  });
  define("pointer", [&view](jsi::Runtime& js, const jsi::Value&,
                            const jsi::Value*, size_t) {
    jsi::Array array(js, 2);
    array.setValueAtIndex(js, 0, jsi::Value(view.pointerX()));
    array.setValueAtIndex(js, 1, jsi::Value(view.pointerY()));
    return jsi::Value(js, array);
  });
  define("safeArea",
         [&view](jsi::Runtime& js, const jsi::Value&, const jsi::Value*,
                 size_t) { return jsString(js, view.safeArea().dump()); });
}

}  // namespace bureau
