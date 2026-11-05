import { Server, type Connection, type WSMessage } from 'partyserver'
import { games, getGame } from '../games'
import { MoveError } from '../games/types'
import {
  MAX_NAME_LENGTH,
  type ClientMessage,
  type ClosedReason,
  type RoomState,
  type ServerMessage,
} from '../shared/protocol'
import type { Env } from './env'

const SEAT_GRACE_MS = 60_000 // How long a disconnected player keeps their seat.
const EMPTY_ROOM_TTL_MS = 65_000 // How long a room with no connections survives.
const MAX_PLAYERS = 8
const MAX_CONNECTIONS = 32
const MAX_MESSAGE_LENGTH = 1024
const MAX_MESSAGES_PER_SECOND = 20

interface Player {
  id: string
  name: string
  /** Secret that lets a returning client reclaim this seat. Never sent to clients. */
  token: string
  connectionId: string | null
  expiry: ReturnType<typeof setTimeout> | null
}

interface ActiveGameRecord {
  gameId: string
  playerIds: string[]
  state: unknown
}

export class Room extends Server<Env> {
  // All state lives in memory, so the object must not hibernate between messages.
  static override options = { hibernate: false }

  private isOpen = false
  private players = new Map<string, Player>()
  private playerByConnection = new Map<string, string>()
  private rates = new Map<string, { windowStart: number; count: number }>()
  private hostId: string | null = null
  private selectedGameId = games[0]!.id
  private game: ActiveGameRecord | null = null
  private emptyTimer: ReturnType<typeof setTimeout> | null = null

  /** Called by the Worker when creating a room. Returns false if the code is in use. */
  open() {
    if (this.isOpen) return false
    this.isOpen = true
    this.armEmptyTimer()
    return true
  }

  override onConnect(connection: Connection) {
    if (!this.isOpen) return this.reject(connection, 'not_found')
    if (this.openConnections().length > MAX_CONNECTIONS) return this.reject(connection, 'full')
    this.clearEmptyTimer()
    this.sendState(connection)
  }

  override onClose(connection: Connection) {
    this.rates.delete(connection.id)
    const playerId = this.playerByConnection.get(connection.id)
    this.playerByConnection.delete(connection.id)

    const player = playerId ? this.players.get(playerId) : undefined
    if (player?.connectionId === connection.id) {
      player.connectionId = null
      player.expiry = setTimeout(() => this.removePlayer(player.id), SEAT_GRACE_MS)
      this.broadcastState()
    }

    const anyoneLeft = this.openConnections().some(({ id }) => id !== connection.id)
    if (this.isOpen && !anyoneLeft) this.armEmptyTimer()
  }

  override onMessage(connection: Connection, raw: WSMessage) {
    if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_LENGTH) return
    if (this.isRateLimited(connection)) return

    let message: ClientMessage
    try {
      message = JSON.parse(raw)
    } catch {
      return
    }
    if (typeof message !== 'object' || message === null) return

    if (message.type === 'join') return this.handleJoin(connection, message.name, message.token)

    const playerId = this.playerByConnection.get(connection.id)
    const player = playerId ? this.players.get(playerId) : undefined
    if (!player) return this.sendError(connection, 'Join the room first.')

    switch (message.type) {
      case 'selectGame':
        return this.handleSelectGame(connection, player, message.gameId)
      case 'start':
        return this.handleStart(connection, player)
      case 'move':
        return this.handleMove(connection, player, message.move)
      case 'endGame':
        return this.handleEndGame(connection, player)
      case 'leave':
        this.send(connection, { type: 'closed', reason: 'left' })
        return this.removePlayer(player.id)
    }
  }

  private handleJoin(connection: Connection, rawName: unknown, token: unknown) {
    const name = cleanName(rawName)
    if (!name) return this.sendError(connection, 'Enter a name.')
    if (typeof token !== 'string' || token.length < 16 || token.length > 64) {
      return this.sendError(connection, 'Could not join. Reload the page and try again.')
    }

    const seats = [...this.players.values()]
    const existing = seats.find((player) => player.token === token)
    const nameTaken = seats.some(
      (player) => player !== existing && player.name.toLowerCase() === name.toLowerCase(),
    )
    if (nameTaken) return this.sendError(connection, 'That name is taken in this room.')

    if (existing) {
      this.takeOverSeat(existing, connection)
      existing.name = name
    } else {
      if (this.players.size >= MAX_PLAYERS) return this.sendError(connection, 'This room is full.')
      const player: Player = {
        id: crypto.randomUUID(),
        name,
        token,
        connectionId: connection.id,
        expiry: null,
      }
      this.players.set(player.id, player)
      this.playerByConnection.set(connection.id, player.id)
      this.hostId ??= player.id
    }
    this.broadcastState()
  }

  private takeOverSeat(player: Player, connection: Connection) {
    if (player.expiry) clearTimeout(player.expiry)
    player.expiry = null

    if (player.connectionId && player.connectionId !== connection.id) {
      const previous = this.getConnection(player.connectionId)
      this.playerByConnection.delete(player.connectionId)
      if (previous) this.reject(previous, 'replaced')
    }
    player.connectionId = connection.id
    this.playerByConnection.set(connection.id, player.id)
  }

  private handleSelectGame(connection: Connection, player: Player, gameId: unknown) {
    if (player.id !== this.hostId) return this.sendError(connection, 'Only the host can do that.')
    if (this.isGameInProgress()) return this.sendError(connection, 'Finish this game first.')
    if (typeof gameId !== 'string' || !getGame(gameId)) {
      return this.sendError(connection, 'That game does not exist.')
    }
    this.selectedGameId = gameId
    this.game = null
    this.broadcastState()
  }

  private handleStart(connection: Connection, player: Player) {
    if (player.id !== this.hostId) return this.sendError(connection, 'Only the host can do that.')
    if (this.isGameInProgress()) return this.sendError(connection, 'A game is already running.')

    const definition = getGame(this.selectedGameId)!
    const playerIds = [...this.players.values()]
      .filter((seat) => seat.connectionId)
      .map((seat) => seat.id)
    if (playerIds.length < definition.minPlayers || playerIds.length > definition.maxPlayers) {
      return this.sendError(connection, `${definition.name} needs ${playersNeeded(definition)}.`)
    }

    this.game = { gameId: definition.id, playerIds, state: definition.setup(playerIds) }
    this.broadcastState()
  }

  private handleMove(connection: Connection, player: Player, move: unknown) {
    if (!this.game) return this.sendError(connection, 'No game is running.')
    const definition = getGame(this.game.gameId)!
    try {
      this.game.state = definition.applyMove(this.game.state, player.id, move)
    } catch (error) {
      if (error instanceof MoveError) return this.sendError(connection, error.message)
      console.error('Move failed', error)
      return this.sendError(connection, 'That move could not be played.')
    }
    this.broadcastState()
  }

  private handleEndGame(connection: Connection, player: Player) {
    if (player.id !== this.hostId) return this.sendError(connection, 'Only the host can do that.')
    this.game = null
    this.broadcastState()
  }

  private removePlayer(playerId: string) {
    const player = this.players.get(playerId)
    if (!player) return
    if (player.expiry) clearTimeout(player.expiry)
    if (player.connectionId) this.playerByConnection.delete(player.connectionId)
    this.players.delete(playerId)

    if (this.game?.playerIds.includes(playerId) && this.isGameInProgress()) {
      this.game = null
      this.broadcast(serialize({ type: 'notice', message: `${player.name} left, so the game ended.` }))
    }
    if (this.hostId === playerId) {
      const seats = [...this.players.values()]
      this.hostId = (seats.find((seat) => seat.connectionId) ?? seats[0])?.id ?? null
    }
    this.broadcastState()
  }

  private isGameInProgress() {
    if (!this.game) return false
    return getGame(this.game.gameId)!.result(this.game.state) === null
  }

  private stateFor(viewerId: string | null): RoomState {
    const game = this.game
    const definition = game && getGame(game.gameId)!
    return {
      code: this.name,
      you: viewerId,
      hostId: this.hostId,
      selectedGameId: this.selectedGameId,
      players: [...this.players.values()].map(({ id, name, connectionId }) => ({
        id,
        name,
        connected: connectionId !== null,
      })),
      game:
        game && definition
          ? {
              gameId: game.gameId,
              playerIds: game.playerIds,
              view: definition.viewFor(game.state, viewerId),
              result: definition.result(game.state),
            }
          : null,
    }
  }

  private sendState(connection: Connection) {
    const viewerId = this.playerByConnection.get(connection.id) ?? null
    this.send(connection, { type: 'state', state: this.stateFor(viewerId) })
  }

  private broadcastState() {
    // Sent per connection because each viewer may see different game state.
    for (const connection of this.openConnections()) this.sendState(connection)
  }

  private openConnections() {
    return [...this.getConnections()].filter(
      (connection) => connection.readyState === WebSocket.OPEN,
    )
  }

  private send(connection: Connection, message: ServerMessage) {
    connection.send(serialize(message))
  }

  private sendError(connection: Connection, message: string) {
    this.send(connection, { type: 'error', message })
  }

  private reject(connection: Connection, reason: ClosedReason) {
    this.send(connection, { type: 'closed', reason })
    connection.close(4000, reason)
  }

  private isRateLimited(connection: Connection) {
    const now = Date.now()
    const rate = this.rates.get(connection.id)
    if (!rate || now - rate.windowStart >= 1000) {
      this.rates.set(connection.id, { windowStart: now, count: 1 })
      return false
    }
    rate.count += 1
    return rate.count > MAX_MESSAGES_PER_SECOND
  }

  private armEmptyTimer() {
    this.clearEmptyTimer()
    this.emptyTimer = setTimeout(() => this.reset(), EMPTY_ROOM_TTL_MS)
  }

  private clearEmptyTimer() {
    if (this.emptyTimer) clearTimeout(this.emptyTimer)
    this.emptyTimer = null
  }

  private reset() {
    for (const player of this.players.values()) {
      if (player.expiry) clearTimeout(player.expiry)
    }
    this.isOpen = false
    this.players.clear()
    this.playerByConnection.clear()
    this.rates.clear()
    this.hostId = null
    this.game = null
    this.selectedGameId = games[0]!.id
    this.emptyTimer = null
  }
}

function serialize(message: ServerMessage) {
  return JSON.stringify(message)
}

function cleanName(name: unknown) {
  if (typeof name !== 'string') return ''
  return name
    .replace(/\p{C}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .trim()
}

function playersNeeded({ minPlayers, maxPlayers }: { minPlayers: number; maxPlayers: number }) {
  return minPlayers === maxPlayers
    ? `exactly ${minPlayers} connected players`
    : `${minPlayers} to ${maxPlayers} connected players`
}
