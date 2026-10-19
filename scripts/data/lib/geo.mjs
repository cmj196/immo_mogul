// Geometry helpers: LV95 to WGS84 (swisstopo approximate formula), point in
// polygon, Douglas-Peucker simplification, bounding boxes.

/** swisstopo approximate formula, LV95 (E, N) to WGS84 [lon, lat] in degrees. */
export function lv95ToWgs84(E, N) {
  const y = (E - 2600000) / 1000000;
  const x = (N - 1200000) / 1000000;
  const lon = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y * y * y;
  const lat = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.0140 * x * x * x;
  return [lon * 100 / 36, lat * 100 / 36];
}

/** Ray casting for one linear ring. */
function inRing(pt, ring) {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygonRings(pt, rings) {
  if (!inRing(pt, rings[0])) return false;
  for (let k = 1; k < rings.length; k++) if (inRing(pt, rings[k])) return false;
  return true;
}

/** GeoJSON Polygon or MultiPolygon geometry. */
export function pointInGeometry(pt, geom) {
  if (!geom) return false;
  if (geom.type === 'Polygon') return inPolygonRings(pt, geom.coordinates);
  if (geom.type === 'MultiPolygon') return geom.coordinates.some((rings) => inPolygonRings(pt, rings));
  return false;
}

export function bboxOfCoords(coords, acc = [Infinity, Infinity, -Infinity, -Infinity]) {
  if (typeof coords[0] === 'number') {
    if (coords[0] < acc[0]) acc[0] = coords[0];
    if (coords[1] < acc[1]) acc[1] = coords[1];
    if (coords[0] > acc[2]) acc[2] = coords[0];
    if (coords[1] > acc[3]) acc[3] = coords[1];
  } else {
    for (const c of coords) bboxOfCoords(c, acc);
  }
  return acc;
}

export function inBbox(pt, b) {
  return pt[0] >= b[0] && pt[0] <= b[2] && pt[1] >= b[1] && pt[1] <= b[3];
}

/** Shoelace area (coordinate units squared, sign ignored). */
export function ringArea(ring) {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return Math.abs(s) / 2;
}

/** The largest outer ring of a Polygon or MultiPolygon. */
export function largestOuterRing(geom) {
  if (!geom) return null;
  if (geom.type === 'Polygon') return geom.coordinates[0];
  if (geom.type === 'MultiPolygon') {
    let best = null;
    let bestA = -1;
    for (const rings of geom.coordinates) {
      const a = ringArea(rings[0]);
      if (a > bestA) { bestA = a; best = rings[0]; }
    }
    return best;
  }
  return null;
}

function perpDist(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  const px = a[0] + t * dx;
  const py = a[1] + t * dy;
  return Math.hypot(p[0] - px, p[1] - py);
}

/** Douglas-Peucker on a polyline. Keeps first and last point. */
export function douglasPeucker(points, epsilon) {
  if (points.length <= 2) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpDist(points[i], points[s], points[e]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx !== -1 && maxD > epsilon) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  const out = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
  return out;
}

/**
 * Simplify a closed ring to at most maxPoints (closing point removed).
 * The ring is split at its farthest point from the start so Douglas-Peucker
 * has two anchors, then the tolerance grows until the budget is met.
 */
export function simplifyRing(ring, maxPoints) {
  const pts = ring.slice();
  if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
  if (pts.length <= maxPoints) return pts;
  let far = 1;
  let farD = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
    if (d > farD) { farD = d; far = i; }
  }
  const a = pts.slice(0, far + 1);
  const b = pts.slice(far).concat([pts[0]]);
  let eps = 1e-6;
  for (let iter = 0; iter < 80; iter++) {
    const sa = douglasPeucker(a, eps);
    const sb = douglasPeucker(b, eps);
    const merged = sa.concat(sb.slice(1, -1));
    if (merged.length <= maxPoints) return merged;
    eps *= 1.3;
  }
  const step = pts.length / maxPoints;
  const out = [];
  for (let i = 0; i < maxPoints; i++) out.push(pts[Math.floor(i * step)]);
  return out;
}

export const round6 = (v) => Math.round(v * 1e6) / 1e6;
