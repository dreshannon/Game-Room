import { beforeEach, describe, expect, it } from 'vitest'
import { MoveError } from '../types'
import { DESIGNS, describeNeed, meets } from './fireflies'
import {
  BRAG_POINTS,
  MAX_CHARMS,
  MEADOW_LIMIT,
  bestNudges,
  makeGlowcatch,
  perRound,
  scoreOf,
  type Charm,
  type Firefly,
  type GlowcatchState,
} from './logic'

/** A game whose dice roll the numbers queued up, in order. */
function scripted() {
  const queue: number[] = []
  let draw = 0.5
  const game = makeGlowcatch({
    roll: (sides) => {
      const value = queue.shift()
      if (value === undefined) throw new Error('No roll queued')
      if (value > sides) throw new Error(`Can't roll ${value} on a d${sides}`)
      return value
    },
    random: () => draw,
  })
  return {
    game,
    rolls: (...values: number[]) => queue.push(...values),
    setDraw: (value: number) => (draw = value),
    left: () => queue.length,
  }
}

let nextId = 1000
const fly = (name: string, overrides: Partial<Firefly> = {}): Firefly => {
  const design = DESIGNS.find((d) => d.name === name)!
  return {
    id: nextId++,
    name,
    points: design.points,
    minTotal: design.minTotal,
    need: design.need,
    flicker: null,
    ...overrides,
  }
}
const charm = (kind: Charm['kind'], value = 0): Charm => ({ id: nextId++, kind, value })

/** A started game with a chosen meadow and charms, and no time limit. */
function newGame(ids = ['a', 'b'], meadow: Firefly[] = [], options: Record<string, number> = {}) {
  const s = scripted()
  const state = s.game.setup(ids, { rounds: 3, timer: 0, meadows: 1, ...options })
  state.meadows = state.meadows.map((_, i) => (i === 0 ? meadow : []))
  state.players.forEach((p) => (p.charms = []))
  return { ...s, state }
}

const cast = (plain: number, extra: Record<string, unknown> = {}) => ({ type: 'cast', plain, charms: [], meadow: 0, ...extra })

describe('fireflies', () => {
  it('checks each kind of need', () => {
    const need = (name: string) => DESIGNS.find((d) => d.name === name)!
    const ok = (name: string, values: number[]) => meets(need(name).need, need(name).minTotal, values)
    expect(ok('Spark', [6, 5])).toBe(true)
    expect(ok('Spark', [6, 4])).toBe(false)
    expect(ok('Dimwick', [1, 2])).toBe(true)
    expect(ok('Dimwick', [4])).toBe(false)
    expect(ok('Twinkle', [3, 3])).toBe(true)
    expect(ok('Twin Glow', [3, 3, 2])).toBe(false)
    expect(ok('Twin Glow', [6, 6, 2])).toBe(true)
    expect(ok('Triplet', [2, 2, 2, 5])).toBe(true)
    expect(ok('Double Wink', [2, 2, 5, 5])).toBe(true)
    expect(ok('Double Wink', [2, 2, 2, 5])).toBe(false)
    expect(ok('Double Wink', [4, 4, 4, 4])).toBe(true)
    expect(ok('Ladder', [3, 5, 4])).toBe(true)
    expect(ok('Ladder', [1, 3, 5])).toBe(false)
    expect(ok('Rainbow', [1, 2, 4, 6])).toBe(true)
    expect(ok('Moonwink', [1, 3, 6])).toBe(true)
    expect(ok('Moonwink', [1, 3])).toBe(false)
    expect(ok('Lucky Seven', [7])).toBe(true)
    expect(ok('Night Owl', [15])).toBe(true)
    expect(ok('Odd Lot', [1, 3, 5])).toBe(true)
    expect(ok('Odd Lot', [1, 3])).toBe(false)
    expect(ok('Even Keel', [2, 4, 6])).toBe(true)
    expect(ok('Even Keel', [2, 4, 5])).toBe(false)
    expect(meets({ kind: 'total' }, 0, [])).toBe(false)
  })

  it('describes needs in a few words', () => {
    expect(describeNeed({ kind: 'total' }, 11)).toBe('Total 11+')
    expect(describeNeed({ kind: 'set', size: 2 }, 14)).toBe('A pair, total 14+')
    expect(describeNeed({ kind: 'has', values: [1, 6] }, 0)).toBe('A 1 and a 6')
  })

  it('adds more fireflies for bigger groups', () => {
    expect(perRound(2)).toBe(2)
    expect(perRound(4)).toBe(3)
    expect(perRound(12)).toBe(7)
  })
})

describe('setup', () => {
  it('fills the meadow and deals a charm each', () => {
    const { game } = scripted()
    const state = game.setup(['a', 'b', 'c', 'd'], { rounds: 7, timer: 30, meadows: 1 })
    expect(state.round).toBe(1)
    expect(state.phase).toBe('cast')
    expect(state.meadowCount).toBe(1)
    expect(state.meadows[0]!.length).toBeGreaterThanOrEqual(3)
    expect(state.players.every((p) => p.charms.length >= 1)).toBe(true)
    expect(state.castEndsAt).not.toBeNull()
  })

  it('only opens two meadows with enough players', () => {
    const { game } = scripted()
    expect(game.setup(['a', 'b', 'c'], { meadows: 2 }).meadowCount).toBe(1)
    const big = game.setup('abcdefghijkl'.split(''), { meadows: 2 })
    expect(big.meadowCount).toBe(2)
    expect(big.meadows[0]!.length).toBeGreaterThanOrEqual(4)
    expect(big.meadows[1]!.length).toBeGreaterThanOrEqual(4)
  })
})

describe('casting', () => {
  it('waits for everyone, then rolls', () => {
    const { game, state, rolls } = newGame(['a', 'b'], [fly('Spark')])
    let s = game.applyMove(state, 'a', cast(2))
    expect(s.phase).toBe('cast')
    expect(game.waitingOn!(s)).toEqual(['b'])
    rolls(1, 6, 5) // b rolls first with fewer dice
    s = game.applyMove(s, 'b', cast(1))
    expect(s.phase).toBe('reveal')
    expect(s.players[0]!.catches.map((f) => f.name)).toEqual(['Spark'])
  })

  it('keeps casts secret until the reveal', () => {
    const { game, state } = newGame()
    const s = game.applyMove(state, 'a', cast(3))
    const theirs = game.viewFor(s, 'b')
    expect(theirs.players.find((p) => p.id === 'a')!.cast).toBe(true)
    expect(theirs.you!.cast).toBeNull()
    expect(JSON.stringify(theirs)).not.toContain('"plain":3')
    expect(game.viewFor(s, 'a').you!.cast!.plain).toBe(3)
  })

  it('hides other players’ charms', () => {
    const { game, state } = newGame()
    state.players[0]!.charms = [charm('spare', 4)]
    const view = game.viewFor(state, 'b')
    expect(view.players[0]!.charms).toBe(1)
    expect(view.you!.charms).toEqual([])
  })

  it('lets you change your cast before everyone is in', () => {
    const { game, state } = newGame(['a', 'b', 'c'])
    let s = game.applyMove(state, 'a', cast(3))
    s = game.applyMove(s, 'a', { type: 'uncast' })
    expect(s.casts.a).toBeNull()
    s = game.applyMove(s, 'a', cast(1))
    expect(s.casts.a!.plain).toBe(1)
  })

  it('rejects bad casts', () => {
    const { game, state } = newGame()
    state.players[0]!.resting.d20 = true
    state.players[0]!.charms = [charm('nudge')]
    const id = state.players[0]!.charms[0]!.id
    const bad = (move: unknown, message: RegExp) => {
      expect(() => game.applyMove(state, 'a', move)).toThrow(MoveError)
      expect(() => game.applyMove(state, 'a', move)).toThrow(message)
    }
    bad(cast(6), /0 to 5/)
    bad(cast(-1), /0 to 5/)
    bad(cast(1.5), /0 to 5/)
    bad(cast(1, { d20: true }), /resting/)
    bad(cast(1, { charms: [999] }), /don’t hold/)
    bad(cast(1, { charms: [id, id] }), /only once/)
    bad(cast(0, { charms: [id] }), /at least one die/)
    bad(cast(1, { meadow: 1 }), /meadow/)
    bad({ type: 'fly' }, /Unknown/)
    expect(() => game.applyMove(state, 'zed', cast(1))).toThrow(/not in this game/)
  })

  it('casts nothing for anyone who runs out of time', () => {
    const { game, state, rolls } = newGame(['a', 'b'], [fly('Pip')], { timer: 30 })
    expect(game.tickDelay!(state)).toBeGreaterThan(0)
    rolls(6)
    let s = game.applyMove(state, 'a', cast(1))
    s = game.tick!(s)
    expect(s.phase).toBe('reveal')
    expect(s.results.map((r) => r.playerId)).toEqual(['a'])
    expect(s.players[1]!.charms).toEqual([])
  })
})

describe('catching', () => {
  it('rolls fewest dice first', () => {
    const { game, state, rolls } = newGame(['a', 'b'], [fly('Pip')])
    let s = game.applyMove(state, 'a', cast(3))
    rolls(6) // b's one die goes first
    rolls(6, 6, 6)
    s = game.applyMove(s, 'b', cast(1))
    expect(s.results.find((r) => r.playerId === 'b')!.group).toBe(0)
    expect(s.players[1]!.catches.map((f) => f.name)).toEqual(['Pip'])
    expect(s.players[0]!.catches).toEqual([])
    expect(s.results.find((r) => r.playerId === 'a')!.emptied).toBe(true)
  })

  it('catches every firefly the roll meets', () => {
    const { game, state, rolls } = newGame(['a', 'b'], [fly('Pip'), fly('Twinkle'), fly('Bonfire')])
    let s = game.applyMove(state, 'b', cast(0))
    rolls(4, 4, 1)
    s = game.applyMove(s, 'a', cast(3))
    expect(s.players[0]!.catches.map((f) => f.name).sort()).toEqual(['Pip', 'Twinkle'])
    expect(s.meadows[0]!.map((f) => f.name)).toEqual(['Bonfire'])
  })

  it('gives a firefly to the lower total when two roll together', () => {
    const { game, state, rolls } = newGame(['a', 'b'], [fly('Pip')])
    rolls(5, 5, 3, 3)
    let s = game.applyMove(state, 'a', cast(2))
    s = game.applyMove(s, 'b', cast(2))
    expect(s.players[1]!.catches.map((f) => f.name)).toEqual(['Pip'])
    expect(s.results.find((r) => r.playerId === 'a')!.missed[0]!.why).toBe('lower')
  })

  it('leaves a firefly in the meadow on a tie', () => {
    const { game, state, rolls } = newGame(['a', 'b'], [fly('Pip')])
    rolls(4, 3, 5, 2)
    let s = game.applyMove(state, 'a', cast(2))
    s = game.applyMove(s, 'b', cast(2))
    expect(s.players.every((p) => p.catches.length === 0)).toBe(true)
    expect(s.meadows[0]!.map((f) => f.name)).toEqual(['Pip'])
    expect(s.results.every((r) => r.missed[0]!.why === 'tie')).toBe(true)
  })

  it('gives a charm for catching nothing, up to the limit', () => {
    const { game, state, rolls } = newGame(['a', 'b'], [fly('Starfall')])
    state.players[1]!.charms = Array.from({ length: MAX_CHARMS }, () => charm('nudge'))
    rolls(1, 1)
    let s = game.applyMove(state, 'a', cast(1))
    s = game.applyMove(s, 'b', cast(1))
    expect(s.players[0]!.charms.length).toBe(1)
    expect(s.players[1]!.charms.length).toBe(MAX_CHARMS)
    expect(s.results.find((r) => r.playerId === 'a')!.gotCharm).toBe(true)
  })

  it('gives nothing for casting no dice', () => {
    const { game, state } = newGame(['a', 'b'], [fly('Pip')])
    let s = game.applyMove(state, 'a', cast(0))
    s = game.applyMove(s, 'b', cast(0))
    expect(s.results).toEqual([])
    expect(s.players.every((p) => p.charms.length === 0)).toBe(true)
  })
})

describe('lanterns', () => {
  it('rolls the big dice and rests them for a round', () => {
    const { game, state, rolls, setDraw } = newGame(['a', 'b'], [fly('Night Owl'), fly('Lucky Seven')])
    rolls(4, 7, 18)
    let s = game.applyMove(state, 'b', cast(0))
    s = game.applyMove(s, 'a', cast(1, { d12: true, d20: true }))
    expect(s.players[0]!.catches.map((f) => f.name).sort()).toEqual(['Lucky Seven', 'Night Owl'])
    expect(s.players[0]!.resting).toEqual({ d12: true, d20: true })

    setDraw(0) // plain Pips, no flickers that matter
    s = game.tick!(s)
    s.meadows[0] = []
    expect(() => game.applyMove(s, 'a', cast(1, { d12: true }))).toThrow(/resting/)
    rolls(2)
    s = game.applyMove(s, 'a', cast(1))
    s = game.applyMove(s, 'b', cast(0))
    expect(s.players[0]!.resting).toEqual({ d12: false, d20: false })
  })
})

describe('charms', () => {
  it('uses nudges to catch the most points', () => {
    const { game, state, rolls } = newGame(['a', 'b'], [fly('Twinkle'), fly('Spark')])
    const nudge = charm('nudge')
    state.players[0]!.charms = [nudge]
    rolls(3, 4)
    let s = game.applyMove(state, 'b', cast(0))
    s = game.applyMove(s, 'a', cast(2, { charms: [nudge.id] }))
    const result = s.results[0]!
    expect(result.caught.map((f) => f.name)).toEqual(['Twinkle'])
    expect(result.dice.map((d) => d.value).sort()).toEqual([3, 3])
    expect(s.players[0]!.charms).toEqual([])
  })

  it('never nudges a die off its faces', () => {
    const best = bestNudges([{ sides: 6, value: 6 }], [], 3, [fly('Lucky Seven')])
    expect(best.caught).toEqual([])
    expect(best.values).toEqual([6])
  })

  it('prefers the lower total when the points are equal', () => {
    const best = bestNudges([{ sides: 6, value: 2 }], [], 1, [fly('Dimwick')])
    expect(best.values).toEqual([1])
  })

  it('adds a spare’s number to the roll', () => {
    const { game, state, rolls } = newGame(['a', 'b'], [fly('Twinkle')])
    const spare = charm('spare', 5)
    state.players[0]!.charms = [spare]
    rolls(5)
    let s = game.applyMove(state, 'b', cast(0))
    s = game.applyMove(s, 'a', cast(1, { charms: [spare.id] }))
    expect(s.players[0]!.catches.map((f) => f.name)).toEqual(['Twinkle'])
    expect(s.results[0]!.total).toBe(10)
  })

  it('a spare does not change who rolls first', () => {
    const { game, state, rolls } = newGame(['a', 'b'], [fly('Pip')])
    const spare = charm('spare', 6)
    state.players[0]!.charms = [spare]
    rolls(1, 6, 6)
    let s = game.applyMove(state, 'a', cast(1, { charms: [spare.id] }))
    s = game.applyMove(s, 'b', cast(2))
    expect(s.results.find((r) => r.playerId === 'a')!.group).toBe(0)
    expect(s.players[0]!.catches.map((f) => f.name)).toEqual(['Pip'])
  })

  it('scores brags only with a catch', () => {
    const { game, state, rolls } = newGame(['a', 'b'], [fly('Pip')])
    const brag1 = charm('brag')
    const brag2 = charm('brag')
    state.players[0]!.charms = [brag1]
    state.players[1]!.charms = [brag2]
    rolls(6, 1, 1)
    let s = game.applyMove(state, 'a', cast(1, { charms: [brag1.id] }))
    s = game.applyMove(s, 'b', cast(2, { charms: [brag2.id] }))
    expect(s.players[0]!.bragPoints).toBe(BRAG_POINTS)
    expect(scoreOf(s.players[0]!)).toBe(1 + BRAG_POINTS)
    expect(s.players[1]!.bragPoints).toBe(0)
    expect(s.players[1]!.charms.length).toBe(1) // the brag is gone, a new charm for catching nothing
    expect(s.players[1]!.charms[0]!.id).not.toBe(brag2.id)
  })
})

describe('flickers', () => {
  it('swarm brings another firefly, and stops when the meadow is full', () => {
    expect(DESIGNS[0]!.flicker).toBe('swarm')
    const { game, setDraw } = scripted()
    setDraw(0) // every draw is the first design
    const state = game.setup(['a', 'b'], { timer: 0 })
    expect(state.meadows[0]!.length).toBe(MEADOW_LIMIT)
    expect(state.flickers.length).toBe(MEADOW_LIMIT)
  })

  it('gift hands everyone a charm, and breeze wakes lanterns', () => {
    const { game, setDraw } = scripted()
    const gift = DESIGNS.findIndex((d) => d.flicker === 'gift')
    const breeze = DESIGNS.findIndex((d) => d.flicker === 'breeze')
    const total = DESIGNS.reduce((s, d) => s + d.weight, 0)
    const at = (index: number) => (DESIGNS.slice(0, index).reduce((s, d) => s + d.weight, 0) + 0.5) / total
    setDraw(at(gift))
    const state = game.setup(['a', 'b'], { timer: 0 })
    expect(state.players.every((p) => p.charms.length === MAX_CHARMS)).toBe(true)

    state.phase = 'reveal'
    state.players[0]!.resting = { d12: true, d20: true }
    setDraw(at(breeze))
    const next = game.tick!(state)
    expect(next.flickers.every((f) => f.flicker === 'breeze')).toBe(true)
    expect(next.players[0]!.resting).toEqual({ d12: false, d20: false })
  })
})

describe('rounds and the end', () => {
  it('refills the meadow and ends after the last round', () => {
    const { game, state, rolls, setDraw } = newGame(['a', 'b'], [fly('Pip')], { timer: 30 })
    setDraw(0.3)
    let s = state
    for (let round = 1; round <= 3; round++) {
      expect(s.round).toBe(round)
      rolls(6, 1)
      s = game.applyMove(s, 'a', cast(1))
      s = game.applyMove(s, 'b', cast(1))
      expect(s.phase).toBe('reveal')
      expect(game.tickDelay!(s)).toBeGreaterThan(0)
      s = game.tick!(s)
      if (round < 3) expect(s.meadows[0]!.length).toBeGreaterThan(0)
    }
    expect(s.phase).toBe('over')
    expect(game.tickDelay!(s)).toBeNull()
    const a = scoreOf(s.players[0]!)
    const b = scoreOf(s.players[1]!)
    const winners = game.result(s)!.winnerIds
    if (a !== b) expect(winners).toEqual([a > b ? 'a' : 'b'])
    else expect(winners.length).toBeGreaterThan(0)
    expect(() => game.applyMove(s, 'a', cast(1))).toThrow(/over/)
  })

  it('with no time limit, waits for everyone to move on from the reveal', () => {
    const { game, state, setDraw } = newGame(['a', 'b', 'c'], [fly('Pip')])
    setDraw(0.3)
    let s = state
    for (const id of ['a', 'b', 'c']) s = game.applyMove(s, id, cast(0))
    expect(s.phase).toBe('reveal')
    expect(s.castEndsAt).toBeNull()
    expect(game.tickDelay!(s)).toBeNull()
    expect(game.waitingOn!(s)).toEqual(['a', 'b', 'c'])
    s = game.applyMove(s, 'a', { type: 'ready' })
    s = game.applyMove(s, 'a', { type: 'ready' })
    expect(s.ready).toEqual(['a'])
    expect(game.viewFor(s, 'b').ready).toEqual(['a'])
    s = game.applyMove(s, 'b', { type: 'ready' })
    expect(s.phase).toBe('reveal')
    // The last one leaving counts as everyone being ready.
    const left = game.onPlayerLeave!(s, 'c')!
    expect(left.phase).toBe('cast')
    expect(left.round).toBe(2)
    s = game.applyMove(s, 'c', { type: 'ready' })
    expect(s.phase).toBe('cast')
    expect(s.ready).toEqual([])
  })

  it('lets only the host skip ahead from the reveal', () => {
    const { game, state } = newGame(['a', 'b'], [fly('Pip')])
    let s = game.applyMove(state, 'a', cast(0))
    s = game.applyMove(s, 'b', cast(0))
    expect(() => game.applyMove(s, 'b', { type: 'next' }, { isHost: false })).toThrow(/host/)
    s = game.applyMove(s, 'a', { type: 'next' }, { isHost: true })
    expect(s.round).toBe(2)
    expect(s.phase).toBe('cast')
    expect(game.applyMove(s, 'a', { type: 'ready' })).toBe(s)
  })

  it('lets the host skip the wait for casts, and anyone still picking sits out', () => {
    const { game, state, rolls } = newGame(['a', 'b', 'c'], [fly('Pip')])
    rolls(6)
    let s = game.applyMove(state, 'b', cast(1))
    s = game.applyMove(s, 'a', { type: 'next' }, { isHost: true })
    expect(s.phase).toBe('reveal')
    expect(s.results.map((r) => r.playerId)).toEqual(['b'])
  })

  it('breaks ties with fewer fireflies', () => {
    const { game, state } = newGame(['a', 'b', 'c'])
    state.phase = 'over'
    state.players[0]!.catches = [fly('Tall Ladder')]
    state.players[1]!.catches = [fly('Spark'), fly('Blaze')]
    state.players[2]!.catches = [fly('Pip')]
    expect(game.result(state)!.winnerIds).toEqual(['a'])
    state.players[1]!.catches = [fly('Bonfire')]
    expect(game.result(state)!.winnerIds).toEqual(['a', 'b'])
  })
})

describe('players coming and going', () => {
  let state: GlowcatchState
  let game: ReturnType<typeof scripted>['game']
  let rolls: (...v: number[]) => void

  beforeEach(() => {
    const made = newGame(['a', 'b', 'c'], [fly('Pip')])
    state = made.state
    game = made.game
    rolls = made.rolls
  })

  it('carries on when someone leaves, keeping their catches', () => {
    state.players[2]!.catches = [fly('Prism')]
    let s = game.applyMove(state, 'a', cast(0))
    s = game.applyMove(s, 'b', cast(0))
    s = game.onPlayerLeave!(s, 'c')!
    expect(s.phase).toBe('reveal')
    expect(s.players[2]!.gone).toBe(true)
    expect(game.viewFor(s, 'a').players[2]!.score).toBe(5)
    expect(() => game.applyMove(s, 'c', cast(1))).toThrow(/not in this game/)
    s.phase = 'over'
    expect(game.result(s)!.winnerIds).not.toContain('c')
  })

  it('ends when fewer than two are left', () => {
    const s = game.onPlayerLeave!(state, 'c')!
    expect(game.onPlayerLeave!(s, 'b')).toBeNull()
  })

  it('lets someone walk in during the first half', () => {
    const s = game.onPlayerJoin!(state, 'd', 0)!
    expect(s.players.map((p) => p.id)).toContain('d')
    expect(s.players[3]!.charms.length).toBe(1)
    expect(game.waitingOn!(s)).toContain('d')
    rolls(1, 1, 1)
    let t = game.applyMove(s, 'a', cast(1))
    t = game.applyMove(t, 'b', cast(1))
    t = game.applyMove(t, 'c', cast(0))
    expect(t.phase).toBe('cast')
    t = game.applyMove(t, 'd', cast(1))
    expect(t.phase).toBe('reveal')
  })

  it('turns walk-ins away in the second half', () => {
    expect(game.onPlayerJoin!({ ...state, round: 3 }, 'd', 0)).toBeNull()
  })
})

describe('two meadows', () => {
  const ids = 'abcdefgh'.split('')

  it('keeps each meadow’s contests apart', () => {
    const { game, state, rolls } = newGame(ids, [], { meadows: 2 })
    state.meadows = [[fly('Pip')], [fly('Pip')]]
    let s = state
    for (const id of ids.slice(2)) s = game.applyMove(s, id, cast(0))
    s = game.applyMove(s, 'a', cast(1, { meadow: 0 }))
    rolls(6, 6)
    s = game.applyMove(s, 'b', cast(1, { meadow: 1 }))
    expect(s.players[0]!.catches.length).toBe(1)
    expect(s.players[1]!.catches.length).toBe(1)
  })
})
