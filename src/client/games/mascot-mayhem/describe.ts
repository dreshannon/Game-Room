import { MASCOTS } from '../../../games/mascot-mayhem/data'
import { NO_PILE, YES_PILE } from '../../../games/mascot-mayhem/logic'
import type { RaceCard, RaceEvent } from '../../../games/mascot-mayhem/race'

const nameOf = (mascot: number | null | undefined) => (mascot === null || mascot === undefined ? 'Everyone' : MASCOTS[mascot]!.name)

export function ordinal(n: number) {
  const teen = n % 100 >= 11 && n % 100 <= 13
  return `${n}${teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}

/** The big symbol on a card, and the words under it. */
export function describeCard(card: RaceCard) {
  const a = card.action
  const who = nameOf(card.mascot)
  switch (a.kind) {
    case 'move':
      if (card.recoverAll) return { symbol: `+${a.spaces}`, text: `${who} gets up and runs ${a.spaces}` }
      return a.spaces > 0
        ? { symbol: `+${a.spaces}`, text: `${who} runs ${a.spaces}` }
        : { symbol: `−${Math.abs(a.spaces)}`, text: `${who} backs up ${Math.abs(a.spaces)}` }
    case 'star':
      return { symbol: '★', text: `${who} dashes to the next star` }
    case 'fall':
      return { symbol: '💫', text: `${who} trips and falls` }
    case 'turn':
      return { symbol: '↺', text: `${who} turns around` }
    case 'swerve':
      return { symbol: a.side === 'left' ? '↰' : '↱', text: `${who} swerves ${a.side}` }
    case 'recover':
      return { symbol: '✚', text: `${who} gets up and faces forward` }
  }
}

/** Race commentary for what a card did. Only the exciting bits. */
export function commentary(event: RaceEvent): string | null {
  const who = nameOf(event.mascot)
  switch (event.kind) {
    case 'collide':
      return `CRASH! ${who} plows into ${nameOf(event.other)}!`
    case 'fall':
      return `${who} goes down!`
    case 'out':
      if (event.reason === 'folded') return `${who} gets rolled up in the fold!`
      if (event.reason === 'offTrack') return `${who} runs right off the track!`
      return `${who} is knocked out cold!`
    case 'finish':
      return `${who} crosses the line ${ordinal(event.place ?? 0)}!`
    case 'fold':
      return 'Out of cards! The track folds up!'
    case 'turn':
      return `${who} is running the wrong way!`
    case 'recover':
      return `${who} is back on their feet.`
    default:
      return null
  }
}

export const pileName = (pile: number) =>
  pile === YES_PILE ? 'Side bet: Yes' : pile === NO_PILE ? 'Side bet: No' : MASCOTS[pile]!.name
