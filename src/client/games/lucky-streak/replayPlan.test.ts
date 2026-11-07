import { describe, expect, it } from 'vitest'
import {
  applyStreakMove,
  cardName,
  createGame,
  viewStreak,
  type ActionName,
  type Card,
  type NumberCard,
  type StreakState,
  type StreakView,
  type Variant,
} from '../../../games/lucky-streak/engine'
import { planReplay, type Place, type Rect, type Step } from './replayPlan'

let nextId = 5000
const num = (value: number, special?: NumberCard['special']): NumberCard =>
  special ? { id: nextId++, kind: 'number', value, special } : { id: nextId++, kind: 'number', value }
const action = (name: ActionName): Card => ({ id: nextId++, kind: 'action', action: name })

/** Players a, b and c. The deal goes b, c, a, and b has the first turn. */
const game = (variant: Variant, cards: Card[]) => createGame(variant, ['a', 'b', 'c'], 200, [...cards].reverse())

/** Pretends every card on the table is on screen. */
function rectsFor(view: StreakView) {
  const rects = new Map<number, Rect>()
  for (const hand of Object.values(view.hands)) {
    for (const card of [...hand.numbers, ...hand.modifiers, ...(hand.secondChance ? [hand.secondChance] : [])]) {
      rects.set(card.id, { left: card.id, top: 0, width: 50, height: 70 })
    }
  }
  return rects
}

const place = (p: Place) => (p.at === 'seat' ? `seat ${p.playerId}` : p.at)

function describeSteps(steps: Step[]) {
  return steps.map((step) =>
    step.kind === 'move'
      ? step.moves.map((m) => `${cardName(m.card)}: ${place(m.from)} → ${place(m.to)}${m.flip ? ' (flip)' : ''}`).join(' + ')
      : 'playerId' in step
        ? `${step.kind} ${step.playerId}`
        : step.kind,
  )
}

/** Plans the replay for one move, the way the client sees it. */
function replay(state: StreakState, player: string, move: Record<string, unknown>) {
  const prev = viewStreak(state)
  const nextState = applyStreakMove(state, player, move)
  const next = viewStreak(nextState)
  const lastLogId = Math.max(-1, ...prev.log.map((entry) => entry.id))
  return { steps: describeSteps(planReplay(prev, next, rectsFor(prev), lastLogId)), state: nextState }
}

describe('planning the replay', () => {
  it('flips a drawn card from the deck into the hand', () => {
    const { steps } = replay(game('classic', [num(1), num(2), num(3), num(9)]), 'b', { type: 'hit' })
    expect(steps).toEqual(['9: deck → slot (flip)'])
  })

  it('lands the duplicate before the bust', () => {
    const { steps } = replay(game('classic', [num(4), num(2), num(3), num(4)]), 'b', { type: 'hit' })
    expect(steps).toEqual(['4: deck → slot (flip)', 'bust b'])
  })

  it('throws away a saved duplicate and the Second Chance together', () => {
    let state = game('classic', [num(4), num(2), num(3), action('secondChance')])
    state = applyStreakMove(state, 'b', { type: 'hit' })
    state = applyStreakMove(state, 'c', { type: 'stay' })
    state = applyStreakMove(state, 'a', { type: 'stay' })
    state.deck.push(num(4))
    const { steps } = replay(state, 'b', { type: 'hit' })
    expect(steps).toEqual(['4: deck → seat b (flip)', 'Second Chance: rect → discard + 4: seat b → discard', 'log'])
  })

  it('holds an action in play while its player chooses', () => {
    const { steps } = replay(game('classic', [num(1), num(2), num(3), action('freeze')]), 'b', { type: 'hit' })
    expect(steps).toEqual(['Freeze: deck → play (flip)'])
  })

  it('sends a played action to its target, then to the discards', () => {
    let state = game('classic', [num(1), num(2), num(3), action('freeze')])
    state = applyStreakMove(state, 'b', { type: 'hit' })
    const { steps } = replay(state, 'b', { type: 'target', playerId: 'c' })
    expect(steps).toEqual(['Freeze: play → seat c', 'status c', 'Freeze: seat c → discard'])
  })

  it('deals out a Flip Three one card at a time', () => {
    let state = game('classic', [num(1), num(2), num(3), action('flipThree'), num(7), num(8), num(9)])
    state = applyStreakMove(state, 'b', { type: 'hit' })
    const { steps } = replay(state, 'b', { type: 'target', playerId: 'c' })
    expect(steps).toEqual([
      'Flip Three: play → seat c',
      'Flip Three: seat c → discard',
      '7: deck → slot (flip)',
      '8: deck → slot (flip)',
      '9: deck → slot (flip)',
    ])
  })

  it('clears the table before dealing a new round', () => {
    let state = game('classic', [num(1), num(2), num(3), num(5), num(6), num(8)])
    state = applyStreakMove(state, 'b', { type: 'stay' })
    state = applyStreakMove(state, 'c', { type: 'stay' })
    state = applyStreakMove(state, 'a', { type: 'stay' })
    const { steps } = replay(state, 'a', { type: 'nextRound', round: state.round })
    expect(steps[0]!.split(' + ').sort()).toEqual(['1: rect → discard', '2: rect → discard', '3: rect → discard'])
    expect(steps.slice(1)).toEqual(['5: deck → slot (flip)', '6: deck → slot (flip)', '8: deck → slot (flip)'])
  })

  it('wipes the other cards when Unlucky 7 lands', () => {
    let state = game('revenge', [num(1), num(2), num(3), num(9)])
    state = applyStreakMove(state, 'b', { type: 'hit' })
    state = applyStreakMove(state, 'c', { type: 'stay' })
    state = applyStreakMove(state, 'a', { type: 'stay' })
    state.deck.push(num(7, 'unlucky7'))
    const { steps } = replay(state, 'b', { type: 'hit' })
    expect(steps).toEqual(['Unlucky 7: deck → slot (flip)', '1: rect → discard + 9: rect → discard', 'log'])
  })

  it('slides a stolen card from one seat to another', () => {
    let state = game('revenge', [num(1), num(2), num(3), action('steal')])
    state = applyStreakMove(state, 'b', { type: 'hit' })
    const card = state.hands.c!.numbers[0]!
    const { steps } = replay(state, 'b', { type: 'steal', ownerId: 'c', cardId: card.id })
    expect(steps).toEqual(['Steal: play → discard + 2: rect → slot'])
  })
})
