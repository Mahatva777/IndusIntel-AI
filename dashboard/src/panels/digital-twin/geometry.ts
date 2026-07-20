export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Given two rectangles, returns the points on their perimeters where the line connecting their centers intersects.
 * This naturally ensures that multiple edges fan out from the perimeter instead of bunching at corners.
 */
export function getPerimeterConnectionPoints(rectA: Rect, rectB: Rect): { pointA: Point; pointB: Point } {
  const centerA = { x: rectA.x + rectA.width / 2, y: rectA.y + rectA.height / 2 };
  const centerB = { x: rectB.x + rectB.width / 2, y: rectB.y + rectB.height / 2 };

  const pointA = getRectIntersection(rectA, centerA, centerB);
  const pointB = getRectIntersection(rectB, centerB, centerA);

  return { pointA, pointB };
}

/**
 * Computes where a ray from the center of a rectangle towards a target point intersects the rectangle's perimeter.
 */
function getRectIntersection(rect: Rect, center: Point, target: Point): Point {
  const dx = target.x - center.x;
  const dy = target.y - center.y;

  if (dx === 0 && dy === 0) return center;

  const hw = rect.width / 2;
  const hh = rect.height / 2;

  const scaleX = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? hh / Math.abs(dy) : Infinity;

  const scale = Math.min(scaleX, scaleY);

  return {
    x: center.x + dx * scale,
    y: center.y + dy * scale
  };
}
