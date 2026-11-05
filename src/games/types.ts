/** Thrown by a game when a move is illegal. The message is shown to the player. */
export class MoveError extends Error {}

export interface GameResult {
  /** Empty means a draw. */
  winnerIds: string[]
}

/** A whole-number setting the host can change in the lobby. */
export interface GameOption {
  key: string
  label: string
  min: number
  max: number
  default: number
}

export type GameOptionValues = Record<string, number>

/**
 * A game is pure rules with no networking. To add one, implement this interface,
 * then register it in games/index.ts and its component in client/games/index.ts.
 */
export interface Game<State = unknown, View = unknown> {
  id: string
  name: string
  minPlayers: number
  maxPlayers: number
  options?: GameOption[]
  setup(playerIds: string[], options: GameOptionValues): State
  /** `move` comes straight from the client, so it must be validated. */
  applyMove(state: State, playerId: string, move: unknown): State
  /** What one viewer may see. `viewerId` is null for anyone not yet in the room. */
  viewFor(state: State, viewerId: string | null): View
  result(state: State): GameResult | null
  /**
   * Called when a player leaves for good during a game. Return the state to carry on with,
   * or null to end the game. Without this, any player leaving ends the game.
   */
  onPlayerLeave?(state: State, playerId: string): State | null
}
