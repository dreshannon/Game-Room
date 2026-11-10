import { describe, expect, it } from 'vitest'
import { MoveError } from '../types'
import {
  CARRYING,
  JOBS,
  THIEF_PICKED,
  WARDENS,
  courierStarts,
  midnightLift,
  ownersOf,
  postChoices,
  thiefOptions,
  type MidnightLiftState,
} from './logic'
import { CORNERS, DOORWAYS, POST_CORNERS, START_SPOTS, cornersWithin, rooftopsFrom, stepsFrom } from './map'

const play = (state: MidnightLiftState, id: string, move: unknown) => midnightLift.applyMove(state, id, move)
const illegal = (state: MidnightLiftState, id: string, move: unknown, message?: RegExp) => {
  expect(() => play(state, id, move)).toThrow(MoveError)
  if (message) expect(() => play(state, id, move)).toThrow(message)
}

/** A game where "t" is the thief and the rest are the Watch. */
function newGame(watch = ['a', 'b'], moves = 15) {
  const state = midnightLift.setup(['t', ...watch], { moves })
  return { ...state, thiefId: 't', watchIds: watch }
}

/** A doorway that isn't a start spot, far from the posts. */
const SAFEHOUSE = DOORWAYS.find((d) => !START_SPOTS.includes(d.id))!.id

const firstPosts = () => ({ wardens: POST_CORNERS.slice(0, 5), decoys: POST_CORNERS.slice(5, 7) })

/** Plays through to the chase on the current night, striking the first couriers straight away. */
function toChase(state: MidnightLiftState): MidnightLiftState {
  let s = state
  if (s.phase === 'safehouse') s = play(s, 't', { type: 'safehouse', doorway: SAFEHOUSE })
  const carrying = courierStarts(s).slice(0, CARRYING[s.night - 1])
  s = play(s, 't', { type: 'couriers', doorways: carrying })
  const { fixed, open } = postChoices(s)
  const corners = [...fixed, ...open.slice(0, 7 - fixed.length)]
  s = play(s, s.watchIds[(s.night - 1) % s.watchIds.length]!, {
    type: 'posts',
    wardens: corners.slice(0, 5),
    decoys: corners.slice(5),
  })
  return play(s, 't', { type: 'strike', doorways: s.couriers.slice(0, JOBS[s.night - 1]) })
}

/** Ends the Watch's turn without moving or searching. */
function watchPasses(state: MidnightLiftState) {
  let s = state
  for (const id of new Set(ownersOf(s.watchIds))) s = play(s, id, { type: 'done' })
  for (const id of new Set(ownersOf(s.watchIds))) s = play(s, id, { type: 'done' })
  return s
}

/** Steps along a path the thief can take, avoiding wardens, until it reaches `target`. */
function routeTo(state: MidnightLiftState, target: number): number[] {
  const blocked = state.wardens.filter((c): c is number => c !== null)
  const prev = new Map<number, number>([[state.position!, -1]])
  const queue = [state.position!]
  while (queue.length) {
    const at = queue.shift()!
    if (at === target) break
    for (const next of stepsFrom(at, blocked)) {
      if (!prev.has(next)) {
        prev.set(next, at)
        queue.push(next)
      }
    }
  }
  const route: number[] = []
  for (let at = target; at !== state.position; at = prev.get(at)!) route.unshift(at)
  return route
}

/** Puts the thief in a quiet spot with wardens out of the way. */
function quietChase(state: MidnightLiftState, at: number, wardens: number[]): MidnightLiftState {
  return { ...state, phase: 'thief', position: at, path: [at], trail: [], wardens }
}

describe('map', () => {
  it('has 72 doorways, each with somewhere to go', () => {
    expect(DOORWAYS).toHaveLength(72)
    for (const d of DOORWAYS) expect(d.links.length).toBeGreaterThan(0)
  })

  it('has 12 different start spots and 9 post corners', () => {
    expect(new Set(START_SPOTS).size).toBe(12)
    expect(new Set(POST_CORNERS).size).toBe(9)
  })

  it('links doorways both ways', () => {
    for (const d of DOORWAYS) for (const l of d.links) expect(stepsFrom(l.to)).toContain(d.id)
  })

  it('reaches every doorway from every other', () => {
    const seen = new Set([0])
    const queue = [0]
    while (queue.length) for (const n of stepsFrom(queue.shift()!)) if (!seen.has(n)) seen.add(n), queue.push(n)
    expect(seen.size).toBe(DOORWAYS.length)
  })

  it('counts warden moves along the streets', () => {
    expect(cornersWithin(0, 1).sort()).toEqual([...CORNERS[0]!.links].sort())
    expect(cornersWithin(12, 2)).not.toContain(12)
  })
})

describe('setup', () => {
  it('picks one thief and puts everyone else on the Watch', () => {
    const state = midnightLift.setup(['a', 'b', 'c'], { moves: 15 })
    expect(['a', 'b', 'c']).toContain(state.thiefId)
    expect(state.watchIds).toHaveLength(2)
    expect(state.watchIds).not.toContain(state.thiefId)
    expect(state.phase).toBe('safehouse')
    expect(state.dashes).toBe(3)
    expect(state.rooftops).toBe(2)
  })

  it('lets the lobby pick the thief', () => {
    const state = midnightLift.setup(['a', 'b', 'c'], { thief: THIEF_PICKED }, { teams: { a: 1, b: 0, c: 1 } })
    expect(state.thiefId).toBe('b')
  })

  it('shares the five wardens out evenly', () => {
    expect(ownersOf(['a'])).toEqual(['a', 'a', 'a', 'a', 'a'])
    expect(ownersOf(['a', 'b'])).toEqual(['a', 'b', 'a', 'b', 'a'])
  })

  it('falls back to 15 moves for an unknown setting', () => {
    expect(midnightLift.setup(['a', 'b'], { moves: 99 }).maxMoves).toBe(15)
  })
})

describe('before the job', () => {
  it('keeps the safehouse off the start spots', () => {
    const s = newGame()
    illegal(s, 't', { type: 'safehouse', doorway: START_SPOTS[0] }, /Couriers start/)
    illegal(s, 'a', { type: 'safehouse', doorway: SAFEHOUSE }, /picking a safehouse/)
    expect(play(s, 't', { type: 'safehouse', doorway: SAFEHOUSE }).phase).toBe('couriers')
  })

  it('sends out the right number of couriers and adds decoys', () => {
    let s = play(newGame(), 't', { type: 'safehouse', doorway: SAFEHOUSE })
    illegal(s, 't', { type: 'couriers', doorways: START_SPOTS.slice(0, 4) }, /Pick 5/)
    illegal(s, 't', { type: 'couriers', doorways: [...START_SPOTS.slice(0, 4), SAFEHOUSE] }, /marked doorways/)
    illegal(s, 't', { type: 'couriers', doorways: [0, 0, 0, 0, 0] }, /only once/)
    s = play(s, 't', { type: 'couriers', doorways: START_SPOTS.slice(0, 5) })
    expect(s.phase).toBe('posts')
    expect(s.courierSpots).toHaveLength(8)
    expect(s.couriers).toHaveLength(5)
  })

  it('keeps the Watch from seeing which couriers carry valuables', () => {
    let s = play(newGame(), 't', { type: 'safehouse', doorway: SAFEHOUSE })
    s = play(s, 't', { type: 'couriers', doorways: START_SPOTS.slice(0, 5) })
    expect(midnightLift.viewFor(s, 'a').couriers).toEqual([])
    expect(midnightLift.viewFor(s, 'a').courierSpots).toHaveLength(8)
    expect(midnightLift.viewFor(s, 'a').safehouse).toBeNull()
    expect(midnightLift.viewFor(s, 't').couriers).toHaveLength(5)
    expect(midnightLift.viewFor(s, 't').safehouse).toBe(SAFEHOUSE)
  })

  it('only lets tonight’s lead place posts, on the marked corners', () => {
    let s = play(newGame(), 't', { type: 'safehouse', doorway: SAFEHOUSE })
    s = play(s, 't', { type: 'couriers', doorways: START_SPOTS.slice(0, 5) })
    illegal(s, 'b', { type: 'posts', ...firstPosts() }, /Another Watch player/)
    illegal(s, 'a', { type: 'posts', wardens: [0, 1, 3, 4, 5], decoys: [7, 9] }, /marked corners/)
    illegal(s, 'a', { type: 'posts', wardens: POST_CORNERS.slice(0, 5), decoys: [POST_CORNERS[0], POST_CORNERS[5]] }, /one post/)
    s = play(s, 'a', { type: 'posts', ...firstPosts() })
    expect(s.phase).toBe('wait')
    expect(s.posts).toHaveLength(7)
  })

  it('hides which posts are real from the thief', () => {
    let s = play(newGame(), 't', { type: 'safehouse', doorway: SAFEHOUSE })
    s = play(s, 't', { type: 'couriers', doorways: START_SPOTS.slice(0, 5) })
    s = play(s, 'a', { type: 'posts', ...firstPosts() })
    expect(midnightLift.viewFor(s, 't').posts.every((p) => p.warden === null)).toBe(true)
    expect(midnightLift.viewFor(s, 'a').posts.filter((p) => p.warden !== null)).toHaveLength(5)
  })
})

describe('waiting and striking', () => {
  const ready = () => {
    let s = play(newGame(), 't', { type: 'safehouse', doorway: SAFEHOUSE })
    s = play(s, 't', { type: 'couriers', doorways: START_SPOTS.slice(0, 5) })
    return play(s, 'a', { type: 'posts', ...firstPosts() })
  }

  it('moves couriers and checks a post on each wait', () => {
    const s = ready()
    const decoy = s.posts.find((p) => p.warden === null)!.corner
    const next = play(s, 't', { type: 'wait', reveal: decoy })
    expect(next.waitRound).toBe(2)
    expect(next.posts).toHaveLength(6)
    expect(next.couriers).toHaveLength(5)
    // Couriers never end beside a post or on top of each other.
    for (const c of next.couriers) {
      expect(next.couriers.filter((o) => o === c)).toHaveLength(1)
    }
    const real = s.posts.find((p) => p.warden !== null)!.corner
    const spotted = play(next, 't', { type: 'wait', reveal: real })
    expect(spotted.posts.find((p) => p.corner === real)!.revealed).toBe(true)
    illegal(spotted, 't', { type: 'wait', reveal: real }, /hidden post/)
  })

  it('forces a strike after five rounds', () => {
    let s = ready()
    for (let i = 0; i < 4; i++) s = play(s, 't', { type: 'wait', reveal: s.posts.find((p) => !p.revealed)!.corner })
    illegal(s, 't', { type: 'wait', reveal: s.posts.find((p) => !p.revealed)!.corner }, /strike now/)
  })

  it('only strikes couriers carrying valuables', () => {
    const s = ready()
    const decoy = s.courierSpots.find((d) => !s.couriers.includes(d))!
    illegal(s, 't', { type: 'strike', doorways: [decoy] }, /carrying valuables/)
    illegal(s, 't', { type: 'strike', doorways: s.couriers.slice(0, 2) }, /one courier/)
  })

  it('sounds the alarm: wardens take their posts and the thief starts at the job', () => {
    const s = ready()
    const target = s.couriers[0]!
    const next = play(s, 't', { type: 'strike', doorways: [target] })
    expect(next.phase).toBe('thief')
    expect(next.wardens).toEqual(POST_CORNERS.slice(0, 5))
    expect(next.position).toBe(target)
    expect(next.jobSites).toEqual([target])
    expect(midnightLift.viewFor(next, 'a').position).toBeNull()
  })
})

describe('the chase', () => {
  it('lets the thief step, but not around a warden', () => {
    const s = quietChase(toChase(newGame()), 0, [20, 21, 22, 23, 24])
    const blockedCorner = DOORWAYS[0]!.corner
    const around = DOORWAYS[0]!.links.find((l) => l.via !== null)!
    const blocked = { ...s, wardens: [blockedCorner, 21, 22, 23, 24] }
    illegal(blocked, 't', { type: 'step', to: around.to }, /warden is standing/)
    illegal(s, 't', { type: 'step', to: 50 }, /next doorway/)
    const next = play(s, 't', { type: 'step', to: around.to })
    expect(next.position).toBe(around.to)
    expect(next.trail).toEqual(['step'])
    expect(next.phase).toBe('watchMove')
  })

  it('lets a dash slip past a warden and costs two moves', () => {
    const s = quietChase(toChase(newGame()), 0, [DOORWAYS[0]!.corner, 21, 22, 23, 24])
    const options = thiefOptions(s, 15)
    const dash = options.dashes.find((d) => d.to !== s.safehouse)!
    const next = play(s, 't', { type: 'dash', ...dash })
    expect(next.trail).toEqual(['dash', 'dash'])
    expect(next.dashes).toBe(2)
    expect(next.path).toEqual([0, dash.via, dash.to])
    illegal({ ...s, dashes: 0 }, 't', { type: 'dash', ...dash }, /no dashes/)
    illegal({ ...s, trail: Array(14).fill('step') }, 't', { type: 'dash', ...dash }, /two moves/)
  })

  it('goes over the rooftops to the same block only', () => {
    const s = quietChase(toChase(newGame()), 0, [20, 21, 22, 23, 24])
    const to = rooftopsFrom(0).find((d) => d !== s.safehouse)!
    const next = play(s, 't', { type: 'rooftop', to })
    expect(next.rooftops).toBe(1)
    const far = DOORWAYS.find((d) => !rooftopsFrom(0).includes(d.id) && d.id !== 0)!.id
    illegal(s, 't', { type: 'rooftop', to: far }, /same block/)
  })

  it('makes the last move home a plain step', () => {
    const near = rooftopsFrom(SAFEHOUSE)[0]!
    const s = quietChase(toChase(newGame()), near, [20, 21, 22, 23, 24])
    illegal(s, 't', { type: 'rooftop', to: SAFEHOUSE }, /last step/)
  })

  it('moves wardens up to two corners and not onto each other', () => {
    let s: MidnightLiftState = quietChase(toChase(newGame()), 0, [6, 8, 12, 16, 18])
    s = play(s, 't', { type: 'step', to: stepsFrom(0)[0]! })
    illegal(s, 'b', { type: 'moveWarden', warden: 0, to: 7 }, /isn’t yours/)
    illegal(s, 'a', { type: 'moveWarden', warden: 0, to: 24 }, /up to two/)
    illegal(s, 'a', { type: 'moveWarden', warden: 0, to: 8 }, /Another warden/)
    s = play(s, 'a', { type: 'moveWarden', warden: 0, to: 7 })
    // Changing your mind counts from where the warden started.
    s = play(s, 'a', { type: 'moveWarden', warden: 0, to: 0 })
    expect(s.wardens[0]).toBe(0)
    illegal(s, 't', { type: 'step', to: 1 }, /Watch is moving/)
    s = play(s, 'a', { type: 'done' })
    expect(s.phase).toBe('watchMove')
    illegal(s, 'a', { type: 'moveWarden', warden: 2, to: 13 }, /done for this round/)
    s = play(s, 'b', { type: 'done' })
    expect(s.phase).toBe('watchAct')
  })

  it('lights a lantern when a search finds the trail, and keeps searching on a miss', () => {
    // Thief started at doorway 0 and stepped along the street.
    let s: MidnightLiftState = quietChase(toChase(newGame()), 0, [20, 21, 22, 23, 24])
    s = play(s, 't', { type: 'step', to: 1 })
    s = watchPasses({ ...s, phase: 'watchMove' }) // no one moves
    s = play(s, 't', { type: 'step', to: stepsFrom(1, s.wardens as number[]).find((d) => d !== 0)! })
    // Put warden 0 on the corner beside doorway 0.
    s = { ...s, phase: 'watchAct', wardens: [DOORWAYS[0]!.corner, 21, 22, 23, 24], done: Array(WARDENS).fill(false), searched: [[], [], [], [], []] }
    const corner = CORNERS[DOORWAYS[0]!.corner]!
    const miss = corner.doorways.find((d) => !s.path.includes(d))
    if (miss !== undefined) {
      s = play(s, 'a', { type: 'search', warden: 0, doorway: miss })
      expect(s.misses).toContain(miss)
      expect(s.done[0]).toBe(false)
      illegal(s, 'a', { type: 'search', warden: 0, doorway: miss }, /already searched/)
    }
    s = play(s, 'a', { type: 'search', warden: 0, doorway: 0 })
    expect(s.lanterns).toContain(0)
    expect(s.done[0]).toBe(true)
    const far = DOORWAYS.find((d) => !corner.doorways.includes(d.id))!.id
    illegal({ ...s, done: Array(WARDENS).fill(false) }, 'a', { type: 'search', warden: 0, doorway: far }, /right by their corner/)
  })

  it('wins for the Watch on a good arrest', () => {
    let s: MidnightLiftState = quietChase(toChase(newGame()), 0, [20, 21, 22, 23, 24])
    s = play(s, 't', { type: 'step', to: 1 })
    s = { ...s, phase: 'watchAct', wardens: [DOORWAYS[1]!.corner, 21, 22, 23, 24], done: Array(WARDENS).fill(false), searched: [[], [], [], [], []] }
    const after = play(s, 'a', { type: 'arrest', warden: 0, doorway: 1 })
    expect(after.phase).toBe('over')
    expect(midnightLift.result(after)).toEqual({ winnerIds: ['a', 'b'], message: 'The Watch caught the thief!' })
  })

  it('ends a warden’s turn on a wrong arrest', () => {
    let s: MidnightLiftState = quietChase(toChase(newGame()), 0, [20, 21, 22, 23, 24])
    s = play(s, 't', { type: 'step', to: 1 })
    s = { ...s, phase: 'watchAct', wardens: [DOORWAYS[0]!.corner, 21, 22, 23, 24], done: Array(WARDENS).fill(false), searched: [[], [], [], [], []] }
    const after = play(s, 'a', { type: 'arrest', warden: 0, doorway: 0 })
    expect(after.phase).toBe('watchAct')
    expect(after.done[0]).toBe(true)
  })

  it('wins for the Watch when the thief runs out of moves', () => {
    let s: MidnightLiftState = quietChase(toChase(newGame(['a'], 12)), 0, [20, 21, 22, 23, 24])
    s = { ...s, trail: Array(11).fill('step') }
    s = play(s, 't', { type: 'step', to: 1 })
    s = watchPasses(s)
    expect(s.phase).toBe('over')
    expect(s.winner).toBe('watch')
  })
})

describe('nights', () => {
  it('ends the night when the thief walks home, and carries the wardens over', () => {
    let s: MidnightLiftState = toChase(newGame())
    s = { ...s, wardens: [20, 21, 22, 23, 24] }
    const route = routeTo(s, SAFEHOUSE)
    for (const [i, to] of route.entries()) {
      s = play(s, 't', { type: 'step', to })
      if (i < route.length - 1) s = watchPasses(s)
    }
    expect(s.night).toBe(2)
    expect(s.phase).toBe('couriers')
    expect(s.lastCorners).toEqual([20, 21, 22, 23, 24])
    expect(s.history).toHaveLength(1)
    expect(s.dashes).toBe(2)
    expect(s.lanterns).toEqual([])
  })

  it('makes posts on later nights go where the wardens ended', () => {
    let s: MidnightLiftState = { ...newGame(), night: 2, phase: 'couriers' as const, safehouse: SAFEHOUSE, lastCorners: [20, 21, 22, 23, 24] }
    s = play(s, 't', { type: 'couriers', doorways: courierStarts(s).slice(0, 4) })
    illegal(s, 'b', { type: 'posts', ...firstPosts() }, /where the wardens ended/)
    s = play(s, 'b', { type: 'posts', wardens: [21, 20, 22, 23, 6], decoys: [24, 8] })
    expect(s.phase).toBe('wait')
  })

  it('has two jobs on night 3, with the Watch going first', () => {
    let s: MidnightLiftState = { ...newGame(), night: 3, phase: 'couriers' as const, safehouse: SAFEHOUSE, lastCorners: [20, 21, 22, 23, 24], dashes: 2, rooftops: 1 }
    s = toChase(s)
    expect(s.jobSites).toHaveLength(2)
    expect(s.trail).toEqual(['job'])
    expect(s.phase).toBe('watchMove')
    expect(s.position).toBe(s.jobSites[1])
  })

  it('keeps couriers off past jobs', () => {
    const s = { ...newGame(), jobSites: [START_SPOTS[0]!] }
    expect(courierStarts(s)).not.toContain(START_SPOTS[0])
  })

  it('wins for the thief after getting home on night 4', () => {
    let s: MidnightLiftState = toChase({ ...newGame(), night: 4, phase: 'couriers' as const, safehouse: SAFEHOUSE, lastCorners: [20, 21, 22, 23, 24], dashes: 1, rooftops: 1 })
    s = { ...s, wardens: [20, 21, 22, 23, 24] }
    const route = routeTo(s, SAFEHOUSE)
    for (const [i, to] of route.entries()) {
      s = play(s, 't', { type: 'step', to })
      if (i < route.length - 1) s = watchPasses(s)
    }
    expect(s.phase).toBe('over')
    expect(midnightLift.result(s)).toEqual({ winnerIds: ['t'], message: 'The thief got away!' })
    expect(midnightLift.viewFor(s, 'a').safehouse).toBe(SAFEHOUSE)
  })
})

describe('players coming and going', () => {
  it('ends the game if the thief leaves', () => {
    expect(midnightLift.onPlayerLeave!(newGame(), 't')).toBeNull()
  })

  it('hands a leaving player’s wardens to the rest', () => {
    const s = midnightLift.onPlayerLeave!(newGame(), 'b')!
    expect(s.watchIds).toEqual(['a'])
    expect(ownersOf(s.watchIds).every((id) => id === 'a')).toBe(true)
  })

  it('ends the game if the whole Watch leaves', () => {
    expect(midnightLift.onPlayerLeave!(newGame(['a']), 'a')).toBeNull()
  })

  it('puts walk-ins on the Watch', () => {
    const s = midnightLift.onPlayerJoin!(newGame(['a']), 'c', 0)!
    expect(s.watchIds).toEqual(['a', 'c'])
    expect(ownersOf(s.watchIds)).toContain('c')
  })

  it('rejects moves from people watching', () => {
    illegal(newGame(), 'z', { type: 'safehouse', doorway: SAFEHOUSE }, /watching/)
  })

  it('waits on the right people', () => {
    const s = newGame()
    expect(midnightLift.waitingOn!(s)).toEqual(['t'])
    let p = play(s, 't', { type: 'safehouse', doorway: SAFEHOUSE })
    p = play(p, 't', { type: 'couriers', doorways: START_SPOTS.slice(0, 5) })
    expect(midnightLift.waitingOn!(p)).toEqual(['a'])
  })
})
