import { describe, expect, it } from 'vitest'
import { MoveError } from '../types'
import { HAND_SIZE, overheat, type Card, type CardKind, type OverheatState } from './logic'
import { TRACKS, cornersOf, layoutTrack } from './tracks'

let nextId = 10_000
const card = (kind: CardKind, value = 0): Card => ({ id: nextId++, kind, value })
const speed = (...values: number[]) => values.map((value) => card('speed', value))
const heat = (count: number) => Array.from({ length: count }, () => card('heat'))

const driver = (state: OverheatState, id: string) => state.drivers.find((d) => d.id === id)!

/**
 * A race on a plain test loop with no corners unless asked for. Cars start where given,
 * with known hands, and decks of 2s so flips are predictable.
 */
function race(
  cars: { id: string; pos: number; spot?: 0 | 1; hand?: Card[]; gear?: number; deck?: Card[] }[],
  { laps = 2, trackId = 0 }: { laps?: number; trackId?: number } = {},
): OverheatState {
  const state = overheat.setup(
    cars.map((c) => c.id),
    { track: trackId },
  )
  state.laps = laps
  for (const c of cars) {
    const d = driver(state, c.id)
    d.pos = c.pos
    d.spot = c.spot ?? 0
    d.gear = c.gear ?? 1
    d.hand = c.hand ?? speed(1, 1, 1, 1, 1, 1, 1)
    d.deck = c.deck ?? speed(2, 2, 2, 2, 2, 2, 2, 2, 2, 2)
    d.discard = []
  }
  return state
}

/** Positions on track 0 well clear of its corners. */
const corners = cornersOf(0)
const clearStart = (() => {
  // Find a run of 20 spaces with no corner line in it.
  for (let start = 0; start < 72; start++) {
    const clear = corners.every((corner) => {
      const offset = (corner.space - start + 72) % 72
      return offset > 20
    })
    if (clear) return start
  }
  throw new Error('no clear stretch')
})()

const plan = (state: OverheatState, id: string, gear: number, count = gear) => {
  const cards = driver(state, id).hand.filter((c) => c.kind !== 'heat').slice(0, count)
  return overheat.applyMove(state, id, { type: 'plan', gear, cards: cards.map((c) => c.id) })
}

/** Ends the current driver's React step and turns down any Slipstream. */
function pass(state: OverheatState) {
  const id = state.order[state.current]!
  let next = endReact(state, id)
  if (driver(next, id).turn?.step === 'slipstream') {
    next = overheat.applyMove(next, id, { type: 'slipstream', take: false })
  }
  return next
}

const endReact = (state: OverheatState, id: string) => overheat.applyMove(state, id, { type: 'endReact' })
const discard = (state: OverheatState, id: string, cards: number[] = []) =>
  overheat.applyMove(state, id, { type: 'discard', cards, round: state.round })

describe('setup', () => {
  it('deals each driver a deck, a hand of 7 and an engine of 6 Heat', () => {
    const state = overheat.setup(['a', 'b', 'c'], { track: 1 })
    expect(state.laps).toBe(2)
    for (const d of state.drivers) {
      expect(d.hand).toHaveLength(HAND_SIZE)
      expect(d.hand.length + d.deck.length).toBe(18)
      expect(d.engine).toHaveLength(6)
      expect(d.gear).toBe(1)
      expect(d.pos).toBeLessThan(0)
    }
    const spots = state.drivers.map((d) => `${d.pos}:${d.spot}`)
    expect(new Set(spots).size).toBe(3)
  })

  it('hides other hands and the planned cards', () => {
    let state = race([
      { id: 'a', pos: clearStart },
      { id: 'b', pos: clearStart + 1 },
    ])
    state = plan(state, 'a', 1)
    const view = overheat.viewFor(state, 'b')
    expect(view.you?.hand).toEqual(driver(state, 'b').hand)
    expect(JSON.stringify(view)).not.toContain(JSON.stringify(driver(state, 'a').hand))
    expect(view.cars.find((c) => c.id === 'a')).toMatchObject({ planned: true, play: [] })
  })
})

describe('planning', () => {
  const fresh = () =>
    race([
      { id: 'a', pos: clearStart },
      { id: 'b', pos: clearStart - 5 },
    ])

  it('allows shifting two gears for 1 Heat, but not three', () => {
    expect(() => plan(fresh(), 'a', 4)).toThrow('at most two')
    const state = plan(plan(fresh(), 'a', 3), 'b', 1)
    // a paid 1 Heat for the double shift when it moved.
    expect(driver(state, 'a').engine).toHaveLength(5)
    expect(driver(state, 'a').gear).toBe(3)
  })

  it('needs Heat in the engine to shift two gears', () => {
    const state = fresh()
    driver(state, 'a').engine = []
    expect(() => plan(state, 'a', 3)).toThrow('costs 1 Heat')
  })

  it('needs one card per gear, and no Heat cards', () => {
    const state = fresh()
    expect(() => plan(state, 'a', 2, 1)).toThrow('play 2 cards')
    driver(state, 'a').hand = [...heat(2), ...speed(3, 3, 3, 3, 3)]
    const heatId = driver(state, 'a').hand[0]!.id
    expect(() => overheat.applyMove(state, 'a', { type: 'plan', gear: 1, cards: [heatId] })).toThrow('Heat cards cannot')
    expect(() => overheat.applyMove(state, 'a', { type: 'plan', gear: 1, cards: [1.5] })).toThrow(MoveError)
  })

  it('waits for everyone, and lets a driver take back their plan', () => {
    let state = plan(fresh(), 'a', 1)
    expect(overheat.waitingOn!(state)).toEqual(['b'])
    state = overheat.applyMove(state, 'a', { type: 'unplan' })
    expect(overheat.waitingOn!(state).sort()).toEqual(['a', 'b'])
  })
})

describe('moving', () => {
  it('moves the leader first, by the total of the cards played', () => {
    let state = race([
      { id: 'back', pos: clearStart, hand: speed(4, 4, 4, 4, 4, 4, 4), gear: 2 },
      { id: 'front', pos: clearStart + 3, hand: speed(1, 1, 1, 1, 1, 1, 1), gear: 2 },
    ])
    state = plan(plan(state, 'back', 2), 'front', 2)
    expect(state.order).toEqual(['front', 'back'])
    // The leader is in 2nd gear with no Heat in hand, so only Boost is left to decide.
    expect(state.order[state.current]).toBe('front')
    expect(driver(state, 'front').pos).toBe(clearStart + 5)
    expect(overheat.viewFor(state, 'front').you?.react).toEqual({ cooldown: 0, boost: true, adrenaline: false })
  })

  it('turns each Stress card into the next speed card in the deck', () => {
    let state = race([
      { id: 'a', pos: clearStart + 5, hand: [card('stress'), ...speed(1, 1, 1, 1, 1, 1)], deck: [...speed(3), card('upgrade', 5), ...heat(1)] },
      { id: 'b', pos: clearStart },
    ])
    state = plan(plan(state, 'a', 1), 'b', 1)
    const a = driver(state, 'a')
    // Heat and the 5 upgrade are flipped past and discarded. The 3 counts.
    expect(a.pos).toBe(clearStart + 8)
    expect(a.play[0]).toMatchObject({ value: 3, flipped: { kind: 'speed', value: 3 } })
    expect(a.discard.map((c) => c.kind).sort()).toEqual(['heat', 'upgrade'])
  })

  it('puts a car beside or behind cars already there, inside spot first', () => {
    let state = race([
      { id: 'a', pos: clearStart + 4, spot: 0 },
      { id: 'b', pos: clearStart + 4, spot: 1 },
      { id: 'c', pos: clearStart, hand: speed(4, 4, 4, 4, 4, 4, 4) },
    ])
    for (const id of ['a', 'b']) driver(state, id).hand = speed(0, 0, 0, 0, 0, 0, 0)
    state = plan(plan(plan(state, 'a', 1), 'b', 1), 'c', 1)
    // a and b move 0 and have nothing to react with, so c moves 4 into a full space.
    while (state.order[state.current] !== 'c') state = pass(state)
    expect(driver(state, 'c')).toMatchObject({ pos: clearStart + 3, spot: 0 })
  })
})

describe('reacting', () => {
  it('cools Heat from hand back to the engine: 3 in 1st gear, 1 in 2nd', () => {
    let state = race([
      { id: 'a', pos: clearStart + 6, hand: [...heat(4), ...speed(1, 1, 1)] },
      { id: 'b', pos: clearStart, hand: [...heat(4), ...speed(1, 1, 1)] },
    ])
    driver(state, 'b').gear = 2
    state = plan(plan(state, 'a', 1), 'b', 2)
    state = overheat.applyMove(state, 'a', { type: 'cooldown' })
    expect(driver(state, 'a').engine).toHaveLength(9)
    state = endReact(state, 'a')
    // b is last, so Adrenaline adds 1 cooldown.
    expect(overheat.viewFor(state, 'b').you?.react?.cooldown).toBe(2)
  })

  it('boosts by paying 1 Heat and flipping the next speed card', () => {
    let state = race([
      { id: 'a', pos: clearStart + 6 },
      { id: 'b', pos: clearStart },
    ])
    state = plan(plan(state, 'a', 1), 'b', 1)
    state = overheat.applyMove(state, 'a', { type: 'boost' })
    const a = driver(state, 'a')
    expect(a.pos).toBe(clearStart + 9)
    expect(a.engine).toHaveLength(5)
    expect(a.turn?.speed).toBe(3)
    // With nothing left to decide, the turn moved on.
    expect(state.order[state.current]).toBe('b')
    expect(() => overheat.applyMove(state, 'a', { type: 'boost' })).toThrow(MoveError)
  })

  it('gives Adrenaline to the last car only, or the last two with 5 or more cars', () => {
    let state = race([
      { id: 'a', pos: clearStart + 6 },
      { id: 'b', pos: clearStart },
    ])
    state = plan(plan(state, 'a', 1), 'b', 1)
    expect(overheat.viewFor(state, 'a').you?.react?.adrenaline).toBe(false)
    state = endReact(state, 'a')
    expect(overheat.viewFor(state, 'b').you?.react?.adrenaline).toBe(true)
    state = overheat.applyMove(state, 'b', { type: 'adrenaline' })
    expect(driver(state, 'b').pos).toBe(clearStart + 2)

    let big = race(['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, pos: clearStart + 10 - i * 2 })))
    for (const id of ['a', 'b', 'c', 'd', 'e']) big = plan(big, id, 1)
    const adrenaline = (id: string) => driver(big, id).turn?.adrenaline
    while (big.phase === 'resolve' && big.current < big.order.length) big = pass(big)
    expect(['a', 'b', 'c', 'd', 'e'].map(adrenaline)).toEqual([false, false, false, true, true])
  })
})

describe('slipstream', () => {
  it('offers 2 extra spaces when ending right behind another car', () => {
    let state = race([
      { id: 'a', pos: clearStart + 2 },
      { id: 'b', pos: clearStart },
    ])
    state = plan(plan(state, 'a', 1), 'b', 1)
    state = endReact(state, 'a')
    state = endReact(state, 'b')
    // b moved to +1, with a gap before a at +3, so no Slipstream and the turn is over.
    expect(driver(state, 'b').pos).toBe(clearStart + 1)
    expect(state.current).toBe(2)

    state = race([
      { id: 'a', pos: clearStart + 2 },
      { id: 'b', pos: clearStart + 1 },
    ])
    state = plan(plan(state, 'a', 1), 'b', 1)
    state = endReact(state, 'a')
    state = endReact(state, 'b')
    // b moved to +2, right behind a at +3.
    expect(overheat.viewFor(state, 'b').you?.canSlipstream).toBe(true)
    state = overheat.applyMove(state, 'b', { type: 'slipstream', take: true })
    expect(driver(state, 'b').pos).toBe(clearStart + 4)
  })

  it('is not allowed over the finish line on the last lap', () => {
    const finish = 72
    let state = race(
      [
        { id: 'a', pos: finish - 2 },
        { id: 'b', pos: finish - 3 },
      ],
      { laps: 1 },
    )
    state = plan(plan(state, 'a', 1), 'b', 1)
    state = endReact(state, 'a')
    state = endReact(state, 'b')
    // b is right behind a, but 2 more spaces would cross the line.
    expect(driver(state, 'b').pos).toBe(finish - 2)
    expect(overheat.viewFor(state, 'b').you?.canSlipstream).toBe(false)
  })
})

describe('corners', () => {
  const corner = corners[0]!

  it('costs 1 Heat for each point over the speed limit', () => {
    const hand = speed(4, 4, 4, 4, 4, 4, 4)
    let state = race([
      { id: 'a', pos: corner.space - 3, hand, gear: 2 },
      { id: 'b', pos: corner.space - 20 },
    ])
    state = plan(plan(state, 'a', 2), 'b', 1)
    state = endReact(state, 'a')
    const a = driver(state, 'a')
    expect(a.pos).toBe(corner.space + 5)
    expect(a.engine).toHaveLength(6 - (8 - corner.limit))
  })

  it('spins out a car that cannot pay: back before the corner, 1st gear, and Stress', () => {
    const hand = speed(4, 4, 4, 4, 4, 4, 4)
    let state = race([
      { id: 'a', pos: corner.space - 3, hand, gear: 3 },
      { id: 'b', pos: corner.space - 20 },
    ])
    driver(state, 'a').engine = heat(1)
    state = plan(plan(state, 'a', 3), 'b', 1)
    state = endReact(state, 'a')
    const a = driver(state, 'a')
    expect(a.pos).toBe(corner.space - 1)
    expect(a.gear).toBe(1)
    expect(a.engine).toHaveLength(0)
    expect(a.hand.filter((c) => c.kind === 'stress')).toHaveLength(2)
    expect(state.events.find((e) => e.kind === 'spin')).toMatchObject({ playerId: 'a', value: 2 })
  })
})

describe('a clogged hand', () => {
  it('stalls the car, drops it to 1st gear and plays Heat out of the hand', () => {
    let state = race([
      { id: 'a', pos: clearStart + 5, hand: [...heat(6), ...speed(4)], gear: 2 },
      { id: 'b', pos: clearStart },
    ])
    state = plan(state, 'a', 3, 1)
    state = plan(state, 'b', 1)
    const a = driver(state, 'a')
    expect(a.pos).toBe(clearStart + 5)
    expect(a.gear).toBe(1)
    // Two Heat went out with the 4, and the hand was refilled with 2s.
    expect(a.hand.filter((c) => c.kind === 'heat')).toHaveLength(4)
    expect(a.hand).toHaveLength(HAND_SIZE)
    expect(a.needsDiscard).toBe(false)
  })
})

describe('discarding and the next round', () => {
  it('lets drivers discard while others move, then starts the next round', () => {
    let state = race([
      { id: 'a', pos: clearStart + 6, hand: [...heat(1), card('stress'), ...speed(1, 1, 1, 1, 1)] },
      { id: 'b', pos: clearStart },
    ])
    state = plan(plan(state, 'a', 1), 'b', 1)
    state = endReact(state, 'a')
    const a = driver(state, 'a')
    expect(a.needsDiscard).toBe(true)
    expect(() => discard(state, 'a', [a.hand[0]!.id])).toThrow('cannot be discarded')
    state = discard(state, 'a', [a.hand[2]!.id, a.hand[3]!.id])
    expect(driver(state, 'a').hand).toHaveLength(HAND_SIZE)
    expect(state.round).toBe(1)

    state = endReact(state, 'b')
    expect(overheat.waitingOn!(state)).toEqual(['b'])
    state = discard(state, 'b')
    expect(state.round).toBe(2)
    expect(state.phase).toBe('plan')
    // A late double click from round 1 is ignored.
    expect(overheat.applyMove(state, 'b', { type: 'discard', cards: [], round: 1 })).toBe(state)
  })
})

describe('finishing', () => {
  it('ranks cars finishing in the same round by how far past the line they got', () => {
    const finish = 72
    let state = race(
      [
        { id: 'a', pos: finish - 1 },
        { id: 'b', pos: finish - 2, hand: speed(4, 4, 4, 4, 4, 4, 4) },
        { id: 'c', pos: finish - 30 },
      ],
      { laps: 1 },
    )
    for (const id of ['a', 'b', 'c']) state = plan(state, id, 1)
    state = endReact(state, 'a')
    state = endReact(state, 'b')
    state = endReact(state, 'c')
    state = discard(state, 'c')
    expect(state.hallOfFame).toEqual(['b', 'a'])
    expect(overheat.result(state)).toBeNull()
    expect(overheat.viewFor(state, null).cars.find((c) => c.id === 'b')?.place).toBe(1)

    // Only c is still racing.
    driver(state, 'c').pos = finish - 1
    state = plan(state, 'c', 1)
    state = endReact(state, 'c')
    expect(state.phase).toBe('over')
    expect(overheat.result(state)).toEqual({ winnerIds: ['b'] })
  })
})

describe('leaving', () => {
  it('carries on without the leaver, and ends when one driver is left', () => {
    let state = race([
      { id: 'a', pos: clearStart + 6 },
      { id: 'b', pos: clearStart + 3 },
      { id: 'c', pos: clearStart },
    ])
    state = plan(plan(state, 'a', 1), 'b', 1)
    const next = overheat.onPlayerLeave!(state, 'c')!
    // c was the only one still planning, so the round starts.
    expect(next.phase).toBe('resolve')
    expect(next.order).toEqual(['a', 'b'])
    expect(overheat.onPlayerLeave!(next, 'a')).toBeNull()
  })

  it('moves on when the driver whose turn it is leaves', () => {
    let state = race([
      { id: 'a', pos: clearStart + 6 },
      { id: 'b', pos: clearStart + 3 },
      { id: 'c', pos: clearStart },
    ])
    for (const id of ['a', 'b', 'c']) state = plan(state, id, 1)
    const next = overheat.onPlayerLeave!(state, 'a')!
    expect(next.order[next.current]).toBe('b')
    expect(driver(next, 'b').turn).not.toBeNull()
  })
})

describe('tracks', () => {
  it.each(TRACKS)('$name has distinct corners clear of the starting grid', (track) => {
    const layout = layoutTrack(track)
    const spaces = layout.corners.map((c) => c.space)
    expect(new Set(spaces).size).toBe(track.corners.length)
    for (const space of spaces) {
      // The grid fills the four spaces before the line, and the line itself.
      expect(space).toBeGreaterThan(2)
      expect(space).toBeLessThan(track.spaces - 5)
    }
    // Spaces are big enough to hold a car.
    expect(layout.spaceLength).toBeGreaterThan(26)
  })
})
