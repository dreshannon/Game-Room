import { describe, expect, it } from 'vitest'
import { MoveError } from '../types'
import {
  applyStreakMove,
  buildDeck,
  createGame,
  scoreHand,
  streakPlayerLeft,
  streakResult,
  streakWaitingOn,
  type ActionName,
  type Card,
  type Hand,
  type ModifierCard,
  type NumberCard,
  type StreakState,
  type Variant,
} from './engine'

let nextId = 1000
const num = (value: number, special?: NumberCard['special']): NumberCard =>
  special ? { id: nextId++, kind: 'number', value, special } : { id: nextId++, kind: 'number', value }
const modifier = (effect: ModifierCard['effect'], value = 2): ModifierCard => ({
  id: nextId++,
  kind: 'modifier',
  effect,
  value,
})
const action = (name: ActionName): Card => ({ id: nextId++, kind: 'action', action: name })

/** Cards listed in the order they'll be drawn. */
const drawOrder = (...cards: Card[]) => [...cards].reverse()

/**
 * Three players, a, b and c. a deals first, so the deal goes b, c, a and b has the first turn.
 * The first three cards are dealt, and the rest are drawn afterwards.
 */
function game(variant: Variant, cards: Card[], players = ['a', 'b', 'c'], target = 200) {
  return createGame(variant, players, target, drawOrder(...cards))
}

const move = (state: StreakState, player: string, payload: Record<string, unknown>) =>
  applyStreakMove(state, player, payload)
const hit = (state: StreakState, player: string) => move(state, player, { type: 'hit' })
const stay = (state: StreakState, player: string) => move(state, player, { type: 'stay' })
const target = (state: StreakState, player: string, playerId: string) =>
  move(state, player, { type: 'target', playerId })
const values = (state: StreakState, player: string) => state.hands[player]!.numbers.map((c) => c.value)
const turnOf = (state: StreakState) => streakWaitingOn(state)[0]

function hand(partial: Partial<Hand>): Hand {
  return { numbers: [], modifiers: [], secondChance: null, status: 'active', ...partial }
}

describe('decks', () => {
  it('builds the classic 94-card deck', () => {
    const deck = buildDeck('classic')
    const numbers = deck.filter((card) => card.kind === 'number')
    expect(deck).toHaveLength(94)
    expect(numbers).toHaveLength(79)
    expect(numbers.filter((card) => card.value === 12)).toHaveLength(12)
    expect(numbers.filter((card) => card.value === 0)).toHaveLength(1)
    expect(deck.filter((card) => card.kind === 'action')).toHaveLength(9)
    expect(deck.filter((card) => card.kind === 'modifier')).toHaveLength(6)
    expect(new Set(deck.map((card) => card.id)).size).toBe(94)
  })

  it('builds the revenge 108-card deck with its special numbers', () => {
    const deck = buildDeck('revenge')
    const numbers = deck.filter((card): card is NumberCard => card.kind === 'number')
    expect(deck).toHaveLength(108)
    expect(numbers).toHaveLength(92)
    expect(numbers.filter((card) => card.value === 13)).toHaveLength(13)
    for (const special of ['zero', 'unlucky7', 'lucky13'] as const) {
      expect(numbers.filter((card) => card.special === special)).toHaveLength(1)
    }
    expect(deck.filter((card) => card.kind === 'action')).toHaveLength(10)
    expect(deck.filter((card) => card.kind === 'modifier')).toHaveLength(6)
  })
})

describe('scoring', () => {
  it('doubles only the numbers, then adds bonuses, in the classic game', () => {
    const scored = hand({ numbers: [num(8), num(6), num(3)], modifiers: [modifier('times2'), modifier('plus', 4)] })
    expect(scoreHand('classic', scored, false)).toBe(38)
    expect(scoreHand('classic', scored, true)).toBe(53)
  })

  it('halves (rounding down) then subtracts, never below zero, in revenge', () => {
    expect(scoreHand('revenge', hand({ numbers: [num(9), num(11)], modifiers: [modifier('half'), modifier('minus', 2)] }), false)).toBe(8)
    expect(scoreHand('revenge', hand({ numbers: [num(9)], modifiers: [modifier('half'), modifier('minus', 6)] }), false)).toBe(0)
  })

  it('scores zero while holding the Zero, unless you Flip 7', () => {
    const zero = hand({ numbers: [num(0, 'zero'), num(12)] })
    expect(scoreHand('revenge', zero, false)).toBe(0)
    expect(scoreHand('revenge', zero, true)).toBe(27)
  })

  it('scores nothing for a bust', () => {
    expect(scoreHand('classic', hand({ numbers: [num(12)], status: 'busted' }), false)).toBe(0)
  })
})

describe('dealing and turns', () => {
  it('deals one card each, starting left of the dealer, who then goes first', () => {
    const state = game('classic', [num(5), num(6), num(7)])
    expect(values(state, 'b')).toEqual([5])
    expect(values(state, 'c')).toEqual([6])
    expect(values(state, 'a')).toEqual([7])
    expect(turnOf(state)).toBe('b')
  })

  it('busts on a duplicate and moves to the next player', () => {
    let state = game('classic', [num(5), num(6), num(7), num(5)])
    state = hit(state, 'b')
    expect(state.hands.b!.status).toBe('busted')
    expect(turnOf(state)).toBe('c')
  })

  it('keeps each line in numerical order as cards are drawn', () => {
    // With two players, b is dealt first and takes the first turn; a stays so b keeps drawing.
    let state = game('classic', [num(8), num(7), num(3), num(11), num(5)], ['a', 'b'])
    state = hit(hit(stay(hit(state, 'b'), 'a'), 'b'), 'b')
    expect(values(state, 'b')).toEqual([3, 5, 8, 11])
  })

  it('rejects moves out of turn', () => {
    expect(() => hit(game('classic', [num(5), num(6), num(7)]), 'c')).toThrow(MoveError)
  })

  it('ends the round once everyone has stayed or busted, and rotates the dealer', () => {
    let state = game('classic', [num(5), num(6), num(7), num(1), num(2), num(3)])
    state = stay(stay(stay(state, 'b'), 'c'), 'a')
    expect(state.phase).toBe('roundOver')
    expect(state.scores).toEqual({ a: 7, b: 5, c: 6 })
    state = move(state, 'a', { type: 'nextRound', round: 1 })
    expect(state.order[state.dealerIndex]).toBe('b')
    expect(turnOf(state)).toBe('c')
  })

  it('ends the round immediately on seven numbers, with the bonus', () => {
    let state = game('classic', [num(5), num(6), num(7), num(9)])
    state.hands.b!.numbers = [1, 2, 3, 4, 5, 6].map((value) => num(value))
    state = hit(state, 'b')
    expect(state.phase).toBe('roundOver')
    expect(state.flip7PlayerId).toBe('b')
    expect(state.roundScores!.b).toBe(1 + 2 + 3 + 4 + 5 + 6 + 9 + 15)
    // Others score what they had, even though they never stayed.
    expect(state.roundScores!.c).toBe(6)
  })

  it('reshuffles the discards when the deck runs out', () => {
    let state = game('classic', [num(5), num(6), num(7)])
    state.discardPile = [num(11)]
    state = hit(state, 'b')
    expect(values(state, 'b')).toEqual([5, 11])
    expect(state.log.some((entry) => entry.type === 'reshuffled')).toBe(true)
  })

  it('ignores a duplicate next-round click', () => {
    let state = game('classic', [num(5), num(6), num(7), num(1), num(2), num(3)])
    state = stay(stay(stay(state, 'b'), 'c'), 'a')
    state = move(state, 'a', { type: 'nextRound', round: 1 })
    expect(move(state, 'b', { type: 'nextRound', round: 1 })).toBe(state)
  })

  it('ends the game at the target score, and ties share the win', () => {
    let state = game('classic', [num(5), num(6), num(7)], ['a', 'b', 'c'], 50)
    state.scores = { a: 43, b: 45, c: 0 }
    state = stay(stay(stay(state, 'b'), 'c'), 'a')
    expect(streakResult(state)).toEqual({ winnerIds: ['a', 'b'] })
    expect(() => move(state, 'a', { type: 'nextRound', round: 1 })).toThrow('over')
  })
})

describe('classic actions', () => {
  it('lets the drawer freeze any active player, including themselves', () => {
    let state = game('classic', [num(5), num(6), num(7), action('freeze')])
    state = hit(state, 'b')
    expect(state.choice).toMatchObject({ kind: 'target', playerId: 'b', options: ['a', 'b', 'c'] })
    expect(turnOf(state)).toBe('b')
    state = target(state, 'b', 'c')
    expect(state.hands.c!.status).toBe('stayed')
    expect(state.hands.c!.frozen).toBe(true)
    expect(state.hands.b!.frozen).toBeUndefined()
    expect(turnOf(state)).toBe('a')
  })

  it('freezes the drawer automatically if they are the only active player', () => {
    let state = game('classic', [num(5), num(6), num(7), action('freeze')])
    state.hands.a!.status = 'stayed'
    state.hands.c!.status = 'stayed'
    state = hit(state, 'b')
    expect(state.phase).toBe('roundOver')
  })

  it('makes the target flip three, holding actions until the end', () => {
    let state = game('classic', [num(5), num(6), num(7), action('flipThree'), num(9), action('freeze'), num(10)])
    state = target(hit(state, 'b'), 'b', 'c')
    expect(values(state, 'c')).toEqual([6, 9, 10])
    expect(state.choice).toMatchObject({ kind: 'target', playerId: 'c' })
    state = target(state, 'c', 'a')
    expect(state.hands.a!.status).toBe('stayed')
  })

  it('stops a Flip Three on a bust and drops the held actions', () => {
    let state = game('classic', [num(5), num(6), num(7), action('flipThree'), action('freeze'), num(6), num(12)])
    state = target(hit(state, 'b'), 'b', 'c')
    expect(state.hands.c!.status).toBe('busted')
    expect(state.choice).toBeNull()
    expect(state.deck.map((card) => (card as NumberCard).value)).toEqual([12])
  })

  it('saves a bust with Second Chance, discarding both cards', () => {
    let state = game('classic', [num(5), num(6), num(7), action('secondChance'), num(5)])
    state = hit(state, 'b')
    expect(state.hands.b!.secondChance).not.toBeNull()
    state = stay(stay(state, 'c'), 'a')
    state = hit(state, 'b')
    expect(state.hands.b!.status).toBe('active')
    expect(state.hands.b!.secondChance).toBeNull()
    expect(values(state, 'b')).toEqual([5])
  })

  it('passes a second Second Chance to someone without one, or discards it', () => {
    let state = game('classic', [num(5), num(6), num(7), action('secondChance'), action('secondChance')])
    state.hands.b!.secondChance = { id: 1, kind: 'action', action: 'secondChance' }
    state.hands.a!.secondChance = { id: 2, kind: 'action', action: 'secondChance' }
    state = hit(state, 'b')
    // c is the only one without, so it goes there automatically.
    expect(state.hands.c!.secondChance).not.toBeNull()
    state = hit(state, 'c')
    expect(state.log.at(-1)?.type).toBe('fizzled')
  })

  it('uses a Second Chance drawn during Flip Three straight away', () => {
    let state = game('classic', [num(5), num(6), num(7), action('flipThree'), action('secondChance'), num(6), num(8)])
    state = target(hit(state, 'b'), 'b', 'c')
    expect(state.hands.c!.status).toBe('active')
    expect(values(state, 'c')).toEqual([6, 8])
  })

  it('does not let stayed players be targeted', () => {
    let state = game('classic', [num(5), num(6), num(7), num(1), action('freeze')])
    state = stay(state, 'b')
    state = hit(state, 'c')
    expect(state.hands.c!.numbers).toHaveLength(2)
    state = hit(state, 'a')
    expect(state.choice).toMatchObject({ options: ['a', 'c'] })
  })
})

describe('revenge modifiers and special numbers', () => {
  it('lets the drawer put a penalty on anyone still in, including stayed players', () => {
    let state = game('revenge', [num(5), num(6), num(7), num(1), modifier('minus', 6)])
    state = stay(state, 'b')
    state = hit(state, 'c')
    state = hit(state, 'a')
    expect(state.choice).toMatchObject({ kind: 'target', playerId: 'a', options: ['a', 'b', 'c'] })
    state = target(state, 'a', 'b')
    expect(state.hands.b!.modifiers.map((card) => card.value)).toEqual([6])
  })

  it('keeps the penalty if nobody else is still in', () => {
    let state = game('revenge', [num(5), num(6), num(7), modifier('minus', 4)])
    state.hands.a!.status = 'busted'
    state.hands.c!.status = 'busted'
    state = hit(state, 'b')
    expect(state.hands.b!.modifiers).toHaveLength(1)
  })

  it('will not let you stay while you hold the Zero', () => {
    let state = game('revenge', [num(0, 'zero'), num(6), num(7)])
    expect(() => stay(state, 'b')).toThrow('Zero')
    state = hit(state, 'b')
  })

  it('makes Unlucky 7 discard everything else without busting, but a later 7 busts', () => {
    let state = game('revenge', [num(7), num(6), num(5), num(7, 'unlucky7'), num(1), num(2), num(7)])
    state.hands.b!.modifiers = [modifier('minus', 4)]
    state = hit(state, 'b')
    expect(state.hands.b!.numbers.map((card) => card.special)).toEqual(['unlucky7'])
    expect(state.hands.b!.modifiers).toEqual([])
    expect(state.hands.b!.status).toBe('active')
    state = hit(hit(state, 'c'), 'a')
    state = hit(state, 'b')
    expect(state.hands.b!.status).toBe('busted')
  })

  it('allows a second 13 with Lucky 13, and busts on a third', () => {
    let state = game('revenge', [num(13), num(6), num(5), num(13, 'lucky13'), num(1), num(2), num(13)])
    state = hit(state, 'b')
    expect(values(state, 'b')).toEqual([13, 13])
    expect(state.hands.b!.status).toBe('active')
    state = hit(hit(state, 'c'), 'a')
    state = hit(state, 'b')
    expect(state.hands.b!.status).toBe('busted')
  })
})

describe('revenge actions', () => {
  it('makes a stayed player take Just One More and stay', () => {
    let state = game('revenge', [num(5), num(6), num(7), action('justOneMore'), num(9)])
    state = stay(state, 'b')
    state = target(hit(state, 'c'), 'c', 'b')
    expect(values(state, 'b')).toEqual([5, 9])
    expect(state.hands.b!.status).toBe('stayed')
  })

  it('makes an active player stay after Just One More', () => {
    let state = game('revenge', [num(5), num(6), num(7), action('justOneMore'), num(9)])
    state = target(hit(state, 'b'), 'b', 'c')
    expect(values(state, 'c')).toEqual([6, 9])
    expect(state.hands.c!.status).toBe('stayed')
    expect(turnOf(state)).toBe('a')
  })

  it('holds Flip Four actions and penalties until all four are flipped', () => {
    let state = game('revenge', [
      num(5), num(6), num(7),
      action('flipFour'), num(1), modifier('minus', 2), num(2), num(3),
    ])
    state = target(hit(state, 'b'), 'b', 'c')
    expect(values(state, 'c')).toEqual([1, 2, 3, 6])
    expect(state.choice).toMatchObject({ kind: 'target', playerId: 'c' })
  })

  it('throws away held Flip Four cards if the player busts', () => {
    let state = game('revenge', [num(5), num(6), num(7), action('flipFour'), action('steal'), num(6), num(1)])
    state = target(hit(state, 'b'), 'b', 'c')
    expect(state.hands.c!.status).toBe('busted')
    expect(state.choice).toBeNull()
    expect(state.deck).toHaveLength(1)
  })

  it('lets Steal take a card, which can bust the stealer', () => {
    let state = game('revenge', [num(5), num(6), num(5), action('steal')])
    state = hit(state, 'b')
    expect(state.choice).toMatchObject({ kind: 'steal', playerId: 'b' })
    expect(() => move(state, 'b', { type: 'steal', ownerId: 'b', cardId: state.hands.b!.numbers[0]!.id })).toThrow()
    const stolen = state.hands.a!.numbers[0]!.id
    state = move(state, 'b', { type: 'steal', ownerId: 'a', cardId: stolen })
    expect(state.hands.a!.numbers).toEqual([])
    expect(state.hands.b!.status).toBe('busted')
  })

  it('puts a stolen number in order in the stealer’s line', () => {
    let state = game('revenge', [num(2), num(6), num(4), action('steal')])
    state.hands.b!.numbers.push(num(9))
    state = hit(state, 'b')
    state = move(state, 'b', { type: 'steal', ownerId: 'a', cardId: state.hands.a!.numbers[0]!.id })
    expect(values(state, 'b')).toEqual([2, 4, 9])
  })

  it('lets Swap bust two players at once', () => {
    let state = game('revenge', [num(10), num(11), num(1), action('swap')])
    state.hands.b!.numbers.push(num(11))
    state.hands.c!.numbers.push(num(10))
    state = hit(state, 'b')
    const [bTen] = state.hands.b!.numbers
    const [cEleven] = state.hands.c!.numbers
    state = move(state, 'b', {
      type: 'swap',
      first: { ownerId: 'b', cardId: bTen!.id },
      second: { ownerId: 'c', cardId: cEleven!.id },
    })
    expect(state.hands.b!.status).toBe('busted')
    expect(state.hands.c!.status).toBe('busted')
  })

  it('lets Discard remove any card, including penalties', () => {
    let state = game('revenge', [num(5), num(6), num(7), action('discard')])
    const penalty = modifier('minus', 10)
    state.hands.b!.modifiers = [penalty]
    state = hit(state, 'b')
    state = move(state, 'b', { type: 'discard', ownerId: 'b', cardId: penalty.id })
    expect(state.hands.b!.modifiers).toEqual([])
  })

  it('throws away an action with no valid target', () => {
    const state = game('revenge', [action('steal'), num(6), num(7)])
    expect(state.log[1]).toMatchObject({ type: 'fizzled', playerId: 'b' })
    expect(state.hands.b!.numbers).toEqual([])
  })
})

describe('players leaving', () => {
  it('moves the turn on if the turn player leaves', () => {
    const state = streakPlayerLeft(game('classic', [num(5), num(6), num(7)]), 'b')!
    expect(turnOf(state)).toBe('c')
    expect(state.hands.b).toBeUndefined()
  })

  it('discards a card someone was choosing a target for when they leave', () => {
    let state = game('classic', [num(5), num(6), num(7), num(8), action('freeze')], ['a', 'b', 'c', 'd'])
    state = hit(state, 'b')
    state = streakPlayerLeft(state, 'b')!
    expect(state.choice).toBeNull()
    expect(turnOf(state)).toBe('c')
  })

  it('ends the game when fewer than two players are left', () => {
    expect(streakPlayerLeft(game('classic', [num(5), num(6)], ['a', 'b']), 'a')).toBeNull()
  })
})
