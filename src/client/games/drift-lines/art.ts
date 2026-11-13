// Drawing helpers for Drift Lines. A square is 100 units across.
import { sideOf } from '../../../games/drift-lines/paths'

export const SQUARE = 100
const OPENINGS: [number, number][] = [
  [33, 0],
  [67, 0],
  [100, 33],
  [100, 67],
  [67, 100],
  [33, 100],
  [0, 67],
  [0, 33],
]
const INWARD: [number, number][] = [
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 0],
]

export const opening = (p: number, x = 0, y = 0): [number, number] => [x + OPENINGS[p]![0], y + OPENINGS[p]![1]]

/** A smooth channel from opening `a` to opening `b` of a square whose top left is (x, y). */
export function channel(a: number, b: number, x = 0, y = 0) {
  const [ax, ay] = opening(a, x, y)
  const [bx, by] = opening(b, x, y)
  const same = sideOf(a) === sideOf(b)
  const k = same ? 34 : 42
  const na = INWARD[sideOf(a)]!
  const nb = INWARD[sideOf(b)]!
  return `M${ax} ${ay} C${ax + na[0] * k} ${ay + na[1] * k} ${bx + nb[0] * k} ${by + nb[1] * k} ${bx} ${by}`
}

/** The four channels of a piece, one per pair. */
export function channels(pairs: readonly number[], x = 0, y = 0) {
  const out: { key: string; d: string }[] = []
  pairs.forEach((partner, p) => {
    if (p < partner) out.push({ key: `${p}-${partner}`, d: channel(p, partner, x, y) })
  })
  return out
}
