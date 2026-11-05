import { createContext, createElement, useContext } from "react";
import type {
  BoxProps,
  FieldProps,
  ImageProps,
  LayerProps,
  PlotProps,
  ScrollProps,
  TextProps,
  TypeStyle,
} from "./types.ts";

export type * from "./types.ts";

export function Box(props: BoxProps) {
  const box = createElement("bureau-box", props);
  if (!props.typeStyle) return box;
  return createElement(TextStyle.Provider, { value: props.typeStyle }, box);
}
const TextStyle = createContext<TypeStyle | null>(null);
/** The type style of the Text this sits in, or null outside one. */
export function useInheritedTypeStyle(): TypeStyle | null {
  return useContext(TextStyle);
}
export function Text(props: TextProps) {
  const inherited = useContext(TextStyle);
  return createElement(
    TextStyle.Provider,
    { value: props.typeStyle ?? inherited ?? "text" },
    createElement<TextProps>("bureau-text", props),
  );
}
export const Image = (props: ImageProps) =>
  createElement("bureau-image", props);
// A header is React's to render: it crosses as the Scroll's first child,
// which the view holds at the top as the content moves under it.
export function Scroll({ header, children, ...props }: ScrollProps) {
  const top = header === undefined ? null : createElement(
    "bureau-box",
    { direction: "column", shrink: 0, __scrollHeader: true },
    header,
  );
  return createElement("bureau-scroll", props, top, children);
}
export const Field = (props: FieldProps) =>
  createElement("bureau-field", props);
export const Plot = (props: PlotProps) => createElement("bureau-plot", props);
export const Layer = (props: LayerProps) =>
  createElement("bureau-layer", props);
