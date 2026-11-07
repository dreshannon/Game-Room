import { describe, expect, it } from 'vitest'
import { MASCOT_TICKETS, RACE_DECK_SIZE, sideTicketValues } from './data'
import { NO_PILE, POTS, STARTING_MONEY, YES_PILE, lifeOutcome, mascotMayhem, type MayhemState } from './logic'
import { BURN, startRace, type RaceCard } from './race'

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`)
const player = (state: MayhemState, id: string) => state.players.find((p) => p.id === id)!
const move = (state: MayhemState, id: string, m: unknown, isHost = true) =>
  mascotMayhem.applyMove(state, id, m, { isHost })

/** Takes tickets in draft order: each picker takes the first non-empty pile, safe side. */
function draftAll(state: MayhemState, pick = (_: MayhemState) => ({ pile: 0, side: 'safe' })) {
  while (state.phase === 'draft') {
    const id = state.draftOrder[state.draftIndex]!
    let { pile, side } = pick(state)
    while (state.piles[pile] === 0) pile++
    state = move(state, id, { type: 'take', pile, side })
  }
  return state
}

function stackAll(state: MayhemState) {
  for (const p of state.players) {
    const count = state.players.length === 2 ? 2 : 1
    state = move(state, p.id, { type: 'stack', cards: player(state, p.id).hand.slice(0, count).map((c) => c.id) })
  }
  return state
}

/** Replaces the shuffled race with one in a known order: Biscuit wins, then Waddles, then Pickles. */
function rigRace(state: MayhemState) {
  let id = 5000
  const c = (mascot: number, spaces: number): RaceCard => ({ id: id++, mascot, action: { kind: 'move', spaces } })
  const burn = Array.from({ length: BURN }, () => c(3, 1))
  state.run = startRace([...burn, c(0, 20), c(1, 20), c(2, 20)], () => 0.9999)
  return state
}

function runToEnd(state: MayhemState) {
  for (let i = 0; i < 200 && state.phase === 'race'; i++) state = mascotMayhem.tick!(state)
  return state
}

describe('setup', () => {
  it('deals hands and builds a race deck that reaches 18 cards once everyone adds one', () => {
    const state = mascotMayhem.setup(ids(4), {})
    expect(state.mode).toBe('draft')
    expect(state.players.every((p) => p.hand.length === 3 && p.money === STARTING_MONEY)).toBe(true)
    expect(state.deck).toHaveLength(RACE_DECK_SIZE - 4)
    expect(state.deck.filter((c) => c.starter)).toHaveLength(4)
  })

  it('uses shared pots and no hands from 9 players', () => {
    const state = mascotMayhem.setup(ids(9), {})
    expect(state.mode).toBe('pots')
    expect(state.phase).toBe('bets')
    expect(state.deck).toHaveLength(RACE_DECK_SIZE)
    expect(state.players.every((p) => p.hand.length === 0)).toBe(true)
  })
})

describe('the ticket draft', () => {
  it('snakes forward then back, starting with the first drafter', () => {
    const state = mascotMayhem.setup(ids(3), {})
    const order = state.draftOrder
    expect(order).toHaveLength(6)
    expect(order[0]).toBe(state.firstDrafter)
    expect(order.slice(0, 3)).toEqual([...order.slice(3)].reverse())
  })

  it('gives two players three picks each, in 1-2-2-1-1-2 order', () => {
    const state = mascotMayhem.setup(ids(2), {})
    const [a, b] = [state.draftOrder[0], state.draftOrder[1]]
    expect(state.draftOrder).toEqual([a, b, b, a, a, b])
  })

  it('hands out the best ticket in a pile first, and only on your pick', () => {
    let state = mascotMayhem.setup(ids(3), {})
    const first = state.draftOrder[0]!
    const second = state.draftOrder[1]!
    expect(() => move(state, second, { type: 'take', pile: 0, side: 'safe' })).toThrow('not your pick')
    state = move(state, first, { type: 'take', pile: 0, side: 'risky' })
    state = move(state, second, { type: 'take', pile: 0, side: 'safe' })
    expect(player(state, first).tickets[0]).toMatchObject({ pile: 0, rank: 0, side: 'risky' })
    expect(player(state, second).tickets[0]).toMatchObject({ pile: 0, rank: 1 })
    const view = mascotMayhem.viewFor(state, first)
    expect(view.offers[0]).toMatchObject({ left: 1, rank: 2, mascot: MASCOT_TICKETS[2] })
  })

  it('refuses an empty pile', () => {
    let state = mascotMayhem.setup(ids(4), {})
    for (let i = 0; i < 3; i++) state = move(state, state.draftOrder[state.draftIndex]!, { type: 'take', pile: 2, side: 'safe' })
    expect(() => move(state, state.draftOrder[state.draftIndex]!, { type: 'take', pile: 2, side: 'safe' })).toThrow('empty')
  })

  it('moves on to adding cards once everyone has their tickets', () => {
    const state = draftAll(mascotMayhem.setup(ids(3), {}))
    expect(state.phase).toBe('stack')
    expect(mascotMayhem.waitingOn!(state).sort()).toEqual(ids(3))
  })
})

describe('racing', () => {
  it('starts the race once everyone has added a card, with a full deck', () => {
    let state = draftAll(mascotMayhem.setup(ids(3), {}))
    state = stackAll(state)
    expect(state.phase).toBe('race')
    expect(state.run!.deck.length + state.run!.burned.length).toBe(RACE_DECK_SIZE)
    expect(state.players.every((p) => p.hand.length === 2)).toBe(true)
  })

  it('counts down, then flips a card on each tick, and the host can pause', () => {
    let state = stackAll(draftAll(mascotMayhem.setup(ids(3), {})))
    expect(state.countdown).toBe(3)
    expect(mascotMayhem.tickDelay!(state)).toBeGreaterThan(0)
    state = mascotMayhem.tick!(mascotMayhem.tick!(state))
    expect(state.revealed).toHaveLength(0)
    state = mascotMayhem.tick!(state)
    expect(state.revealed).toHaveLength(1)

    expect(() => move(state, 'p1', { type: 'pause', paused: true }, false)).toThrow('Only the host')
    state = move(state, 'p0', { type: 'pause', paused: true })
    expect(mascotMayhem.tickDelay!(state)).toBeNull()
    expect(mascotMayhem.tick!(state)).toBe(state)
  })

  it('pays safe tickets by place and risky tickets only for a win', () => {
    let state = mascotMayhem.setup(ids(3), {})
    // Everyone takes Biscuit (who will win) or Pickles (3rd), on different sides.
    const picks = [
      { pile: 0, side: 'risky' },
      { pile: 0, side: 'safe' },
      { pile: 2, side: 'risky' },
      { pile: 2, side: 'safe' },
      { pile: 3, side: 'safe' },
      { pile: 1, side: 'safe' },
    ]
    let n = 0
    state = draftAll(state, () => picks[n++]!)
    state = rigRace(stackAll(state))
    state = runToEnd(state)
    expect(state.phase).toBe('results')
    expect(state.places).toEqual([1, 2, 3, 4])

    const lines = state.players.flatMap((p) => p.lines)
    const biscuitRisky = lines.find((l) => l.pile === 0 && l.side === 'risky')!
    const biscuitSafe = lines.find((l) => l.pile === 0 && l.side === 'safe')!
    const picklesRisky = lines.find((l) => l.pile === 2 && l.side === 'risky')!
    const picklesSafe = lines.find((l) => l.pile === 2 && l.side === 'safe')!
    const bandit = lines.find((l) => l.pile === 3)!
    expect(biscuitRisky.amount).toBe(MASCOT_TICKETS[0]!.risky)
    expect(biscuitSafe.amount).toBe(MASCOT_TICKETS[1]!.safe[0])
    expect(picklesRisky.amount).toBe(0)
    expect(picklesSafe.amount).toBe(MASCOT_TICKETS[1]!.safe[2])
    expect(bandit.amount).toBe(0)
    for (const p of state.players) {
      expect(p.money).toBe(STARTING_MONEY + p.lines.reduce((s, l) => s + l.amount, 0))
    }
  })

  it('pays side bets by their odds, and a wrong risky side bet costs money', () => {
    let state = mascotMayhem.setup(ids(2), {})
    state.sideBet = 0 // "Will any mascot be knocked out or go off the track?" Not in the rigged race.
    const picks = [
      { pile: YES_PILE, side: 'risky' },
      { pile: NO_PILE, side: 'safe' },
      { pile: 0, side: 'safe' },
      { pile: 0, side: 'safe' },
      { pile: 0, side: 'safe' },
      { pile: 0, side: 'safe' },
    ]
    let n = 0
    state = draftAll(state, () => picks[n++]!)
    state = runToEnd(rigRace(stackAll(state)))
    expect(state.sideResult).toBe(false)
    const lines = state.players.flatMap((p) => p.lines)
    expect(lines.find((l) => l.pile === YES_PILE)!.amount).toBe(-sideTicketValues(0.78, 0).riskyLoss)
    expect(lines.find((l) => l.pile === NO_PILE)!.amount).toBe(sideTicketValues(0.22, 0).safe)
  })

  it('deals a new card to everyone and lets the poorest draft first next race', () => {
    // A real, shuffled race, so the whole deck comes back afterwards.
    let state = runToEnd(stackAll(draftAll(mascotMayhem.setup(ids(3), {}))))
    expect(() => move(state, 'p1', { type: 'nextRace', race: 1 }, false)).toThrow('Only the host')
    const poorest = [...state.players].sort((a, b) => a.money - b.money)[0]!.money
    state = move(state, 'p0', { type: 'nextRace', race: 1 })
    expect(state.race).toBe(2)
    expect(state.phase).toBe('draft')
    expect(player(state, state.draftOrder[0]!).money).toBe(poorest)
    expect(state.players.every((p) => p.hand.length === 3 && p.tickets.length === 0)).toBe(true)
    expect(state.deck.length + 3).toBe(RACE_DECK_SIZE)
    // A late second click is ignored.
    expect(move(state, 'p0', { type: 'nextRace', race: 1 })).toBe(state)
  })

  it('lets everyone double one ticket in the last race, and ends after it', () => {
    let state = mascotMayhem.setup(ids(3), {})
    for (let race = 1; race <= 2; race++) {
      state = runToEnd(rigRace(stackAll(draftAll(state))))
      state = move(state, 'p0', { type: 'nextRace', race })
    }
    state = draftAll(state)
    expect(state.phase).toBe('double')
    for (const p of state.players) state = move(state, p.id, { type: 'double', index: 0 })
    expect(state.phase).toBe('stack')
    state = runToEnd(rigRace(stackAll(state)))
    expect(state.phase).toBe('over')
    const doubled = state.players.flatMap((p) => p.lines).filter((l) => l.doubled && l.pile === 0)
    expect(doubled.length).toBeGreaterThan(0)
    expect(mascotMayhem.result(state)?.winnerIds.length).toBeGreaterThan(0)
  })
})

describe('pots mode', () => {
  it('hides bets until everyone has bet, then splits the pots', () => {
    let state = mascotMayhem.setup(ids(9), {})
    state = move(state, 'p0', { type: 'bets', piles: [0, 0] })
    expect(mascotMayhem.viewFor(state, 'p1').players[0]!.bets).toBeNull()
    expect(mascotMayhem.viewFor(state, 'p0').players[0]!.bets).toHaveLength(2)
    for (const id of ids(9).slice(1)) state = move(state, id, { type: 'bets', piles: id === 'p1' ? [0, 1] : [3, 3] })
    expect(state.phase).toBe('race')
    state = runToEnd(rigRace(state))
    // Biscuit won: p0 has two shares and p1 one, of the $18 pot.
    expect(player(state, 'p0').history[0]).toBe(Math.floor(POTS.first / 3) * 2)
    expect(player(state, 'p1').history[0]).toBe(Math.floor(POTS.first / 3) + POTS.second)
    expect(player(state, 'p2').history[0]).toBe(0)
  })
})

describe('leaving', () => {
  it('skips a leaver in the draft, and ends with one player left', () => {
    let state = mascotMayhem.setup(ids(3), {})
    const current = state.draftOrder[0]!
    state = mascotMayhem.onPlayerLeave!(state, current)!
    expect(state.draftOrder).toHaveLength(4)
    expect(state.draftOrder).not.toContain(current)
    const [a] = state.players
    expect(mascotMayhem.onPlayerLeave!(state, a!.id)).toBeNull()
  })

  it('starts the race if the leaver was the last to add a card', () => {
    let state = draftAll(mascotMayhem.setup(ids(3), {}))
    state = move(state, 'p0', { type: 'stack', cards: [player(state, 'p0').hand[0]!.id] })
    state = move(state, 'p1', { type: 'stack', cards: [player(state, 'p1').hand[0]!.id] })
    state = mascotMayhem.onPlayerLeave!(state, 'p2')!
    expect(state.phase).toBe('race')
  })
})

describe('life outcomes', () => {
  it('has an outcome for any amount of money', () => {
    expect(lifeOutcome(0)).toContain('Walks home')
    expect(lifeOutcome(100)).toContain('stadium')
  })
})
