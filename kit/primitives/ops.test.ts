import { assertEquals } from "@std/assert";
import { changedProps, MutationWriter, Op } from "./ops.ts";

Deno.test("a literal tree encodes to one operation array and string table", () => {
  const writer = new MutationWriter();
  writer.create(1, "bureau-box");
  writer.props(1, { fill: "db32-black", onPress: true });
  writer.text(2, "Cash");
  writer.append(1, 2);
  writer.append(0, 1);

  const stream = writer.take();
  assertEquals(Array.from(stream.operations), [
    Op.Create,
    1,
    0,
    Op.Props,
    1,
    1,
    Op.Text,
    2,
    2,
    Op.Append,
    1,
    2,
    Op.Append,
    0,
    1,
  ]);
  assertEquals(stream.strings, [
    "bureau-box",
    '{"fill":"db32-black","onPress":true}',
    "Cash",
  ]);
  assertEquals(Array.from(writer.take().operations), []);
});

Deno.test("a prop update carries only changed values and removals", () => {
  const previous = {
    fill: "db32-black",
    grow: 1,
    onPress: () => {},
    label: "Cash",
  };
  const next = {
    fill: "db32-white",
    grow: 1,
    onPress: undefined,
    label: undefined,
  };
  assertEquals(changedProps(previous, next), {
    fill: "db32-white",
    onPress: false,
    label: null,
  });
});
