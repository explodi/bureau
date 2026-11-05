# Integrating Bureau

A whole little game's side of it, first in TypeScript and then in C++.

```tsx
// ui/main.tsx
import { useState } from "react";
import { Box, Text } from "bureau/primitives";
import { Button } from "bureau/kit/Bureau.tsx";
import { render } from "bureau/kit/render.ts";

const native = globalThis.__native as unknown as { startGame(): void };

function Menu() {
  const [presses, setPresses] = useState(0);
  return (
    <Box direction="column">
      <Text>{`Pressed ${presses} times`}</Text>
      <Button onPress={() => setPresses(presses + 1)}>Press</Button>
      <Button onPress={() => native.startGame()}>Start</Button>
    </Box>
  );
}

render(<Menu />);
```

```cpp
// game.cpp
bureau::Ui::Options options;
options.bytecode = readBytes("ui/bundle.hbc");
options.tokens = readText("ui/tokens.json");
options.readAsset = [](const std::string& path) { return readText("assets" + path); };
options.width = 1280;
options.height = 720;
options.install = [&](facebook::jsi::Runtime& js, facebook::jsi::Object& native) {
  bureau::bridge::define(js, native, "startGame",
                         [&](facebook::jsi::Runtime&, const facebook::jsi::Value&,
                             const facebook::jsi::Value*, size_t) {
                           game.start();
                           return facebook::jsi::Value::undefined();
                         });
};
bureau::Ui ui(std::move(options));
ui.start();

bureau::MetalBackend backend((__bridge void*)device, MTLPixelFormatBGRA8Unorm);
std::shared_ptr<const bureau::DisplayList> list;

while (running) {
  // Your window's events, in points from its top left:
  ui.pointer(pointerEvent);
  ui.key(keyEvent);

  auto frame = ui.takeFrame();
  backend.upload(frame.uploads);
  if (frame.list) list = std::move(frame.list);

  // ...draw your game, then in the same pass:
  if (list) backend.draw(*list, (__bridge void*)encoder, width, height);

  ui.refresh(nowMs);
}
```

## Getting started

You need CMake, Ninja, a C++20 compiler and [Deno](https://deno.com), which runs
the TypeScript toolchain.

Each commit of `main` that passes its tests is published as a package. Copy the
newest into your repository:

```sh
curl -L https://github.com/explodi/bureau/releases/latest/download/bureau.tar.gz |
  tar -xz -C third_party
```

That makes `third_party/bureau`, and replacing the folder updates it. `bureau.json`,
beside the archive, names its commit and SHA-256. A particular commit's package is
at `releases/download/main-<its first 12 characters>/bureau.tar.gz`, and its bytes
never change.

From Bureau's folder, fetch Hermes, then write out the looks and compile your TSX:

```sh
cd third_party/bureau
deno task hermes                                    # the pinned Hermes, once
deno task tokens ../../ui/tokens.json               # the looks, as JSON
deno task bundle ../../ui/main.tsx ../../build/ui   # your TSX, as bytecode
```

Then, in your CMake project:

```cmake
add_subdirectory(third_party/bureau)
target_link_libraries(game PRIVATE bureau_js bureau_metal)
# On Apple, Hermes is a framework. This runs the game from its build tree; an
# app you ship carries a copy of the framework itself.
set_target_properties(game PROPERTIES BUILD_RPATH "${BUREAU_HERMES_FRAMEWORKS}")
```

`Options::readAsset` also answers for Bureau's own `assets/`, its fonts and icons,
so ship that folder among your game's assets.

The bundler knows Bureau's import names by itself. For your editor and type checker,
set `bureau/kit/`, `bureau/primitives`, `bureau/host`, `bureau/jsx-runtime`,
`bureau/pad_actions` and `platform` in your import map as `deno.json` here does.

## Backends

A backend draws a display list into your own pass, with your own device. Link
the one you use. Each header says how, in a few lines.

| Renderer    | Target          | Header                     |
| ----------- | --------------- | -------------------------- |
| Metal       | `bureau_metal`  | `bureau/backends/metal.h`  |
| OpenGL      | `bureau_opengl` | `bureau/backends/opengl.h` |
| Vulkan      | `bureau_vulkan` | `bureau/backends/vulkan.h` |
| Direct3D 11 | `bureau_d3d11`  | `bureau/backends/d3d11.h`  |
| Direct3D 12 | `bureau_d3d12`  | `bureau/backends/d3d12.h`  |

The [README](../README.md#how-it-works) says how far each has been tested.
`bureau_vulkan_tests` and `bureau_d3d_tests` draw the shared scene: Vulkan on
the system's loader or on whichever library `BUREAU_VULKAN_LIBRARY` names,
Direct3D on WARP, so neither needs a GPU of a particular kind.

A renderer of your own needs one pipeline: textured quads, premultiplied
blending, one scissor per run. `bureau::backends::batchesOf`
(`bureau/backends/quads.h`) gives you the vertices and the runs. Draw into a
UNORM target, not an sRGB one: the UI's colours are sRGB-encoded already and
blend in that encoding.

## Writing the UI

- **Primitives** (`bureau/primitives`): `Box`, `Text`, `Image`, `Scroll`,
  `Field`, `Plot` and `Layer`. Everything on screen is one of these.
- **The kit** (`bureau/kit/`): `Window`, `Dialog`, `Button`, `TextField`,
  `Select`, `Tabs`, `List`, `Sheet`, `Chart`, `Meter` and more, each keyboard
  and controller driven.
- **Looks** (`kit/tokens.ts`) are named data: colours, bevels, type styles. Your
  game's are its own document, written out with `tools/tokens.ts`.
- **Text** (`bureau/kit/i18n/i18n.ts`): ICU MessageFormat, with number, date and
  plural formatting built in, since Hermes carries no `Intl`.
- **Controllers** (`bureau/kit/input/useGamepad.ts`): named actions, not
  buttons. Send pad state with `ui.gamepads(json)`. A game with more actions
  maps `bureau/pad_actions` to its own table.
- **The machine** (`platform`): `kit/native_platform.ts` covers it. A game with
  more to offer, such as saved settings, adds `storageGet`, `storageSet` and
  `storageRemove` to `__native`, or maps `platform` to its own
  (`kit/platform.ts` says what the kit needs).
- **Pictures**: `LoadingState` turns `/img/hourglass.gif` if your assets hold
  one, and shows only its words if not.
- **Sounds**: controls call a player you hand to `setKitSoundPlayer`
  (`kit/sounds.ts`). Without one they are silent.

There is no HTML, CSS or DOM. `bureau_lint_plugin.ts` catches what the types
cannot.

## Debugging

Configure with `-DBUREAU_INSPECTOR=ON`, bundle with `--developer`, set
`Options::debugBundle` to the bundle's path, and launch with
`BUREAU_INSPECT_PORT=9223`. Add `localhost:9223` in `chrome://inspect`:
breakpoints land in your TSX.

## Developing Bureau

```sh
deno task hermes                 # once
deno task check
deno task bundle:tests           # after changing the kit
cmake -S . -B build -G Ninja && cmake --build build
ctest --test-dir build --output-on-failure
deno task test
```

The first configure fetches the pinned commits in
`third_party/dependencies.cmake`.
