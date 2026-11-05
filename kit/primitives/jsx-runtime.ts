import type * as React from "react";
import type {
  BoxProps,
  FieldProps,
  ImageProps,
  LayerProps,
  PlotProps,
  ScrollProps,
  TextProps,
} from "./types.ts";

export { Fragment, jsx, jsxs } from "react/jsx-runtime";

// React's component rules stay the same; only the renderer's host vocabulary changes.
// deno-lint-ignore no-namespace -- TypeScript discovers the JSX contract by namespace.
export namespace JSX {
  export type ElementType = React.JSX.ElementType;
  export type Element = React.JSX.Element;
  export type ElementClass = React.JSX.ElementClass;
  export type ElementAttributesProperty = React.JSX.ElementAttributesProperty;
  export type ElementChildrenAttribute = React.JSX.ElementChildrenAttribute;
  export type LibraryManagedAttributes<C, P> =
    React.JSX.LibraryManagedAttributes<
      C,
      P
    >;
  export type IntrinsicAttributes = React.JSX.IntrinsicAttributes;
  export type IntrinsicClassAttributes<T> = React.JSX.IntrinsicClassAttributes<
    T
  >;
  export interface IntrinsicElements {
    "bureau-box": BoxProps;
    "bureau-text": TextProps;
    "bureau-image": ImageProps;
    "bureau-scroll": ScrollProps;
    "bureau-field": FieldProps;
    "bureau-plot": PlotProps;
    "bureau-layer": LayerProps;
  }
}
