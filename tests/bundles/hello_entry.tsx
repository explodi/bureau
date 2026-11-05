// A whole little UI, as a game writes one: the kit, its default platform, and a
// function of the game's own on `__native`.
import { useState } from "react";
import { Box, Text } from "bureau/primitives";
import { Button } from "bureau/kit/Bureau.tsx";
import { render } from "bureau/kit/render.ts";

const native = globalThis.__native as unknown as {
  pressed(times: number): void;
};

function Hello() {
  const [times, setTimes] = useState(0);
  return (
    <Box id="hello" direction="column">
      <Text>{`Pressed ${times}`}</Text>
      <Button
        id="press"
        onPress={() => {
          native.pressed(times + 1);
          setTimes(times + 1);
        }}
      >
        Press
      </Button>
    </Box>
  );
}

render(<Hello />);
