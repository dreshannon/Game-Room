// The geometry of the canal: channel pieces, how they join, and how lanterns drift along them.
//
// Each square has 8 openings, two per side, numbered clockwise from the top left:
//   top 0 1, right 2 3, bottom 4 5, left 6 7.
// A piece joins the 8 openings in 4 pairs. Turning a piece a quarter clockwise moves opening p to p + 2.

/** For each opening, the opening it meets on the neighbouring square. */
export const FACING = [5, 4, 7, 6, 1, 0, 3, 2] as const
/** Which side each opening is on: 0 top, 1 right, 2 bottom, 3 left. */
export const sideOf = (p: number) => Math.floor(p / 2)
const STEP: [number, number][] = [
  [-1, 0],
  [0, 1],
  [1, 0],
  [0, -1],
]

/** Every way to join 8 openings in pairs, one of each up to turning: 35 in all. */
export const PATTERNS: number[][] = (() => {
  const all: number[][] = []
  const build = (pairs: number[]) => {
    const free = pairs.indexOf(-1)
    if (free === -1) return all.push([...pairs])
    for (let other = free + 1; other < 8; other++) {
      if (pairs[other] !== -1) continue
      pairs[free] = other
      pairs[other] = free
      build(pairs)
      pairs[free] = -1
      pairs[other] = -1
    }
  }
  build(Array(8).fill(-1))
  const seen = new Set<string>()
  const unique: number[][] = []
  for (const pairs of all) {
    const keys = [0, 1, 2, 3].map((turns) => turn(pairs, turns).join())
    if (keys.some((k) => seen.has(k))) continue
    seen.add(keys[0]!)
    unique.push(pairs)
  }
  return unique
})()

/** The pairs of a piece turned a quarter clockwise `turns` times. */
export function turn(pairs: readonly number[], turns: number): number[] {
  const shift = (((turns % 4) + 4) % 4) * 2
  const out = Array(8).fill(0)
  pairs.forEach((partner, p) => (out[(p + shift) % 8] = (partner + shift) % 8))
  return out
}

/** A lantern waits at opening `p` of square (r, c), about to drift into it. */
export interface Spot {
  r: number
  c: number
  p: number
}

/** One channel a lantern drifted along: on square `sq`, from opening `a` to `b`. */
export interface Segment {
  sq: number
  a: number
  b: number
}

/** The board: for each square, row by row, the pairs of the piece on it, or null. */
export type Board = (number[] | null)[]

export const onBoard = (size: number, r: number, c: number) => r >= 0 && c >= 0 && r < size && c < size

/** The same point seen from either square it sits between. */
export function pointKey(size: number, s: Spot) {
  const side = sideOf(s.p)
  const r = s.r + STEP[side]![0]
  const c = s.c + STEP[side]![1]
  if (!onBoard(size, r, c)) return `${s.r},${s.c},${s.p}`
  const a = s.r * size + s.c
  const b = r * size + c
  return a < b ? `${s.r},${s.c},${s.p}` : `${r},${c},${FACING[s.p]}`
}

/** The openings on the wall, clockwise from the top left corner. There are 8 per row of squares. */
export function wallSpots(size: number): Spot[] {
  const spots: Spot[] = []
  for (let c = 0; c < size; c++) spots.push({ r: 0, c, p: 0 }, { r: 0, c, p: 1 })
  for (let r = 0; r < size; r++) spots.push({ r, c: size - 1, p: 2 }, { r, c: size - 1, p: 3 })
  for (let c = size - 1; c >= 0; c--) spots.push({ r: size - 1, c, p: 4 }, { r: size - 1, c, p: 5 })
  for (let r = size - 1; r >= 0; r--) spots.push({ r, c: 0, p: 6 }, { r, c: 0, p: 7 })
  return spots
}

export interface DriftOutcome {
  /** Where the lantern ends up, or null if it went out. */
  spot: Spot | null
  /** Channels drifted along this move. */
  trail: Segment[]
  out: 'wall' | 'crash' | null
}

/**
 * Drifts every lantern waiting at square `sq`, which has just had a piece put on it.
 * Lanterns that touch the wall go out. Lanterns that meet on a channel both go out.
 * Returns an outcome for every lantern that moved or went out.
 */
export function drift(
  board: Board,
  size: number,
  lanterns: { id: string; spot: Spot }[],
  sq: number,
): Map<string, DriftOutcome> {
  const at = new Map<string, string>()
  for (const l of lanterns) at.set(pointKey(size, l.spot), l.id)
  const outcomes = new Map<string, DriftOutcome>()

  for (const lantern of lanterns) {
    if (lantern.spot.r * size + lantern.spot.c !== sq) continue
    let { r, c, p } = lantern.spot
    const trail: Segment[] = []
    let result: DriftOutcome | null = null
    // Each channel can only be used once, so this always ends.
    for (let guard = 0; guard < board.length * 4 + 1 && !result; guard++) {
      const here = r * size + c
      const pairs = board[here]
      if (!pairs) {
        result = { spot: { r, c, p }, trail, out: null }
        break
      }
      const exit = pairs[p]!
      trail.push({ sq: here, a: p, b: exit })
      const met = at.get(pointKey(size, { r, c, p: exit }))
      if (met !== undefined && met !== lantern.id) {
        result = { spot: null, trail, out: 'crash' }
        const theirs = outcomes.get(met)
        if (!theirs) outcomes.set(met, { spot: null, trail: [], out: 'crash' })
        else if (!theirs.out) outcomes.set(met, { ...theirs, spot: null, out: 'crash' })
        break
      }
      const side = sideOf(exit)
      const nr = r + STEP[side]![0]
      const nc = c + STEP[side]![1]
      if (!onBoard(size, nr, nc)) {
        result = { spot: null, trail, out: 'wall' }
        break
      }
      r = nr
      c = nc
      p = FACING[exit]!
    }
    const previous = outcomes.get(lantern.id)
    // Someone already ran into this lantern: it still drifts, but it's out.
    outcomes.set(lantern.id, previous?.out === 'crash' ? { ...result!, spot: null, out: 'crash' } : result!)
  }
  return outcomes
}
