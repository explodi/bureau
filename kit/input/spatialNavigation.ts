import {
  getFocusedNode,
  host,
  type HostNode,
  type HostRect,
} from "bureau/host";

type Direction = "up" | "down" | "left" | "right";

export function getNavigableElements(gridId?: string): HostNode[] {
  return host.navigable(gridId);
}

/**
 * Calculate distance between two rectangles in a given direction
 * Returns Infinity if target is not in the correct direction
 */
function getDirectionalDistance(
  fromRect: HostRect,
  toRect: HostRect,
  direction: Direction,
): number {
  const fromCenterX = fromRect.left + fromRect.width / 2;
  const fromCenterY = fromRect.top + fromRect.height / 2;
  const toCenterX = toRect.left + toRect.width / 2;
  const toCenterY = toRect.top + toRect.height / 2;

  const dx = toCenterX - fromCenterX;
  const dy = toCenterY - fromCenterY;

  // Check if target is in the correct direction
  switch (direction) {
    case "up":
      if (dy >= 0) return Infinity; // Target is not above
      break;
    case "down":
      if (dy <= 0) return Infinity; // Target is not below
      break;
    case "left":
      if (dx >= 0) return Infinity; // Target is not to the left
      break;
    case "right":
      if (dx <= 0) return Infinity; // Target is not to the right
      break;
  }

  // Calculate distance with directional bias
  // Prefer elements that are more aligned in the primary axis
  const primaryDistance = Math.abs(
    direction === "up" || direction === "down" ? dy : dx,
  );
  const secondaryDistance = Math.abs(
    direction === "up" || direction === "down" ? dx : dy,
  );

  // Weight primary direction more heavily
  return primaryDistance + secondaryDistance * 0.5;
}

/**
 * Find the closest focusable element in a given direction
 */
export function findClosestInDirection(
  currentElement: HostNode,
  direction: Direction,
  gridId?: string,
): HostNode | null {
  const elements = getNavigableElements(gridId);
  const currentRect = host.measure(currentElement);

  let closestElement: HostNode | null = null;
  let closestDistance = Infinity;

  for (const element of elements) {
    if (element === currentElement) continue;

    const rect = host.measure(element);
    const distance = getDirectionalDistance(currentRect, rect, direction);

    if (distance < closestDistance) {
      closestDistance = distance;
      closestElement = element;
    }
  }

  return closestElement;
}

/**
 * Navigate in a direction from the currently focused element
 * Returns true if navigation succeeded
 */
export function navigateDirection(
  direction: Direction,
  gridId?: string,
): boolean {
  const currentElement = getFocusedNode();

  // Check if current element is navigable
  if (
    !currentElement || !host.isNavigable(currentElement)
  ) {
    // Focus first navigable element
    const elements = getNavigableElements(gridId);
    if (elements[0]) host.focus(elements[0]);
    return elements.length > 0;
  }

  const nextElement = findClosestInDirection(currentElement, direction, gridId);

  if (nextElement) {
    host.focus(nextElement);
    return true;
  }

  return false;
}
