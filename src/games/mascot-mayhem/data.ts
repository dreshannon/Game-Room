import type { CardAction, RaceCard, RaceState } from './race'

export const MASCOTS = [
  { name: 'Biscuit', animal: 'dog', color: '#e4572e' },
  { name: 'Waddles', animal: 'duck', color: '#f2b705' },
  { name: 'Pickles', animal: 'frog', color: '#2fbf71' },
  { name: 'Bandit', animal: 'raccoon', color: '#4d7cfe' },
] as const

/** Each mascot's own cards. */
const MASCOT_CARDS: CardAction[] = [
  { kind: 'move', spaces: 1 },
  { kind: 'move', spaces: 2 },
  { kind: 'move', spaces: 2 },
  { kind: 'move', spaces: 3 },
  { kind: 'move', spaces: 3 },
  { kind: 'move', spaces: 4 },
  { kind: 'move', spaces: 5 },
  { kind: 'move', spaces: -2 },
  { kind: 'star' },
  { kind: 'fall' },
  { kind: 'turn' },
  { kind: 'swerve', side: 'left' },
  { kind: 'swerve', side: 'right' },
  { kind: 'recover' },
]

/** Cards for everyone at once. */
const EVERYONE_CARDS: Omit<RaceCard, 'id'>[] = [
  { mascot: null, action: { kind: 'move', spaces: 1 } },
  { mascot: null, action: { kind: 'move', spaces: 2 } },
  { mascot: null, action: { kind: 'recover' }, recoverAll: true },
  { mascot: null, action: { kind: 'move', spaces: 1 }, recoverAll: true },
]

/** Every card in the game. The four starters are always in the race deck. */
export function allCards(): RaceCard[] {
  const cards: Omit<RaceCard, 'id'>[] = []
  for (let mascot = 0; mascot < MASCOTS.length; mascot++) {
    cards.push({ mascot, action: { kind: 'move', spaces: 3 }, starter: true })
    for (const action of MASCOT_CARDS) cards.push({ mascot, action })
  }
  cards.push(...EVERYONE_CARDS)
  return cards.map((card, id) => ({ ...card, id }))
}

/** Race cards always in the deck: the starters, plus random cards by player count, plus one from each player. */
export const RACE_DECK_SIZE = 18

/** Payouts for a mascot ticket, best ticket first in each pile. */
export interface MascotTicketValues {
  /** For 1st, 2nd and 3rd. 4th never pays. */
  safe: [number, number, number]
  /** Only pays if the mascot wins. */
  risky: number
}

export const MASCOT_TICKETS: MascotTicketValues[] = [
  { safe: [7, 4, 2], risky: 13 },
  { safe: [6, 3, 1], risky: 10 },
  { safe: [5, 2, 1], risky: 8 },
]

/** The three tickets in each side bet pile pay this share of the top ticket, like the mascot piles. */
const TICKET_SCALE = [1, 0.77, 0.62]
/** Roughly what the best mascot ticket is worth on average, so side bets match it. */
const TARGET_VALUE = 3.25
/** What a wrong risky side bet costs. */
export const RISKY_SIDE_LOSS = 2
const MAX_SIDE_PAYOUT = 30

export interface SideTicketValues {
  safe: number
  risky: number
  riskyLoss: number
}

/**
 * Payouts for betting yes or no on a side bet, from how likely the answer is. Long shots pay
 * more, and both sides are worth about the same as a mascot ticket on average.
 */
export function sideTicketValues(chanceRight: number, rank: number): SideTicketValues {
  const target = TARGET_VALUE * TICKET_SCALE[rank]!
  const safe = Math.min(MAX_SIDE_PAYOUT, Math.max(1, Math.round(target / chanceRight)))
  const risky = Math.min(
    MAX_SIDE_PAYOUT,
    Math.max(safe + 2, Math.round((target + (1 - chanceRight) * RISKY_SIDE_LOSS) / chanceRight)),
  )
  return { safe, risky, riskyLoss: RISKY_SIDE_LOSS }
}

/**
 * A yes-or-no bet on how the race goes. Payouts are worked out from how often it happens
 * in the simulator, so long shots pay more. `risky` loses money when wrong.
 */
export interface SideBet {
  id: number
  question: string
  test(race: RaceState): boolean
  /** How often it came true in 20,000 simulated races, from scripts/simulate-mascot-mayhem.ts. */
  chance: number
}

export const SIDE_BETS: SideBet[] = [
  { id: 0, question: 'Will any mascot be knocked out or go off the track?', test: (r) => r.stats.outs > 0, chance: 0.78 },
  { id: 1, question: 'Will the track fold twice?', test: (r) => r.stats.folds >= 2, chance: 0.21 },
  { id: 2, question: 'Will two or more mascots go out?', test: (r) => r.stats.outs >= 2, chance: 0.38 },
  { id: 3, question: 'Will mascots crash into each other twice or more?', test: (r) => r.stats.collisions >= 2, chance: 0.2 },
  { id: 4, question: 'Will three or more mascots fall over?', test: (r) => r.stats.fell.length >= 3, chance: 0.1 },
  { id: 5, question: 'Will a mascot run off the side of the track?', test: (r) => r.stats.offTrack, chance: 0.39 },
  { id: 6, question: 'Will a star card carry a mascot over the finish?', test: (r) => r.stats.starFinish, chance: 0.11 },
  { id: 7, question: 'Will the race last more than 30 cards?', test: (r) => r.stats.cardsPlayed > 30, chance: 0.19 },
  { id: 8, question: 'Will a mascot get caught in the fold?', test: (r) => r.mascots.some((m) => m.outReason === 'folded'), chance: 0.32 },
  { id: 9, question: 'Will Biscuit beat Bandit?', test: (r) => r.mascots[0]!.place! < r.mascots[3]!.place!, chance: 0.5 },
  { id: 10, question: 'Will Waddles finish in the top two?', test: (r) => r.mascots[1]!.place! <= 2, chance: 0.49 },
  { id: 11, question: 'Will Pickles come last?', test: (r) => r.mascots[2]!.place === 4, chance: 0.26 },
]
