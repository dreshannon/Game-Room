/** Thrown by a game when a move is illegal. The message is shown to the player. */
export class MoveError extends Error {}

export interface GameResult {
  /** Empty means a draw. */
  winnerIds: string[]
  /** Replaces the usual "You win!" line, such as for team games. */
  message?: string
}

/** A whole-number setting the host can change in the lobby. */
export interface GameOption {
  key: string
  label: string
  min: number
  max: number
  default: number
  /** Shows a dropdown of named values instead of a number box. */
  choices?: { value: number; label: string }[]
  /** Only shown, and only matters, when another setting has this value. */
  showWhen?: { key: string; value: number }
}

export type GameOptionValues = Record<string, number>

/** Teams picked in the lobby, for games that use them. */
export interface TeamSettings {
  names: string[]
  minPerTeam: number
  /** Whether the current settings call for teams. */
  when(options: GameOptionValues): boolean
}

export interface SetupContext {
  /** Each player's team number, when the game is played in teams. */
  teams: Record<string, number>
}

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
  teams?: TeamSettings
  /**
   * For games with a fixed number of players: the host picks who plays in the lobby,
   * and everyone else in the room watches.
   */
  seats?: number
  setup(playerIds: string[], options: GameOptionValues, context?: SetupContext): State
  /** `move` comes straight from the client, so it must be validated. */
  applyMove(state: State, playerId: string, move: unknown): State
  /** What one viewer may see. `viewerId` is null for anyone not yet in the room. */
  viewFor(state: State, viewerId: string | null): View
  result(state: State): GameResult | null
  /** Players the game is waiting on right now, so they can be alerted that it's their turn. */
  waitingOn?(state: State): string[]
  /**
   * Called when a player leaves for good during a game. Return the state to carry on with,
   * or null to end the game. Without this, any player leaving ends the game.
   */
  onPlayerLeave?(state: State, playerId: string): State | null
}

export const optionIsShown = (option: GameOption, values: GameOptionValues) =>
  !option.showWhen || values[option.showWhen.key] === option.showWhen.value
