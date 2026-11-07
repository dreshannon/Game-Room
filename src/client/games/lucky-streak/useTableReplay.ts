import { nextTick, onBeforeUnmount, reactive, ref, shallowRef, watch, type Ref } from 'vue'
import type { Card, Status, StreakView } from '../../../games/lucky-streak/engine'
import { planReplay, type Move, type Place, type Rect, type Step } from './replayPlan'
import { sounds } from './sounds'

/**
 * Replays what just happened at the table, one card at a time.
 *
 * The server sends the table as it is after a move has fully resolved, which can be
 * several cards later (a deal, a Flip Three, a bust). This works out the order things
 * happened from the log, keeps the new cards hidden in their final spots, and flies a
 * copy of each card there in turn. Statuses, the turn and any choice wait until the
 * cards have landed, so nothing is given away early.
 */

export interface Flier extends Rect {
  key: number
  card: Card
}

const toRect = (r: DOMRect): Rect => ({ left: r.left, top: r.top, width: r.width, height: r.height })

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function useTableReplay(view: () => StreakView, root: Ref<HTMLElement | null>) {
  const busy = ref(false)
  /** The turn, choice, phase and scores to show while cards are still flying. */
  const shown = shallowRef<StreakView>(view())
  const hidden = reactive(new Set<number>())
  const statusOverride = reactive(new Map<string, Status>())
  const fliers = reactive<Flier[]>([])
  const shownLogId = ref(Infinity)
  const deckCount = ref(view().deckCount)
  const discardCount = ref(view().discardCount)
  const lastDiscard = shallowRef<Card | null>(null)
  const playCard = shallowRef<Card | null>(view().choice?.card ?? null)
  const shaking = reactive(new Set<string>())
  const clashing = reactive(new Set<number>())
  const frosting = reactive(new Set<string>())
  const celebrating = ref<string | null>(null)
  const shuffling = ref(false)
  /** 0 to 1 while the round's points count up, then stays at 1. */
  const tally = ref(1)

  const flierEls = new Map<number, HTMLElement>()
  /** Cards waiting part way, beside a seat or in the play spot, and which seat. */
  const parked = new Map<number, { flier: Flier; seat: string | null }>()
  const running = new Set<Animation>()
  let token = 0
  let nextKey = 0
  let lastLogId = Math.max(-1, ...view().log.map((entry) => entry.id))
  let tallyFrame = 0

  const setFlierEl = (key: number, el: unknown) => {
    if (el instanceof HTMLElement) flierEls.set(key, el)
    else flierEls.delete(key)
  }

  const query = (selector: string) => root.value?.querySelector<HTMLElement>(selector) ?? null
  const rectOfAnchor = (name: string) => {
    const el = query(`[data-anchor="${name}"]`)
    return el ? toRect(el.getBoundingClientRect()) : null
  }

  function cardSize() {
    const sample = query('.seat [data-card-id]:not(.small)')
    if (sample) {
      const r = sample.getBoundingClientRect()
      return { width: r.width, height: r.height }
    }
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    return { width: 3.1 * rem, height: 4.3 * rem }
  }

  /** A spot just past the end of a player's cards, where a card waits before moving on. */
  function seatRect(playerId: string): Rect | null {
    const row = query(`[data-seat="${CSS.escape(playerId)}"] .cards`)
    if (!row) return null
    const size = cardSize()
    const box = row.getBoundingClientRect()
    const cards = row.querySelectorAll<HTMLElement>('[data-card-id]')
    const last = cards[cards.length - 1]
    const waiting = [...parked.values()].filter((entry) => entry.seat === playerId).length
    const left = last ? last.getBoundingClientRect().right + 6 : box.left
    return {
      left: Math.min(left + waiting * size.width * 0.45, window.innerWidth - size.width - 4),
      top: box.top + (box.height - size.height) / 2,
      ...size,
    }
  }

  function placeRect(place: Place, card: Card): Rect | null {
    switch (place.at) {
      case 'deck':
        return rectOfAnchor('deck')
      case 'play':
        return rectOfAnchor('play')
      case 'discard':
        return rectOfAnchor('discard')
      case 'rect':
        return place.rect
      case 'seat':
        return seatRect(place.playerId)
      case 'slot': {
        const el = query(`[data-card-id="${card.id}"]`)
        return el ? toRect(el.getBoundingClientRect()) : null
      }
    }
  }

  function removeFlier(flier: Flier) {
    const index = fliers.indexOf(flier)
    if (index !== -1) fliers.splice(index, 1)
  }

  async function fly(move: Move, duration: number, mine: number) {
    const { card } = move
    let from: Rect | null
    const waiting = parked.get(card.id)?.flier
    if (waiting && (move.from.at === 'seat' || move.from.at === 'play')) {
      from = { left: waiting.left, top: waiting.top, width: waiting.width, height: waiting.height }
      parked.delete(card.id)
      removeFlier(waiting)
    } else if (move.from.at === 'play' && playCard.value?.id === card.id) {
      from = rectOfAnchor('play')
      playCard.value = null
    } else {
      from = placeRect(move.from, card)
    }
    if (move.from.at === 'deck') deckCount.value = Math.max(0, deckCount.value - 1)

    const to = placeRect(move.to, card)
    if (!from || !to || mine !== token) {
      landed(move, null)
      return
    }

    const flier: Flier = reactive({ key: nextKey++, card, ...to })
    fliers.push(flier)
    await nextTick()
    const el = flierEls.get(flier.key)
    if (!el || mine !== token) {
      landed(move, flier)
      return
    }

    const dx = from.left - to.left
    const dy = from.top - to.top
    const sx = from.width / to.width
    const sy = from.height / to.height
    const lift = Math.min(60, 20 + Math.hypot(dx, dy) * 0.08)
    const motion = el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
        {
          transform: `translate(${dx * 0.45}px, ${dy * 0.45 - lift}px) scale(${(sx + 1) / 2 + 0.08}, ${(sy + 1) / 2 + 0.08})`,
          offset: 0.5,
        },
        { transform: 'none' },
      ],
      { duration, easing: 'cubic-bezier(0.3, 0.7, 0.25, 1)' },
    )
    running.add(motion)
    const turns: Animation[] = []
    if (move.flip) {
      const inner = el.firstElementChild as HTMLElement | null
      if (inner) {
        const turn = inner.animate([{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(0deg)' }], {
          duration: duration * 0.75,
          delay: duration * 0.1,
          easing: 'ease-in-out',
          fill: 'backwards',
        })
        running.add(turn)
        turns.push(turn)
      }
    }
    try {
      await Promise.all([motion.finished, ...turns.map((turn) => turn.finished)])
    } catch {
      // Cancelled because a newer update arrived.
    }
    running.delete(motion)
    turns.forEach((turn) => running.delete(turn))
    landed(move, flier)
  }

  function landed(move: Move, flier: Flier | null) {
    if (move.to.at === 'seat' || move.to.at === 'play') {
      if (flier) parked.set(move.card.id, { flier, seat: move.to.at === 'seat' ? move.to.playerId : null })
      return
    }
    if (flier) removeFlier(flier)
    if (move.to.at === 'slot') hidden.delete(move.card.id)
    if (move.to.at === 'discard') {
      lastDiscard.value = move.card
      discardCount.value += 1
    }
  }

  function settle() {
    token++
    running.forEach((animation) => animation.cancel())
    running.clear()
    fliers.splice(0)
    parked.clear()
    hidden.clear()
    statusOverride.clear()
    shaking.clear()
    clashing.clear()
    frosting.clear()
    celebrating.value = null
    shuffling.value = false
    const current = view()
    shown.value = current
    shownLogId.value = Infinity
    deckCount.value = current.deckCount
    discardCount.value = current.discardCount
    playCard.value = current.choice?.card ?? null
    busy.value = false
  }

  function startTally() {
    cancelAnimationFrame(tallyFrame)
    const start = performance.now()
    const length = 1400
    let lastTick = 0
    tally.value = 0
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / length)
      tally.value = 1 - (1 - t) ** 3
      if (now - lastTick > 110 && t < 1) {
        lastTick = now
        sounds.tally()
      }
      tallyFrame = t < 1 ? requestAnimationFrame(frame) : 0
    }
    tallyFrame = requestAnimationFrame(frame)
  }

  async function run(steps: Step[], mine: number, endsRound: boolean) {
    const fast = steps.length > 10
    const duration = fast ? 300 : 420
    for (const step of steps) {
      if (mine !== token) return
      // A line joins the log once its card lands, or as a bust or Flip 7 starts.
      const showLine = () => {
        if ('logId' in step && step.logId !== undefined) shownLogId.value = Math.max(shownLogId.value, step.logId)
      }
      if (step.kind !== 'move') showLine()
      switch (step.kind) {
        case 'move': {
          if (step.sound) sounds[step.sound]()
          // Several cards moving at once (a swap, or sweeping the table) go together.
          await Promise.all(step.moves.map((move) => fly(move, duration, mine)))
          showLine()
          if (step.hold) await wait(step.hold)
          break
        }
        case 'status':
          statusOverride.delete(step.playerId)
          if (step.freeze) {
            sounds.freeze()
            frosting.add(step.playerId)
            await wait(500)
          } else {
            await wait(fast ? 150 : 250)
          }
          break
        case 'bust': {
          const hand = view().hands[step.playerId]
          const last = hand?.numbers.at(-1)
          const pair = hand?.numbers.filter((card) => card.value === last?.value) ?? []
          if (pair.length > 1) pair.forEach((card) => clashing.add(card.id))
          shaking.add(step.playerId)
          sounds.bust()
          await wait(650)
          statusOverride.delete(step.playerId)
          shaking.delete(step.playerId)
          await wait(350)
          break
        }
        case 'flip7':
          celebrating.value = step.playerId
          sounds.flip7()
          await wait(1900)
          celebrating.value = null
          break
        case 'shuffle':
          shuffling.value = true
          sounds.shuffle()
          deckCount.value += discardCount.value
          discardCount.value = 0
          lastDiscard.value = null
          await wait(1100)
          shuffling.value = false
          break
        case 'log':
          await wait(250)
          break
      }
    }
    if (mine !== token) return
    settle()
    if (endsRound) startTally()
  }

  const quiet = () =>
    document.hidden || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  watch(
    view,
    (next, prev) => {
      const newestLog = Math.max(lastLogId, ...next.log.map((entry) => entry.id))
      const endsRound = next.phase === 'roundOver' && (prev.phase !== 'roundOver' || prev.round !== next.round)
      if (busy.value) settle()
      const rects = new Map<number, Rect>()
      root.value?.querySelectorAll<HTMLElement>('[data-card-id]').forEach((el) => {
        rects.set(Number(el.dataset.cardId), toRect(el.getBoundingClientRect()))
      })
      const steps = quiet() ? [] : planReplay(prev, next, rects, lastLogId)
      lastLogId = newestLog

      if (!steps.length) {
        settle()
        if (endsRound && !quiet()) startTally()
        else if (next.phase !== 'roundOver') tally.value = 1
        return
      }

      const mine = ++token
      cancelAnimationFrame(tallyFrame)
      tally.value = next.phase === 'roundOver' ? 0 : 1
      busy.value = true
      const newRound = next.round !== prev.round
      shown.value = newRound ? { ...next, phase: 'playing', choice: null, turnPlayerId: null } : prev
      deckCount.value = newRound ? next.deckCount + next.log.filter((e) => e.type === 'deal' || e.type === 'draw').length : prev.deckCount
      discardCount.value = prev.discardCount
      playCard.value = prev.choice?.card ?? null
      shownLogId.value = lastLogIdBefore(prev, next)

      for (const step of steps) {
        if (step.kind !== 'move') continue
        for (const move of step.moves) {
          if (move.to.at === 'slot') hidden.add(move.card.id)
        }
      }
      for (const id of next.order) {
        const was = newRound ? 'active' : prev.hands[id]?.status
        const now = next.hands[id]?.status
        if (was && now && was !== now) statusOverride.set(id, was)
      }
      void nextTick(() => run(steps, mine, endsRound))
    },
    { flush: 'pre' },
  )

  onBeforeUnmount(() => {
    token++
    running.forEach((animation) => animation.cancel())
    cancelAnimationFrame(tallyFrame)
  })

  return {
    busy,
    shown,
    hidden,
    statusOverride,
    fliers,
    setFlierEl,
    shownLogId,
    deckCount,
    discardCount,
    lastDiscard,
    playCard,
    shaking,
    clashing,
    frosting,
    celebrating,
    shuffling,
    tally,
  }
}

/** The log as it stood before this update, so new lines appear as their cards land. */
function lastLogIdBefore(prev: StreakView, next: StreakView) {
  if (prev.round !== next.round) return -1
  return Math.max(-1, ...prev.log.map((entry) => entry.id))
}
