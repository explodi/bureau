import { assertEquals } from "@std/assert";
import { Card, CardDismissContext, CardTitle } from "./Card.tsx";
import { createNativeRoot, nativeNodes } from "./primitives/reconciler.ts";

Deno.test("an inspector title dismisses its selection from the engraved compartment", () => {
  let dismissed = 0;
  const root = createNativeRoot(() => {});
  root.renderSync(
    <CardDismissContext.Provider value={() => dismissed++}>
      <Card>
        <CardTitle>Road</CardTitle>
      </Card>
    </CardDismissContext.Provider>,
  );
  try {
    const nodes = [...nativeNodes()];
    const close = nodes.find((node) => node.props.id === "toolconfig-dismiss")!;
    assertEquals(close.props.feedback, "cancel");
    assertEquals(close.props.look, "instrument-back");
    (close.props.onPress as () => void)();
    assertEquals(dismissed, 1);
  } finally {
    root.renderSync(null);
  }
});
