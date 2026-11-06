import { describe, expect, it } from 'vitest'
import { MoveError } from '../types'
import { CATEGORIES, CONTENDER_SUGGESTIONS } from './lists'
import { slotScore, tierTalk, type Tier, type TierTalkState } from './logic'

const PLAYERS = ['w', 'a', 'b', 'c']
const NAMES = ['Ann', 'Ben', 'Cy', 'Di', 'Ed', 'Flo', 'Gus', 'Hal']
const ANSWER: Tier[] = ['S', 'A', 'B', 'C', 'D', 'S', 'A', 'B']

const play = (state: TierTalkState, player: string, move: Record<string, unknown>) =>
  tierTalk.applyMove(state, player, move)

function named(players = PLAYERS) {
  let state = play(tierTalk.setup(players, {}), players[0]!, { type: 'category', text: 'Being a pirate' })
  state.slotOwners.forEach((owner, slot) => {
    state = play(state, owner, { type: 'name', slot, text: NAMES[slot] })
  })
  return state
}

function guessing(players = PLAYERS) {
  let state = play(named(players), players[0]!, { type: 'lockNames' })
  return play(state, players[0]!, { type: 'rank', tiers: ANSWER })
}

function guessAll(state: TierTalkState, tiers: Tier[], by = 'a') {
  tiers.forEach((tier, slot) => {
    state = play(state, by, { type: 'guess', slot, tier })
  })
  return state
}

const readyAll = (state: TierTalkState) =>
  state.order
    .filter((id) => id !== state.wizardId)
    .reduce((next, id) => play(next, id, { type: 'ready', ready: true }), state)

describe('scoring', () => {
  it('gives 2 for the exact tier, 1 for one tier off, and 0 otherwise', () => {
    expect(slotScore('S', 'S')).toBe(2)
    expect(slotScore('A', 'S')).toBe(1)
    expect(slotScore('C', 'D')).toBe(1)
    expect(slotScore('B', 'S')).toBe(0)
    expect(slotScore(null, 'S')).toBe(0)
  })

  it('adds up the team’s points at reveal', () => {
    // 4 exact (8), 2 one off (2), 2 far off (0).
    const guess: Tier[] = ['S', 'A', 'B', 'C', 'C', 'A', 'D', 'D']
    const state = readyAll(guessAll(guessing(), guess))
    expect(state.phase).toBe('reveal')
    expect(state.slotPoints).toEqual([2, 2, 2, 2, 1, 1, 0, 0])
    expect(state.history).toEqual([{ wizardId: 'w', category: 'Being a pirate', points: 10 }])
  })
})

describe('a round', () => {
  it('lets only the Wizard choose the category, and hides it from guessers', () => {
    const state = tierTalk.setup(PLAYERS, {})
    expect(() => play(state, 'a', { type: 'category', text: 'x' })).toThrow('Tier Wizard')
    expect(() => play(state, 'w', { type: 'category', text: '   ' })).toThrow(MoveError)
    const next = play(state, 'w', { type: 'category', text: 'Being a pirate' })
    expect(tierTalk.viewFor(next, 'w').category).toBe('Being a pirate')
    expect(tierTalk.viewFor(next, 'a').category).toBeNull()
    expect(tierTalk.viewFor(next, null).category).toBeNull()
  })

  it('splits the 8 names between guessers, in turn order', () => {
    const state = play(tierTalk.setup(PLAYERS, {}), 'w', { type: 'category', text: 'x' })
    expect(state.slotOwners).toEqual(['a', 'b', 'c', 'a', 'b', 'c', 'a', 'b'])
  })

  it('only lets each guesser fill their own slots, with no repeated names', () => {
    let state = play(tierTalk.setup(PLAYERS, {}), 'w', { type: 'category', text: 'x' })
    expect(() => play(state, 'b', { type: 'name', slot: 0, text: 'Ann' })).toThrow('Someone else')
    state = play(state, 'a', { type: 'name', slot: 0, text: 'Ann' })
    expect(() => play(state, 'b', { type: 'name', slot: 1, text: 'ann' })).toThrow('already')
    state = play(state, 'a', { type: 'name', slot: 0, text: 'Annie' })
    expect(state.contenders[0]).toBe('Annie')
  })

  it('waits for all 8 names before the Wizard can start ranking', () => {
    const state = play(tierTalk.setup(PLAYERS, {}), 'w', { type: 'category', text: 'x' })
    expect(() => play(state, 'w', { type: 'lockNames' })).toThrow('all 8')
    expect(tierTalk.waitingOn!(state)).toEqual(['a', 'b', 'c'])
    expect(tierTalk.waitingOn!(named())).toEqual(['w'])
  })

  it('requires a complete ranking and hides it until reveal', () => {
    const ranking = play(named(), 'w', { type: 'lockNames' })
    expect(() => play(ranking, 'w', { type: 'rank', tiers: ['S'] })).toThrow(MoveError)
    expect(() => play(ranking, 'w', { type: 'rank', tiers: Array(8).fill('F') })).toThrow(MoveError)
    const state = play(ranking, 'w', { type: 'rank', tiers: ANSWER })
    expect(tierTalk.viewFor(state, 'a').wizardTiers).toBeNull()
    expect(tierTalk.viewFor(state, 'a').category).toBe('Being a pirate')
    expect(tierTalk.viewFor(state, 'w').wizardTiers).toEqual(ANSWER)
  })

  it('lets any guesser move cards on the shared board, but not the Wizard', () => {
    let state = guessing()
    state = play(state, 'a', { type: 'guess', slot: 0, tier: 'S' })
    state = play(state, 'b', { type: 'guess', slot: 0, tier: 'A' })
    expect(state.guessTiers[0]).toBe('A')
    expect(() => play(state, 'w', { type: 'guess', slot: 0, tier: 'S' })).toThrow('Wizard')
  })

  it('needs every guesser ready, and any change un-readies everyone', () => {
    let state = guessAll(guessing(), ANSWER)
    expect(() => play(guessing(), 'a', { type: 'ready', ready: true })).toThrow('every contender')
    state = play(state, 'a', { type: 'ready', ready: true })
    state = play(state, 'b', { type: 'ready', ready: true })
    expect(tierTalk.waitingOn!(state)).toEqual(['c'])
    state = play(state, 'c', { type: 'guess', slot: 3, tier: 'D' })
    expect(state.ready).toEqual([])
    state = readyAll(state)
    expect(state.phase).toBe('reveal')
  })
})

describe('the whole game', () => {
  it('gives everyone one turn as Wizard, then ends with the team score', () => {
    let state = readyAll(guessAll(guessing(['w', 'a', 'b']), ANSWER))
    const wizards = [state.wizardId]
    for (let round = 2; round <= 3; round++) {
      expect(tierTalk.result(state)).toBeNull()
      state = play(state, 'a', { type: 'nextRound', round: round - 1 })
      wizards.push(state.wizardId)
      const guessers = state.order.filter((id) => id !== state.wizardId)
      state = play(state, state.wizardId, { type: 'category', text: 'x' })
      state.slotOwners.forEach((owner, slot) => {
        state = play(state, owner, { type: 'name', slot, text: NAMES[slot] })
      })
      state = play(state, state.wizardId, { type: 'lockNames' })
      state = play(state, state.wizardId, { type: 'rank', tiers: ANSWER })
      state = readyAll(guessAll(state, ANSWER, guessers[0]))
    }
    expect(wizards).toEqual(['w', 'a', 'b'])
    expect(tierTalk.result(state)).toEqual({
      winnerIds: ['w', 'a', 'b'],
      message: 'Team score: 48 out of 48',
    })
    expect(() => play(state, 'a', { type: 'nextRound', round: 3 })).toThrow('over')
  })

  it('ignores a duplicate next-round click', () => {
    let state = readyAll(guessAll(guessing(), ANSWER))
    state = play(state, 'a', { type: 'nextRound', round: 1 })
    expect(play(state, 'b', { type: 'nextRound', round: 1 })).toBe(state)
  })

  it('supports up to 15 players', () => {
    expect(tierTalk.maxPlayers).toBe(15)
    const many = Array.from({ length: 15 }, (_, i) => `p${i}`)
    const state = play(tierTalk.setup(many, {}), 'p0', { type: 'category', text: 'x' })
    expect(state.slotOwners).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'])
    expect(tierTalk.waitingOn!(play(named(many), 'p0', { type: 'lockNames' }))).toEqual(['p0'])
  })
})

describe('players leaving', () => {
  it('hands a leaver’s unnamed slots to the other guessers', () => {
    let state = play(tierTalk.setup(PLAYERS, {}), 'w', { type: 'category', text: 'x' })
    state = play(state, 'a', { type: 'name', slot: 0, text: 'Ann' })
    state = tierTalk.onPlayerLeave!(state, 'a')!
    expect(state.contenders[0]).toBe('Ann')
    expect(state.slotOwners.filter((owner) => owner === 'a')).toHaveLength(1)
    expect(state.slotOwners.slice(3)).not.toContain('a')
  })

  it('reveals if the last guesser who wasn’t ready leaves', () => {
    let state = guessAll(guessing(), ANSWER)
    state = play(play(state, 'a', { type: 'ready', ready: true }), 'b', { type: 'ready', ready: true })
    state = tierTalk.onPlayerLeave!(state, 'c')!
    expect(state.phase).toBe('reveal')
  })

  it('starts a fresh round with the next player if the Wizard leaves', () => {
    const state = tierTalk.onPlayerLeave!(guessing(), 'w')!
    expect(state.wizardId).toBe('a')
    expect(state.phase).toBe('category')
    expect(state.slotOwners).toEqual(['b', 'c', 'b', 'c', 'b', 'c', 'b', 'c'])
  })

  it('ends the game if fewer than two players remain', () => {
    expect(tierTalk.onPlayerLeave!(guessing(['w', 'a', 'b']), 'a')).not.toBeNull()
    const two = tierTalk.onPlayerLeave!(guessing(['w', 'a', 'b']), 'a')!
    expect(tierTalk.onPlayerLeave!(two, 'b')).toBeNull()
  })
})

describe('word lists', () => {
  it('has plenty of unique categories and suggestions', () => {
    expect(new Set(CATEGORIES).size).toBe(CATEGORIES.length)
    expect(new Set(CONTENDER_SUGGESTIONS).size).toBe(CONTENDER_SUGGESTIONS.length)
    expect(CATEGORIES.length).toBeGreaterThanOrEqual(50)
    expect(CONTENDER_SUGGESTIONS.length).toBeGreaterThanOrEqual(50)
    expect(CATEGORIES.every((text) => text.length <= 60)).toBe(true)
    expect(CONTENDER_SUGGESTIONS.every((text) => text.length <= 30)).toBe(true)
  })
})
