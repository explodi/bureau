// The view's half of `__native`: the functions the reconciler and the host in
// kit/primitives call, and the view's calls back into React.
#pragma once

namespace facebook::jsi {
class Object;
class Runtime;
}  // namespace facebook::jsi

namespace bureau {

class View;

void installViewBridge(facebook::jsi::Runtime& runtime,
                       facebook::jsi::Object& native, View& view);

}  // namespace bureau
