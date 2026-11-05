import { assertEquals } from "@std/assert";
import { type HostNode, notifyFocus, subscribeFocus } from "./host.ts";

Deno.test("a focus subscription hears each move until it stops", () => {
  const first: HostNode = {
    id: 1,
    type: "bureau-box",
    props: {},
    text: "",
    children: [],
    attached: true,
  };
  const heard: Array<HostNode | null> = [];
  const stop = subscribeFocus((node) => heard.push(node));
  notifyFocus(first);
  notifyFocus(null);
  stop();
  notifyFocus(first);
  assertEquals(heard, [first, null]);
});
