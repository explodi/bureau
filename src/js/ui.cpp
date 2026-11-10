#include "bureau/ui.h"

#include <jsi/jsi.h>

#include <cstdio>
#include <deque>
#include <mutex>
#include <random>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include "bureau/bridge.h"
#include "js/host.h"
#include "js/inspect.h"
#include "js/view_bridge.h"
#include "view/view.h"

namespace bureau {

namespace jsi = facebook::jsi;
using bridge::define;
using bridge::numberArg;
using bridge::stringArg;
using bridge::jsString;

namespace {

class Bytes final : public jsi::MutableBuffer {
 public:
  explicit Bytes(std::string bytes) : bytes_(std::move(bytes)) {}
  size_t size() const override { return bytes_.size(); }
  uint8_t* data() override { return reinterpret_cast<uint8_t*>(bytes_.data()); }

 private:
  std::string bytes_;
};

std::string languageOf(const std::string& tag) {
  return tag.substr(0, tag.find_first_of("-_"));
}

/** The step a pointer event's task names when the UI's thread stalls. */
const char* pointerStep(PointerEvent::Kind kind) {
  using Kind = PointerEvent::Kind;
  switch (kind) {
    case Kind::Move:
      return "pointer move";
    case Kind::Down:
      return "pointer down";
    case Kind::Up:
      return "pointer up";
    case Kind::Cancel:
      return "pointer cancel";
    case Kind::Leave:
      return "pointer leave";
    case Kind::Wheel:
      return "pointer wheel";
  }
  return "pointer";
}

/** A call into React as a stalled turn names it: the handler and the nearest
 * named node it is on ("onPress #stats"), or the host's own listener and
 * its first word ("__surface up"). */
std::string callName(const View& view, int node, std::string_view handler,
                     const nlohmann::json& args) {
  const std::string name(handler);
  if (node > 0) {
    const std::string id = view.nameOf(node);
    return id.empty() ? name : name + " #" + id;
  }
  const bool worded = args.is_array() && !args.empty() && args[0].is_string();
  return worded ? name + " " + args[0].get<std::string>() : name;
}

}  // namespace

struct Ui::Impl {
  Options options;
  std::unique_ptr<View> view;
  std::unique_ptr<js::Inspector> inspector;

  mutable std::mutex mutex;
  /** Under the mutex, as other threads post through it. */
  std::unique_ptr<js::Host> host;
  std::deque<std::pair<Task, std::string>> held;
  bool stopped = false;
  float width = 0;
  float height = 0;
  float scale = 1;
  /** What the UI's thread hands the render thread between refreshes. */
  Frame mailbox;

  /** The UI's thread's: animation time, when something holds it still. */
  std::optional<double> frozenClock;

  /** What the UI's thread is in the middle of, outermost first: it writes,
   * any thread reads. */
  mutable std::mutex doingMutex;
  mutable std::vector<std::string> doing;

  /** Names what the UI's thread does for as long as this lives. */
  struct Doing {
    Doing(const Impl* impl, std::string what) : impl_(impl) {
      std::lock_guard lock(impl_->doingMutex);
      impl_->doing.push_back(std::move(what));
    }
    ~Doing() {
      std::lock_guard lock(impl_->doingMutex);
      impl_->doing.pop_back();
    }
    Doing(const Doing&) = delete;
    Doing& operator=(const Doing&) = delete;

   private:
    const Impl* impl_;
  };

  void post(Task task, std::string tag) {
    std::lock_guard lock(mutex);
    if (stopped) return;
    if (!host) {
      held.emplace_back(std::move(task), std::move(tag));
      return;
    }
    host->post(std::move(task), std::move(tag));
  }

  /** After every turn: the view's new frame. */
  void publish(double nowMs) {
    const bool changed = view->frame(frozenClock.value_or(nowMs));
    std::string textInput = view->textInput().dump();
    const bool busy = changed ? view->windowBusy() : true;
    std::lock_guard lock(mutex);
    mailbox.textInput = std::move(textInput);
    if (!changed) return;
    mailbox.list = view->displayList();
    mailbox.busy = busy;
    for (auto& upload : view->takeUploads()) {
      mailbox.uploads.push_back(std::move(upload));
    }
    mailbox.pressable = view->pointerOverPress();
  }

  std::optional<std::string> readAsset(const std::string& path) const {
    const Doing reading(this, "read " + path);
    return options.readAsset ? options.readAsset(path) : std::nullopt;
  }

  void installNative(jsi::Runtime& js) {
    // A reload starts the tree again.
    view->clear();
    jsi::Object native(js);
    installViewBridge(js, native, *view);
    view->setDispatch([this, call = view->dispatch()](
                          int node, std::string_view handler,
                          const nlohmann::json& args) {
      const Doing calling(this, callName(*view, node, handler, args));
      return call(node, handler, args);
    });
    installServices(js, native);
    if (options.install) options.install(js, native);
    js.global().setProperty(js, "__native", native);
  }

  /** What the kit's default platform (kit/native_platform.ts) needs of the
   * machine. */
  void installServices(jsi::Runtime& js, jsi::Object& native) {
    define(js, native, "log",
           [this](jsi::Runtime& runtime, const jsi::Value&,
                  const jsi::Value* args, size_t count) {
             const auto category = stringArg(runtime, args, count, 0);
             const auto message = stringArg(runtime, args, count, 1);
             std::fprintf(stderr, "[%s] %s\n", category.c_str(),
                          message.c_str());
             const bool wanted = category == "report" || category == "exception";
             if (wanted && options.onReport) options.onReport(category, message);
             return jsi::Value::undefined();
           });
    define(js, native, "randomBytes",
           [](jsi::Runtime& runtime, const jsi::Value&, const jsi::Value* args,
              size_t count) {
             static std::random_device device;
             const size_t length =
                 static_cast<size_t>(numberArg(args, count, 0, 0));
             jsi::Array array(runtime, length);
             for (size_t index = 0; index < length; ++index) {
               array.setValueAtIndex(
                   runtime, index,
                   jsi::Value(static_cast<int>(device() & 0xff)));
             }
             return jsi::Value(runtime, array);
           });
    define(js, native, "reload",
           [this](jsi::Runtime&, const jsi::Value&, const jsi::Value*, size_t) {
             std::lock_guard lock(mutex);
             if (host) host->requestReload();
             return jsi::Value::undefined();
           });
    define(js, native, "language",
           [this](jsi::Runtime& runtime, const jsi::Value&, const jsi::Value*,
                  size_t) { return jsString(runtime, options.language); });
    define(js, native, "window",
           [this](jsi::Runtime& runtime, const jsi::Value&, const jsi::Value*,
                  size_t) {
             std::lock_guard lock(mutex);
             jsi::Array array(runtime, 3);
             array.setValueAtIndex(runtime, 0, jsi::Value(width));
             array.setValueAtIndex(runtime, 1, jsi::Value(height));
             array.setValueAtIndex(runtime, 2, jsi::Value(scale));
             return jsi::Value(runtime, array);
           });
    define(js, native, "assetText",
           [this](jsi::Runtime& runtime, const jsi::Value&,
                  const jsi::Value* args, size_t count) {
             const auto bytes = readAsset(stringArg(runtime, args, count, 0));
             return bytes ? jsString(runtime, *bytes) : jsi::Value::null();
           });
    define(js, native, "assetBytes",
           [this](jsi::Runtime& runtime, const jsi::Value&,
                  const jsi::Value* args, size_t count) {
             auto bytes = readAsset(stringArg(runtime, args, count, 0));
             if (!bytes) return jsi::Value::null();
             return jsi::Value(
                 runtime,
                 jsi::ArrayBuffer(runtime,
                                  std::make_shared<Bytes>(std::move(*bytes))));
           });
  }
};

Ui::Ui(Options options) : impl_(std::make_unique<Impl>()) {
  Impl* impl = impl_.get();
  impl->options = std::move(options);
  impl->frozenClock = impl->options.frozenClock;
  impl->width = impl->options.width;
  impl->height = impl->options.height;
  impl->scale = impl->options.scale > 0 ? impl->options.scale : 1;
  impl->view = std::make_unique<View>(
      [impl](const std::string& path)
          -> std::shared_ptr<const std::vector<uint8_t>> {
        const auto bytes = impl->readAsset(path);
        if (!bytes) return nullptr;
        return std::make_shared<const std::vector<uint8_t>>(bytes->begin(),
                                                            bytes->end());
      });
  impl->view->setAtlas(impl->options.atlasSize, impl->options.atlasPageBudget);
  impl->view->setMonochromeText(impl->options.monochromeText);
  impl->view->loadTokens(impl->options.tokens);
  impl->view->setViewport(impl->width, impl->height, impl->scale);
  impl->view->setLanguage(languageOf(impl->options.language));
}

Ui::~Ui() { stop(); }

void Ui::start() {
  Impl* impl = impl_.get();
  js::Host::Options options;
  if (!impl->options.debugBundle.empty()) {
    impl->inspector = js::Inspector::fromEnvironment(impl->options.debugBundle);
  }
  if (impl->inspector) {
    options.debugger = true;
    options.sourceUrl = impl->inspector->sourceUrl();
  }
  options.realClock = true;
  options.onError = [impl](const std::string& message) {
    if (impl->options.onError) impl->options.onError(message);
  };
  options.install = [impl](jsi::Runtime& js) { impl->installNative(js); };
  options.uninstall = [impl](jsi::Runtime& js) {
    impl->view->setDispatch(nullptr);
    if (impl->options.uninstall) impl->options.uninstall(js);
  };
  options.afterTurn = [impl](jsi::Runtime& js, double nowMs) {
    if (impl->options.afterTurn) impl->options.afterTurn(js, nowMs);
    impl->publish(nowMs);
  };
  auto host = std::make_unique<js::Host>(std::move(impl->options.bytecode),
                                         std::move(options));
  if (impl->inspector) impl->inspector->start(*host);
  std::lock_guard lock(impl->mutex);
  impl->host = std::move(host);
  for (auto& [task, tag] : impl->held) {
    impl->host->post(std::move(task), std::move(tag));
  }
  impl->held.clear();
}

void Ui::stop() {
  Impl* impl = impl_.get();
  {
    std::lock_guard lock(impl->mutex);
    if (impl->stopped) return;
    impl->stopped = true;
    impl->held.clear();
    if (!impl->host) return;
  }
  // Queued tasks read host(), so they run while it still holds the engine.
  impl->host->invoke([](jsi::Runtime&) {}, "quit");
  impl->inspector.reset();
  std::unique_ptr<js::Host> host;
  {
    std::lock_guard lock(impl->mutex);
    host = std::move(impl->host);
  }
}

void Ui::post(Task task, std::string tag) {
  impl_->post(std::move(task), std::move(tag));
}

void Ui::invoke(Task task, std::string tag) {
  impl_->host->invoke(std::move(task), std::move(tag));
}

Ui::Frame Ui::takeFrame() {
  Frame frame;
  std::lock_guard lock(impl_->mutex);
  frame.list = std::move(impl_->mailbox.list);
  impl_->mailbox.list.reset();
  frame.uploads.swap(impl_->mailbox.uploads);
  frame.pressable = impl_->mailbox.pressable;
  frame.busy = impl_->mailbox.busy;
  frame.textInput = impl_->mailbox.textInput;
  return frame;
}

void Ui::refresh(double nowMs) { impl_->host->frame(nowMs); }

void Ui::resendAtlas() {
  Impl* impl = impl_.get();
  impl->post(
      [impl](jsi::Runtime&) {
        auto pages = impl->view->atlasPages();
        std::lock_guard lock(impl->mutex);
        for (auto& page : pages) impl->mailbox.uploads.push_back(std::move(page));
      },
      "atlas pages");
}

void Ui::pointer(const PointerEvent& event) {
  Impl* impl = impl_.get();
  impl->post([impl, event](jsi::Runtime&) { impl->view->pointer(event); },
             pointerStep(event.kind));
}

void Ui::key(const KeyEvent& event) {
  Impl* impl = impl_.get();
  impl->post([impl, event](jsi::Runtime&) { impl->view->key(event); },
             event.down ? "key down" : "key up");
}

void Ui::typed(std::string text) {
  Impl* impl = impl_.get();
  impl->post([impl, text = std::move(text)](
                 jsi::Runtime&) { impl->view->typed(text); },
             "typed text");
}

void Ui::edit(nlohmann::json edit) {
  Impl* impl = impl_.get();
  impl->post([impl, edit = std::move(edit)](
                 jsi::Runtime&) { impl->view->editText(edit); },
             "text edit");
}

void Ui::resize(float width, float height, float scale) {
  Impl* impl = impl_.get();
  {
    std::lock_guard lock(impl->mutex);
    impl->width = width;
    impl->height = height;
    impl->scale = scale;
  }
  impl->post(
      [impl, width, height, scale](jsi::Runtime&) {
        impl->view->setViewport(width, height, scale);
      },
      "resize");
}

void Ui::setInsets(float top, float right, float bottom, float left,
                   float keyboardHeight) {
  Impl* impl = impl_.get();
  impl->post(
      [=](jsi::Runtime&) {
        impl->view->setInsets(top, right, bottom, left, keyboardHeight);
      },
      "insets");
}

void Ui::setReducedMotion(bool reduced) {
  Impl* impl = impl_.get();
  impl->post(
      [impl, reduced](jsi::Runtime&) { impl->view->setReducedMotion(reduced); },
      "reduced motion");
}

void Ui::gamepads(std::string json) {
  impl_->post(
      [json = std::move(json)](jsi::Runtime& js) {
        const auto deliver = js.global().getProperty(js, "__nativeGamepads");
        if (!deliver.isObject()) return;
        deliver.asObject(js).asFunction(js).call(
            js, jsi::String::createFromUtf8(js, json));
      },
      "gamepads");
}

void Ui::setProjection(const std::array<double, 16>& matrix) {
  Impl* impl = impl_.get();
  impl->post(
      [impl, matrix](jsi::Runtime&) { impl->view->setProjection(matrix); },
      "projection");
}

void Ui::setClock(std::optional<double> ms, double nowMs) {
  Impl* impl = impl_.get();
  impl->host->invoke([impl, ms, nowMs](jsi::Runtime&) {
    impl->frozenClock = ms;
    impl->publish(nowMs);
  });
}

void Ui::reload(std::vector<std::uint8_t> bytecode, std::string tokens) {
  Impl* impl = impl_.get();
  if (!tokens.empty()) {
    impl->host->post([impl, tokens = std::move(tokens)](jsi::Runtime&) {
      impl->view->loadTokens(tokens);
    });
  }
  impl->host->reloadBundle(std::move(bytecode));
}

View& Ui::view() { return *impl_->view; }

js::Host* Ui::host() const {
  std::lock_guard lock(impl_->mutex);
  return impl_->host.get();
}

std::string Ui::doing() const {
  std::lock_guard lock(impl_->doingMutex);
  std::string joined;
  for (const auto& what : impl_->doing) {
    if (!joined.empty()) joined += " > ";
    joined += what;
  }
  return joined;
}

}  // namespace bureau
