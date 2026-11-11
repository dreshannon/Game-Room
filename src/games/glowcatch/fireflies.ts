/** What a roll needs to catch a firefly, on top of its smallest total. */
export type Need =
  | { kind: 'total' }
  | { kind: 'atMost'; total: number }
  | { kind: 'set'; size: number }
  | { kind: 'twoPairs' }
  | { kind: 'run'; length: number }
  | { kind: 'distinct'; count: number }
  | { kind: 'has'; values: number[] }
  | { kind: 'high'; value: number }
  | { kind: 'allOdd'; min: number }
  | { kind: 'allEven'; min: number }

/** Something that happens the moment a firefly appears. */
export type Flicker = 'swarm' | 'gift' | 'breeze'

export interface FireflyDesign {
  name: string
  points: number
  /** The roll's total must be at least this. */
  minTotal: number
  need: Need
  flicker: Flicker | null
  /** How often it shows up, against the others. */
  weight: number
}

export const DESIGNS: FireflyDesign[] = [
  { name: 'Pip', points: 1, minTotal: 6, need: { kind: 'total' }, flicker: 'swarm', weight: 6 },
  { name: 'Spark', points: 2, minTotal: 11, need: { kind: 'total' }, flicker: null, weight: 6 },
  { name: 'Blaze', points: 3, minTotal: 17, need: { kind: 'total' }, flicker: 'gift', weight: 5 },
  { name: 'Bonfire', points: 5, minTotal: 25, need: { kind: 'total' }, flicker: null, weight: 3 },
  { name: 'Starfall', points: 7, minTotal: 34, need: { kind: 'total' }, flicker: null, weight: 2 },
  { name: 'Dimwick', points: 2, minTotal: 0, need: { kind: 'atMost', total: 3 }, flicker: null, weight: 4 },
  { name: 'Twinkle', points: 2, minTotal: 0, need: { kind: 'set', size: 2 }, flicker: 'breeze', weight: 6 },
  { name: 'Twin Glow', points: 3, minTotal: 14, need: { kind: 'set', size: 2 }, flicker: null, weight: 4 },
  { name: 'Triplet', points: 4, minTotal: 0, need: { kind: 'set', size: 3 }, flicker: null, weight: 4 },
  { name: 'Quartet', points: 7, minTotal: 0, need: { kind: 'set', size: 4 }, flicker: null, weight: 2 },
  { name: 'Double Wink', points: 4, minTotal: 0, need: { kind: 'twoPairs' }, flicker: 'gift', weight: 4 },
  { name: 'Ladder', points: 3, minTotal: 0, need: { kind: 'run', length: 3 }, flicker: 'swarm', weight: 5 },
  { name: 'Tall Ladder', points: 5, minTotal: 0, need: { kind: 'run', length: 4 }, flicker: null, weight: 3 },
  { name: 'Comet Tail', points: 7, minTotal: 0, need: { kind: 'run', length: 5 }, flicker: null, weight: 2 },
  { name: 'Rainbow', points: 3, minTotal: 0, need: { kind: 'distinct', count: 4 }, flicker: null, weight: 4 },
  { name: 'Prism', points: 5, minTotal: 0, need: { kind: 'distinct', count: 5 }, flicker: null, weight: 3 },
  { name: 'Moonwink', points: 2, minTotal: 0, need: { kind: 'has', values: [1, 6] }, flicker: null, weight: 4 },
  { name: 'Lucky Seven', points: 3, minTotal: 0, need: { kind: 'has', values: [7] }, flicker: null, weight: 3 },
  { name: 'Night Owl', points: 3, minTotal: 0, need: { kind: 'high', value: 15 }, flicker: 'breeze', weight: 3 },
  { name: 'Odd Lot', points: 3, minTotal: 0, need: { kind: 'allOdd', min: 3 }, flicker: null, weight: 3 },
  { name: 'Even Keel', points: 3, minTotal: 0, need: { kind: 'allEven', min: 3 }, flicker: null, weight: 3 },
]

const counts = (values: number[]) => {
  const out = new Map<number, number>()
  for (const v of values) out.set(v, (out.get(v) ?? 0) + 1)
  return [...out.values()]
}

function longestRun(values: number[]) {
  const sorted = [...new Set(values)].sort((a, b) => a - b)
  let best = 0
  let run = 0
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && sorted[i] === sorted[i - 1]! + 1 ? run + 1 : 1
    best = Math.max(best, run)
  }
  return best
}

/** Whether a roll (every die and Spare showing) meets a need. */
export function meets(need: Need, minTotal: number, values: number[]): boolean {
  if (values.length === 0) return false
  const total = values.reduce((sum, v) => sum + v, 0)
  if (total < minTotal) return false
  switch (need.kind) {
    case 'total':
      return true
    case 'atMost':
      return total <= need.total
    case 'set':
      return counts(values).some((c) => c >= need.size)
    case 'twoPairs': {
      const c = counts(values)
      return c.filter((n) => n >= 2).length >= 2 || c.some((n) => n >= 4)
    }
    case 'run':
      return longestRun(values) >= need.length
    case 'distinct':
      return new Set(values).size >= need.count
    case 'has':
      return need.values.every((v) => values.includes(v))
    case 'high':
      return values.some((v) => v >= need.value)
    case 'allOdd':
      return values.length >= need.min && values.every((v) => v % 2 === 1)
    case 'allEven':
      return values.length >= need.min && values.every((v) => v % 2 === 0)
  }
}

/** A short line saying what a firefly needs. */
export function describeNeed(need: Need, minTotal: number): string {
  const total = minTotal > 0 ? `total ${minTotal}+` : ''
  const join = (text: string) => (total ? `${text}, ${total}` : text)
  switch (need.kind) {
    case 'total':
      return `Total ${minTotal}+`
    case 'atMost':
      return `Total ${need.total} or less`
    case 'set':
      return join(need.size === 2 ? 'A pair' : `${need.size} of a kind`)
    case 'twoPairs':
      return join('Two pairs')
    case 'run':
      return join(`Run of ${need.length}`)
    case 'distinct':
      return join(`${need.count} different numbers`)
    case 'has':
      return join(need.values.length === 1 ? `A ${need.values[0]}` : `A ${need.values.join(' and a ')}`)
    case 'high':
      return join(`A ${need.value} or higher`)
    case 'allOdd':
      return join(`All odd, ${need.min}+ dice`)
    case 'allEven':
      return join(`All even, ${need.min}+ dice`)
  }
}

export const FLICKER_TEXT: Record<Flicker, string> = {
  swarm: 'One more firefly appears.',
  gift: 'Everyone gets a charm.',
  breeze: 'Resting lanterns come back.',
}
