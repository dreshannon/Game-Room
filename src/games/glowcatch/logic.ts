import { MoveError, type Game } from '../types'
import { DESIGNS, meets, type Flicker, type Need } from './fireflies'

export const MAX_PLAYERS = 12
export const PLAIN_DICE = 5
export const MAX_CHARMS = 3
export const START_CHARMS = 1
export const BRAG_POINTS = 2
/** A meadow holds at most this many fireflies. The oldest fly off first. */
export const MEADOW_LIMIT = 10
/** Two meadows only open with at least this many players. */
export const TWO_MEADOWS_FROM = 8
/** How long the reveal lasts: a pause, then each group of rollers in turn. */
export const REVEAL_START_MS = 1500
export const REVEAL_GROUP_MS = 1500
export const REVEAL_END_MS = 2500
export const REVEAL_MAX_MS = 14000

export type Lantern = 'd12' | 'd20'
export const LANTERN_SIDES: Record<Lantern, number> = { d12: 12, d20: 20 }

export type CharmKind = 'nudge' | 'spare' | 'brag'
export interface Charm {
  id: number
  kind: CharmKind
  /** The number a Spare adds. */
  value: number
}

export interface Firefly {
  id: number
  name: string
  points: number
  minTotal: number
  need: Need
  flicker: Flicker | null
}

export interface Cast {
  plain: number
  d12: boolean
  d20: boolean
  charms: number[]
  meadow: number
}

export interface Catcher {
  id: string
  charms: Charm[]
  resting: Record<Lantern, boolean>
  catches: Firefly[]
  bragPoints: number
  gone: boolean
}

export interface DieResult {
  sides: number
  rolled: number
  /** After nudges. */
  value: number
}

export interface CastResult {
  playerId: string
  meadow: number
  /** Order to roll in, from 0. Players in the same group roll together. */
  group: number
  dice: DieResult[]
  spares: number[]
  nudges: number
  brags: number
  total: number
  caught: Firefly[]
  /** Fireflies this roll could catch but someone else got, or that a tie left in the meadow. */
  missed: { firefly: Firefly; why: 'lower' | 'tie' }[]
  bragPoints: number
  gotCharm: boolean
  /** The meadow was empty by the time this group rolled. */
  emptied: boolean
}

export interface FlickerEvent {
  /** The firefly that flickered. */
  id: number
  name: string
  flicker: Flicker
  meadow: number
}

export interface GlowcatchState {
  rounds: number
  round: number
  meadowCount: number
  /** Seconds to cast, or 0 for no limit. */
  timer: number
  phase: 'cast' | 'reveal' | 'over'
  castEndsAt: number | null
  revealEndsAt: number | null
  players: Catcher[]
  casts: Record<string, Cast | null>
  meadows: Firefly[][]
  results: CastResult[]
  flickers: FlickerEvent[]
  /** With no time limit, who has tapped to move on from the reveal. */
  ready: string[]
  nextId: number
}

export interface CatcherView {
  id: string
  score: number
  fireflies: number
  bragPoints: number
  charms: number
  resting: Record<Lantern, boolean>
  cast: boolean
  gone: boolean
}

export interface GlowcatchView {
  round: number
  rounds: number
  phase: GlowcatchState['phase']
  meadowCount: number
  timer: number
  castEndsAt: number | null
  revealEndsAt: number | null
  meadows: Firefly[][]
  players: CatcherView[]
  results: CastResult[]
  flickers: FlickerEvent[]
  ready: string[]
  you: { charms: Charm[]; resting: Record<Lantern, boolean>; cast: Cast | null; playing: boolean } | null
}

export type GlowcatchMove =
  | { type: 'cast'; plain: number; d12: boolean; d20: boolean; charms: number[]; meadow: number }
  | { type: 'uncast' }
  | { type: 'ready' }
  | { type: 'next' }

export interface Randomness {
  /** A die roll from 1 to `sides`. */
  roll(sides: number): number
  /** A number from 0 up to 1, for drawing fireflies and charms. */
  random(): number
}

const defaultRandomness: Randomness = {
  roll: (sides) => Math.floor(Math.random() * sides) + 1,
  random: Math.random,
}

/** Fireflies to add each round, across all meadows, for this many players. */
export function perRound(players: number) {
  return players <= 3 ? 2 : Math.ceil(players / 2) + 1
}

export const scoreOf = (p: Catcher) => p.catches.reduce((sum, f) => sum + f.points, 0) + p.bragPoints
export const diceCount = (cast: Cast) => cast.plain + (cast.d12 ? 1 : 0) + (cast.d20 ? 1 : 0)
const active = (state: GlowcatchState) => state.players.filter((p) => !p.gone)

export function revealLength(results: CastResult[]) {
  const groups = Math.max(0, ...results.map((r) => r.group + 1))
  return Math.min(REVEAL_MAX_MS, REVEAL_START_MS + groups * REVEAL_GROUP_MS + REVEAL_END_MS)
}

interface Best {
  values: number[]
  caught: Firefly[]
  points: number
}

/**
 * Finds the nudges that catch the most points. Each nudge moves one die up or down by 1,
 * staying on its faces. Ties go to the lower total, which wins contests. With nothing to catch,
 * the dice stay as rolled.
 */
export function bestNudges(dice: { sides: number; value: number }[], spares: number[], nudges: number, meadow: Firefly[]) {
  const evaluate = (values: number[]): Best => {
    const all = [...values, ...spares]
    const caught = meadow.filter((f) => meets(f.need, f.minTotal, all))
    return { values, caught, points: caught.reduce((sum, f) => sum + f.points, 0) }
  }
  const total = (b: Best) => b.values.reduce((s, v) => s + v, 0)
  let best = evaluate(dice.map((d) => d.value))
  let frontier = [best.values]
  const seen = new Set([best.values.join()])
  for (let step = 0; step < nudges; step++) {
    const next: number[][] = []
    for (const values of frontier) {
      values.forEach((v, i) => {
        for (const delta of [-1, 1]) {
          const value = v + delta
          if (value < 1 || value > dice[i]!.sides) continue
          const moved = values.map((x, j) => (j === i ? value : x))
          const key = moved.join()
          if (seen.has(key)) continue
          seen.add(key)
          next.push(moved)
          const tried = evaluate(moved)
          if (tried.points > best.points || (tried.points === best.points && tried.points > 0 && total(tried) < total(best))) best = tried
        }
      })
    }
    frontier = next
  }
  return best
}

function drawFirefly(state: GlowcatchState, rng: Randomness): Firefly {
  const totalWeight = DESIGNS.reduce((sum, d) => sum + d.weight, 0)
  let pick = rng.random() * totalWeight
  let design = DESIGNS[DESIGNS.length - 1]!
  for (const d of DESIGNS) {
    pick -= d.weight
    if (pick < 0) {
      design = d
      break
    }
  }
  return {
    id: state.nextId++,
    name: design.name,
    points: design.points,
    minTotal: design.minTotal,
    need: design.need,
    flicker: design.flicker,
  }
}

function drawCharm(state: GlowcatchState, rng: Randomness): Charm {
  const pick = rng.random()
  if (pick < 0.4) return { id: state.nextId++, kind: 'nudge', value: 0 }
  if (pick < 0.75) return { id: state.nextId++, kind: 'spare', value: Math.min(6, Math.floor(rng.random() * 6) + 1) }
  return { id: state.nextId++, kind: 'brag', value: 0 }
}

function giveCharm(state: GlowcatchState, player: Catcher, rng: Randomness) {
  if (player.charms.length >= MAX_CHARMS) return false
  player.charms.push(drawCharm(state, rng))
  return true
}

/** New fireflies fly into each meadow, and any flickers happen. */
function fillMeadows(state: GlowcatchState, rng: Randomness) {
  state.flickers = []
  const each = Math.ceil(perRound(active(state).length) / state.meadowCount)
  for (let m = 0; m < state.meadowCount; m++) {
    let toAdd = each
    // A swarm can bring another swarm, so stop once a meadow's worth have come.
    for (let added = 0; toAdd > 0 && added < MEADOW_LIMIT; added++, toAdd--) {
      const firefly = drawFirefly(state, rng)
      state.meadows[m]!.push(firefly)
      if (!firefly.flicker) continue
      state.flickers.push({ id: firefly.id, name: firefly.name, flicker: firefly.flicker, meadow: m })
      if (firefly.flicker === 'swarm') toAdd++
      if (firefly.flicker === 'gift') active(state).forEach((p) => giveCharm(state, p, rng))
      if (firefly.flicker === 'breeze') active(state).forEach((p) => (p.resting = { d12: false, d20: false }))
    }
    const meadow = state.meadows[m]!
    if (meadow.length > MEADOW_LIMIT) meadow.splice(0, meadow.length - MEADOW_LIMIT)
  }
}

function startCast(state: GlowcatchState) {
  state.phase = 'cast'
  state.casts = Object.fromEntries(active(state).map((p) => [p.id, null]))
  state.castEndsAt = state.timer > 0 ? Date.now() + state.timer * 1000 : null
  state.revealEndsAt = null
}

/** Everyone has cast (or run out of time): roll, catch and hand out charms. */
function resolve(state: GlowcatchState, rng: Randomness) {
  const results: CastResult[] = []
  const usedLanterns = new Map<string, Record<Lantern, boolean>>()

  for (let m = 0; m < state.meadowCount; m++) {
    const casters = active(state).filter((p) => {
      const cast = state.casts[p.id]
      return cast && cast.meadow === m && diceCount(cast) > 0
    })
    const sizes = [...new Set(casters.map((p) => diceCount(state.casts[p.id]!)))].sort((a, b) => a - b)
    sizes.forEach((size, group) => {
      const meadow = state.meadows[m]!
      const rolls = casters
        .filter((p) => diceCount(state.casts[p.id]!) === size)
        .map((player) => {
          const cast = state.casts[player.id]!
          const charms = cast.charms.map((id) => player.charms.find((c) => c.id === id)!)
          const sides = [...Array(cast.plain).fill(6), ...(cast.d12 ? [12] : []), ...(cast.d20 ? [20] : [])]
          const dice = sides.map((s) => ({ sides: s, value: rng.roll(s) }))
          const spares = charms.filter((c) => c.kind === 'spare').map((c) => c.value)
          const nudges = charms.filter((c) => c.kind === 'nudge').length
          const best = bestNudges(dice, spares, nudges, meadow)
          const total = [...best.values, ...spares].reduce((s, v) => s + v, 0)
          return { player, cast, charms, dice, best, spares, nudges, total }
        })

      const caughtBy = new Map<number, string>()
      const missedBy = new Map<string, CastResult['missed']>()
      for (const firefly of meadow) {
        const able = rolls.filter((r) => r.best.caught.includes(firefly))
        if (able.length === 0) continue
        const lowest = Math.min(...able.map((r) => r.total))
        const winners = able.filter((r) => r.total === lowest)
        if (winners.length === 1) caughtBy.set(firefly.id, winners[0]!.player.id)
        for (const r of able) {
          if (winners.length === 1 && r === winners[0]) continue
          const list = missedBy.get(r.player.id) ?? []
          list.push({ firefly, why: winners.length === 1 ? 'lower' : 'tie' })
          missedBy.set(r.player.id, list)
        }
      }

      for (const r of rolls) {
        const caught = meadow.filter((f) => caughtBy.get(f.id) === r.player.id)
        const brags = r.charms.filter((c) => c.kind === 'brag').length
        r.player.charms = r.player.charms.filter((c) => !r.cast.charms.includes(c.id))
        r.player.catches.push(...caught)
        const bragPoints = caught.length > 0 ? brags * BRAG_POINTS : 0
        r.player.bragPoints += bragPoints
        const gotCharm = caught.length === 0 && giveCharm(state, r.player, rng)
        usedLanterns.set(r.player.id, { d12: r.cast.d12, d20: r.cast.d20 })
        results.push({
          playerId: r.player.id,
          meadow: m,
          group,
          dice: r.dice.map((d, i) => ({ sides: d.sides, rolled: d.value, value: r.best.values[i]! })),
          spares: r.spares,
          nudges: r.nudges,
          brags,
          total: r.total,
          caught,
          missed: missedBy.get(r.player.id) ?? [],
          bragPoints,
          gotCharm,
          emptied: meadow.length === 0,
        })
      }
      state.meadows[m] = meadow.filter((f) => !caughtBy.has(f.id))
    })
  }

  for (const p of active(state)) p.resting = usedLanterns.get(p.id) ?? { d12: false, d20: false }
  state.results = results
  state.phase = 'reveal'
  state.castEndsAt = null
  state.ready = []
  // With no time limit, the reveal waits for everyone to tap Next round.
  state.revealEndsAt = state.timer > 0 ? Date.now() + revealLength(results) : null
}

function maybeResolve(state: GlowcatchState, rng: Randomness) {
  if (state.phase === 'cast' && active(state).every((p) => state.casts[p.id])) resolve(state, rng)
}

function maybeNextRound(state: GlowcatchState, rng: Randomness) {
  if (state.phase === 'reveal' && state.timer === 0 && active(state).every((p) => state.ready.includes(p.id))) {
    nextRound(state, rng)
  }
}

function nextRound(state: GlowcatchState, rng: Randomness) {
  state.ready = []
  if (state.round >= state.rounds) {
    state.phase = 'over'
    state.revealEndsAt = null
    return
  }
  state.round++
  state.results = []
  fillMeadows(state, rng)
  startCast(state)
}

function readCast(state: GlowcatchState, player: Catcher, move: Record<string, unknown>): Cast {
  const plain = move.plain
  if (typeof plain !== 'number' || !Number.isInteger(plain) || plain < 0 || plain > PLAIN_DICE) {
    throw new MoveError(`Pick 0 to ${PLAIN_DICE} plain dice.`)
  }
  const lantern = (key: Lantern) => {
    const value = move[key]
    if (value !== undefined && typeof value !== 'boolean') throw new MoveError('Pick your lanterns again.')
    if (value && player.resting[key]) throw new MoveError(`Your ${key} lantern is resting this round.`)
    return value === true
  }
  const d12 = lantern('d12')
  const d20 = lantern('d20')
  const charms = move.charms ?? []
  if (!Array.isArray(charms) || !charms.every((id) => Number.isInteger(id))) throw new MoveError('Pick charms you hold.')
  if (new Set(charms).size !== charms.length) throw new MoveError('Pick each charm only once.')
  if (!charms.every((id) => player.charms.some((c) => c.id === id))) throw new MoveError('You don’t hold that charm.')
  const meadow = move.meadow ?? 0
  if (typeof meadow !== 'number' || !Number.isInteger(meadow) || meadow < 0 || meadow >= state.meadowCount) {
    throw new MoveError('Pick a meadow.')
  }
  const cast: Cast = { plain, d12, d20, charms: charms as number[], meadow }
  if (diceCount(cast) === 0 && charms.length > 0) throw new MoveError('Cast at least one die to use charms.')
  return cast
}

const newCatcher = (id: string): Catcher => ({
  id,
  charms: [],
  resting: { d12: false, d20: false },
  catches: [],
  bragPoints: 0,
  gone: false,
})

export function makeGlowcatch(rng: Randomness = defaultRandomness): Game<GlowcatchState, GlowcatchView> {
  return {
    id: 'glowcatch',
    name: 'Glowcatch',
    minPlayers: 2,
    maxPlayers: MAX_PLAYERS,
    options: [
      { key: 'rounds', label: 'Rounds', min: 4, max: 10, default: 7 },
      {
        key: 'timer',
        label: 'Time to cast',
        min: 0,
        max: 60,
        default: 30,
        choices: [
          { value: 20, label: '20 seconds' },
          { value: 30, label: '30 seconds' },
          { value: 45, label: '45 seconds' },
          { value: 60, label: '60 seconds' },
          { value: 0, label: 'No limit' },
        ],
      },
      {
        key: 'meadows',
        label: 'Meadows',
        min: 1,
        max: 2,
        default: 1,
        choices: [
          { value: 1, label: 'One' },
          { value: 2, label: `Two (${TWO_MEADOWS_FROM}+ players)` },
        ],
      },
    ],

    setup(playerIds, options) {
      const state: GlowcatchState = {
        rounds: options.rounds ?? 7,
        round: 1,
        meadowCount: options.meadows === 2 && playerIds.length >= TWO_MEADOWS_FROM ? 2 : 1,
        timer: options.timer ?? 30,
        phase: 'cast',
        castEndsAt: null,
        revealEndsAt: null,
        players: playerIds.map(newCatcher),
        casts: {},
        meadows: [],
        results: [],
        flickers: [],
        ready: [],
        nextId: 1,
      }
      state.meadows = Array.from({ length: state.meadowCount }, () => [])
      for (const p of state.players) for (let i = 0; i < START_CHARMS; i++) giveCharm(state, p, rng)
      fillMeadows(state, rng)
      startCast(state)
      return state
    },

    applyMove(original, playerId, rawMove, context) {
      const move = (rawMove ?? {}) as Record<string, unknown>
      if (original.phase === 'over') throw new MoveError('The game is over.')
      const player = original.players.find((p) => p.id === playerId && !p.gone)
      if (!player) throw new MoveError('You are not in this game.')
      switch (move.type) {
        case 'cast': {
          if (original.phase !== 'cast') throw new MoveError('Wait for the next round to cast.')
          const state = structuredClone(original)
          const me = state.players.find((p) => p.id === playerId)!
          state.casts[playerId] = readCast(state, me, move)
          maybeResolve(state, rng)
          return state
        }
        case 'uncast': {
          if (original.phase !== 'cast' || !original.casts[playerId]) return original
          const state = structuredClone(original)
          state.casts[playerId] = null
          return state
        }
        case 'ready': {
          if (original.phase !== 'reveal' || original.ready.includes(playerId)) return original
          const state = structuredClone(original)
          state.ready.push(playerId)
          maybeNextRound(state, rng)
          return state
        }
        case 'next': {
          if (!context?.isHost) throw new MoveError('Only the host can skip ahead.')
          const state = structuredClone(original)
          // Anyone still picking sits the round out.
          if (state.phase === 'cast') resolve(state, rng)
          else nextRound(state, rng)
          return state
        }
        default:
          throw new MoveError('Unknown move.')
      }
    },

    viewFor(state, viewerId) {
      const viewer = state.players.find((p) => p.id === viewerId)
      return {
        round: state.round,
        rounds: state.rounds,
        phase: state.phase,
        meadowCount: state.meadowCount,
        timer: state.timer,
        castEndsAt: state.castEndsAt,
        revealEndsAt: state.revealEndsAt,
        meadows: state.meadows,
        results: state.results,
        flickers: state.flickers,
        ready: state.ready,
        players: state.players.map((p) => ({
          id: p.id,
          score: scoreOf(p),
          fireflies: p.catches.length,
          bragPoints: p.bragPoints,
          charms: p.charms.length,
          resting: p.resting,
          cast: !!state.casts[p.id],
          gone: p.gone,
        })),
        you: viewer
          ? {
              charms: viewer.charms,
              resting: viewer.resting,
              cast: state.casts[viewer.id] ?? null,
              playing: !viewer.gone,
            }
          : null,
      }
    },

    result(state) {
      if (state.phase !== 'over') return null
      const left = active(state)
      const top = Math.max(...left.map(scoreOf))
      const best = left.filter((p) => scoreOf(p) === top)
      const fewest = Math.min(...best.map((p) => p.catches.length))
      return { winnerIds: best.filter((p) => p.catches.length === fewest).map((p) => p.id) }
    },

    waitingOn(state) {
      if (state.phase === 'reveal' && state.timer === 0) {
        return active(state)
          .filter((p) => !state.ready.includes(p.id))
          .map((p) => p.id)
      }
      if (state.phase !== 'cast') return []
      return active(state)
        .filter((p) => !state.casts[p.id])
        .map((p) => p.id)
    },

    tickDelay(state) {
      const at = state.phase === 'cast' ? state.castEndsAt : state.phase === 'reveal' ? state.revealEndsAt : null
      return at === null ? null : Math.max(0, at - Date.now())
    },

    tick(original) {
      const state = structuredClone(original)
      if (state.phase === 'cast') resolve(state, rng)
      else if (state.phase === 'reveal') nextRound(state, rng)
      return state
    },

    onPlayerJoin(original, playerId) {
      if (original.phase === 'over' || original.round > Math.ceil(original.rounds / 2)) return null
      if (active(original).length >= MAX_PLAYERS) return null
      const state = structuredClone(original)
      const existing = state.players.find((p) => p.id === playerId)
      const player = existing ?? newCatcher(playerId)
      player.gone = false
      if (!existing) {
        state.players.push(player)
        for (let i = 0; i < START_CHARMS; i++) giveCharm(state, player, rng)
      }
      if (state.phase === 'cast') state.casts[playerId] = null
      return state
    },

    onPlayerLeave(original, playerId) {
      const state = structuredClone(original)
      const player = state.players.find((p) => p.id === playerId)
      if (!player) return state
      player.gone = true
      delete state.casts[playerId]
      if (active(state).length < 2) return null
      state.ready = state.ready.filter((id) => id !== playerId)
      maybeResolve(state, rng)
      maybeNextRound(state, rng)
      return state
    },
  }
}

export const glowcatch = makeGlowcatch()
