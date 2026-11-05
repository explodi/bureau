/** React's seven host elements, committed as one stream per mutation commit. */
import Reconciler from "react-reconciler";
import {
  ConcurrentRoot,
  DefaultEventPriority,
  DiscreteEventPriority,
  NoEventPriority,
} from "react-reconciler/constants.js";
import type { ReactNode } from "react";
import { platform } from "platform";
import { changedProps, type MutationStream, MutationWriter } from "./ops.ts";

type Props = Record<string, unknown>;
/** A host node as JavaScript holds it: what nodeRef hands a program. */
export type NativeNode = {
  id: number;
  type: string;
  props: Props;
  text: string;
  children: NativeNode[];
  attached: boolean;
};
type Node = NativeNode;
type Container = { id: 0; children: Node[] };
type NodeRef = (node: Node | null) => void;

/** Every node on screen, by the id the native host knows it by. */
const nodesById = new Map<number, Node>();

/** The node an id names, for the host's answers (host.ts). */
export function nativeNode(id: number): NativeNode | null {
  return nodesById.get(id) ?? null;
}

/** The committed tree, for the native interface bench's scene selectors. */
export function nativeNodes(): readonly NativeNode[] {
  return [...nodesById.values()];
}

export interface NativeRoot {
  render(element: ReactNode): void;
  renderSync(element: ReactNode): void;
  dispatch(id: number, handler: string, ...args: unknown[]): unknown;
}

function removeFrom(children: Node[], child: Node) {
  const index = children.indexOf(child);
  if (index >= 0) children.splice(index, 1);
}

export function createNativeRoot(
  commit: (stream: MutationStream) => void,
  onUncaughtError: (error: unknown) => void = (error) => {
    throw error;
  },
): NativeRoot {
  const container: Container = { id: 0, children: [] };
  const writer = new MutationWriter();
  const attachedNodes = nodesById;
  // nodeRef is the primitives' ref: called once the commit's mutations are
  // in, as React calls any ref after its mutation phase.
  let refCalls: Array<[NodeRef, Node | null]> = [];
  const refOf = (props: Props) =>
    typeof props.nodeRef === "function" ? props.nodeRef as NodeRef : null;
  let nextId = 1;
  const freeIds: number[] = [];
  let updatePriority: number = NoEventPriority;

  const allocateId = () => freeIds.pop() ?? nextId++;

  // Render can be abandoned before commit. Emit a subtree only when React
  // attaches it to the committed tree.
  const attach = (node: Node) => {
    if (node.attached) return;
    node.attached = true;
    attachedNodes.set(node.id, node);
    const ref = refOf(node.props);
    if (ref) refCalls.push([ref, node]);
    if (node.type === "#text") writer.text(node.id, node.text);
    else {
      writer.create(node.id, node.type);
      const props = changedProps({}, node.props);
      if (Object.keys(props).length > 0) writer.props(node.id, props);
    }
    for (const child of node.children) {
      attach(child);
      writer.append(node.id, child.id);
    }
  };

  const destroy = (node: Node) => {
    for (const child of node.children) destroy(child);
    if (node.attached) {
      writer.destroy(node.id);
      attachedNodes.delete(node.id);
      freeIds.push(node.id);
      const ref = refOf(node.props);
      if (ref) refCalls.push([ref, null]);
    }
    node.attached = false;
  };

  const append = (parent: Node | Container, child: Node) => {
    removeFrom(parent.children, child);
    parent.children.push(child);
    if (parent.id === 0 || (parent as Node).attached) {
      attach(child);
      writer.append(parent.id, child.id);
    }
  };

  const insert = (parent: Node | Container, child: Node, before: Node) => {
    removeFrom(parent.children, child);
    parent.children.splice(parent.children.indexOf(before), 0, child);
    if (parent.id === 0 || (parent as Node).attached) {
      attach(child);
      writer.insert(parent.id, child.id, before.id);
    }
  };

  const remove = (parent: Node | Container, child: Node) => {
    removeFrom(parent.children, child);
    if (child.attached) {
      writer.remove(parent.id, child.id);
      destroy(child);
    }
  };

  const reconciler = Reconciler({
    supportsMutation: true,
    supportsPersistence: false,
    supportsHydration: false,
    isPrimaryRenderer: true,
    rendererVersion: "0.0.0",
    rendererPackageName: "bureau",
    extraDevToolsConfig: null,
    noTimeout: -1,
    scheduleTimeout: (callback, delay) =>
      platform.timers.setTimeout(callback, delay),
    cancelTimeout: (id) => platform.timers.clearTimeout(id),
    supportsMicrotasks: true,
    scheduleMicrotask: (callback) => queueMicrotask(callback),

    createInstance(type: string, props: Props) {
      return {
        id: allocateId(),
        type,
        props,
        text: "",
        children: [],
        attached: false,
      };
    },
    createTextInstance(text: string) {
      return {
        id: allocateId(),
        type: "#text",
        props: {},
        text,
        children: [],
        attached: false,
      };
    },
    appendInitialChild(parent: Node, child: Node) {
      parent.children.push(child);
    },
    appendChild: append,
    appendChildToContainer: append,
    insertBefore: insert,
    insertInContainerBefore: insert,
    removeChild: remove,
    removeChildFromContainer: remove,
    detachDeletedInstance() {},
    commitUpdate(node: Node, _type, oldProps: Props, newProps: Props) {
      node.props = newProps;
      const before = refOf(oldProps);
      const after = refOf(newProps);
      if (node.attached && before !== after) {
        if (before) refCalls.push([before, null]);
        if (after) refCalls.push([after, node]);
      }
      const patch = changedProps(oldProps, newProps);
      if (node.attached && Object.keys(patch).length > 0) {
        writer.props(node.id, patch);
      }
    },
    commitTextUpdate(node: Node, _old, text) {
      node.text = text;
      if (node.attached) writer.text(node.id, text);
    },
    // Suspense's hiding, apart from the `hidden` an Access prop means.
    hideInstance(node: Node) {
      if (node.attached) writer.props(node.id, { __hidden: true });
    },
    unhideInstance(node: Node) {
      if (node.attached) writer.props(node.id, { __hidden: false });
    },
    hideTextInstance(node: Node) {
      if (node.attached) writer.props(node.id, { __hidden: true });
    },
    unhideTextInstance(node: Node) {
      if (node.attached) writer.props(node.id, { __hidden: false });
    },
    clearContainer(root: Container) {
      for (const child of [...root.children]) remove(root, child);
    },
    resetTextContent() {},
    commitMount() {},

    finalizeInitialChildren: () => false,
    shouldSetTextContent: () => false,
    getRootHostContext: () => ({}),
    getChildHostContext: (parent) => parent,
    getPublicInstance: (node) => node,
    prepareForCommit: () => null,
    resetAfterCommit() {
      const stream = writer.take();
      if (stream.operations.length > 0) commit(stream);
      const calls = refCalls;
      refCalls = [];
      for (const [ref, node] of calls) ref(node);
    },
    preparePortalMount() {},

    setCurrentUpdatePriority(priority) {
      updatePriority = priority;
    },
    getCurrentUpdatePriority: () => updatePriority,
    resolveUpdatePriority: () =>
      updatePriority === NoEventPriority
        ? DefaultEventPriority
        : updatePriority,
    resolveEventType: () => null,
    resolveEventTimeStamp: () => -1.1,
    shouldAttemptEagerTransition: () => false,
    trackSchedulerEvent() {},
    requestPostPaintCallback() {},

    maySuspendCommit: () => false,
    maySuspendCommitOnUpdate: () => false,
    maySuspendCommitInSyncRender: () => false,
    preloadInstance: () => true,
    startSuspendingCommit: () => null,
    suspendInstance() {},
    suspendOnActiveViewTransition() {},
    waitForCommitToBeReady: () => null,
    getSuspendedCommitReason: () => null,

    NotPendingTransition: null,
    HostTransitionContext: {
      $$typeof: Symbol.for("react.context"),
      Provider: null,
      Consumer: null,
      _currentValue: null,
      _currentValue2: null,
      _threadCount: 0,
    } as never,
    resetFormInstance() {},
    bindToConsole: (methodName, args) => {
      const method = (console as unknown as Record<string, () => void>)[
        methodName
      ]!;
      return method.bind(console, ...(args as []));
    },

    getInstanceFromNode: () => null,
    beforeActiveInstanceBlur() {},
    afterActiveInstanceBlur() {},
    prepareScopeUpdate() {},
    getInstanceFromScope: () => null,
  });

  const root = reconciler.createContainer(
    container,
    ConcurrentRoot,
    null,
    false,
    null,
    "",
    onUncaughtError,
    () => {},
    () => {},
    () => {},
    null,
  );

  return {
    render(element) {
      reconciler.updateContainer(element, root, null, null);
    },
    renderSync(element) {
      reconciler.updateContainerSync(element, root, null, null);
      reconciler.flushSyncWork();
    },
    dispatch(id, handler, ...args) {
      const callback = attachedNodes.get(id)?.props[handler];
      if (typeof callback !== "function") return undefined;
      const previousPriority = updatePriority;
      updatePriority = DiscreteEventPriority;
      try {
        return callback(...args);
      } finally {
        updatePriority = previousPriority;
      }
    },
  };
}
