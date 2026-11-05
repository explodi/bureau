/** The mutation stream shared by the React host and the C++ node table. */
export enum Op {
  Create = 1,
  Text = 2,
  Append = 3,
  Insert = 4,
  Remove = 5,
  Props = 6,
  Destroy = 7,
}

export interface MutationStream {
  operations: Int32Array;
  strings: string[];
}

export class MutationWriter {
  private operations: number[] = [];
  private strings: string[] = [];

  create(id: number, type: string): void {
    this.operations.push(Op.Create, id, this.addString(type));
  }

  text(id: number, value: string): void {
    this.operations.push(Op.Text, id, this.addString(value));
  }

  append(parent: number, child: number): void {
    this.operations.push(Op.Append, parent, child);
  }

  insert(parent: number, child: number, before: number): void {
    this.operations.push(Op.Insert, parent, child, before);
  }

  remove(parent: number, child: number): void {
    this.operations.push(Op.Remove, parent, child);
  }

  props(id: number, patch: Record<string, unknown>): void {
    this.operations.push(Op.Props, id, this.addString(JSON.stringify(patch)));
  }

  destroy(id: number): void {
    this.operations.push(Op.Destroy, id);
  }

  take(): MutationStream {
    const stream = {
      operations: Int32Array.from(this.operations),
      strings: this.strings,
    };
    this.operations = [];
    this.strings = [];
    return stream;
  }

  private addString(value: string): number {
    const index = this.strings.length;
    this.strings.push(value);
    return index;
  }
}

/** React keeps handlers; C++ needs only whether a node can receive an event. */
export function changedProps(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const key of keys) {
    if (key === "children" || key === "nodeRef") continue;
    if (previous[key] === next[key]) continue;
    const value = next[key];
    if (key.startsWith("on")) {
      patch[key] = typeof value === "function";
    } else {
      patch[key] = value === undefined ? null : value;
    }
  }
  return patch;
}
