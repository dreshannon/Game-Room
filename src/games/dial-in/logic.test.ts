import { describe, expect, it } from 'vitest'
import { MoveError } from '../types'
import {
  DIAL_START,
  MODE_COOP,
  MODE_TEAMS,
  dialIn,
  guessersOf,
  pointsFor,
  trueSide,
  type DialInState,
} from './logic'
import { SPECTRUMS } from './spectrums'

// a1 and a2 are Coral (team 0), b1 and b2 are Teal (team 1).
const TEAMS = { a1: 0, a2: 0, b1: 1, b2: 1 }
const PLAYERS = Object.keys(TEAMS)

const teamsGame = (targetScore = 10) =>
  dialIn.setup(PLAYERS, { mode: MODE_TEAMS, targetScore }, { teams: TEAMS })
const coopGame = (players = ['p1', 'p2', 'p3'], rounds = 3) =>
  dialIn.setup(players, { mode: MODE_COOP, rounds }, { teams: {} })

const play = (state: DialInState, player: string, move: Record<string, unknown>) =>
  dialIn.applyMove(state, player, move)

/** Gives a clue, sets the dial, and readies the guessing team. */
function guessAt(state: DialInState, dial: number, target = state.target) {
  let next = play({ ...state, target }, state.psychicId, { type: 'clue', text: 'warm' })
  const [first, ...others] = guessersOf(next)
  next = play(next, first!, { type: 'dial', value: dial })
  for (const id of [first!, ...others]) next = play(next, id, { type: 'ready', ready: true })
  return next
}

function sideGuess(state: DialInState, side: 'left' | 'right') {
  const [first, ...others] = state.teams[1 - state.activeTeam]!
  let next = play(state, first!, { type: 'side', side })
  for (const id of [first!, ...others]) next = play(next, id, { type: 'sideReady', ready: true })
  return next
}

describe('scoring', () => {
  it('gives 4, 3, or 2 points by how close the dial is, and 0 beyond', () => {
    expect(pointsFor(90, 90)).toBe(4)
    expect(pointsFor(93, 90)).toBe(4)
    expect(pointsFor(81, 90)).toBe(3)
    expect(pointsFor(105, 90)).toBe(2)
    expect(pointsFor(106, 90)).toBe(0)
  })

  it('works out which side the target is on', () => {
    expect(trueSide(90, 40)).toBe('left')
    expect(trueSide(90, 140)).toBe('right')
    expect(trueSide(90, 90)).toBeNull()
  })
})

describe('team mode', () => {
  it('sets up teams from the lobby, with Coral’s first Psychic', () => {
    const state = teamsGame()
    expect(state.teams).toEqual([['a1', 'a2'], ['b1', 'b2']])
    expect(state.psychicId).toBe('a1')
    expect(state.dial).toBe(DIAL_START)
    expect(SPECTRUMS).toContainEqual(state.spectrum)
  })

  it('hides the target from everyone but the Psychic until reveal', () => {
    const state = teamsGame()
    expect(dialIn.viewFor(state, 'a1').target).toBe(state.target)
    for (const viewer of ['a2', 'b1', null]) expect(dialIn.viewFor(state, viewer).target).toBeNull()
    expect(dialIn.viewFor(state, 'b1')).not.toHaveProperty('deck')
  })

  it('lets only the Psychic give a clue or draw a different card', () => {
    const state = teamsGame()
    expect(() => play(state, 'a2', { type: 'clue', text: 'hot' })).toThrow('Psychic')
    expect(() => play(state, 'a1', { type: 'clue', text: '  ' })).toThrow(MoveError)
    expect(play(state, 'a1', { type: 'redraw' }).deck).toHaveLength(state.deck.length - 1)
  })

  it('lets only the Psychic’s teammates turn the dial, and un-readies on a change', () => {
    let state = play(teamsGame(), 'a1', { type: 'clue', text: 'warm' })
    expect(() => play(state, 'a1', { type: 'dial', value: 10 })).toThrow()
    expect(() => play(state, 'b1', { type: 'dial', value: 10 })).toThrow()
    state = play(state, 'a2', { type: 'dial', value: 250 })
    expect(state.dial).toBe(180)
    expect(dialIn.waitingOn!(state)).toEqual(['a2'])
  })

  it('has the other team guess left or right, then scores both', () => {
    let state = guessAt(teamsGame(), 100, 85)
    expect(state.phase).toBe('side')
    expect(dialIn.waitingOn!(state)).toEqual(['b1', 'b2'])
    state = sideGuess(state, 'left')
    expect(state.phase).toBe('reveal')
    expect(state.scores).toEqual([2, 1])
  })

  it('gives no left/right point on a bullseye, or for the wrong side', () => {
    expect(sideGuess(guessAt(teamsGame(), 90, 91), 'right').scores).toEqual([4, 0])
    expect(sideGuess(guessAt(teamsGame(), 90, 60), 'right').scores).toEqual([0, 0])
  })

  it('takes turns between teams and rotates each team’s Psychic', () => {
    let state = sideGuess(guessAt(teamsGame(), 0, 180), 'right')
    const psychics = [state.psychicId]
    for (let round = 1; round <= 3; round++) {
      state = play(state, 'a2', { type: 'nextRound', round })
      psychics.push(state.psychicId)
      state = sideGuess(guessAt(state, 0, 180), 'right')
    }
    expect(psychics).toEqual(['a1', 'b1', 'a2', 'b2'])
  })

  it('ends when a team reaches the target, but keeps going on a tie', () => {
    let state = { ...teamsGame(4), scores: [0, 4] }
    state = sideGuess(guessAt(state, 90, 90), 'left')
    expect(state.scores).toEqual([4, 4])
    expect(dialIn.result(state)).toBeNull()
    state = play(state, 'b1', { type: 'nextRound', round: 1 })
    state = sideGuess(guessAt(state, 90, 90), 'left')
    expect(dialIn.result(state)).toEqual({
      winnerIds: ['b1', 'b2'],
      message: 'Team Teal wins, 8 to 4!',
    })
    expect(() => play(state, 'a1', { type: 'nextRound', round: 2 })).toThrow('over')
  })

  it('ignores a duplicate next-round click', () => {
    let state = sideGuess(guessAt(teamsGame(), 90, 10), 'left')
    state = play(state, 'a2', { type: 'nextRound', round: 1 })
    expect(play(state, 'b2', { type: 'nextRound', round: 1 })).toBe(state)
  })
})

describe('co-op mode', () => {
  it('puts everyone on one team, skips left/right, and rotates the Psychic', () => {
    let state = coopGame()
    expect(state.teams).toEqual([['p1', 'p2', 'p3']])
    state = guessAt(state, 90, 90)
    expect(state.phase).toBe('reveal')
    expect(state.scores).toEqual([4])
    state = play(state, 'p1', { type: 'nextRound', round: 1 })
    expect(state.psychicId).toBe('p2')
  })

  it('ends after the set number of rounds with the team score', () => {
    let state = coopGame(['p1', 'p2'], 3)
    for (let round = 1; round <= 3; round++) {
      state = guessAt(state, 90, 90)
      if (round < 3) state = play(state, 'p1', { type: 'nextRound', round })
    }
    expect(dialIn.result(state)).toEqual({ winnerIds: ['p1', 'p2'], message: 'Team score: 12 out of 12' })
  })
})

describe('players leaving', () => {
  it('starts a fresh turn with the next Psychic if the Psychic leaves', () => {
    const state = dialIn.onPlayerLeave!(
      dialIn.setup(['a1', 'a2', 'a3', 'b1', 'b2'], { mode: MODE_TEAMS }, { teams: { ...TEAMS, a3: 0 } }),
      'a1',
    )!
    expect(state.activeTeam).toBe(0)
    expect(['a2', 'a3']).toContain(state.psychicId)
    expect(state.phase).toBe('clue')
  })

  it('moves on if the last guesser who wasn’t ready leaves', () => {
    let state = play(coopGame(['p1', 'p2', 'p3']), 'p1', { type: 'clue', text: 'warm' })
    state = play(state, 'p2', { type: 'ready', ready: true })
    state = dialIn.onPlayerLeave!(state, 'p3')!
    expect(state.phase).toBe('reveal')
  })

  it('ends the game if a team drops below two players', () => {
    expect(dialIn.onPlayerLeave!(teamsGame(), 'b2')).toBeNull()
    expect(dialIn.onPlayerLeave!(coopGame(['p1', 'p2']), 'p2')).toBeNull()
  })
})

describe('spectrum cards', () => {
  it('has plenty of unique, two-ended cards', () => {
    expect(SPECTRUMS.length).toBeGreaterThanOrEqual(50)
    expect(new Set(SPECTRUMS.map((pair) => pair.join('|'))).size).toBe(SPECTRUMS.length)
    expect(SPECTRUMS.every(([left, right]) => left && right && left !== right)).toBe(true)
  })
})
