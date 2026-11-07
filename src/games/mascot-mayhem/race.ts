/**
 * The race itself: four mascots on a straight track, moved by cards flipped one at a time.
 * Pure and separate from betting, so the simulator can run thousands of races.
 */

export const MASCOT_COUNT = 4
/** Six lanes, with the mascots in the middle four, so one swerve can't send anyone off the side. */
export const LANES = 6
/** Mascots start here. Space 0 is the back edge. */
export const START = 2
/** Reaching this space finishes the race. */
export const FINISH = 13
/** Star spaces. The finish line also counts as a star. */
export const STARS = [5, 8, 11]
/** Each time the deck runs out, the track folds and everything behind the next line is out. */
export const FOLDS = [4, 6, 8, 10, 12]
export const BURN = 3

export type CardAction =
  | { kind: 'move'; spaces: number }
  | { kind: 'star' }
  | { kind: 'fall' }
  | { kind: 'turn' }
  | { kind: 'swerve'; side: 'left' | 'right' }
  | { kind: 'recover' }

export interface RaceCard {
  id: number
  /** The mascot it moves, or null for a card that moves everyone. */
  mascot: number | null
  action: CardAction
  /** Everyone cards may also stand everyone up first. */
  recoverAll?: boolean
  /** One per mascot, always in the deck. */
  starter?: boolean
}

export interface Mascot {
  pos: number
  lane: number
  fallen: boolean
  /** 1 runs toward the finish, -1 away from it. */
  facing: 1 | -1
  status: 'running' | 'finished' | 'out'
  place: number | null
  /** Why it went out, for the commentary. */
  outReason?: OutReason
}

export type OutReason = 'knockout' | 'offTrack' | 'folded'

export type RaceEventKind = 'finish' | 'out' | 'collide' | 'fold' | 'star' | 'fall' | 'turn' | 'swerve' | 'recover'

export interface RaceEvent {
  kind: RaceEventKind
  mascot: number | null
  /** For collisions, the mascot that was hit. */
  other?: number
  reason?: OutReason
  place?: number
}

export interface RaceStats {
  cardsPlayed: number
  folds: number
  collisions: number
  outs: number
  /** Mascots that fell at least once. */
  fell: number[]
  /** The winner crossed the line while turned around or fallen. */
  winnerBackwards: boolean
  winnerFallen: boolean
  /** Someone reached the finish on a star card. */
  starFinish: boolean
  offTrack: boolean
}

export interface RaceState {
  mascots: Mascot[]
  deck: RaceCard[]
  burned: RaceCard[]
  played: RaceCard[]
  /** The back edge of the track. Spaces below this are folded away. */
  back: number
  folds: number
  stats: RaceStats
  over: boolean
}

export const startingMascots = (): Mascot[] =>
  Array.from({ length: MASCOT_COUNT }, (_, index) => ({
    pos: START,
    lane: index + 1,
    fallen: false,
    facing: 1 as const,
    status: 'running' as const,
    place: null,
  }))

export function shuffle<T>(items: T[], random = Math.random): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/** Starts a race: shuffles the deck and burns the top cards unseen. */
export function startRace(cards: RaceCard[], random = Math.random): RaceState {
  const deck = shuffle(cards, random)
  return {
    mascots: startingMascots(),
    burned: deck.splice(0, BURN),
    deck,
    played: [],
    back: 0,
    folds: 0,
    stats: {
      cardsPlayed: 0,
      folds: 0,
      collisions: 0,
      outs: 0,
      fell: [],
      winnerBackwards: false,
      winnerFallen: false,
      starFinish: false,
      offTrack: false,
    },
    over: false,
  }
}

const running = (race: RaceState) => race.mascots.filter((m) => m.status === 'running')
const doneCount = (race: RaceState) => race.mascots.filter((m) => m.status !== 'running').length

/** Places taken so far, so finishers get the best open one and outs the worst. */
function openPlaces(race: RaceState) {
  const taken = new Set(race.mascots.map((m) => m.place).filter((p) => p !== null))
  return [1, 2, 3, 4].filter((p) => !taken.has(p))
}

function finish(race: RaceState, index: number, events: RaceEvent[], viaStar: boolean) {
  const mascot = race.mascots[index]!
  const place = openPlaces(race)[0]!
  if (place === 1) {
    race.stats.winnerBackwards = mascot.facing === -1
    race.stats.winnerFallen = mascot.fallen
  }
  if (viaStar) race.stats.starFinish = true
  mascot.status = 'finished'
  mascot.place = place
  mascot.pos = FINISH
  events.push({ kind: 'finish', mascot: index, place })
}

/** Puts mascots out together. Two out at once share the worse of the places left. */
function knockOut(race: RaceState, indexes: number[], reason: OutReason, events: RaceEvent[]) {
  if (!indexes.length) return
  const open = openPlaces(race)
  const place = open[open.length - 1]!
  // Outs take places from the bottom. When several go at once, they all get the lowest.
  for (const [n, index] of indexes.entries()) {
    const mascot = race.mascots[index]!
    mascot.status = 'out'
    mascot.place = indexes.length > 1 ? place : open[open.length - 1 - n]!
    mascot.outReason = reason
    race.stats.outs++
    if (reason === 'offTrack') race.stats.offTrack = true
    events.push({ kind: 'out', mascot: index, reason, place: mascot.place })
  }
}

function fall(race: RaceState, index: number, events: RaceEvent[]) {
  const mascot = race.mascots[index]!
  if (mascot.fallen) return knockOut(race, [index], 'knockout', events)
  mascot.fallen = true
  if (!race.stats.fell.includes(index)) race.stats.fell.push(index)
  events.push({ kind: 'fall', mascot: index })
}

/**
 * Moves one mascot space by space. Running into or through a standing mascot in the same
 * lane knocks it over; hitting one that's already down knocks it out.
 */
function step(race: RaceState, index: number, spaces: number, events: RaceEvent[], viaStar = false) {
  const mascot = race.mascots[index]!
  const direction = Math.sign(spaces)
  for (let i = 0; i < Math.abs(spaces); i++) {
    mascot.pos += direction
    if (mascot.pos >= FINISH) return finish(race, index, events, viaStar)
    if (mascot.pos < race.back) return knockOut(race, [index], 'offTrack', events)
    for (const [otherIndex, other] of race.mascots.entries()) {
      if (otherIndex === index || other.status !== 'running') continue
      if (other.pos !== mascot.pos || other.lane !== mascot.lane) continue
      race.stats.collisions++
      events.push({ kind: 'collide', mascot: index, other: otherIndex })
      fall(race, otherIndex, events)
    }
  }
}

/** The next star in the direction a mascot faces, or null if there isn't one. */
function nextStar(pos: number, facing: 1 | -1) {
  const stars = [...STARS, FINISH]
  if (facing === 1) return stars.find((star) => star > pos) ?? null
  return [...stars].reverse().find((star) => star < pos) ?? null
}

function applyToMascot(race: RaceState, card: RaceCard, index: number, events: RaceEvent[]) {
  const mascot = race.mascots[index]!
  if (mascot.status !== 'running') return
  const action = card.action
  switch (action.kind) {
    case 'move': {
      const spaces = mascot.fallen ? Math.sign(action.spaces) : action.spaces
      step(race, index, spaces * mascot.facing, events)
      return
    }
    case 'star': {
      const target = nextStar(mascot.pos, mascot.facing)
      if (target === null) return
      events.push({ kind: 'star', mascot: index })
      // A fallen mascot can only crawl, even on a star.
      const spaces = mascot.fallen ? mascot.facing : target - mascot.pos
      step(race, index, spaces, events, true)
      return
    }
    case 'fall':
      fall(race, index, events)
      return
    case 'turn':
      mascot.facing = mascot.facing === 1 ? -1 : 1
      events.push({ kind: 'turn', mascot: index })
      return
    case 'swerve': {
      // Left is toward lane 0 when running toward the finish.
      const shift = (action.side === 'left' ? -1 : 1) * mascot.facing
      mascot.lane += shift
      events.push({ kind: 'swerve', mascot: index })
      if (mascot.lane < 0 || mascot.lane >= LANES) return knockOut(race, [index], 'offTrack', events)
      for (const [otherIndex, other] of race.mascots.entries()) {
        if (otherIndex === index || other.status !== 'running') continue
        if (other.pos === mascot.pos && other.lane === mascot.lane) {
          race.stats.collisions++
          events.push({ kind: 'collide', mascot: index, other: otherIndex })
          fall(race, otherIndex, events)
        }
      }
      return
    }
    case 'recover':
      if (!mascot.fallen && mascot.facing === 1) return
      mascot.fallen = false
      mascot.facing = 1
      events.push({ kind: 'recover', mascot: index })
      return
  }
}

/** Everyone cards move all mascots at once. No collisions, and nobody crosses the finish. */
function applyToAll(race: RaceState, card: RaceCard, events: RaceEvent[]) {
  for (const [index, mascot] of race.mascots.entries()) {
    if (mascot.status !== 'running') continue
    if (card.recoverAll && (mascot.fallen || mascot.facing === -1)) {
      mascot.fallen = false
      mascot.facing = 1
      events.push({ kind: 'recover', mascot: index })
    }
    if (card.action.kind !== 'move') continue
    const spaces = (mascot.fallen ? 1 : card.action.spaces) * mascot.facing
    mascot.pos = Math.min(FINISH - 1, Math.max(race.back, mascot.pos + spaces))
  }
}

/** Folds the track when the deck runs out, then reshuffles everything and burns again. */
function fold(race: RaceState, events: RaceEvent[], random: () => number) {
  const line = FOLDS[Math.min(race.folds, FOLDS.length - 1)]!
  race.back = Math.max(race.back, line)
  race.folds++
  race.stats.folds++
  events.push({ kind: 'fold', mascot: null })
  const caught = race.mascots.flatMap((m, i) => (m.status === 'running' && m.pos < race.back ? [i] : []))
  knockOut(race, caught, 'folded', events)
  const deck = shuffle([...race.deck, ...race.burned, ...race.played], random)
  race.burned = deck.splice(0, BURN)
  race.deck = deck
  race.played = []
}

function settle(race: RaceState) {
  if (doneCount(race) < MASCOT_COUNT - 1) return
  // The last mascot standing takes whichever place is left.
  for (const mascot of running(race)) {
    mascot.status = 'finished'
    mascot.place = openPlaces(race)[0]!
  }
  race.over = true
}

/** Flips the next card. Returns what happened, for the commentary. */
export function playNext(race: RaceState, random = Math.random): { card: RaceCard | null; events: RaceEvent[] } {
  const events: RaceEvent[] = []
  if (race.over) return { card: null, events }
  if (race.deck.length === 0) {
    fold(race, events, random)
    settle(race)
    return { card: null, events }
  }
  const card = race.deck.shift()!
  race.played.push(card)
  race.stats.cardsPlayed++
  if (card.mascot === null) applyToAll(race, card, events)
  else applyToMascot(race, card, card.mascot, events)
  settle(race)
  return { card, events }
}

/** Plays a whole race at once, for the simulator and tests. */
export function runRace(cards: RaceCard[], random = Math.random, limit = 500): RaceState {
  const race = startRace(cards, random)
  for (let i = 0; i < limit && !race.over; i++) playNext(race, random)
  return race
}
