import { describe, expect, it } from 'vitest'
import { MoveError } from '../types'
import {
  CELL_COUNT,
  COLUMNS,
  cellLabel,
  colorClues,
  guesserPoints,
  type ColorCluesState,
} from './logic'

const PLAYERS = ['a', 'b', 'c']
const setup = (targetScore = 50, players = PLAYERS) => colorClues.setup(players, { targetScore })
const at = (row: number, column: number) => row * COLUMNS + column

function firstClue(state: ColorCluesState, cell = state.card[0]!) {
  return colorClues.applyMove(state, state.giverId, { type: 'firstClue', cell, word: 'ocean' })
}

function secondClue(state: ColorCluesState) {
  return colorClues.applyMove(state, state.giverId, { type: 'secondClue', words: 'still water' })
}

const place = (state: ColorCluesState, player: string, cell: number) =>
  colorClues.applyMove(state, player, { type: 'place', cell })

/** Puts the target at a known cell, then plays a whole round for three players. */
function playRound(state: ColorCluesState, target: number, guesses: [number, number, number, number]) {
  let next = firstClue({ ...state, card: [target, 1, 2, 3] }, target)
  const [first, second] = next.queue as [string, string]
  next = place(next, first, guesses[0])
  next = place(next, second, guesses[1])
  next = secondClue(next)
  next = place(next, second, guesses[2])
  return place(next, first, guesses[3])
}

describe('board', () => {
  it('labels cells by row letter and column number', () => {
    expect(CELL_COUNT).toBe(480)
    expect(cellLabel(0)).toBe('A1')
    expect(cellLabel(at(15, 29))).toBe('P30')
  })
})

describe('scoring', () => {
  const target = at(8, 15)

  it('gives guessers 3 for exact, 2 inside the box, 1 touching it, and 0 beyond', () => {
    expect(guesserPoints(target, target)).toBe(3)
    expect(guesserPoints(at(7, 14), target)).toBe(2)
    expect(guesserPoints(at(8, 17), target)).toBe(1)
    expect(guesserPoints(at(6, 13), target)).toBe(1)
    expect(guesserPoints(at(8, 18), target)).toBe(0)
  })

  it('does not treat the end of one row as next to the start of the next', () => {
    expect(guesserPoints(at(1, 0), at(0, 29))).toBe(0)
  })

  it('adds both tokens for guessers, and one per boxed token for the clue-giver', () => {
    const state = playRound(setup(), target, [
      target, // b exact: 3, clue-giver +1
      at(7, 15), // c inside: 2, clue-giver +1
      at(8, 17), // c touching: 1
      at(0, 0), // b far away: 0
    ])
    expect(state.phase).toBe('reveal')
    expect(state.scores).toEqual({ a: 2, b: 3, c: 3 })
  })

  it('works when the target is on the edge of the board', () => {
    const state = playRound(setup(), 0, [0, 1, 2, 100])
    expect(state.roundScores).toEqual({ a: 2, b: 3, c: 3 })
  })
})

describe('turn order', () => {
  it('guesses in order first, then in reverse order', () => {
    let state = firstClue(setup())
    expect(state.queue).toEqual(['b', 'c'])
    state = place(place(state, 'b', 0), 'c', 1)
    state = secondClue(state)
    expect(state.queue).toEqual(['c', 'b'])
  })

  it('starts guessing with the player after the clue-giver', () => {
    const state = setup(50, ['a', 'b', 'c', 'd'])
    const next = colorClues.applyMove(
      { ...playRound(setup(), 0, [10, 11, 12, 13]), order: ['a', 'b', 'c', 'd'], nextGiverAfterIndex: 0 },
      'a',
      { type: 'nextRound', round: 1 },
    )
    expect(state.giverId).toBe('a')
    expect(next.giverId).toBe('b')
    expect(firstClue(next).queue).toEqual(['c', 'd', 'a'])
  })

  it('rejects guessing out of turn', () => {
    expect(() => place(firstClue(setup()), 'c', 0)).toThrow(MoveError)
  })

  it('does not let the clue-giver place tokens', () => {
    expect(() => place(firstClue(setup()), 'a', 0)).toThrow(MoveError)
  })
})

describe('tokens', () => {
  it('allows only one token on a space, including your own', () => {
    let state = place(firstClue(setup()), 'b', 5)
    expect(() => place(state, 'c', 5)).toThrow('already has a token')
    state = place(state, 'c', 6)
    state = secondClue(state)
    state = place(state, 'c', 7)
    expect(() => place(state, 'b', 5)).toThrow('already has a token')
  })

  it.each([-1, 480, 1.5, '3', null])('rejects %s as a space', (cell) => {
    expect(() => colorClues.applyMove(firstClue(setup()), 'b', { type: 'place', cell })).toThrow(MoveError)
  })
})

describe('clues', () => {
  it('requires a color from the card', () => {
    const state = setup()
    const offCard = [...Array(CELL_COUNT).keys()].find((cell) => !state.card.includes(cell))
    expect(() => firstClue(state, offCard)).toThrow('from your card')
  })

  it.each(['', '   ', 'two words', 'x'.repeat(25)])('rejects %j as a one-word clue', (word) => {
    const state = setup()
    expect(() =>
      colorClues.applyMove(state, 'a', { type: 'firstClue', cell: state.card[0], word }),
    ).toThrow(MoveError)
  })

  it.each(['', '   ', 'one two three'])('rejects %j as a second clue', (words) => {
    const state = place(place(firstClue(setup()), 'b', 0), 'c', 1)
    expect(() => colorClues.applyMove(state, 'a', { type: 'secondClue', words })).toThrow(MoveError)
  })

  it.each(['red', 'Bright', 'dark', 'blue-green', 'deep sea', 'GREY', 'shade'])(
    'rejects the color word in %j',
    (words) => {
      const state = place(place(firstClue(setup()), 'b', 0), 'c', 1)
      expect(() => colorClues.applyMove(state, 'a', { type: 'secondClue', words })).toThrow('describes a color')
    },
  )

  it('rejects a color word as the first clue', () => {
    const state = setup()
    expect(() =>
      colorClues.applyMove(state, 'a', { type: 'firstClue', cell: state.card[0], word: 'Pink' }),
    ).toThrow('“Pink” describes a color')
  })

  it.each(['blackberry', 'reddish', 'teal', 'redwood', 'shadow', 'lightning', 'ruby', 'pumpkin'])(
    'allows %j',
    (words) => {
      const state = place(place(firstClue(setup()), 'b', 0), 'c', 1)
      expect(colorClues.applyMove(state, 'a', { type: 'secondClue', words }).secondClue).toBe(words)
    },
  )

  it.each(['stormy', 'stormy sky'])('accepts %j as a second clue', (words) => {
    const state = place(place(firstClue(setup()), 'b', 0), 'c', 1)
    const next = colorClues.applyMove(state, 'a', { type: 'secondClue', words })
    expect(next.secondClue).toBe(words)
    expect(next.phase).toBe('secondGuess')
  })

  it('only accepts clues from the clue-giver', () => {
    const state = setup()
    expect(() =>
      colorClues.applyMove(state, 'b', { type: 'firstClue', cell: state.card[0], word: 'sky' }),
    ).toThrow('Only the clue-giver')
  })
})

describe('hidden information', () => {
  it('shows the card and target only to the clue-giver until reveal', () => {
    const state = firstClue(setup())
    expect(colorClues.viewFor(state, 'a').card).toHaveLength(4)
    expect(colorClues.viewFor(state, 'a').target).toBe(state.target)
    for (const viewer of ['b', null]) {
      const view = colorClues.viewFor(state, viewer)
      expect(view.card).toBeNull()
      expect(view.target).toBeNull()
      expect(view).not.toHaveProperty('deck')
    }
  })

  it('shows the target to everyone at reveal', () => {
    const state = playRound(setup(), 50, [0, 1, 2, 3])
    expect(colorClues.viewFor(state, 'b').target).toBe(50)
  })
})

describe('rounds and winning', () => {
  it('deals four different colors and never repeats them', () => {
    const state = setup()
    expect(new Set(state.card).size).toBe(4)
    expect(state.deck).not.toEqual(expect.arrayContaining(state.card))
  })

  it('clears the board, keeps scores, and rotates the clue-giver', () => {
    let state = playRound(setup(), 50, [50, 1, 2, 3])
    const scores = state.scores
    state = colorClues.applyMove(state, 'c', { type: 'nextRound', round: 1 })
    expect(state.giverId).toBe('b')
    expect(state.tokens).toEqual([])
    expect(state.target).toBeNull()
    expect(state.scores).toEqual(scores)
  })

  it('ignores a duplicate next-round click', () => {
    let state = playRound(setup(), 50, [0, 1, 2, 3])
    state = colorClues.applyMove(state, 'b', { type: 'nextRound', round: 1 })
    const again = colorClues.applyMove(state, 'c', { type: 'nextRound', round: 1 })
    expect(again.round).toBe(2)
    expect(again.giverId).toBe('b')
  })

  it('ends when someone meets the target score, and the top scorer wins', () => {
    const state = playRound({ ...setup(5), scores: { a: 0, b: 2, c: 0 } }, 50, [50, 0, 1, 2])
    expect(state.scores.b).toBe(5)
    expect(colorClues.result(state)).toEqual({ winnerIds: ['b'] })
    expect(() => colorClues.applyMove(state, 'a', { type: 'nextRound', round: 1 })).toThrow('over')
  })

  it('shares the win on a tie', () => {
    const state = playRound({ ...setup(3) }, 50, [50, 51, 52, 0])
    expect(state.scores).toEqual({ a: 2, b: 3, c: 3 })
    expect(colorClues.result(state)).toEqual({ winnerIds: ['b', 'c'] })
  })

  it('does not declare a winner mid-round', () => {
    expect(colorClues.result(firstClue({ ...setup(1), scores: { a: 9, b: 0, c: 0 } }))).toBeNull()
  })
})

describe('players leaving', () => {
  const four = () => setup(50, ['a', 'b', 'c', 'd'])

  it('ends the game if fewer than two players remain', () => {
    expect(colorClues.onPlayerLeave!(setup(50, ['a', 'b']), 'b')).toBeNull()
  })

  it('skips a guesser who leaves on their turn and removes their tokens', () => {
    let state = place(firstClue(four()), 'b', 0)
    state = colorClues.onPlayerLeave!(state, 'b')!
    expect(state.tokens).toEqual([])
    expect(state.queue).toEqual(['c', 'd'])
    state = colorClues.onPlayerLeave!(state, 'c')!
    expect(state.queue).toEqual(['d'])
  })

  it('moves on when the last player to guess leaves', () => {
    let state = place(place(firstClue(four()), 'b', 0), 'c', 1)
    state = colorClues.onPlayerLeave!(state, 'd')!
    expect(state.phase).toBe('secondClue')
  })

  it('scores the round when the last second-guess player leaves', () => {
    let state = firstClue(four())
    state = place(place(place(state, 'b', 0), 'c', 1), 'd', 2)
    state = place(place(secondClue(state), 'd', 3), 'c', 4)
    state = colorClues.onPlayerLeave!(state, 'b')!
    expect(state.phase).toBe('reveal')
  })

  it('starts a new round with the next player if the clue-giver leaves', () => {
    const state = colorClues.onPlayerLeave!(firstClue(four()), 'a')!
    expect(state.giverId).toBe('b')
    expect(state.phase).toBe('firstClue')
    expect(state.tokens).toEqual([])
    expect(state.card).toHaveLength(4)
  })

  it('does not skip anyone if the clue-giver leaves during reveal', () => {
    let state = playRound(setup(), 50, [0, 1, 2, 3])
    state = { ...state, order: ['a', 'b', 'c', 'd'], scores: { ...state.scores, d: 0 } }
    state = colorClues.onPlayerLeave!(state, 'a')!
    state = colorClues.applyMove(state, 'c', { type: 'nextRound', round: state.round })
    expect(state.giverId).toBe('b')
  })

  it('keeps the rotation correct when an earlier player leaves', () => {
    let state: ColorCluesState = { ...four(), giverId: 'c', nextGiverAfterIndex: 2 }
    state = colorClues.onPlayerLeave!(state, 'a')!
    expect(state.nextGiverAfterIndex).toBe(1)
    expect(state.order[(state.nextGiverAfterIndex + 1) % state.order.length]).toBe('d')
  })
})

describe('moves from outsiders', () => {
  it('rejects anyone not in the game and unknown moves', () => {
    expect(() => colorClues.applyMove(setup(), 'z', { type: 'nextRound', round: 1 })).toThrow('not playing')
    expect(() => colorClues.applyMove(setup(), 'a', { type: 'nonsense' })).toThrow(MoveError)
    expect(() => colorClues.applyMove(setup(), 'a', null)).toThrow(MoveError)
  })
})

describe('word limits', () => {
  it('does not let underscores join words into one', () => {
    const state = setup()
    const clue = (word: string) =>
      colorClues.applyMove(state, state.giverId, { type: 'firstClue', cell: state.card[0]!, word })
    expect(() => clue('ice_cream')).toThrow('exactly one word')
    expect(() => clue('ice__cream_cone')).toThrow('exactly one word')
    expect(clue('_ocean_').firstClue).toBe('ocean')
  })

  it('counts underscores as spaces in the second clue', () => {
    const state = place(place(firstClue(setup()), 'b', 0), 'c', 1)
    expect(() => colorClues.applyMove(state, 'a', { type: 'secondClue', words: 'sea_side_town' })).toThrow(
      '1 to 2 words',
    )
    expect(colorClues.applyMove(state, 'a', { type: 'secondClue', words: 'sea_side' }).secondClue).toBe('sea side')
  })
})

describe('player colors', () => {
  it('uses the colors players picked', () => {
    const state = colorClues.setup(PLAYERS, { targetScore: 50 }, { teams: {}, colors: { a: 5, b: 2, c: 7 } })
    expect(state.seats).toEqual({ a: 5, b: 2, c: 7 })
  })

  it('changes color mid-game', () => {
    expect(colorClues.recolor!(setup(), 'b', 6).seats.b).toBe(6)
  })
})

describe('players walking in', () => {
  it('seats them just before the clue-giver, so they give a clue last', () => {
    const state = colorClues.onPlayerJoin!(setup(), 'd', 4)!
    expect(state.order).toEqual(['d', 'a', 'b', 'c'])
    expect(state.seats.d).toBe(4)
    expect(state.scores.d).toBe(0)
    expect(firstClue(state).queue).toEqual(['b', 'c', 'd'])
  })

  it('joins the guessing queue at the end mid-guess', () => {
    const state = colorClues.onPlayerJoin!(firstClue(setup()), 'd', 4)!
    expect(state.queue).toEqual(['b', 'c', 'd'])
    const done = place(place(place(state, 'b', 0), 'c', 1), 'd', 2)
    expect(done.phase).toBe('secondClue')
  })

  it('keeps the next clue-giver the same', () => {
    let state = colorClues.onPlayerJoin!(setup(), 'd', 4)!
    state = place(place(place(firstClue(state), 'b', 0), 'c', 1), 'd', 2)
    state = secondClue(state)
    state = place(place(place(state, 'd', 3), 'c', 4), 'b', 5)
    expect(state.phase).toBe('reveal')
    state = colorClues.applyMove(state, 'a', { type: 'nextRound', round: 1 })
    expect(state.giverId).toBe('b')
  })

  it('adds them to the round scores during reveal', () => {
    let state = place(place(firstClue(setup()), 'b', 0), 'c', 1)
    state = place(place(secondClue(state), 'c', 2), 'b', 3)
    state = colorClues.onPlayerJoin!(state, 'd', 4)!
    expect(state.roundScores?.d).toBe(0)
    expect(colorClues.applyMove(state, 'a', { type: 'nextRound', round: 1 }).giverId).toBe('b')
  })
})
