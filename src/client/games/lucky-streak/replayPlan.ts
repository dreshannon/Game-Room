import type { Card, LogEntry, StreakView } from '../../../games/lucky-streak/engine'

/**
 * Works out, from the log, the order cards moved in between two views of the table,
 * so the client can replay them one at a time. Kept free of the DOM so it can be tested.
 */

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export type Place =
  | { at: 'deck' }
  | { at: 'play' }
  | { at: 'discard' }
  | { at: 'slot' }
  | { at: 'seat'; playerId: string }
  | { at: 'rect'; rect: Rect }

export interface Move {
  card: Card
  from: Place
  to: Place
  flip?: boolean
}

export type Step =
  | { kind: 'move'; moves: Move[]; logId?: number; sound?: 'flip' | 'play' | 'land'; hold?: number }
  | { kind: 'bust'; playerId: string; logId: number }
  | { kind: 'flip7'; playerId: string; logId: number }
  | { kind: 'status'; playerId: string; logId?: number; freeze?: boolean }
  | { kind: 'shuffle'; logId: number }
  | { kind: 'log'; logId: number }

function handIds(view: StreakView) {
  const owner = new Map<number, string>()
  const cards = new Map<number, Card>()
  for (const [id, hand] of Object.entries(view.hands)) {
    for (const card of [...hand.numbers, ...hand.modifiers, ...(hand.secondChance ? [hand.secondChance] : [])]) {
      owner.set(card.id, id)
      cards.set(card.id, card)
    }
  }
  return { owner, cards }
}

/** The card ids a log entry moves around, for knowing whether a card has more to do. */
function entryCards(entry: LogEntry): number[] {
  switch (entry.type) {
    case 'draw':
    case 'deal':
    case 'played':
    case 'fizzled':
    case 'stole':
    case 'discarded':
      return [entry.card.id]
    case 'swapped':
      return [entry.first.id, entry.second.id]
    default:
      return []
  }
}

/** Works out the steps that take the table from `prev` to `next`. */
export function planReplay(prev: StreakView, next: StreakView, rects: Map<number, Rect>, lastLogId: number): Step[] {
  const before = handIds(prev)
  const after = handIds(next)
  const finalChoice = next.choice?.card.id
  const where = new Map<number, Place>()
  const owner = new Map<number, string>()
  const cardOf = new Map<number, Card>(before.cards)
  const steps: Step[] = []

  for (const [id, playerId] of before.owner) {
    const rect = rects.get(id)
    if (rect) where.set(id, { at: 'rect', rect })
    owner.set(id, playerId)
  }
  if (prev.choice) {
    where.set(prev.choice.card.id, { at: 'play' })
    cardOf.set(prev.choice.card.id, prev.choice.card)
  }

  const newRound = next.round !== prev.round
  if (newRound) {
    const moves = [...where.keys()].map((id) => ({ card: cardOf.get(id)!, from: where.get(id)!, to: { at: 'discard' } as Place }))
    if (moves.length) steps.push({ kind: 'move', moves, sound: 'land' })
    where.clear()
    owner.clear()
  }

  const entries = next.log.filter((entry) => entry.id > lastLogId)
  const lastUse = new Map<number, number>()
  entries.forEach((entry, i) => entryCards(entry).forEach((id) => lastUse.set(id, i)))
  const usedLater = (id: number, i: number) => (lastUse.get(id) ?? -1) > i

  const send = (card: Card, to: Place, flip = false): Move => {
    cardOf.set(card.id, card)
    const from = where.get(card.id) ?? { at: 'deck' }
    if (to.at === 'discard') {
      where.delete(card.id)
      owner.delete(card.id)
    } else {
      where.set(card.id, to)
      if (to.at === 'seat') owner.set(card.id, to.playerId)
      if (to.at === 'slot') owner.set(card.id, after.owner.get(card.id)!)
    }
    return { card, from, to, flip }
  }

  /** Where a card ends up when it's given to a player. */
  const destination = (card: Card, playerId: string, i: number): Place =>
    after.owner.get(card.id) === playerId && !usedLater(card.id, i) ? { at: 'slot' } : { at: 'seat', playerId }

  /** Cards sitting with a player that the move threw away, such as after a bust. */
  const clearAway = (playerId: string, i: number, logId: number) => {
    const moves: Move[] = []
    for (const [id, holder] of [...owner]) {
      if (holder !== playerId || after.owner.get(id) === playerId || id === finalChoice || usedLater(id, i)) continue
      moves.push(send(cardOf.get(id)!, { at: 'discard' }))
    }
    if (moves.length) steps.push({ kind: 'move', moves, logId, sound: 'land' })
  }

  /** The Steal, Swap or Discard card that was waiting in play goes as soon as it's used. */
  const usedUp = (): Move[] => {
    const id = prev.choice?.card.id
    if (id === undefined || where.get(id)?.at !== 'play' || id === finalChoice) return []
    return [send(cardOf.get(id)!, { at: 'discard' })]
  }

  entries.forEach((entry, i) => {
    switch (entry.type) {
      case 'deal':
      case 'draw': {
        const { card, playerId } = entry
        const to: Place =
          card.kind === 'number'
            ? destination(card, playerId, i)
            : after.owner.get(card.id) === playerId && !usedLater(card.id, i)
              ? { at: 'slot' }
              : { at: 'play' }
        steps.push({ kind: 'move', moves: [send(card, to, true)], logId: entry.id, sound: 'flip' })
        break
      }
      case 'played': {
        const { card, targetId } = entry
        const to = destination(card, targetId, i)
        steps.push({ kind: 'move', moves: [send(card, to)], logId: entry.id, sound: 'play', hold: to.at === 'seat' ? 380 : 0 })
        if (card.kind === 'action' && card.action === 'freeze') {
          steps.push({ kind: 'status', playerId: targetId, freeze: true })
        }
        if (to.at === 'seat' && !usedLater(card.id, i)) {
          steps.push({ kind: 'move', moves: [send(card, { at: 'discard' })], sound: 'land' })
        }
        break
      }
      case 'fizzled':
        steps.push({ kind: 'move', moves: [send(entry.card, { at: 'discard' })], logId: entry.id, sound: 'land' })
        break
      case 'stole':
        steps.push({
          kind: 'move',
          moves: [...usedUp(), send(entry.card, destination(entry.card, entry.playerId, i))],
          logId: entry.id,
          sound: 'play',
        })
        break
      case 'swapped':
        steps.push({
          kind: 'move',
          moves: [
            ...usedUp(),
            send(entry.first, destination(entry.first, entry.secondOwnerId, i)),
            send(entry.second, destination(entry.second, entry.firstOwnerId, i)),
          ],
          logId: entry.id,
          sound: 'play',
        })
        break
      case 'discarded':
        steps.push({ kind: 'move', moves: [...usedUp(), send(entry.card, { at: 'discard' })], logId: entry.id, sound: 'land' })
        break
      case 'unlucky':
      case 'saved':
        clearAway(entry.playerId, i, entry.id)
        steps.push({ kind: 'log', logId: entry.id })
        break
      case 'bust':
        steps.push({ kind: 'bust', playerId: entry.playerId, logId: entry.id })
        clearAway(entry.playerId, i, entry.id)
        break
      case 'flip7':
        steps.push({ kind: 'flip7', playerId: entry.playerId, logId: entry.id })
        break
      case 'stay':
      case 'forcedStay':
        steps.push({ kind: 'status', playerId: entry.playerId, logId: entry.id })
        break
      case 'reshuffled':
        steps.push({ kind: 'shuffle', logId: entry.id })
        break
    }
  })

  // Anything the log didn't cover, such as entries that fell off its end.
  const late: Move[] = []
  for (const [id, playerId] of after.owner) {
    const place = where.get(id)
    if (place?.at === 'slot') continue
    if (place?.at === 'rect' && owner.get(id) === playerId) continue
    late.push(send(after.cards.get(id)!, { at: 'slot' }, !place))
  }
  for (const [id, place] of [...where]) {
    if (after.owner.has(id)) continue
    if (id === finalChoice) {
      if (place.at !== 'play') late.push(send(cardOf.get(id)!, { at: 'play' }))
    } else {
      late.push(send(cardOf.get(id)!, { at: 'discard' }))
    }
  }
  if (next.choice && !where.has(next.choice.card.id) && !cardOf.has(next.choice.card.id)) {
    late.push(send(next.choice.card, { at: 'play' }, true))
  }
  if (late.length) steps.push({ kind: 'move', moves: late, sound: 'land' })

  return steps
}
