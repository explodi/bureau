import { Children, isValidElement, type ReactNode } from "react";

/**
 * Whether a key's content is pictures only (an Image, a kit icon component)
 * and no words. Such a key is drawn square whatever its variant,
 * so a program cannot forget to ask for it.
 */
export function holdsOnlyIcons(
  children: ReactNode,
  iconTypes: ReadonlySet<unknown>,
): boolean {
  const parts = Children.toArray(children);
  if (parts.length === 0) return false;
  return parts.every((part) =>
    isValidElement(part) && iconTypes.has(part.type)
  );
}
