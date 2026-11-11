import { meets } from '../../../games/glowcatch/fireflies'
import type { Firefly } from '../../../games/glowcatch/logic'

/** Whether some way of using up to `nudges` nudges makes this roll meet the firefly. */
function canMeet(firefly: Firefly, values: number[], sides: number[], spares: number[], nudges: number) {
  const check = (v: number[]) => meets(firefly.need, firefly.minTotal, [...v, ...spares])
  if (check(values)) return true
  let frontier = [values]
  const seen = new Set([values.join()])
  for (let step = 0; step < nudges; step++) {
    const next: number[][] = []
    for (const v of frontier) {
      for (let i = 0; i < v.length; i++) {
        for (const delta of [-1, 1]) {
          const value = v[i]! + delta
          if (value < 1 || value > sides[i]!) continue
          const moved = v.slice()
          moved[i] = value
          const key = moved.join()
          if (seen.has(key)) continue
          seen.add(key)
          if (check(moved)) return true
          next.push(moved)
        }
      }
    }
    frontier = next
  }
  return false
}

/**
 * Roughly how often a pick of dice meets each firefly, by rolling it many times.
 * It ignores other players, so it's the chance to meet a firefly, not to win it.
 */
export function meetChances(
  fireflies: Firefly[],
  sides: number[],
  spares: number[],
  nudges: number,
  rolls = 240,
): Map<number, number> {
  const hits = new Map(fireflies.map((f) => [f.id, 0]))
  if (sides.length === 0) return new Map(fireflies.map((f) => [f.id, 0]))
  for (let r = 0; r < rolls; r++) {
    const values = sides.map((s) => Math.floor(Math.random() * s) + 1)
    for (const f of fireflies) if (canMeet(f, values, sides, spares, nudges)) hits.set(f.id, hits.get(f.id)! + 1)
  }
  return new Map([...hits].map(([id, n]) => [id, n / rolls]))
}

/** "40%", rounded to the nearest 5 so it doesn't jitter, with the ends shown as "<5%" and "95%+". */
export function chanceLabel(chance: number) {
  if (chance <= 0) return '0%'
  if (chance < 0.05) return '<5%'
  if (chance >= 0.999) return '100%'
  if (chance >= 0.95) return '95%+'
  return `${Math.round(chance * 20) * 5}%`
}
