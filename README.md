# Bureau

Write your C++ game's UI in React and TypeScript, and draw it in your own render
pass on Metal, Vulkan, Direct3D or OpenGL, with no browser in the way.

## The problem

Player-facing UI is where a C++ game loses the most time for the least reward. A
real interface needs layout, text shaping in several scripts, translated strings
and plurals, focus, scrolling, animation, and navigation by mouse, touch,
keyboard and controller. Its state changes constantly and has to stay in step
with the game.

The usual options each give something up:

- **Immediate-mode libraries** are wonderful for debug tools and quick to start,
  but they leave layout, localised text and controller navigation of a shipping
  interface to you.
- **A retained toolkit of your own** can do all of it, after you have spent
  years writing it, and every change to a menu still means recompiling your
  game.
- **An embedded browser** gives you the web's tools, and with them a browser to
  ship, its memory and processes, and the work of compositing its output with
  your renderer and keeping its frames in step with yours.

React already solved the part that makes UI code hard: describe the screen as a
function of state, and let the library work out what changed. Bureau gives C++
games that model, and nothing else from the web.

## What Bureau is, and what it isn't

**Bureau is React, for real.** It runs the actual `react` package on a custom
reconciler, so hooks, context and the React Compiler all work, and you write
strictly typed TSX. You get the programming model and the type checker without
learning a new UI language.

**Bureau is a native UI engine.** Layout comes from Yoga, text from HarfBuzz and
FreeType with proper line breaking, and input, focus and scrolling are handled
in C++. It handles Latin, Cyrillic and CJK text, and formats numbers, dates and
plurals itself, because a game should not need a browser to say "3 coins" in
Polish.

**Bureau is a component kit.** Windows, dialogs, buttons, fields, selects, tabs,
lists, sheets, charts and meters, all driven by keyboard, mouse, touch and
controller, with on-screen glyphs that follow the pad in the player's hands.
They share a distinctive bevelled, pixel-font look, defined as data you can
change.

**Bureau is a small seam in your code.** You hold one C++ object, feed it input,
and draw what it gives you. TypeScript calls your C++ through functions you
register.

**It isn't a browser or a web view.** There is no HTML, CSS or DOM, and npm
packages that touch them will not run. Those are precisely the costs Bureau
exists to avoid, and the type checker rejects them, so you find out while
writing the code.

**It isn't React Native.** It shares a JavaScript engine with it, Hermes, but
draws no platform widgets. Every pixel goes through your renderer, so your UI
looks the same on every machine and sits correctly over your game.

**It isn't a renderer or an engine.** It owns no window, no GPU device and no
main loop, because your game already has those. It hands you textured quads and
you decide when they are drawn.

**It isn't Dear ImGui.** If you want a debug panel in five lines of C++, use an
immediate-mode library. Bureau needs a JavaScript engine in your game and a
TypeScript toolchain in your build, which is only worth it for an interface your
players will spend time in.

## How it works

Your TSX is compiled ahead of time. The game ships bytecode, not source.

```
ui/main.tsx ──> tools/bundle.ts ──> bundle.hbc
                React Compiler,      Hermes bytecode
                then hermesc
```

At run time the UI lives on a thread of its own, so a slow screen never holds up
your frame. The two threads meet only over immutable data.

```
        UI thread (Hermes)                     Your render thread
┌────────────────────────────────┐      ┌───────────────────────────────┐
│  React renders your components │      │  ui.pointer(), ui.key() ...   │──┐
│                 │              │      │                               │  │
│     commits, as a stream of    │      │  ui.takeFrame()               │  │
│     integers, into the view    │      │      │ newest display list    │  │
│                 │              │      │      │ and atlas pixels       │  │
│  layout (Yoga), text (HarfBuzz)│      │      v                        │  │
│  and painting into quads       │─────>│  backend.draw() in your pass  │  │
│                 ^              │      │                               │  │
│    events reach your handlers  │<─────│───────────────────────────────│<─┘
└────────────────────────────────┘      └───────────────────────────────┘
```

A frame of your game looks like this:

```cpp
auto frame = ui.takeFrame();
backend.upload(frame.uploads);
if (frame.list) list = std::move(frame.list);

// ...draw your game, then, in the same pass:
if (list) backend.draw(*list, encoder, width, height);

ui.refresh(nowMs);
```

And the other side of it:

```tsx
import { useState } from "react";
import { Box, Text } from "bureau/primitives";
import { Button } from "bureau/kit/Bureau.tsx";
import { render } from "bureau/kit/render.ts";

function Menu() {
  const [presses, setPresses] = useState(0);
  return (
    <Box direction="column">
      <Text>{`Pressed ${presses} times`}</Text>
      <Button onPress={() => setPresses(presses + 1)}>Press</Button>
    </Box>
  );
}

render(<Menu />);
```

A display list is a plain array of textured quads with their clips, so there is
one simple pipeline to draw it: premultiplied blending, one scissor per run. A
backend does that on your device, inside your pass:

| Your renderer | Target          | State                                             |
| ------------- | --------------- | ------------------------------------------------- |
| Metal         | `bureau_metal`  | Tested                                            |
| OpenGL 3.3    | `bureau_opengl` | Tested on macOS; the ES 3.0 path has not been run |
| Vulkan        | `bureau_vulkan` | Written and compiled, not yet run on a driver     |
| Direct3D 11   | `bureau_d3d11`  | Written, not yet compiled by MSVC or run          |
| Direct3D 12   | `bureau_d3d12`  | Written, not yet compiled by MSVC or run          |

Each draws the same scene in `tests/backends/`, checked pixel by pixel against
values worked out by hand, so a backend that is new to your platform has a test
waiting for it. With a renderer of your own, `bureau::backends::batchesOf` gives
you the vertices and the runs to draw yourself.

To put it in your game, read [Integrating Bureau](docs/integrating.md).

Bureau is MIT licensed. Its fonts and other third-party parts keep their own
terms: see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
