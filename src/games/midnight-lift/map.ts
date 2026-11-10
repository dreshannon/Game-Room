// The market district: a 5×5 grid of street corners with blocks between them. Each stretch of
// street between two corners has two doorways. The thief and the couriers move between doorways,
// and the wardens move between corners.

export const ROWS = 5
export const COLS = 5
/** Distance between corners on the drawn map. */
export const SPACING = 90
export const MARGIN = 22
export const MAP_SIZE = MARGIN * 2 + SPACING * (COLS - 1)

export interface Corner {
  id: number
  row: number
  col: number
  x: number
  y: number
  /** Corners one street away. */
  links: number[]
  /** The doorway nearest this corner on each street that meets here. */
  doorways: number[]
}

export interface Street {
  key: string
  /** The corners at each end. */
  ends: [number, number]
  /** Its two doorways, the first nearest `ends[0]`. */
  doorways: [number, number]
}

export interface Link {
  to: number
  /** The corner this step goes around, or null for a step along the same street. */
  via: number | null
}

export interface Doorway {
  id: number
  street: number
  x: number
  y: number
  /** The corner this doorway is nearest. */
  corner: number
  links: Link[]
  /** The blocks it opens onto, for rooftop moves. */
  blocks: number[]
}

/** Streets left out to make a few bigger blocks, like a market square. */
const CLOSED = new Set(['v0,1', 'v1,2', 'h2,3', 'h3,1'])

/** Corners where wardens can be posted on the first night. */
export const POST_CORNERS = [2, 6, 8, 10, 12, 14, 16, 18, 22]

const cornerId = (row: number, col: number) => row * COLS + col

function build() {
  const corners: Corner[] = []
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      corners.push({
        id: cornerId(row, col),
        row,
        col,
        x: MARGIN + col * SPACING,
        y: MARGIN + row * SPACING,
        links: [],
        doorways: [],
      })
    }
  }

  // Blocks are the cells between corners, joined where a street is closed.
  const cellOf = (row: number, col: number) => row * (COLS - 1) + col
  const parent = Array.from({ length: (ROWS - 1) * (COLS - 1) }, (_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)))
  const join = (a: number, b: number) => (parent[find(a)] = find(b))

  const streets: Street[] = []
  const doorways: Doorway[] = []
  /** The cells on each side of a street, for working out blocks. */
  const sides: number[][] = []

  const addStreet = (key: string, a: number, b: number, cells: number[]) => {
    if (CLOSED.has(key)) {
      if (cells.length === 2) join(cells[0]!, cells[1]!)
      return
    }
    const street = streets.length
    const first = doorways.length
    const [ca, cb] = [corners[a]!, corners[b]!]
    for (const [k, near] of [
      [0, a],
      [1, b],
    ] as const) {
      const t = (k + 1) / 3
      doorways.push({
        id: first + k,
        street,
        x: ca.x + (cb.x - ca.x) * t,
        y: ca.y + (cb.y - ca.y) * t,
        corner: near,
        links: [],
        blocks: [],
      })
    }
    streets.push({ key, ends: [a, b], doorways: [first, first + 1] })
    sides.push(cells)
    ca.links.push(b)
    cb.links.push(a)
    ca.doorways.push(first)
    cb.doorways.push(first + 1)
  }

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS - 1; col++) {
      const cells = [row - 1, row].filter((r) => r >= 0 && r < ROWS - 1).map((r) => cellOf(r, col))
      addStreet(`h${row},${col}`, cornerId(row, col), cornerId(row, col + 1), cells)
    }
  }
  for (let row = 0; row < ROWS - 1; row++) {
    for (let col = 0; col < COLS; col++) {
      const cells = [col - 1, col].filter((c) => c >= 0 && c < COLS - 1).map((c) => cellOf(row, c))
      addStreet(`v${row},${col}`, cornerId(row, col), cornerId(row + 1, col), cells)
    }
  }

  // Number the joined blocks from 0.
  const roots = [...new Set(parent.map((_, i) => find(i)))]
  streets.forEach((street, s) => {
    const blocks = sides[s]!.map((cell) => roots.indexOf(find(cell)))
    for (const d of street.doorways) doorways[d]!.blocks = blocks
  })

  // Steps: along the street to the other doorway, or around the near corner to another street.
  for (const street of streets) {
    const [a, b] = street.doorways
    doorways[a]!.links.push({ to: b, via: null })
    doorways[b]!.links.push({ to: a, via: null })
  }
  for (const corner of corners) {
    for (const from of corner.doorways) {
      for (const to of corner.doorways) {
        if (from !== to) doorways[from]!.links.push({ to, via: corner.id })
      }
    }
  }

  // Each block's outline, for drawing.
  const cells = Array.from({ length: (ROWS - 1) * (COLS - 1) }, (_, i) => ({
    row: Math.floor(i / (COLS - 1)),
    col: i % (COLS - 1),
    block: roots.indexOf(find(i)),
  }))

  return { corners, streets, doorways, cells, closed: [...CLOSED] }
}

export const MAP = build()
export const { corners: CORNERS, streets: STREETS, doorways: DOORWAYS } = MAP

const doorwayAt = (streetKey: string, k: 0 | 1) => {
  const street = STREETS.find((s) => s.key === streetKey)
  if (!street) throw new Error(`No street ${streetKey}`)
  return street.doorways[k]
}

/** Where couriers can start the night. */
export const START_SPOTS = (
  [
    ['h1,0', 1],
    ['h1,3', 0],
    ['v1,1', 0],
    ['v1,3', 1],
    ['h2,1', 1],
    ['h2,2', 0],
    ['v2,0', 1],
    ['v2,4', 0],
    ['h3,0', 0],
    ['h3,2', 1],
    ['v0,2', 0],
    ['v3,2', 1],
  ] as const
).map(([key, k]) => doorwayAt(key, k))

/** Corners a warden can reach in up to `steps` moves along the streets, not counting where it is. */
export function cornersWithin(from: number, steps: number): number[] {
  const seen = new Set([from])
  let edge = [from]
  for (let i = 0; i < steps; i++) {
    const next: number[] = []
    for (const c of edge) {
      for (const n of CORNERS[c]!.links) {
        if (!seen.has(n)) {
          seen.add(n)
          next.push(n)
        }
      }
    }
    edge = next
  }
  seen.delete(from)
  return [...seen]
}

/** Doorways one step away, leaving out steps around a blocked corner. */
export const stepsFrom = (from: number, blocked: Iterable<number> = []) => {
  const block = new Set(blocked)
  return DOORWAYS[from]!.links.filter((link) => link.via === null || !block.has(link.via)).map((link) => link.to)
}

/** Every doorway sharing a block with this one. */
export const rooftopsFrom = (from: number) => {
  const blocks = DOORWAYS[from]!.blocks
  return DOORWAYS.filter((d) => d.id !== from && d.blocks.some((b) => blocks.includes(b))).map((d) => d.id)
}

/** Whether a doorway is right by a corner, so a warden there can search it. */
export const isBeside = (corner: number, doorway: number) => CORNERS[corner]!.doorways.includes(doorway)
