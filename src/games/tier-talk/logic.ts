import { MoveError, type Game } from '../types'

export const TIERS = ['S', 'A', 'B', 'C', 'D'] as const
export type Tier = (typeof TIERS)[number]

export const CONTENDER_COUNT = 8
export const MAX_CATEGORY_LENGTH = 60
export const MAX_NAME_LENGTH = 30
export const MAX_ROUND_POINTS = CONTENDER_COUNT * 2

export type Phase = 'category' | 'names' | 'rank' | 'guess' | 'reveal'

export interface RoundRecord {
  wizardId: string
  category: string
  points: number
}

export interface TierTalkState {
  order: string[]
  /** Everyone who has had a turn as Wizard. The game ends once that's everyone. */
  wizardsDone: string[]
  wizardId: string
  round: number
  phase: Phase
  /** Secret from the guessers until the guessing starts. */
  category: string | null
  contenders: (string | null)[]
  /** Which guesser fills in each contender slot. */
  slotOwners: string[]
  /** Secret until reveal. */
  wizardTiers: Tier[] | null
  /** The guessers' shared board. */
  guessTiers: (Tier | null)[]
  ready: string[]
  slotPoints: number[] | null
  history: RoundRecord[]
}

export interface TierTalkView extends Omit<TierTalkState, 'category' | 'wizardTiers'> {
  category: string | null
  wizardTiers: Tier[] | null
  guesserIds: string[]
  totalPoints: number
  maxPoints: number
  totalRounds: number
}

export type TierTalkMove =
  | { type: 'category'; text: string }
  | { type: 'name'; slot: number; text: string }
  | { type: 'lockNames' }
  | { type: 'rank'; tiers: Tier[] }
  | { type: 'guess'; slot: number; tier: Tier | null }
  | { type: 'ready'; ready: boolean }
  | { type: 'nextRound'; round: number }

const clean = (text: unknown, max: number) =>
  typeof text === 'string'
    ? text.replace(/\p{C}/gu, '').replace(/\s+/g, ' ').trim().slice(0, max).trim()
    : ''

const isTier = (value: unknown): value is Tier => TIERS.includes(value as Tier)

/** 2 for the Wizard's exact tier, 1 for one tier away. */
export function slotScore(guess: Tier | null, actual: Tier): number {
  if (guess === null) return 0
  const distance = Math.abs(TIERS.indexOf(guess) - TIERS.indexOf(actual))
  return distance === 0 ? 2 : distance === 1 ? 1 : 0
}

export const guessersOf = (state: Pick<TierTalkState, 'order' | 'wizardId'>) => {
  const index = state.order.indexOf(state.wizardId)
  return [...state.order.slice(index + 1), ...state.order.slice(0, index)]
}

/** Shares out the contender slots among the guessers, in turn order. */
function assignSlots(state: TierTalkState) {
  const guessers = guessersOf(state)
  return Array.from({ length: CONTENDER_COUNT }, (_, slot) => guessers[slot % guessers.length]!)
}

function startRound(state: TierTalkState, wizardId: string, round: number): TierTalkState {
  const next: TierTalkState = {
    ...state,
    wizardId,
    round,
    phase: 'category',
    category: null,
    contenders: Array(CONTENDER_COUNT).fill(null),
    slotOwners: [],
    wizardTiers: null,
    guessTiers: Array(CONTENDER_COUNT).fill(null),
    ready: [],
    slotPoints: null,
  }
  return { ...next, slotOwners: assignSlots(next) }
}

/** The next player, after the current Wizard, who hasn't been Wizard yet. */
function nextWizard(state: TierTalkState, afterIndex: number) {
  for (let step = 1; step <= state.order.length; step++) {
    const id = state.order[(afterIndex + step) % state.order.length]!
    if (!state.wizardsDone.includes(id)) return id
  }
  return null
}

function reveal(state: TierTalkState): TierTalkState {
  const slotPoints = state.wizardTiers!.map((tier, slot) => slotScore(state.guessTiers[slot]!, tier))
  const points = slotPoints.reduce((sum, value) => sum + value, 0)
  return {
    ...state,
    phase: 'reveal',
    ready: [],
    slotPoints,
    history: [...state.history, { wizardId: state.wizardId, category: state.category!, points }],
  }
}

/** Reveals once every guesser is ready and the board is complete. */
function revealIfReady(state: TierTalkState) {
  if (state.phase !== 'guess' || state.guessTiers.some((tier) => tier === null)) return state
  const guessers = guessersOf(state)
  return guessers.every((id) => state.ready.includes(id)) ? reveal(state) : state
}

const isOver = (state: TierTalkState) =>
  state.phase === 'reveal' && state.order.every((id) => state.wizardsDone.includes(id))

export const tierTalk: Game<TierTalkState, TierTalkView> = {
  id: 'tier-talk',
  name: 'Tier Talk',
  minPlayers: 3,
  maxPlayers: 15,

  setup(playerIds) {
    const initial: TierTalkState = {
      order: playerIds,
      wizardsDone: [playerIds[0]!],
      wizardId: playerIds[0]!,
      round: 0,
      phase: 'category',
      category: null,
      contenders: [],
      slotOwners: [],
      wizardTiers: null,
      guessTiers: [],
      ready: [],
      slotPoints: null,
      history: [],
    }
    return startRound(initial, playerIds[0]!, 1)
  },

  applyMove(state, playerId, rawMove) {
    if (!state.order.includes(playerId)) throw new MoveError('You are not playing in this game.')
    const move = (rawMove ?? {}) as Record<string, unknown>
    const isWizard = playerId === state.wizardId
    const requirePhase = (phase: Phase) => {
      if (state.phase !== phase) throw new MoveError('It’s not time for that.')
    }
    const requireWizard = () => {
      if (!isWizard) throw new MoveError('Only the Tier Wizard can do that.')
    }
    const requireGuesser = () => {
      if (isWizard) throw new MoveError('The Tier Wizard can’t help guess.')
    }

    switch (move.type) {
      case 'category': {
        requirePhase('category')
        requireWizard()
        const category = clean(move.text, MAX_CATEGORY_LENGTH)
        if (!category) throw new MoveError('Choose or type a category.')
        return { ...state, category, phase: 'names' }
      }

      case 'name': {
        requirePhase('names')
        const slot = move.slot
        if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0 || slot >= CONTENDER_COUNT) {
          throw new MoveError('That isn’t a contender slot.')
        }
        if (state.slotOwners[slot] !== playerId) throw new MoveError('Someone else is naming that one.')
        const name = clean(move.text, MAX_NAME_LENGTH)
        if (!name) throw new MoveError('Type a name.')
        const duplicate = state.contenders.some(
          (other, index) => index !== slot && other?.toLowerCase() === name.toLowerCase(),
        )
        if (duplicate) throw new MoveError(`${name} is already a contender.`)
        const contenders = [...state.contenders]
        contenders[slot] = name
        return { ...state, contenders }
      }

      case 'lockNames': {
        requirePhase('names')
        requireWizard()
        if (state.contenders.some((name) => !name)) throw new MoveError('Wait for all 8 names.')
        return { ...state, phase: 'rank' }
      }

      case 'rank': {
        requirePhase('rank')
        requireWizard()
        const tiers = move.tiers
        if (!Array.isArray(tiers) || tiers.length !== CONTENDER_COUNT || !tiers.every(isTier)) {
          throw new MoveError('Put every contender in a tier.')
        }
        return { ...state, wizardTiers: [...tiers], phase: 'guess' }
      }

      case 'guess': {
        requirePhase('guess')
        requireGuesser()
        const slot = move.slot
        if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0 || slot >= CONTENDER_COUNT) {
          throw new MoveError('That isn’t a contender.')
        }
        if (move.tier !== null && !isTier(move.tier)) throw new MoveError('That isn’t a tier.')
        const guessTiers = [...state.guessTiers]
        guessTiers[slot] = move.tier
        // Any change means the group should look again before locking in.
        return { ...state, guessTiers, ready: [] }
      }

      case 'ready': {
        requirePhase('guess')
        requireGuesser()
        if (move.ready && state.guessTiers.some((tier) => tier === null)) {
          throw new MoveError('Place every contender first.')
        }
        const ready = state.ready.filter((id) => id !== playerId)
        if (move.ready) ready.push(playerId)
        return revealIfReady({ ...state, ready })
      }

      case 'nextRound': {
        if (move.round !== state.round) return state
        requirePhase('reveal')
        if (isOver(state)) throw new MoveError('The game is over.')
        const wizardId = nextWizard(state, state.order.indexOf(state.wizardId))!
        return startRound(
          { ...state, wizardsDone: [...state.wizardsDone, wizardId] },
          wizardId,
          state.round + 1,
        )
      }

      default:
        throw new MoveError('That move isn’t recognized.')
    }
  },

  viewFor(state, viewerId) {
    const isWizard = viewerId === state.wizardId
    const categoryVisible = isWizard || state.phase === 'guess' || state.phase === 'reveal'
    const totalPoints = state.history.reduce((sum, record) => sum + record.points, 0)
    return {
      ...state,
      category: categoryVisible ? state.category : null,
      wizardTiers: isWizard || state.phase === 'reveal' ? state.wizardTiers : null,
      guesserIds: guessersOf(state),
      totalPoints,
      maxPoints: state.history.length * MAX_ROUND_POINTS,
      totalRounds: state.order.length,
    }
  },

  result(state) {
    if (!isOver(state)) return null
    const total = state.history.reduce((sum, record) => sum + record.points, 0)
    return {
      winnerIds: [...state.order],
      message: `Team score: ${total} out of ${state.history.length * MAX_ROUND_POINTS}`,
    }
  },

  waitingOn(state) {
    switch (state.phase) {
      case 'category':
      case 'rank':
        return [state.wizardId]
      case 'names': {
        const waiting = state.slotOwners.filter((owner, slot) => !state.contenders[slot])
        return waiting.length ? [...new Set(waiting)] : [state.wizardId]
      }
      case 'guess':
        return guessersOf(state).filter((id) => !state.ready.includes(id))
      case 'reveal':
        return []
    }
  },

  onPlayerLeave(state, playerId) {
    const index = state.order.indexOf(playerId)
    if (index === -1) return state
    const order = state.order.filter((id) => id !== playerId)
    if (order.length < 2) return null
    const remaining: TierTalkState = {
      ...state,
      order,
      ready: state.ready.filter((id) => id !== playerId),
      wizardsDone: state.wizardsDone.filter((id) => id !== playerId || id === state.wizardId),
    }

    if (playerId === state.wizardId) {
      if (state.phase === 'reveal') return remaining
      // The round can't go on without its Wizard, so the next player starts a fresh one.
      const wizardId = nextWizard({ ...remaining, wizardsDone: remaining.wizardsDone }, index - 1)
      if (!wizardId) return null
      return startRound(
        { ...remaining, wizardsDone: [...remaining.wizardsDone, wizardId] },
        wizardId,
        state.round + 1,
      )
    }

    // Their unnamed slots go to the remaining guessers.
    const guessers = guessersOf(remaining)
    let handOff = 0
    const slotOwners = state.slotOwners.map((owner, slot) =>
      owner === playerId && !state.contenders[slot] ? guessers[handOff++ % guessers.length]! : owner,
    )
    return revealIfReady({ ...remaining, slotOwners })
  },
}
