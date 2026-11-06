import type { GameOptionValues, GameResult } from '../games/types'

export const ROOM_CODE_LENGTH = 5
export const MAX_NAME_LENGTH = 20

export type ClientMessage =
  | { type: 'join'; name: string; token: string }
  | { type: 'rename'; name: string }
  | { type: 'selectGame'; gameId: string }
  | { type: 'setOption'; key: string; value: number }
  | { type: 'start' }
  | { type: 'move'; move: unknown }
  | { type: 'endGame' }
  | { type: 'removePlayer'; playerId: string }
  | { type: 'leave' }

export interface PublicPlayer {
  id: string
  name: string
  connected: boolean
}

export interface ActiveGame {
  gameId: string
  playerIds: string[]
  view: unknown
  result: GameResult | null
  /** Players whose turn it is. */
  waitingOn: string[]
}

export interface RoomState {
  code: string
  /** This viewer's player id, or null until they join. */
  you: string | null
  hostId: string | null
  players: PublicPlayer[]
  selectedGameId: string
  options: GameOptionValues
  game: ActiveGame | null
}

export type ClosedReason = 'not_found' | 'full' | 'replaced' | 'left' | 'removed'

export type ServerMessage =
  | { type: 'state'; state: RoomState }
  | { type: 'error'; message: string }
  | { type: 'notice'; message: string }
  /** The room is unavailable to this client, so it should stop reconnecting. */
  | { type: 'closed'; reason: ClosedReason }
