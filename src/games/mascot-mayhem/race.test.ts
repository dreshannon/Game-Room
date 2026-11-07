import { describe, expect, it } from 'vitest'
import { RACE_DECK_SIZE, SIDE_BETS, allCards } from './data'
import {
  BURN,
  FINISH,
  FOLDS,
  START,
  playNext,
  runRace,
  shuffle,
  startRace,
  type CardAction,
  type RaceCard,
  type RaceState,
} from './race'

/** Keeps the deck in the order given, so races are predictable. */
const inOrder = () => 0.9999

let nextId = 1000
const card = (mascot: number | null, action: CardAction, recoverAll = false): RaceCard => ({
  id: nextId++,
  mascot,
  action,
  recoverAll,
})
const move = (mascot: number, spaces: number) => card(mascot, { kind: 'move', spaces })
const burn = () => Array.from({ length: BURN }, () => move(3, 1))

/** A race with these cards played in order after the burn. */
function race(cards: RaceCard[], setup?: (race: RaceState) => void) {
  const state = startRace([...burn(), ...cards], inOrder)
  setup?.(state)
  return state
}
const playAll = (state: RaceState, count: number) => {
  for (let i = 0; i < count; i++) playNext(state, inOrder)
  return state
}

describe('moving', () => {
  it('burns the top cards, then moves mascots by their cards', () => {
    const state = race([move(0, 3), move(1, -2)])
    expect(state.burned).toHaveLength(BURN)
    playAll(state, 2)
    expect(state.mascots[0]!.pos).toBe(START + 3)
    expect(state.mascots[1]!.pos).toBe(START - 2)
  })

  it('jumps to the next star, and a star past the last one reaches the finish', () => {
    const state = race([card(0, { kind: 'star' }), card(0, { kind: 'star' })])
    playAll(state, 1)
    expect(state.mascots[0]!.pos).toBe(5)
    state.mascots[0]!.pos = 12
    playAll(state, 1)
    expect(state.mascots[0]).toMatchObject({ status: 'finished', place: 1 })
    expect(state.stats.starFinish).toBe(true)
  })

  it('makes a fallen mascot crawl one space, and a second fall knocks it out', () => {
    const state = race([card(0, { kind: 'fall' }), move(0, 4), card(0, { kind: 'fall' })])
    playAll(state, 2)
    expect(state.mascots[0]).toMatchObject({ fallen: true, pos: START + 1 })
    playAll(state, 1)
    expect(state.mascots[0]).toMatchObject({ status: 'out', place: 4, outReason: 'knockout' })
  })

  it('runs a turned-around mascot the wrong way, until it recovers', () => {
    const state = race([card(0, { kind: 'turn' }), move(0, 1), card(0, { kind: 'recover' }), move(0, 2)])
    playAll(state, 2)
    expect(state.mascots[0]!.pos).toBe(START - 1)
    playAll(state, 2)
    expect(state.mascots[0]).toMatchObject({ facing: 1, pos: START + 1 })
  })

  it('puts a mascot out for running off the back of the track', () => {
    const state = race([move(0, -2), move(0, -2)])
    playAll(state, 2)
    expect(state.mascots[0]).toMatchObject({ status: 'out', outReason: 'offTrack' })
  })
})

describe('swerving and collisions', () => {
  it('moves a lane left or right, and two swerves off the edge put a mascot out', () => {
    const left = card(0, { kind: 'swerve', side: 'left' })
    const state = race([left, { ...left, id: nextId++ }])
    playAll(state, 1)
    expect(state.mascots[0]!.lane).toBe(0)
    playAll(state, 1)
    expect(state.mascots[0]).toMatchObject({ status: 'out', outReason: 'offTrack' })
  })

  it('knocks over a standing mascot that is run into or through in the same lane', () => {
    const state = race([move(0, 3)], (r) => {
      r.mascots[1]!.lane = r.mascots[0]!.lane
      r.mascots[1]!.pos = START + 1
    })
    playAll(state, 1)
    expect(state.mascots[1]!.fallen).toBe(true)
    expect(state.mascots[0]!.pos).toBe(START + 3)
    expect(state.stats.collisions).toBe(1)
  })

  it('knocks out a mascot that is hit while already down', () => {
    const state = race([move(0, 2)], (r) => {
      r.mascots[1]!.lane = r.mascots[0]!.lane
      r.mascots[1]!.pos = START + 2
      r.mascots[1]!.fallen = true
    })
    playAll(state, 1)
    expect(state.mascots[1]).toMatchObject({ status: 'out', outReason: 'knockout' })
  })

  it('moves everyone at once without collisions, and stops them short of the finish', () => {
    const everyone = card(null, { kind: 'move', spaces: 2 })
    const state = race([everyone], (r) => {
      r.mascots[1]!.lane = r.mascots[0]!.lane
      r.mascots[1]!.pos = START + 1
      r.mascots[2]!.pos = FINISH - 1
    })
    playAll(state, 1)
    expect(state.mascots.map((m) => m.pos)).toEqual([START + 2, START + 3, FINISH - 1, START + 2])
    expect(state.mascots[1]!.fallen).toBe(false)
  })
})

describe('folding and the end of the race', () => {
  it('folds the track when the deck runs out, putting out anyone behind the line', () => {
    const state = race([move(0, 4)])
    playAll(state, 1)
    expect(state.deck).toHaveLength(0)
    playNext(state, inOrder)
    expect(state.back).toBe(FOLDS[0])
    expect(state.mascots.filter((m) => m.status === 'out')).toHaveLength(3)
    // Three out at once share 4th place, and the last one standing takes 1st.
    expect(state.mascots.map((m) => m.place)).toEqual([1, 4, 4, 4])
    expect(state.over).toBe(true)
  })

  it('reshuffles every card and burns again after a fold', () => {
    const state = race([move(0, 3), move(1, 3), move(2, 3), move(3, 3)])
    playAll(state, 5)
    expect(state.folds).toBe(1)
    expect(state.deck.length + state.burned.length).toBe(BURN + 4)
    expect(state.burned).toHaveLength(BURN)
  })

  it('ends once three mascots are done, giving the last the place left over', () => {
    const state = race([move(0, 20), move(1, -3), move(2, 20)])
    playAll(state, 3)
    expect(state.over).toBe(true)
    expect(state.mascots.map((m) => m.place)).toEqual([1, 4, 2, 3])
  })

  it('always ends with every place filled', () => {
    for (let i = 0; i < 300; i++) {
      const cards = allCards()
      const deck = [...cards.filter((c) => c.starter), ...shuffle(cards.filter((c) => !c.starter)).slice(0, RACE_DECK_SIZE - 4)]
      const result = runRace(deck)
      expect(result.over).toBe(true)
      expect(result.mascots.every((m) => m.place !== null)).toBe(true)
    }
  })
})

describe('balance', () => {
  it('has side bet odds that match a fresh simulation', () => {
    const cards = allCards()
    const starters = cards.filter((c) => c.starter)
    const rest = cards.filter((c) => !c.starter)
    const hits = SIDE_BETS.map(() => 0)
    const races = 4000
    for (let i = 0; i < races; i++) {
      const result = runRace([...starters, ...shuffle(rest).slice(0, RACE_DECK_SIZE - starters.length)])
      SIDE_BETS.forEach((bet, j) => (hits[j]! += bet.test(result) ? 1 : 0))
    }
    SIDE_BETS.forEach((bet, j) => expect(Math.abs(hits[j]! / races - bet.chance), bet.question).toBeLessThan(0.04))
  })
})
