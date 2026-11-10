import { MoveError, type Game } from '../types'
import {
  CORNERS,
  DOORWAYS,
  POST_CORNERS,
  START_SPOTS,
  cornersWithin,
  isBeside,
  rooftopsFrom,
  stepsFrom,
} from './map'

export const NIGHTS = 4
export const WARDENS = 5
export const POSTS = 7
export const WAIT_ROUNDS = 5
export const MAX_WARDEN_STEPS = 2
/** Per night, from night 1. */
export const COURIERS = [8, 7, 6, 4]
export const CARRYING = [5, 4, 3, 1]
export const JOBS = [1, 1, 2, 1]
export const DASHES = [3, 2, 2, 1]
export const ROOFTOPS = [2, 2, 1, 1]
export const TOTAL_JOBS = JOBS.reduce((a, b) => a + b, 0)

export const THIEF_RANDOM = 0
export const THIEF_PICKED = 1

export type Phase =
  | 'safehouse'
  | 'couriers'
  | 'posts'
  | 'wait'
  | 'thief'
  | 'watchMove'
  | 'watchAct'
  | 'over'

/** What each of the thief's moves was. Everyone sees these; only the thief sees where. */
export type Trail = 'job' | 'step' | 'dash' | 'rooftop'

export interface Post {
  corner: number
  /** Which warden is posted here, or null for a decoy. */
  warden: number | null
  revealed: boolean
}

export interface MidnightLiftState {
  thiefId: string
  watchIds: string[]
  maxMoves: number
  night: number
  phase: Phase
  seed: number

  safehouse: number | null
  /** Every job so far, in order. */
  jobSites: number[]
  /** Doorways couriers were sent to tonight, real and decoy, while posts go out. */
  courierSpots: number[]
  /** Couriers carrying valuables. Hidden from the Watch until the posts are out. */
  couriers: number[]
  posts: Post[]
  /** How many times the thief may still wait before striking is forced. */
  waitRound: number

  /** Each warden's corner, or null while they are posted. */
  wardens: (number | null)[]
  /** Where the wardens stood when last night ended. */
  lastCorners: number[]
  /** Where each warden started this move, so a player can change their mind. */
  moveStart: number[]
  /** Wardens that have finished this part of the round. */
  done: boolean[]
  /** Doorways searched this round by each warden, so it doesn't search the same one twice. */
  searched: number[][]

  position: number | null
  /** Every doorway the thief has been through tonight. */
  path: number[]
  trail: Trail[]
  dashes: number
  rooftops: number
  /** Doorways the thief was found to have used tonight. */
  lanterns: number[]
  /** Doorways searched tonight with nothing found. */
  misses: number[]
  /** Each finished night's path, revealed when the game ends. */
  history: number[][]
  /** A short line about the last thing that happened. */
  news: string
  winner: 'thief' | 'watch' | null
}

export interface MidnightLiftView extends Omit<MidnightLiftState, 'seed' | 'safehouse' | 'position' | 'path' | 'posts' | 'couriers' | 'history'> {
  safehouse: number | null
  position: number | null
  path: number[]
  couriers: number[]
  posts: Post[]
  history: number[][]
  youAreThief: boolean
  /** Which wardens each watch player runs. */
  owners: string[]
  /** The Watch player placing posts tonight. */
  leadId: string | null
  movesUsed: number
  jobsDone: number
  jobsTonight: number
  carryingTonight: number
  couriersTonight: number
}

export type MidnightLiftMove =
  | { type: 'safehouse'; doorway: number }
  | { type: 'couriers'; doorways: number[] }
  | { type: 'posts'; wardens: number[]; decoys: number[] }
  | { type: 'wait'; reveal: number }
  | { type: 'strike'; doorways: number[] }
  | { type: 'step'; to: number }
  | { type: 'dash'; via: number; to: number }
  | { type: 'rooftop'; to: number }
  | { type: 'moveWarden'; warden: number; to: number }
  | { type: 'search'; warden: number; doorway: number }
  | { type: 'arrest'; warden: number; doorway: number }
  | { type: 'done' }

// A small seeded random number generator, so tests can rely on what happens.
function random(state: MidnightLiftState): number {
  let t = (state.seed = (state.seed + 0x6d2b79f5) | 0)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function shuffle<T>(state: MidnightLiftState, items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random(state) * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

const tonight = (list: number[], night: number) => list[night - 1]!

/** Which watch player runs each warden: shared out as evenly as possible. */
export const ownersOf = (watchIds: string[]) =>
  Array.from({ length: WARDENS }, (_, i) => watchIds[i % watchIds.length]!)

export const leadOf = (state: Pick<MidnightLiftState, 'watchIds' | 'night'>) =>
  state.watchIds[(state.night - 1) % state.watchIds.length] ?? null

const movesUsed = (state: MidnightLiftState) => state.trail.length

const wardenCorners = (state: MidnightLiftState) =>
  state.wardens.filter((corner): corner is number => corner !== null)

/** Corners the posts can go on tonight. */
export function postChoices(state: Pick<MidnightLiftState, 'night' | 'lastCorners'>) {
  if (state.night === 1) return { fixed: [] as number[], open: POST_CORNERS }
  return { fixed: state.lastCorners, open: POST_CORNERS.filter((c) => !state.lastCorners.includes(c)) }
}

/** Doorways couriers may start on tonight. */
export const courierStarts = (state: Pick<MidnightLiftState, 'jobSites'>) =>
  START_SPOTS.filter((d) => !state.jobSites.includes(d))

const isInt = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value)
const isDoorway = (value: unknown): value is number => isInt(value) && value >= 0 && value < DOORWAYS.length
const isCorner = (value: unknown): value is number => isInt(value) && value >= 0 && value < CORNERS.length
const isWarden = (value: unknown): value is number => isInt(value) && value >= 0 && value < WARDENS

function readDoorways(value: unknown): number[] {
  if (!Array.isArray(value) || !value.every(isDoorway)) throw new MoveError('Pick doorways on the map.')
  if (new Set(value).size !== value.length) throw new MoveError('Pick each doorway only once.')
  return value
}

/** Every move the thief could make from here, ignoring how many moves are left. */
export function thiefOptions(
  state: Pick<MidnightLiftState, 'position' | 'wardens' | 'safehouse' | 'dashes' | 'rooftops'>,
  movesLeft: number,
) {
  const from = state.position
  if (from === null || movesLeft <= 0) return { steps: [], dashes: [], rooftops: [] }
  const blocked = state.wardens.filter((c): c is number => c !== null)
  const steps = stepsFrom(from, blocked)
  const dashes: { via: number; to: number }[] = []
  if (state.dashes > 0 && movesLeft >= 2) {
    for (const via of stepsFrom(from)) {
      for (const to of stepsFrom(via)) {
        if (to !== from && to !== state.safehouse) dashes.push({ via, to })
      }
    }
  }
  const rooftops = state.rooftops > 0 ? rooftopsFrom(from).filter((to) => to !== state.safehouse) : []
  return { steps, dashes, rooftops }
}

const thiefMovesLeft = (state: MidnightLiftState) => state.maxMoves - movesUsed(state)

/** Hands the turn to the thief, or ends the game if the thief is stuck or out of time. */
function startThiefTurn(state: MidnightLiftState): MidnightLiftState {
  const left = thiefMovesLeft(state)
  if (left <= 0) return { ...state, phase: 'over', winner: 'watch', news: 'The thief ran out of time.' }
  const options = thiefOptions(state, left)
  if (!options.steps.length && !options.dashes.length && !options.rooftops.length) {
    return { ...state, phase: 'over', winner: 'watch', news: 'The thief was cornered.' }
  }
  return { ...state, phase: 'thief' }
}

function startWatchMove(state: MidnightLiftState): MidnightLiftState {
  return {
    ...state,
    phase: 'watchMove',
    moveStart: state.wardens as number[],
    done: Array(WARDENS).fill(false),
  }
}

function startWatchAct(state: MidnightLiftState): MidnightLiftState {
  return { ...state, phase: 'watchAct', done: Array(WARDENS).fill(false), searched: state.wardens.map(() => []) }
}

function startNight(state: MidnightLiftState, night: number): MidnightLiftState {
  return {
    ...state,
    night,
    phase: night === 1 ? 'safehouse' : 'couriers',
    courierSpots: [],
    couriers: [],
    posts: [],
    waitRound: 1,
    wardens: Array(WARDENS).fill(null),
    done: Array(WARDENS).fill(false),
    position: null,
    path: [],
    trail: [],
    dashes: tonight(DASHES, night),
    rooftops: tonight(ROOFTOPS, night),
    lanterns: [],
    misses: [],
  }
}

/** The thief is home. On to the next night, or the thief wins. */
function endNight(state: MidnightLiftState): MidnightLiftState {
  const history = [...state.history, state.path]
  if (state.night >= NIGHTS) {
    return { ...state, history, phase: 'over', winner: 'thief', news: 'The thief made it home with every job done.' }
  }
  const lastCorners = wardenCorners(state)
  const next = startNight({ ...state, history, lastCorners }, state.night + 1)
  return { ...next, news: `The thief slipped away. Night ${state.night + 1} begins.` }
}

/** Couriers drift one doorway, staying clear of posts and past jobs. */
function moveCouriers(state: MidnightLiftState): number[] {
  const postCorners = state.posts.map((p) => p.corner)
  const nearPost = (d: number) => postCorners.some((c) => isBeside(c, d))
  const placed = [...state.couriers]
  for (let i = 0; i < placed.length; i++) {
    const options = stepsFrom(placed[i]!, postCorners).filter(
      (to) => !nearPost(to) && !state.jobSites.includes(to) && !placed.includes(to),
    )
    if (options.length) placed[i] = options[Math.floor(random(state) * options.length)]!
  }
  return placed
}

function ownWarden(state: MidnightLiftState, playerId: string, warden: unknown) {
  if (!isWarden(warden)) throw new MoveError('Pick one of your wardens.')
  if (ownersOf(state.watchIds)[warden] !== playerId) throw new MoveError('That warden isn’t yours.')
  if (state.done[warden]) throw new MoveError('That warden is done for this round.')
  return warden
}

function allDone(state: MidnightLiftState, next: () => MidnightLiftState): MidnightLiftState {
  return state.done.every(Boolean) ? next() : state
}

function wardenTouch(state: MidnightLiftState, warden: number, doorway: unknown) {
  if (!isDoorway(doorway)) throw new MoveError('Pick a doorway.')
  const corner = state.wardens[warden]!
  if (!isBeside(corner, doorway)) throw new MoveError('Wardens can only reach the doorways right by their corner.')
  return doorway
}

function thiefMove(state: MidnightLiftState, move: Record<string, unknown>): MidnightLiftState {
  const from = state.position!
  const left = thiefMovesLeft(state)
  const options = thiefOptions(state, left)

  if (move.type === 'step') {
    if (!isDoorway(move.to) || !options.steps.includes(move.to)) {
      throw new MoveError(
        isDoorway(move.to) && stepsFrom(from).includes(move.to)
          ? 'A warden is standing on that corner.'
          : 'You can only step to the next doorway.',
      )
    }
    const next = { ...state, position: move.to, path: [...state.path, move.to], trail: [...state.trail, 'step' as Trail] }
    if (move.to === state.safehouse) return endNight(next)
    return startWatchMove({ ...next, news: 'The thief moved.' })
  }

  if (move.type === 'dash') {
    if (state.dashes <= 0) throw new MoveError('You have no dashes left tonight.')
    if (left < 2) throw new MoveError('A dash takes two moves, and you only have one left.')
    if (move.to === state.safehouse) throw new MoveError('Walk the last step into your safehouse.')
    if (!options.dashes.some((d) => d.via === move.via && d.to === move.to)) {
      throw new MoveError('A dash is two steps in a row to a new doorway.')
    }
    const via = move.via as number
    const to = move.to as number
    return startWatchMove({
      ...state,
      position: to,
      path: [...state.path, via, to],
      trail: [...state.trail, 'dash', 'dash'],
      dashes: state.dashes - 1,
      news: 'The thief dashed.',
    })
  }

  if (move.type === 'rooftop') {
    if (state.rooftops <= 0) throw new MoveError('You have no rooftop moves left tonight.')
    if (move.to === state.safehouse) throw new MoveError('Walk the last step into your safehouse.')
    if (!isDoorway(move.to) || !options.rooftops.includes(move.to)) {
      throw new MoveError('Rooftops only reach doorways on the same block.')
    }
    return startWatchMove({
      ...state,
      position: move.to,
      path: [...state.path, move.to],
      trail: [...state.trail, 'rooftop'],
      rooftops: state.rooftops - 1,
      news: 'The thief went over the rooftops.',
    })
  }

  throw new MoveError('Move to a doorway.')
}

export const midnightLift: Game<MidnightLiftState, MidnightLiftView> = {
  id: 'midnight-lift',
  name: 'Midnight Lift',
  minPlayers: 2,
  maxPlayers: 6,
  options: [
    {
      key: 'thief',
      label: 'Thief',
      min: 0,
      max: 1,
      default: THIEF_RANDOM,
      choices: [
        { value: THIEF_RANDOM, label: 'Random' },
        { value: THIEF_PICKED, label: 'Pick in the lobby' },
      ],
    },
    {
      key: 'moves',
      label: 'Moves a night',
      min: 12,
      max: 18,
      default: 15,
      choices: [
        { value: 12, label: '12 (harder)' },
        { value: 15, label: '15' },
        { value: 18, label: '18 (easier)' },
      ],
    },
  ],
  teams: {
    names: ['Thief', 'Night Watch'],
    minPerTeam: 1,
    when: (options) => options.thief === THIEF_PICKED,
  },

  setup(playerIds, options, context) {
    const seed = Math.floor(Math.random() * 2 ** 31)
    const picked =
      options.thief === THIEF_PICKED ? playerIds.filter((id) => context?.teams[id] === 0) : []
    const pool = picked.length ? picked : playerIds
    const thiefId = pool[Math.floor(Math.random() * pool.length)]!
    const state: MidnightLiftState = {
      thiefId,
      watchIds: playerIds.filter((id) => id !== thiefId),
      maxMoves: [12, 15, 18].includes(options.moves!) ? options.moves! : 15,
      night: 1,
      phase: 'safehouse',
      seed,
      safehouse: null,
      jobSites: [],
      courierSpots: [],
      couriers: [],
      posts: [],
      waitRound: 1,
      wardens: [],
      lastCorners: [],
      moveStart: [],
      done: [],
      searched: [],
      position: null,
      path: [],
      trail: [],
      dashes: 0,
      rooftops: 0,
      lanterns: [],
      misses: [],
      history: [],
      news: '',
      winner: null,
    }
    return { ...startNight(state, 1), news: 'The thief is picking a safehouse.' }
  },

  applyMove(prev, playerId, rawMove) {
    if (prev.phase === 'over') throw new MoveError('The game is over.')
    const move = (rawMove ?? {}) as Record<string, unknown>
    const isThief = playerId === prev.thiefId
    if (!isThief && !prev.watchIds.includes(playerId)) throw new MoveError('You’re watching this game.')
    // Work on a copy so the seeded random number generator can update its seed.
    const state: MidnightLiftState = { ...prev }

    switch (state.phase) {
      case 'safehouse': {
        if (!isThief) throw new MoveError('The thief is picking a safehouse.')
        if (move.type !== 'safehouse' || !isDoorway(move.doorway)) throw new MoveError('Pick a doorway for your safehouse.')
        if (START_SPOTS.includes(move.doorway)) throw new MoveError('Couriers start there. Pick another doorway.')
        return { ...state, safehouse: move.doorway, phase: 'couriers', news: 'The thief is sending out couriers.' }
      }

      case 'couriers': {
        if (!isThief) throw new MoveError('The thief is sending out couriers.')
        if (move.type !== 'couriers') throw new MoveError('Pick which couriers carry valuables.')
        const carrying = readDoorways(move.doorways)
        const starts = courierStarts(state)
        const needed = tonight(CARRYING, state.night)
        if (carrying.length !== needed) throw new MoveError(`Pick ${needed} courier${needed === 1 ? '' : 's'}.`)
        if (!carrying.every((d) => starts.includes(d))) throw new MoveError('Couriers can only start on the marked doorways.')
        const decoyCount = tonight(COURIERS, state.night) - needed
        const decoys = shuffle(state, starts.filter((d) => !carrying.includes(d))).slice(0, decoyCount)
        return {
          ...state,
          couriers: carrying,
          courierSpots: [...carrying, ...decoys].sort((a, b) => a - b),
          phase: 'posts',
          news: `${tonight(COURIERS, state.night)} couriers are out. The Watch is placing posts.`,
        }
      }

      case 'posts': {
        if (playerId !== leadOf(state)) throw new MoveError('Another Watch player is placing the posts tonight.')
        if (move.type !== 'posts') throw new MoveError('Place the posts.')
        const { wardens, decoys } = move
        if (!Array.isArray(wardens) || wardens.length !== WARDENS || !wardens.every(isCorner)) {
          throw new MoveError('Put each of the five wardens on a corner.')
        }
        if (!Array.isArray(decoys) || decoys.length !== POSTS - WARDENS || !decoys.every(isCorner)) {
          throw new MoveError('Put both decoy posts on corners.')
        }
        const all = [...wardens, ...decoys] as number[]
        if (new Set(all).size !== all.length) throw new MoveError('Only one post can go on each corner.')
        const { fixed, open } = postChoices(state)
        const onFixed = all.filter((c) => fixed.includes(c))
        const onOpen = all.filter((c) => open.includes(c))
        if (onFixed.length !== fixed.length || onOpen.length !== POSTS - fixed.length) {
          throw new MoveError(
            state.night === 1
              ? 'Posts go on the marked corners.'
              : 'Five posts go where the wardens ended last night, and two on empty marked corners.',
          )
        }
        const posts: Post[] = all.map((corner, i) => ({ corner, warden: i < WARDENS ? i : null, revealed: false }))
        return {
          ...state,
          posts,
          phase: 'wait',
          news: 'The posts are out. The thief is watching the couriers.',
        }
      }

      case 'wait': {
        if (!isThief) throw new MoveError('The thief is deciding when to strike.')
        if (move.type === 'wait') {
          if (state.waitRound >= WAIT_ROUNDS) throw new MoveError('Time’s up. You have to strike now.')
          const post = state.posts.find((p) => p.corner === move.reveal)
          if (!post || post.revealed) throw new MoveError('Pick a hidden post to check.')
          const couriers = moveCouriers(state)
          const posts = state.posts
            .map((p) => (p === post ? { ...p, revealed: true } : p))
            .filter((p) => !(p.revealed && p.warden === null))
          return {
            ...state,
            couriers,
            posts,
            waitRound: state.waitRound + 1,
            news: post.warden === null ? 'The thief waited and found a decoy post.' : 'The thief waited and spotted a warden.',
          }
        }
        if (move.type !== 'strike') throw new MoveError('Wait or strike.')
        const targets = readDoorways(move.doorways)
        const jobs = tonight(JOBS, state.night)
        if (targets.length !== jobs) throw new MoveError(jobs === 1 ? 'Pick one courier.' : `Pick ${jobs} couriers.`)
        if (!targets.every((d) => state.couriers.includes(d))) throw new MoveError('Pick a courier carrying valuables.')

        // The alarm goes up: real posts become wardens and the decoys and other couriers go home.
        const wardens: (number | null)[] = Array(WARDENS).fill(null)
        for (const post of state.posts) if (post.warden !== null) wardens[post.warden] = post.corner
        const position = targets[targets.length - 1]!
        const next: MidnightLiftState = {
          ...state,
          jobSites: [...state.jobSites, ...targets],
          couriers: [],
          courierSpots: [],
          posts: [],
          wardens,
          position,
          path: [...targets],
          // The first of two jobs uses up the first move.
          trail: targets.slice(1).map(() => 'job'),
          news: jobs === 1 ? 'A courier has been robbed! The Watch is on the move.' : 'Two couriers robbed at once! Which one was last?',
        }
        return jobs > 1 ? startWatchMove(next) : startThiefTurn(next)
      }

      case 'thief': {
        if (!isThief) throw new MoveError('The thief is on the move.')
        return thiefMove(state, move)
      }

      case 'watchMove': {
        if (isThief) throw new MoveError('The Watch is moving.')
        const owners = ownersOf(state.watchIds)
        if (move.type === 'done') {
          const done = state.done.map((d, i) => d || owners[i] === playerId)
          return allDone({ ...state, done }, () => startWatchAct({ ...state, done }))
        }
        if (move.type !== 'moveWarden') throw new MoveError('Move a warden or press Done.')
        const warden = ownWarden(state, playerId, move.warden)
        if (!isCorner(move.to)) throw new MoveError('Pick a corner.')
        const start = state.moveStart[warden]!
        if (move.to !== start && !cornersWithin(start, MAX_WARDEN_STEPS).includes(move.to)) {
          throw new MoveError('Wardens move up to two corners along the streets.')
        }
        if (state.wardens.some((c, i) => i !== warden && c === move.to)) throw new MoveError('Another warden is on that corner.')
        const wardens = state.wardens.map((c, i) => (i === warden ? (move.to as number) : c))
        return { ...state, wardens }
      }

      case 'watchAct': {
        if (isThief) throw new MoveError('The Watch is searching.')
        const owners = ownersOf(state.watchIds)
        const afterRound = startThiefTurn
        if (move.type === 'done') {
          const done = state.done.map((d, i) => d || owners[i] === playerId)
          return allDone({ ...state, done }, () => afterRound({ ...state, done }))
        }
        const warden = ownWarden(state, playerId, move.warden)
        const doorway = wardenTouch(state, warden, move.doorway)

        if (move.type === 'arrest') {
          if (doorway === state.position) {
            return { ...state, phase: 'over', winner: 'watch', news: 'Caught! The Watch arrested the thief.' }
          }
          const done = state.done.map((d, i) => d || i === warden)
          const next = { ...state, done, news: 'An arrest came up empty.' }
          return allDone(next, () => afterRound(next))
        }

        if (move.type === 'search') {
          if (state.searched[warden]!.includes(doorway)) throw new MoveError('This warden already searched there.')
          const searched = state.searched.map((list, i) => (i === warden ? [...list, doorway] : list))
          if (state.path.includes(doorway)) {
            const done = state.done.map((d, i) => d || i === warden)
            const lanterns = state.lanterns.includes(doorway) ? state.lanterns : [...state.lanterns, doorway]
            const next = { ...state, done, searched, lanterns, news: 'A lantern goes up: the thief came this way.' }
            return allDone(next, () => afterRound(next))
          }
          const misses = state.misses.includes(doorway) ? state.misses : [...state.misses, doorway]
          // A warden can keep searching its doorways until it finds something or runs out.
          const left = CORNERS[state.wardens[warden]!]!.doorways.filter((d) => !searched[warden]!.includes(d))
          const done = left.length ? state.done : state.done.map((d, i) => d || i === warden)
          const next = { ...state, done, searched, misses, news: 'Nothing found.' }
          return allDone(next, () => afterRound(next))
        }
        throw new MoveError('Search, arrest or press Done.')
      }
    }
    throw new MoveError('That move doesn’t fit right now.')
  },

  viewFor(state, viewerId) {
    const youAreThief = viewerId === state.thiefId
    const over = state.phase === 'over'
    const sees = youAreThief || over
    // Before the alarm, the Watch sees where couriers went but not which carry valuables.
    const couriers = sees ? state.couriers : state.phase === 'wait' ? state.couriers : []
    const posts = state.posts.map((post) =>
      youAreThief && !post.revealed && !over ? { ...post, warden: null } : post,
    )
    const { seed: _seed, ...rest } = state
    return {
      ...rest,
      safehouse: sees ? state.safehouse : null,
      position: sees ? state.position : null,
      path: sees ? state.path : [],
      history: over ? state.history : [],
      couriers,
      posts: youAreThief || over || state.watchIds.includes(viewerId ?? '') ? posts : posts.map((p) => (p.revealed ? p : { ...p, warden: null })),
      youAreThief,
      owners: ownersOf(state.watchIds),
      leadId: leadOf(state),
      movesUsed: movesUsed(state),
      jobsDone: state.jobSites.length,
      jobsTonight: tonight(JOBS, state.night),
      carryingTonight: tonight(CARRYING, state.night),
      couriersTonight: tonight(COURIERS, state.night),
    }
  },

  result(state) {
    if (state.phase !== 'over') return null
    if (state.winner === 'thief') return { winnerIds: [state.thiefId], message: 'The thief got away!' }
    return { winnerIds: state.watchIds, message: 'The Watch caught the thief!' }
  },

  waitingOn(state) {
    const owners = ownersOf(state.watchIds)
    switch (state.phase) {
      case 'safehouse':
      case 'couriers':
      case 'wait':
      case 'thief':
        return [state.thiefId]
      case 'posts':
        return [leadOf(state)!]
      case 'watchMove':
      case 'watchAct':
        return [...new Set(owners.filter((_, i) => !state.done[i]))]
      default:
        return []
    }
  },

  onPlayerLeave(state, playerId) {
    if (playerId === state.thiefId) return null
    const watchIds = state.watchIds.filter((id) => id !== playerId)
    if (!watchIds.length) return null
    return { ...state, watchIds }
  },

  onPlayerJoin(state, playerId) {
    if (state.phase === 'over') return null
    return { ...state, watchIds: [...state.watchIds, playerId] }
  },
}
