import { MoveError, type Game } from '../types'
import { SPECTRUMS } from './spectrums'

/** The dial runs from 0 (far left) to this (far right), in degrees. */
export const DIAL_MAX = 180
export const DIAL_START = 90
export const MAX_CLUE_LENGTH = 60
export const TEAM_NAMES = ['Coral', 'Teal']

/** Points for landing within this many degrees of the target, best first. */
export const SCORE_BANDS = [
  { within: 3, points: 4 },
  { within: 9, points: 3 },
  { within: 15, points: 2 },
] as const

export const MODE_TEAMS = 0
export const MODE_COOP = 1

export type Side = 'left' | 'right'
export type Phase = 'clue' | 'guess' | 'side' | 'reveal'

export interface RoundRecord {
  psychicId: string
  team: number
  spectrum: [string, string]
  clue: string
  target: number
  dial: number
  points: number
  sidePoint: boolean
}

export interface DialInState {
  mode: 'teams' | 'coop'
  /** In co-op, everyone is on the one team. */
  teams: string[][]
  scores: number[]
  targetScore: number
  totalRounds: number
  /** How many times each team has had a Psychic, so the job rotates. */
  psychicTurns: number[]
  activeTeam: number
  round: number
  phase: Phase
  deck: number[]
  spectrum: [string, string]
  psychicId: string
  /** Secret from everyone but the Psychic until reveal. */
  target: number
  clue: string | null
  dial: number
  ready: string[]
  side: Side | null
  sideReady: string[]
  history: RoundRecord[]
}

export interface DialInView extends Omit<DialInState, 'deck' | 'target'> {
  target: number | null
  guesserIds: string[]
  /** The team that guesses left or right, in team mode. */
  sideTeamIds: string[]
}

export type DialInMove =
  | { type: 'redraw' }
  | { type: 'clue'; text: string }
  | { type: 'dial'; value: number }
  | { type: 'ready'; ready: boolean }
  | { type: 'side'; side: Side | null }
  | { type: 'sideReady'; ready: boolean }
  | { type: 'nextRound'; round: number }

export function pointsFor(dial: number, target: number) {
  const distance = Math.abs(dial - target)
  return SCORE_BANDS.find((band) => distance <= band.within)?.points ?? 0
}

/** Which side of the dial the target is really on. Null on a bullseye. */
export function trueSide(dial: number, target: number): Side | null {
  if (target === dial) return null
  return target < dial ? 'left' : 'right'
}

function shuffledDeck() {
  const deck = SPECTRUMS.map((_, index) => index)
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j]!, deck[i]!]
  }
  return deck
}

function drawSpectrum(state: DialInState) {
  const deck = state.deck.length ? [...state.deck] : shuffledDeck()
  const index = deck.pop()!
  return { deck, spectrum: SPECTRUMS[index]! }
}

export const guessersOf = (state: Pick<DialInState, 'teams' | 'activeTeam' | 'psychicId'>) =>
  state.teams[state.activeTeam]!.filter((id) => id !== state.psychicId)

export const sideTeamOf = (state: Pick<DialInState, 'mode' | 'teams' | 'activeTeam'>) =>
  state.mode === 'teams' ? state.teams[1 - state.activeTeam]! : []

/** Starts a turn for a team, with the next Psychic in that team's rotation. */
function startTurn(state: DialInState, team: number, round: number): DialInState {
  const members = state.teams[team]!
  const psychicTurns = [...state.psychicTurns]
  const psychicId = members[psychicTurns[team]! % members.length]!
  psychicTurns[team]! += 1
  const { deck, spectrum } = drawSpectrum(state)
  return {
    ...state,
    activeTeam: team,
    psychicTurns,
    psychicId,
    round,
    phase: 'clue',
    deck,
    spectrum,
    target: Math.floor(Math.random() * (DIAL_MAX + 1)),
    clue: null,
    dial: DIAL_START,
    ready: [],
    side: null,
    sideReady: [],
  }
}

function reveal(state: DialInState): DialInState {
  const points = pointsFor(state.dial, state.target)
  const actualSide = trueSide(state.dial, state.target)
  const sidePoint = state.mode === 'teams' && points < 4 && state.side !== null && state.side === actualSide
  const scores = [...state.scores]
  scores[state.activeTeam]! += points
  if (sidePoint) scores[1 - state.activeTeam]! += 1
  return {
    ...state,
    phase: 'reveal',
    scores,
    history: [
      ...state.history,
      {
        psychicId: state.psychicId,
        team: state.activeTeam,
        spectrum: state.spectrum,
        clue: state.clue ?? '',
        target: state.target,
        dial: state.dial,
        points,
        sidePoint,
      },
    ],
  }
}

/** Moves on once everyone who needs to has pressed Ready. */
function advanceIfReady(state: DialInState): DialInState {
  if (state.phase === 'guess') {
    const guessers = guessersOf(state)
    if (guessers.length === 0 || !guessers.every((id) => state.ready.includes(id))) return state
    return state.mode === 'teams' ? { ...state, phase: 'side' } : reveal(state)
  }
  if (state.phase === 'side') {
    const sideTeam = sideTeamOf(state)
    if (state.side === null || !sideTeam.every((id) => state.sideReady.includes(id))) return state
    return reveal(state)
  }
  return state
}

function winner(state: DialInState) {
  if (state.phase !== 'reveal') return null
  if (state.mode === 'coop') return state.round >= state.totalRounds ? 0 : null
  const top = Math.max(...state.scores)
  // A tie at the top means another round, until one team is ahead.
  if (top < state.targetScore || state.scores.filter((score) => score === top).length > 1) return null
  return state.scores.indexOf(top)
}

export const dialIn: Game<DialInState, DialInView> = {
  id: 'dial-in',
  name: 'Dial In',
  minPlayers: 2,
  maxPlayers: 15,
  options: [
    {
      key: 'mode',
      label: 'Play as',
      min: MODE_TEAMS,
      max: MODE_COOP,
      default: MODE_TEAMS,
      choices: [
        { value: MODE_TEAMS, label: 'Two teams' },
        { value: MODE_COOP, label: 'One team (co-op)' },
      ],
    },
    { key: 'targetScore', label: 'Play to', min: 5, max: 30, default: 10, showWhen: { key: 'mode', value: MODE_TEAMS } },
    { key: 'rounds', label: 'Rounds', min: 3, max: 30, default: 10, showWhen: { key: 'mode', value: MODE_COOP } },
  ],
  teams: {
    names: TEAM_NAMES,
    minPerTeam: 2,
    when: (options) => options.mode !== MODE_COOP,
  },

  setup(playerIds, options, context) {
    const isTeams = options.mode !== MODE_COOP
    const teams = isTeams
      ? [0, 1].map((team) => playerIds.filter((id) => context?.teams[id] === team))
      : [[...playerIds]]
    const initial: DialInState = {
      mode: isTeams ? 'teams' : 'coop',
      teams,
      scores: teams.map(() => 0),
      targetScore: options.targetScore ?? 10,
      totalRounds: options.rounds ?? 10,
      psychicTurns: teams.map(() => 0),
      activeTeam: 0,
      round: 0,
      phase: 'clue',
      deck: [],
      spectrum: ['', ''],
      psychicId: '',
      target: 0,
      clue: null,
      dial: DIAL_START,
      ready: [],
      side: null,
      sideReady: [],
      history: [],
    }
    return startTurn(initial, 0, 1)
  },

  applyMove(state, playerId, rawMove) {
    if (!state.teams.some((team) => team.includes(playerId))) {
      throw new MoveError('You are not playing in this game.')
    }
    const move = (rawMove ?? {}) as Record<string, unknown>
    const requirePhase = (phase: Phase) => {
      if (state.phase !== phase) throw new MoveError('It’s not time for that.')
    }
    const requirePsychic = () => {
      if (playerId !== state.psychicId) throw new MoveError('Only the Psychic can do that.')
    }
    const requireGuesser = () => {
      if (!guessersOf(state).includes(playerId)) throw new MoveError('Only the Psychic’s teammates can turn the dial.')
    }
    const requireSideTeam = () => {
      if (!sideTeamOf(state).includes(playerId)) throw new MoveError('Only the other team guesses left or right.')
    }

    switch (move.type) {
      case 'redraw': {
        requirePhase('clue')
        requirePsychic()
        return { ...state, ...drawSpectrum(state) }
      }

      case 'clue': {
        requirePhase('clue')
        requirePsychic()
        const text =
          typeof move.text === 'string'
            ? move.text.replace(/\p{C}/gu, '').replace(/\s+/g, ' ').trim().slice(0, MAX_CLUE_LENGTH).trim()
            : ''
        if (!text) throw new MoveError('Type a clue.')
        return { ...state, clue: text, phase: 'guess' }
      }

      case 'dial': {
        requirePhase('guess')
        requireGuesser()
        const value = move.value
        if (typeof value !== 'number' || !Number.isFinite(value)) throw new MoveError('That isn’t a dial position.')
        const dial = Math.round(Math.min(DIAL_MAX, Math.max(0, value)))
        if (dial === state.dial) return state
        // Any change means the team should look again before locking in.
        return { ...state, dial, ready: [] }
      }

      case 'ready': {
        requirePhase('guess')
        requireGuesser()
        const ready = state.ready.filter((id) => id !== playerId)
        if (move.ready) ready.push(playerId)
        return advanceIfReady({ ...state, ready })
      }

      case 'side': {
        requirePhase('side')
        requireSideTeam()
        if (move.side !== null && move.side !== 'left' && move.side !== 'right') {
          throw new MoveError('Choose left or right.')
        }
        if (move.side === state.side) return state
        return { ...state, side: move.side, sideReady: [] }
      }

      case 'sideReady': {
        requirePhase('side')
        requireSideTeam()
        if (move.ready && state.side === null) throw new MoveError('Choose left or right first.')
        const sideReady = state.sideReady.filter((id) => id !== playerId)
        if (move.ready) sideReady.push(playerId)
        return advanceIfReady({ ...state, sideReady })
      }

      case 'nextRound': {
        if (move.round !== state.round) return state
        requirePhase('reveal')
        if (winner(state) !== null) throw new MoveError('The game is over.')
        const nextTeam = state.mode === 'teams' ? 1 - state.activeTeam : 0
        return startTurn(state, nextTeam, state.round + 1)
      }

      default:
        throw new MoveError('That move isn’t recognized.')
    }
  },

  viewFor(state, viewerId) {
    const { deck: _deck, target, ...rest } = state
    const canSeeTarget = state.phase === 'reveal' || viewerId === state.psychicId
    return {
      ...rest,
      target: canSeeTarget ? target : null,
      guesserIds: guessersOf(state),
      sideTeamIds: sideTeamOf(state),
    }
  },

  result(state) {
    const team = winner(state)
    if (team === null) return null
    if (state.mode === 'coop') {
      return {
        winnerIds: [...state.teams[0]!],
        message: `Team score: ${state.scores[0]} out of ${state.totalRounds * 4}`,
      }
    }
    return {
      winnerIds: [...state.teams[team]!],
      message: `Team ${TEAM_NAMES[team]} wins, ${state.scores[team]} to ${state.scores[1 - team]}!`,
    }
  },

  waitingOn(state) {
    switch (state.phase) {
      case 'clue':
        return [state.psychicId]
      case 'guess':
        return guessersOf(state).filter((id) => !state.ready.includes(id))
      case 'side':
        return sideTeamOf(state).filter((id) => !state.sideReady.includes(id))
      case 'reveal':
        return []
    }
  },

  onPlayerLeave(state, playerId) {
    const teams = state.teams.map((team) => team.filter((id) => id !== playerId))
    const tooSmall = state.mode === 'teams' ? teams.some((team) => team.length < 2) : teams[0]!.length < 2
    if (tooSmall) return null

    const remaining: DialInState = {
      ...state,
      teams,
      ready: state.ready.filter((id) => id !== playerId),
      sideReady: state.sideReady.filter((id) => id !== playerId),
    }
    // Without its Psychic the turn can't finish, so the same team starts over with the next one.
    if (playerId === state.psychicId && state.phase !== 'reveal') {
      return startTurn(remaining, state.activeTeam, state.round)
    }
    return advanceIfReady(remaining)
  },
}
