/**
 * Track shapes for Overheat. The rules only need each track's space count and corners,
 * but those come from the same geometry the client draws, so it lives here and stays pure.
 */

export type Point = [number, number]

export interface CornerDef {
  /** The control point at the corner's apex, where its line goes. */
  point: number
  limit: number
}

export interface TrackDef {
  id: number
  name: string
  laps: number
  spaces: number
  /** A closed loop, driven in order. The finish line is at point 0. */
  points: Point[]
  corners: CornerDef[]
  scenery: { grass: string; infield: string; tree: string }
}

export interface Corner {
  /** The corner line sits just before this space. */
  space: number
  limit: number
}

export interface PathPoint {
  x: number
  y: number
  /** Unit direction of travel. */
  tx: number
  ty: number
}

export interface TrackLayout {
  def: TrackDef
  /** Dense points along the centre of the track. */
  path: Point[]
  /** Distance along the path at each dense point. */
  distances: number[]
  length: number
  spaceLength: number
  corners: Corner[]
  /** +1 when the inside of the loop is to the driver's left, -1 when it's to their right. */
  insideSide: 1 | -1
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
}

/** The drivable width of the track, in the same units as the points. Two cars fit side by side. */
export const TRACK_WIDTH = 54

export const TRACKS: TrackDef[] = [
  {
    id: 0,
    name: 'Sunset Oval',
    laps: 1,
    spaces: 72,
    points: [
      [520, 560],
      [760, 560],
      [910, 510],
      [975, 360],
      [910, 210],
      [760, 150],
      [600, 175],
      [470, 135],
      [300, 140],
      [150, 210],
      [80, 360],
      [140, 500],
      [300, 560],
    ],
    corners: [
      { point: 3, limit: 5 },
      { point: 7, limit: 7 },
      { point: 10, limit: 4 },
    ],
    scenery: { grass: '#c9a86a', infield: '#d8bb7f', tree: '#7d8f3a' },
  },
  {
    id: 1,
    name: 'Pine Ridge',
    laps: 2,
    spaces: 52,
    points: [
      [330, 580],
      [620, 580],
      [810, 555],
      [895, 455],
      [835, 350],
      [670, 330],
      [585, 255],
      [625, 140],
      [520, 65],
      [330, 80],
      [180, 140],
      [95, 290],
      [110, 455],
      [190, 560],
    ],
    corners: [
      { point: 3, limit: 3 },
      { point: 7, limit: 5 },
      { point: 10, limit: 4 },
      { point: 12, limit: 6 },
    ],
    scenery: { grass: '#4f8a46', infield: '#5b9a50', tree: '#2c5a2c' },
  },
  {
    id: 2,
    name: 'Old Harbor',
    laps: 3,
    spaces: 40,
    points: [
      [400, 520],
      [590, 520],
      [700, 460],
      [710, 345],
      [600, 300],
      [575, 215],
      [670, 135],
      [600, 50],
      [420, 55],
      [270, 120],
      [310, 245],
      [215, 330],
      [150, 440],
      [235, 520],
    ],
    corners: [
      { point: 2, limit: 4 },
      { point: 4, limit: 2 },
      { point: 7, limit: 5 },
      { point: 9, limit: 3 },
      { point: 12, limit: 6 },
    ],
    scenery: { grass: '#6f8d8f', infield: '#7f9c9c', tree: '#3d5f5c' },
  },
]

export const getTrack = (id: number) => TRACKS.find((track) => track.id === id) ?? TRACKS[0]!

const SAMPLES_PER_SEGMENT = 48

/** A centripetal Catmull–Rom spline through every point, closed back to the start. */
function sampleLoop(points: Point[]): Point[] {
  const out: Point[] = []
  const n = points.length
  const at = (i: number) => points[((i % n) + n) % n]!
  const knot = (t: number, a: Point, b: Point) => t + Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1]))

  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1)
    const p1 = at(i)
    const p2 = at(i + 1)
    const p3 = at(i + 2)
    const t0 = 0
    const t1 = knot(t0, p0, p1)
    const t2 = knot(t1, p1, p2)
    const t3 = knot(t2, p2, p3)
    for (let s = 0; s < SAMPLES_PER_SEGMENT; s++) {
      const t = t1 + ((t2 - t1) * s) / SAMPLES_PER_SEGMENT
      const lerp = (a: Point, b: Point, ta: number, tb: number): Point => {
        const wa = (tb - t) / (tb - ta)
        const wb = (t - ta) / (tb - ta)
        return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb]
      }
      const a1 = lerp(p0, p1, t0, t1)
      const a2 = lerp(p1, p2, t1, t2)
      const a3 = lerp(p2, p3, t2, t3)
      const b1 = lerp(a1, a2, t0, t2)
      const b2 = lerp(a2, a3, t1, t3)
      out.push(lerp(b1, b2, t1, t2))
    }
  }
  return out
}

const layouts = new Map<number, TrackLayout>()

export function layoutTrack(def: TrackDef): TrackLayout {
  const cached = layouts.get(def.id)
  if (cached) return cached

  const path = sampleLoop(def.points)
  const distances = [0]
  for (let i = 1; i <= path.length; i++) {
    const a = path[i - 1]!
    const b = path[i % path.length]!
    distances.push(distances[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1]))
  }
  const length = distances[path.length]!
  const spaceLength = length / def.spaces

  // The shoelace sum is negative when the loop runs counterclockwise on screen (y points down).
  let area = 0
  path.forEach((a, i) => {
    const b = path[(i + 1) % path.length]!
    area += a[0] * b[1] - b[0] * a[1]
  })

  const corners = def.corners
    .map((corner) => {
      const distance = distances[corner.point * SAMPLES_PER_SEGMENT]!
      return { space: Math.round(distance / spaceLength) % def.spaces, limit: corner.limit }
    })
    .sort((a, b) => a.space - b.space)

  const xs = path.map((p) => p[0])
  const ys = path.map((p) => p[1])
  const layout: TrackLayout = {
    def,
    path,
    distances,
    length,
    spaceLength,
    corners,
    insideSide: area < 0 ? 1 : -1,
    bounds: { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) },
  }
  layouts.set(def.id, layout)
  return layout
}

/** The point and direction at a distance along the track, wrapping around laps. */
export function pointAlong(layout: TrackLayout, distance: number): PathPoint {
  const { path, distances, length } = layout
  const d = ((distance % length) + length) % length
  // Binary search for the dense segment holding d.
  let lo = 0
  let hi = path.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (distances[mid]! <= d) lo = mid
    else hi = mid - 1
  }
  const a = path[lo]!
  const b = path[(lo + 1) % path.length]!
  const segment = distances[lo + 1]! - distances[lo]! || 1
  const f = (d - distances[lo]!) / segment
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy) || 1
  return { x: a[0] + dx * f, y: a[1] + dy * f, tx: dx / len, ty: dy / len }
}

/** Corner limits by space, for the rules. */
export function cornersOf(trackId: number): Corner[] {
  return layoutTrack(getTrack(trackId)).corners
}
