import { MoveError, type Game, type PlayerColor } from '../types'
import { TRACKS, cornersOf, getTrack, type Corner } from './tracks'

export const HAND_SIZE = 7
export const ENGINE_HEAT = 6
export const MAX_GEAR = 4
/** Cooldown from each gear, by gear number. */
export const COOLDOWN_BY_GEAR = [0, 3, 1, 0, 0]
export const SLIPSTREAM_SPACES = 2
export const MAX_CARS = 8
/** From this many cars, the last two cars each round get Adrenaline. */
export const TWO_ADRENALINE_FROM = 5
export const CAR_COLORS: PlayerColor[] = [
  { name: 'Red', fill: '#e63946', text: '#ffffff' },
  { name: 'Blue', fill: '#3a86ff', text: '#ffffff' },
  { name: 'Yellow', fill: '#ffbe0b', text: '#111111' },
  { name: 'Green', fill: '#06d6a0', text: '#111111' },
  { name: 'Purple', fill: '#9b5de5', text: '#ffffff' },
  { name: 'Orange', fill: '#f77f00', text: '#111111' },
  { name: 'Pink', fill: '#ff70a6', text: '#111111' },
  { name: 'Silver', fill: '#e9ecef', text: '#111111' },
]

export type CardKind = 'speed' | 'upgrade' | 'heat' | 'stress'

export interface Card {
  id: number
  kind: CardKind
  /** Movement for speed and upgrade cards. Zero for Heat and Stress. */
  value: number
}

/** A card in the play area. A Stress card or a Boost turns into the speed card flipped for it. */
export interface PlayEntry {
  card: Card | null
  flipped: Card | null
  value: number
  boost: boolean
}

export type TurnStep = 'react' | 'slipstream' | 'corners'

export interface Turn {
  startPos: number
  /** Total speed this turn, for corners. Counts Boost and Adrenaline, not Slipstream. */
  speed: number
  boosted: boolean
  adrenaline: boolean
  adrenalineUsed: boolean
  cooldownLeft: number
  slipstreamed: boolean
  clogged: boolean
  step: TurnStep
}

export interface Plan {
  gear: number
  cards: number[]
}

export interface Driver {
  id: string
  color: string
  /** Spaces travelled since the finish line. The grid starts behind it, below zero. */
  pos: number
  /** 0 is the inside spot, which counts as ahead. */
  spot: 0 | 1
  gear: number
  engine: Card[]
  hand: Card[]
  deck: Card[]
  discard: Card[]
  play: PlayEntry[]
  plan: Plan | null
  turn: Turn | null
  /** Done with this round's move, and still to discard and draw. */
  needsDiscard: boolean
  finishedRound: number | null
  /** Finishing place from 1, once the car is in the Hall of Fame. */
  place: number | null
}

export type RaceEventKind =
  | 'move'
  | 'clog'
  | 'boost'
  | 'adrenaline'
  | 'cooldown'
  | 'slipstream'
  | 'corner'
  | 'spin'
  | 'finish'

export interface RaceEvent {
  seq: number
  round: number
  kind: RaceEventKind
  playerId: string
  value?: number
  limit?: number
}

export interface OverheatState {
  trackId: number
  laps: number
  spaces: number
  startCount: number
  round: number
  phase: 'plan' | 'resolve' | 'over'
  drivers: Driver[]
  /** This round's move order, front to back. */
  order: string[]
  current: number
  hallOfFame: string[]
  nextCardId: number
  seq: number
  events: RaceEvent[]
}

export interface CarView {
  id: string
  color: string
  pos: number
  spot: 0 | 1
  gear: number
  engine: number
  hand: number
  deck: number
  discard: number
  /** Shown once the car's turn starts. */
  play: PlayEntry[]
  speed: number | null
  /** Where the car started this turn, while it's moving. */
  startPos: number | null
  planned: boolean
  needsDiscard: boolean
  finishedRound: number | null
  place: number | null
}

export interface ReactOptions {
  boost: boolean
  adrenaline: boolean
}

export interface OverheatView {
  trackId: number
  laps: number
  spaces: number
  round: number
  phase: OverheatState['phase']
  cars: CarView[]
  order: string[]
  current: { id: string; step: TurnStep } | null
  hallOfFame: string[]
  events: RaceEvent[]
  you: {
    hand: Card[]
    plan: Plan | null
    react: ReactOptions | null
    canSlipstream: boolean
  } | null
}

export type OverheatMove =
  | { type: 'plan'; gear: number; cards: number[] }
  | { type: 'unplan' }
  | { type: 'boost' }
  | { type: 'adrenaline' }
  | { type: 'endReact' }
  | { type: 'slipstream'; take: boolean }
  | { type: 'discard'; cards: number[]; round: number }

const MAX_EVENTS = 40

const finishPos = (state: OverheatState) => state.laps * state.spaces
const spaceOf = (state: OverheatState, pos: number) => ((pos % state.spaces) + state.spaces) % state.spaces
const isPlayable = (card: Card) => card.kind !== 'heat'
const isDiscardable = (card: Card) => card.kind === 'speed' || card.kind === 'upgrade'

export function shuffle<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

function newCard(state: OverheatState, kind: CardKind, value = 0): Card {
  return { id: state.nextCardId++, kind, value }
}

function findDriver(state: OverheatState, playerId: string) {
  const driver = state.drivers.find((d) => d.id === playerId)
  if (!driver) throw new MoveError('You are not in this race.')
  return driver
}

function log(state: OverheatState, event: Omit<RaceEvent, 'seq' | 'round'>) {
  state.events.push({ ...event, seq: ++state.seq, round: state.round })
  if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS)
}

function drawCard(driver: Driver): Card | null {
  if (driver.deck.length === 0) {
    driver.deck = shuffle(driver.discard)
    driver.discard = []
  }
  return driver.deck.pop() ?? null
}

/** Flips cards until a 1–4 speed card shows. Everything else flipped goes to the discard pile. */
function flipForSpeed(driver: Driver): Card | null {
  let tries = driver.deck.length + driver.discard.length
  while (tries-- > 0) {
    const card = drawCard(driver)
    if (!card) return null
    if (card.kind === 'speed') return card
    driver.discard.push(card)
  }
  return null
}

function replenish(driver: Driver) {
  for (const entry of driver.play) {
    if (entry.card) driver.discard.push(entry.card)
    if (entry.flipped) driver.discard.push(entry.flipped)
  }
  driver.play = []
  while (driver.hand.length < HAND_SIZE) {
    const card = drawCard(driver)
    if (!card) break
    driver.hand.push(card)
  }
  driver.needsDiscard = false
}

/** Cars still on the track, including any that finished this round. */
const onTrack = (state: OverheatState) => state.drivers.filter((d) => d.place === null)

/** The nearest free spot at a position or behind it. The inside spot goes first. */
function findSpot(state: OverheatState, pos: number, selfId: string): { pos: number; spot: 0 | 1 } {
  const taken = new Set(
    onTrack(state)
      .filter((d) => d.id !== selfId)
      .map((d) => `${spaceOf(state, d.pos)}:${d.spot}`),
  )
  for (let p = pos; p > pos - state.spaces; p--) {
    for (const spot of [0, 1] as const) {
      if (!taken.has(`${spaceOf(state, p)}:${spot}`)) return { pos: p, spot }
    }
  }
  return { pos, spot: 0 }
}

function moveBy(state: OverheatState, driver: Driver, spaces: number) {
  if (spaces === 0) return
  const spot = findSpot(state, driver.pos + spaces, driver.id)
  driver.pos = spot.pos
  driver.spot = spot.spot
}

/** Front of the race first. Side by side, the inside spot is ahead. */
const raceOrder = (drivers: Driver[]) =>
  [...drivers].sort((a, b) => b.pos - a.pos || a.spot - b.spot).map((d) => d.id)

export function reactOptions(driver: Driver): ReactOptions {
  const turn = driver.turn
  if (!turn || turn.step !== 'react' || turn.clogged) return { boost: false, adrenaline: false }
  return {
    boost: !turn.boosted && driver.engine.length > 0,
    adrenaline: turn.adrenaline && !turn.adrenalineUsed,
  }
}

const hasReactOptions = (options: ReactOptions) => options.boost || options.adrenaline

/** Moves Heat from hand back to the engine. It never hurts, so it happens by itself. */
function coolDown(state: OverheatState, driver: Driver) {
  const turn = driver.turn!
  const heat = driver.hand.filter((card) => card.kind === 'heat').slice(0, turn.cooldownLeft)
  if (heat.length === 0) return
  driver.hand = driver.hand.filter((card) => !heat.includes(card))
  driver.engine.push(...heat)
  turn.cooldownLeft -= heat.length
  log(state, { kind: 'cooldown', playerId: driver.id, value: heat.length })
}

/** Whether a car may take a Slipstream: right beside another car, or right behind one. */
export function canSlipstream(state: OverheatState, driver: Driver) {
  const turn = driver.turn
  if (!turn || turn.clogged || turn.step !== 'slipstream') return false
  // No slipstreaming over the finish line on the last lap.
  if (driver.pos + SLIPSTREAM_SPACES >= finishPos(state)) return false
  const here = spaceOf(state, driver.pos)
  const ahead = spaceOf(state, driver.pos + 1)
  return onTrack(state).some((other) => {
    if (other.id === driver.id) return false
    const space = spaceOf(state, other.pos)
    return space === here || space === ahead
  })
}

function payHeat(driver: Driver, amount: number) {
  driver.discard.push(...driver.engine.splice(0, amount))
}

function startTurn(state: OverheatState, driver: Driver) {
  const plan = driver.plan!
  if (Math.abs(plan.gear - driver.gear) === 2) payHeat(driver, 1)
  driver.gear = plan.gear

  const chosen = plan.cards.map((id) => driver.hand.find((card) => card.id === id)!)
  driver.hand = driver.hand.filter((card) => !plan.cards.includes(card.id))
  const clogged = chosen.length < driver.gear
  const index = state.order.indexOf(driver.id)
  const adrenalineCars = state.startCount >= TWO_ADRENALINE_FROM ? 2 : 1
  const adrenaline = !clogged && index >= state.order.length - adrenalineCars

  driver.turn = {
    startPos: driver.pos,
    speed: 0,
    boosted: false,
    adrenaline,
    adrenalineUsed: false,
    cooldownLeft: COOLDOWN_BY_GEAR[driver.gear]! + (adrenaline ? 1 : 0),
    slipstreamed: false,
    clogged,
    step: 'react',
  }

  if (clogged) {
    // A hand full of Heat: play what you can, fill the rest with Heat, and stall.
    const heat = driver.hand.filter((card) => card.kind === 'heat').slice(0, driver.gear - chosen.length)
    driver.hand = driver.hand.filter((card) => !heat.includes(card))
    driver.play = [...chosen, ...heat].map((card) => ({ card, flipped: null, value: 0, boost: false }))
    driver.gear = 1
    log(state, { kind: 'clog', playerId: driver.id })
    return
  }

  driver.play = chosen.map((card) => {
    if (card.kind === 'stress') {
      const flipped = flipForSpeed(driver)
      return { card, flipped, value: flipped?.value ?? 0, boost: false }
    }
    return { card, flipped: null, value: card.value, boost: false }
  })
  driver.turn.speed = driver.play.reduce((sum, entry) => sum + entry.value, 0)
  moveBy(state, driver, driver.turn.speed)
  log(state, { kind: 'move', playerId: driver.id, value: driver.turn.speed })
}

function checkCorners(state: OverheatState, driver: Driver, corners: Corner[]) {
  const turn = driver.turn!
  const limits = new Map(corners.map((corner) => [corner.space, corner.limit]))
  const end = Math.min(driver.pos, finishPos(state) - 1)
  for (let p = turn.startPos + 1; p <= end; p++) {
    const limit = limits.get(spaceOf(state, p))
    if (limit === undefined) continue
    const excess = turn.speed - limit
    if (excess <= 0) continue
    if (driver.engine.length >= excess) {
      payHeat(driver, excess)
      log(state, { kind: 'corner', playerId: driver.id, value: excess, limit })
      continue
    }
    // Spin out: lose all engine Heat, stop before the corner, take Stress and drop to 1st gear.
    payHeat(driver, driver.engine.length)
    const spot = findSpot(state, p - 1, driver.id)
    driver.pos = spot.pos
    driver.spot = spot.spot
    const stress = driver.gear <= 2 ? 1 : 2
    for (let i = 0; i < stress; i++) driver.hand.push(newCard(state, 'stress'))
    driver.gear = 1
    log(state, { kind: 'spin', playerId: driver.id, value: stress, limit })
    return
  }
}

function finishTurn(state: OverheatState, driver: Driver) {
  const turn = driver.turn!
  if (driver.pos >= finishPos(state)) {
    driver.finishedRound = state.round
    replenish(driver)
  } else if (turn.clogged) {
    replenish(driver)
  } else {
    driver.needsDiscard = true
  }
  state.current++
}

function endRound(state: OverheatState) {
  const finishers = state.drivers.filter((d) => d.finishedRound === state.round && d.place === null)
  for (const id of raceOrder(finishers)) {
    const driver = findDriver(state, id)
    state.hallOfFame.push(id)
    driver.place = state.hallOfFame.length
    log(state, { kind: 'finish', playerId: id, value: driver.place })
  }
  for (const driver of state.drivers) {
    driver.plan = null
    driver.turn = null
  }
  state.order = []
  state.current = 0
  if (state.drivers.every((d) => d.place !== null)) {
    state.phase = 'over'
    return
  }
  state.round++
  state.phase = 'plan'
}

/** Runs the round forward until a player has a choice to make. */
function advance(state: OverheatState) {
  const corners = cornersOf(state.trackId)
  while (state.phase === 'resolve') {
    if (state.current >= state.order.length) {
      if (state.drivers.some((d) => d.needsDiscard)) return
      endRound(state)
      return
    }
    const driver = findDriver(state, state.order[state.current]!)
    if (!driver.turn) startTurn(state, driver)
    const turn = driver.turn!
    if (turn.clogged) {
      finishTurn(state, driver)
      continue
    }
    if (turn.step === 'react') {
      coolDown(state, driver)
      if (hasReactOptions(reactOptions(driver))) return
      turn.step = 'slipstream'
    }
    if (turn.step === 'slipstream') {
      if (canSlipstream(state, driver)) return
      turn.step = 'corners'
    }
    checkCorners(state, driver, corners)
    finishTurn(state, driver)
  }
}

function startResolve(state: OverheatState) {
  state.order = raceOrder(onTrack(state))
  state.current = 0
  state.phase = 'resolve'
  advance(state)
}

function maybeStartResolve(state: OverheatState) {
  if (state.phase === 'plan' && onTrack(state).every((d) => d.plan)) startResolve(state)
}

function currentDriver(state: OverheatState, playerId: string, step: TurnStep) {
  if (state.phase !== 'resolve') return null
  const id = state.order[state.current]
  if (id !== playerId) return null
  const driver = findDriver(state, playerId)
  return driver.turn?.step === step ? driver : null
}

function idList(value: unknown): number[] {
  if (!Array.isArray(value) || !value.every((id) => Number.isInteger(id))) {
    throw new MoveError('Pick cards from your hand.')
  }
  if (new Set(value).size !== value.length) throw new MoveError('Pick each card only once.')
  return value as number[]
}

function makeDriver(state: OverheatState, id: string, color: number, pos: number, spot: 0 | 1): Driver {
  const card = (kind: CardKind, value = 0) => newCard(state, kind, value)
  const deck: Card[] = []
  for (let value = 1; value <= 4; value++) for (let i = 0; i < 3; i++) deck.push(card('speed', value))
  deck.push(card('upgrade', 0), card('upgrade', 5), card('heat'))
  for (let i = 0; i < 3; i++) deck.push(card('stress'))
  const driver: Driver = {
    id,
    color: CAR_COLORS[color % CAR_COLORS.length]!.fill,
    pos,
    spot,
    gear: 1,
    engine: Array.from({ length: ENGINE_HEAT }, () => card('heat')),
    hand: [],
    deck: shuffle(deck),
    discard: [],
    play: [],
    plan: null,
    turn: null,
    needsDiscard: false,
    finishedRound: null,
    place: null,
  }
  replenish(driver)
  return driver
}

export const overheat: Game<OverheatState, OverheatView> = {
  id: 'overheat',
  name: 'Overheat',
  minPlayers: 2,
  maxPlayers: MAX_CARS,
  playerColors: CAR_COLORS,
  options: [
    {
      key: 'track',
      label: 'Track',
      min: 0,
      max: TRACKS.length - 1,
      default: 0,
      choices: TRACKS.map((track) => ({
        value: track.id,
        label: `${track.name} · ${track.laps} lap${track.laps === 1 ? '' : 's'}`,
      })),
    },
  ],

  setup(playerIds, options, context) {
    const track = getTrack(options.track ?? 0)
    const state: OverheatState = {
      trackId: track.id,
      laps: track.laps,
      spaces: track.spaces,
      startCount: playerIds.length,
      round: 1,
      phase: 'plan',
      drivers: [],
      order: [],
      current: 0,
      hallOfFame: [],
      nextCardId: 1,
      seq: 0,
      events: [],
    }
    // Players pick their colours in the lobby. The starting grid is random.
    const grid = shuffle(playerIds)
    state.drivers = playerIds.map((id, index) => {
      const slot = grid.indexOf(id)
      return makeDriver(state, id, context?.colors?.[id] ?? index, -1 - Math.floor(slot / 2), (slot % 2) as 0 | 1)
    })
    return state
  },

  applyMove(original, playerId, rawMove) {
    const move = (rawMove ?? {}) as Record<string, unknown>
    if (original.phase === 'over') throw new MoveError('The race is over.')
    const state = structuredClone(original)
    const driver = findDriver(state, playerId)

    switch (move.type) {
      case 'plan': {
        if (state.phase !== 'plan') throw new MoveError('The cars are already moving.')
        if (driver.place !== null) throw new MoveError('You have already finished.')
        const gear = move.gear
        if (typeof gear !== 'number' || !Number.isInteger(gear) || gear < 1 || gear > MAX_GEAR) {
          throw new MoveError('Pick a gear from 1 to 4.')
        }
        const shift = Math.abs(gear - driver.gear)
        if (shift > 2) throw new MoveError('You can shift at most two gears at once.')
        if (shift === 2 && driver.engine.length === 0) {
          throw new MoveError('Shifting two gears costs 1 Heat, and your engine has none.')
        }
        const ids = idList(move.cards)
        const cards = ids.map((id) => driver.hand.find((card) => card.id === id))
        if (cards.some((card) => !card)) throw new MoveError('Those cards are not in your hand.')
        if (cards.some((card) => !isPlayable(card!))) throw new MoveError('Heat cards cannot be played.')
        const needed = Math.min(gear, driver.hand.filter(isPlayable).length)
        if (ids.length !== needed) {
          throw new MoveError(`In gear ${gear}, play ${needed} card${needed === 1 ? '' : 's'}.`)
        }
        driver.plan = { gear, cards: ids }
        maybeStartResolve(state)
        return state
      }

      case 'unplan': {
        if (state.phase !== 'plan') return original
        driver.plan = null
        return state
      }

      case 'boost': {
        const active = currentDriver(state, playerId, 'react')
        if (!active) throw new MoveError('You can only boost on your turn.')
        if (!reactOptions(active).boost) throw new MoveError('You cannot boost now.')
        payHeat(active, 1)
        const flipped = flipForSpeed(active)
        const value = flipped?.value ?? 0
        active.play.push({ card: null, flipped, value, boost: true })
        active.turn!.boosted = true
        active.turn!.speed += value
        moveBy(state, active, value)
        log(state, { kind: 'boost', playerId, value })
        advance(state)
        return state
      }

      case 'adrenaline': {
        const active = currentDriver(state, playerId, 'react')
        if (!active || !reactOptions(active).adrenaline) throw new MoveError('You have no Adrenaline to use.')
        active.turn!.adrenalineUsed = true
        active.turn!.speed += 1
        moveBy(state, active, 1)
        log(state, { kind: 'adrenaline', playerId })
        advance(state)
        return state
      }

      case 'endReact': {
        const active = currentDriver(state, playerId, 'react')
        if (!active) return original
        active.turn!.step = 'slipstream'
        advance(state)
        return state
      }

      case 'slipstream': {
        const active = currentDriver(state, playerId, 'slipstream')
        if (!active) return original
        if (move.take === true) {
          moveBy(state, active, SLIPSTREAM_SPACES)
          active.turn!.slipstreamed = true
          log(state, { kind: 'slipstream', playerId })
        }
        active.turn!.step = 'corners'
        advance(state)
        return state
      }

      case 'discard': {
        if (move.round !== state.round || !driver.needsDiscard) return original
        const ids = idList(move.cards)
        const cards = ids.map((id) => driver.hand.find((card) => card.id === id))
        if (cards.some((card) => !card)) throw new MoveError('Those cards are not in your hand.')
        if (cards.some((card) => !isDiscardable(card!))) {
          throw new MoveError('Heat and Stress cards cannot be discarded.')
        }
        driver.hand = driver.hand.filter((card) => !ids.includes(card.id))
        driver.discard.push(...(cards as Card[]))
        replenish(driver)
        advance(state)
        return state
      }

      default:
        throw new MoveError('Unknown move.')
    }
  },

  viewFor(state, viewerId) {
    const current = state.phase === 'resolve' ? state.drivers.find((d) => d.id === state.order[state.current]) : null
    const viewer = viewerId ? state.drivers.find((d) => d.id === viewerId) : undefined
    const yourTurn = viewer && current?.id === viewer.id
    return {
      trackId: state.trackId,
      laps: state.laps,
      spaces: state.spaces,
      round: state.round,
      phase: state.phase,
      order: state.order,
      current: current?.turn ? { id: current.id, step: current.turn.step } : null,
      hallOfFame: state.hallOfFame,
      events: state.events,
      cars: state.drivers.map((d) => ({
        id: d.id,
        color: d.color,
        pos: d.pos,
        spot: d.spot,
        gear: d.gear,
        engine: d.engine.length,
        hand: d.hand.length,
        deck: d.deck.length,
        discard: d.discard.length,
        play: d.turn ? d.play : [],
        speed: d.turn && !d.turn.clogged ? d.turn.speed : null,
        startPos: d.turn ? d.turn.startPos : null,
        planned: d.plan !== null,
        needsDiscard: d.needsDiscard,
        finishedRound: d.finishedRound,
        place: d.place,
      })),
      you: viewer
        ? {
            hand: viewer.hand,
            plan: viewer.plan,
            react: yourTurn && viewer.turn?.step === 'react' ? reactOptions(viewer) : null,
            canSlipstream: !!yourTurn && canSlipstream(state, viewer),
          }
        : null,
    }
  },

  result(state) {
    if (state.phase !== 'over') return null
    return { winnerIds: state.hallOfFame.slice(0, 1) }
  },

  waitingOn(state) {
    if (state.phase === 'plan') return onTrack(state).filter((d) => !d.plan).map((d) => d.id)
    if (state.phase !== 'resolve') return []
    const waiting = state.drivers.filter((d) => d.needsDiscard).map((d) => d.id)
    const id = state.order[state.current]
    if (id && !waiting.includes(id)) waiting.push(id)
    return waiting
  },

  recolor(original, playerId, color) {
    const fill = CAR_COLORS[color]?.fill
    if (!fill) return original
    return { ...original, drivers: original.drivers.map((d) => (d.id === playerId ? { ...d, color: fill } : d)) }
  },

  onPlayerLeave(original, playerId) {
    const state = structuredClone(original)
    state.drivers = state.drivers.filter((d) => d.id !== playerId)
    if (state.drivers.length < 2) return null
    state.hallOfFame = state.hallOfFame.filter((id) => id !== playerId)
    state.drivers.forEach((d) => {
      if (d.place !== null) d.place = state.hallOfFame.indexOf(d.id) + 1
    })

    const index = state.order.indexOf(playerId)
    if (index !== -1) {
      state.order.splice(index, 1)
      if (index < state.current) state.current--
    }
    if (state.phase === 'plan') {
      if (state.drivers.every((d) => d.place !== null)) state.phase = 'over'
      else maybeStartResolve(state)
    } else if (state.phase === 'resolve') {
      advance(state)
    }
    return state
  },
}
