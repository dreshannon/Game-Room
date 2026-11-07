/**
 * Balances Mascot Mayhem: runs many races with random decks and reports how they go.
 * Run with: npx vitest run --config scripts/vitest.scripts.config.ts
 */
import { test } from 'vitest'
import { MASCOTS, MASCOT_TICKETS, RACE_DECK_SIZE, SIDE_BETS, allCards } from '../src/games/mascot-mayhem/data'
import { runRace, shuffle } from '../src/games/mascot-mayhem/race'

const RACES = 20_000

test('simulate', () => {
  const cards = allCards()
  const starters = cards.filter((c) => c.starter)
  const rest = cards.filter((c) => !c.starter)
  const lengths: number[] = []
  let folds = 0
  let outs = 0
  const places = MASCOTS.map(() => [0, 0, 0, 0])
  const sideHits = SIDE_BETS.map(() => 0)
  for (let i = 0; i < RACES; i++) {
    const deck = [...starters, ...shuffle(rest).slice(0, RACE_DECK_SIZE - starters.length)]
    const race = runRace(deck)
    if (!race.over) throw new Error('race did not end')
    lengths.push(race.stats.cardsPlayed)
    folds += race.stats.folds > 0 ? 1 : 0
    outs += race.stats.outs
    race.mascots.forEach((m, j) => places[j]![m.place! - 1]!++)
    SIDE_BETS.forEach((bet, j) => (sideHits[j]! += bet.test(race) ? 1 : 0))
  }
  lengths.sort((a, b) => a - b)
  const pct = (n: number) => `${((n / RACES) * 100).toFixed(1)}%`
  console.log(`cards: median ${lengths[RACES / 2]}, p10 ${lengths[RACES * 0.1]}, p90 ${lengths[RACES * 0.9]}, max ${lengths.at(-1)}`)
  console.log(`races with a fold: ${pct(folds)}, outs per race: ${(outs / RACES).toFixed(2)}`)
  places.forEach((p, j) => console.log(`${MASCOTS[j]!.name}: ${p.map(pct).join(' / ')}`))
  const p = places.map((row) => row.map((n) => n / RACES))
  MASCOT_TICKETS.forEach((t, k) => {
    const safe = p[0]![0]! * t.safe[0] + p[0]![1]! * t.safe[1] + p[0]![2]! * t.safe[2]
    console.log(`ticket ${k + 1}: safe EV $${safe.toFixed(2)}, risky EV $${(p[0]![0]! * t.risky).toFixed(2)}`)
  })
  SIDE_BETS.forEach((bet, j) => console.log(`side ${bet.id}: ${(sideHits[j]! / RACES).toFixed(3)}  ${bet.question}`))
})
