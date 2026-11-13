import { Server, type Connection, type WSMessage } from 'partyserver'
import { defaultOptions, games, getGame } from '../games'
import { MoveError, type PlayerColor } from '../games/types'
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
const MAX_PLAYERS = 15
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
  team: number | null
  /** The name of the color they picked, so it carries over to games with the same color. */
  color: string | null
  /** Whether they've said they're ready for the next game. */
  ready: boolean
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
  private gameOptions = defaultOptions(games[0]!)
  private pickedIds: string[] = []
  private game: ActiveGameRecord | null = null
  private emptyTimer: ReturnType<typeof setTimeout> | null = null
  private tickTimer: ReturnType<typeof setTimeout> | null = null
  /** The game state the tick timer was set for, so unrelated updates don't restart it. */
  private tickFor: unknown = null

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
      case 'rename':
        return this.handleRename(connection, player, message.name)
      case 'selectGame':
        return this.handleSelectGame(connection, player, message.gameId)
      case 'setOption':
        return this.handleSetOption(connection, player, message.key, message.value)
      case 'setTeam':
        return this.handleSetTeam(connection, player, message.team)
      case 'setColor':
        return this.handleSetColor(connection, player, message.color)
      case 'setReady':
        return this.handleSetReady(player, message.ready)
      case 'shuffleTeams':
        return this.handleShuffleTeams(connection, player)
      case 'pickPlayer':
        return this.handlePickPlayer(connection, player, message.playerId, message.picked)
      case 'start':
        return this.handleStart(connection, player)
      case 'move':
        return this.handleMove(connection, player, message.move)
      case 'endGame':
        return this.handleEndGame(connection, player)
      case 'removePlayer':
        return this.handleRemovePlayer(connection, player, message.playerId)
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

    const existing = [...this.players.values()].find((player) => player.token === token)
    if (this.isNameTaken(name, existing)) {
      return this.sendError(connection, 'That name is taken in this room.')
    }

    let player = existing
    if (player) {
      this.takeOverSeat(player, connection)
      player.name = name
    } else {
      if (this.players.size >= MAX_PLAYERS) return this.sendError(connection, 'This room is full.')
      player = {
        id: crypto.randomUUID(),
        name,
        token,
        connectionId: connection.id,
        expiry: null,
        team: null,
        color: null,
        ready: false,
      }
      this.players.set(player.id, player)
      this.playerByConnection.set(connection.id, player.id)
      this.hostId ??= player.id
    }
    this.seatWalkIn(player)
    this.fillColors()
    this.broadcastState()
  }

  /** Puts someone who arrived mid-game into it, for games that allow that. */
  private seatWalkIn(player: Player) {
    const game = this.game
    if (!game || game.playerIds.includes(player.id) || !this.isGameInProgress()) return
    const definition = getGame(game.gameId)!
    if (!definition.onPlayerJoin || game.playerIds.length >= definition.maxPlayers) return
    const color = definition.playerColors
      ? this.assignColors([...game.playerIds, player.id], definition.playerColors)[player.id]!
      : 0
    let next: unknown
    try {
      next = definition.onPlayerJoin(game.state, player.id, color)
    } catch (error) {
      console.error('Walk-in failed', error)
      return
    }
    if (next === null) return
    game.state = next
    game.playerIds = [...game.playerIds, player.id]
    this.broadcast(serialize({ type: 'notice', message: `${player.name} joined the game.` }))
  }

  /**
   * Makes sure each of these players has their own color from the palette, keeping the ones
   * they picked where possible. Returns everyone's color.
   */
  private assignColors(playerIds: string[], palette: PlayerColor[]) {
    const names = palette.map((swatch) => swatch.name)
    const seats = playerIds.map((id) => this.players.get(id)).filter((seat): seat is Player => !!seat)
    const kept = new Set<string>()
    for (const seat of seats) {
      if (seat.color !== null && names.includes(seat.color) && !kept.has(seat.color)) kept.add(seat.color)
      else seat.color = null
    }
    for (const seat of seats) {
      if (seat.color !== null) continue
      // Prefer a color nobody in the room has picked, then any that's free among these players.
      const others = new Set(
        [...this.players.values()].filter((other) => !seats.includes(other)).map((other) => other.color),
      )
      const free = names.filter((name) => !kept.has(name))
      const color = free.find((name) => !others.has(name)) ?? free[0]
      if (color === undefined) continue
      for (const other of this.players.values()) if (!seats.includes(other) && other.color === color) other.color = null
      seat.color = color
      kept.add(color)
    }
    return Object.fromEntries(seats.map((seat) => [seat.id, Math.max(0, names.indexOf(seat.color ?? ''))]))
  }

  /** Gives a color to everyone who doesn't have one, when the game has colors. */
  private fillColors() {
    const palette = this.palette()
    if (palette) this.assignColors([...this.players.keys()], palette)
  }

  private clearReady() {
    for (const player of this.players.values()) player.ready = false
  }

  private handleSetReady(player: Player, ready: unknown) {
    // Ready only means something in the lobby.
    if (this.game) return
    player.ready = ready === true
    this.broadcastState()
  }

  /** Colors for the game being played, or otherwise the one picked in the lobby. */
  private palette() {
    return getGame(this.game?.gameId ?? this.selectedGameId)!.playerColors ?? null
  }

  private handleSetColor(connection: Connection, player: Player, color: unknown) {
    const definition = getGame(this.game?.gameId ?? this.selectedGameId)!
    const palette = definition.playerColors
    if (!palette) return this.sendError(connection, 'This game doesn’t have player colors.')
    if (typeof color !== 'number' || !Number.isInteger(color) || color < 0 || color >= palette.length) {
      return this.sendError(connection, 'That color doesn’t exist.')
    }
    const name = palette[color]!.name
    const holder = [...this.players.values()].find((other) => other !== player && other.color === name)
    if (holder) return this.sendError(connection, `${holder.name} already has ${name.toLowerCase()}.`)
    player.color = name
    const game = this.game
    if (game && definition.recolor && game.playerIds.includes(player.id) && this.isGameInProgress()) {
      game.state = definition.recolor(game.state, player.id, color)
    }
    this.broadcastState()
  }

  private isNameTaken(name: string, self?: Player) {
    return [...this.players.values()].some(
      (player) => player !== self && player.name.toLowerCase() === name.toLowerCase(),
    )
  }

  private handleRename(connection: Connection, player: Player, rawName: unknown) {
    const name = cleanName(rawName)
    if (!name) return this.sendError(connection, 'Enter a name.')
    if (this.isNameTaken(name, player)) {
      return this.sendError(connection, 'That name is taken in this room.')
    }
    player.name = name
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
    const definition = typeof gameId === 'string' ? getGame(gameId) : undefined
    if (!definition) return this.sendError(connection, 'That game does not exist.')
    // A different game means different rules to read, so everyone readies up again.
    if (definition.id !== this.selectedGameId) this.clearReady()
    this.selectedGameId = definition.id
    this.gameOptions = defaultOptions(definition)
    this.game = null
    this.fillColors()
    this.broadcastState()
  }

  private handleSetOption(connection: Connection, player: Player, key: unknown, value: unknown) {
    if (player.id !== this.hostId) return this.sendError(connection, 'Only the host can do that.')
    if (this.isGameInProgress()) return this.sendError(connection, 'Finish this game first.')

    const option = getGame(this.selectedGameId)!.options?.find((candidate) => candidate.key === key)
    if (!option) return this.sendError(connection, 'That setting does not exist.')
    const allowed = option.choices
      ? option.choices.some((choice) => choice.value === value)
      : typeof value === 'number' && Number.isInteger(value) && value >= option.min && value <= option.max
    if (!allowed || typeof value !== 'number') {
      this.sendError(connection, `${option.label} must be from ${option.min} to ${option.max}.`)
      // Puts the host's input back to the value that's actually in effect.
      return this.sendState(connection)
    }
    this.gameOptions = { ...this.gameOptions, [option.key]: value }
    this.broadcastState()
  }

  private teamSettings() {
    const settings = getGame(this.selectedGameId)!.teams
    return settings?.when(this.gameOptions) ? settings : null
  }

  private handleSetTeam(connection: Connection, player: Player, team: unknown) {
    const settings = this.teamSettings()
    if (!settings) return this.sendError(connection, 'This game isn’t played in teams.')
    if (this.isGameInProgress()) return this.sendError(connection, 'Finish this game first.')
    if (typeof team !== 'number' || !Number.isInteger(team) || team < 0 || team >= settings.names.length) {
      return this.sendError(connection, 'That team doesn’t exist.')
    }
    player.team = team
    this.broadcastState()
  }

  private handleShuffleTeams(connection: Connection, player: Player) {
    if (player.id !== this.hostId) return this.sendError(connection, 'Only the host can do that.')
    const settings = this.teamSettings()
    if (!settings) return this.sendError(connection, 'This game isn’t played in teams.')
    if (this.isGameInProgress()) return this.sendError(connection, 'Finish this game first.')
    const seats = [...this.players.values()]
    for (let i = seats.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[seats[i], seats[j]] = [seats[j]!, seats[i]!]
    }
    seats.forEach((seat, index) => (seat.team = index % settings.names.length))
    this.broadcastState()
  }

  private handlePickPlayer(connection: Connection, host: Player, playerId: unknown, picked: unknown) {
    if (host.id !== this.hostId) return this.sendError(connection, 'Only the host can do that.')
    const seats = getGame(this.selectedGameId)!.seats
    if (!seats) return this.sendError(connection, 'Everyone plays in this game.')
    if (this.isGameInProgress()) return this.sendError(connection, 'Finish this game first.')
    if (typeof playerId !== 'string' || !this.players.has(playerId)) {
      return this.sendError(connection, 'That player isn’t in the room.')
    }
    const others = this.pickedIds.filter((id) => id !== playerId)
    if (picked && others.length >= seats) {
      return this.sendError(connection, `Only ${seats} can play. Take someone out first.`)
    }
    this.pickedIds = picked ? [...others, playerId] : others
    this.broadcastState()
  }

  /**
   * Who plays a fixed-seat game: the host's picks who are connected, topped up with
   * whoever joined the room first if the host picked fewer than needed.
   */
  private seatedPlayers(seats: number) {
    const connected = [...this.players.values()].filter((seat) => seat.connectionId).map((seat) => seat.id)
    const chosen = this.pickedIds.filter((id) => connected.includes(id))
    for (const id of connected) {
      if (chosen.length >= seats) break
      if (!chosen.includes(id)) chosen.push(id)
    }
    return chosen
  }

  /** Puts anyone who hasn't picked a team onto the smallest one. */
  private fillTeams(seats: Player[], teamCount: number) {
    const sizes = Array<number>(teamCount).fill(0)
    for (const seat of seats) if (seat.team !== null && seat.team < teamCount) sizes[seat.team]! += 1
    for (const seat of seats) {
      if (seat.team !== null && seat.team < teamCount) continue
      const smallest = sizes.indexOf(Math.min(...sizes))
      seat.team = smallest
      sizes[smallest]! += 1
    }
    return sizes
  }

  private handleStart(connection: Connection, player: Player) {
    if (player.id !== this.hostId) return this.sendError(connection, 'Only the host can do that.')
    if (this.isGameInProgress()) return this.sendError(connection, 'A game is already running.')

    const definition = getGame(this.selectedGameId)!
    const seated = definition.seats ? this.seatedPlayers(definition.seats) : null
    const seats = [...this.players.values()].filter(
      (seat) => seat.connectionId && (!seated || seated.includes(seat.id)),
    )
    const playerIds = seated ?? seats.map((seat) => seat.id)
    if (playerIds.length < definition.minPlayers || playerIds.length > definition.maxPlayers) {
      return this.sendError(connection, `${definition.name} needs ${playersNeeded(definition)}.`)
    }

    const teams: Record<string, number> = {}
    const settings = this.teamSettings()
    if (settings) {
      const sizes = this.fillTeams(seats, settings.names.length)
      if (sizes.some((size) => size < settings.minPerTeam)) {
        this.broadcastState()
        return this.sendError(
          connection,
          `Each team needs at least ${settings.minPerTeam} connected players.`,
        )
      }
      for (const seat of seats) teams[seat.id] = seat.team!
    }

    const colors = definition.playerColors ? this.assignColors(playerIds, definition.playerColors) : undefined
    this.game = {
      gameId: definition.id,
      playerIds,
      state: definition.setup(playerIds, this.gameOptions, { teams, colors }),
    }
    this.clearReady()
    this.broadcastState()
  }

  private handleMove(connection: Connection, player: Player, move: unknown) {
    if (!this.game) return this.sendError(connection, 'No game is running.')
    const definition = getGame(this.game.gameId)!
    try {
      this.game.state = definition.applyMove(this.game.state, player.id, move, {
        isHost: player.id === this.hostId,
      })
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
    this.clearReady()
    this.fillColors()
    this.broadcastState()
  }

  private handleRemovePlayer(connection: Connection, host: Player, playerId: unknown) {
    if (host.id !== this.hostId) return this.sendError(connection, 'Only the host can do that.')
    if (playerId === host.id) return this.sendError(connection, 'Use Leave to leave the room.')
    const target = typeof playerId === 'string' ? this.players.get(playerId) : undefined
    // They may have just left by themselves, in which case there's nothing to do.
    if (!target) return

    const targetConnection = target.connectionId ? this.getConnection(target.connectionId) : undefined
    if (targetConnection) this.reject(targetConnection, 'removed')
    this.removePlayer(target.id, 'was removed')
  }

  private removePlayer(playerId: string, departure = 'left') {
    const player = this.players.get(playerId)
    if (!player) return
    if (player.expiry) clearTimeout(player.expiry)
    if (player.connectionId) this.playerByConnection.delete(player.connectionId)
    this.players.delete(playerId)
    this.pickedIds = this.pickedIds.filter((id) => id !== playerId)

    if (this.game?.playerIds.includes(playerId) && this.isGameInProgress()) {
      const definition = getGame(this.game.gameId)!
      const nextState = definition.onPlayerLeave?.(this.game.state, playerId) ?? null
      if (nextState === null) {
        this.game = null
        this.broadcast(
          serialize({ type: 'notice', message: `${player.name} ${departure}, so the game ended.` }),
        )
      } else {
        this.game.state = nextState
        this.game.playerIds = this.game.playerIds.filter((id) => id !== playerId)
        this.broadcast(serialize({ type: 'notice', message: `${player.name} ${departure}.` }))
      }
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
    const colorNames = this.palette()?.map((swatch) => swatch.name) ?? []
    const colorIndex = (name: string | null) => {
      const index = name === null ? -1 : colorNames.indexOf(name)
      return index === -1 ? null : index
    }
    return {
      code: this.name,
      you: viewerId,
      hostId: this.hostId,
      selectedGameId: this.selectedGameId,
      options: this.gameOptions,
      pickedIds: this.pickedIds,
      players: [...this.players.values()].map(({ id, name, connectionId, team, color, ready }) => ({
        id,
        name,
        connected: connectionId !== null,
        team,
        color: colorIndex(color),
        ready,
      })),
      game:
        game && definition
          ? {
              gameId: game.gameId,
              playerIds: game.playerIds,
              view: definition.viewFor(game.state, viewerId),
              result: definition.result(game.state),
              waitingOn: definition.waitingOn?.(game.state) ?? [],
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
    this.scheduleTick()
  }

  /** Lets games that play out on their own, like a race, move on without a player's move. */
  private scheduleTick() {
    const game = this.game
    if (game && game.state === this.tickFor && this.tickTimer) return
    if (this.tickTimer) clearTimeout(this.tickTimer)
    this.tickTimer = null
    this.tickFor = null
    if (!game) return
    const definition = getGame(game.gameId)!
    if (!definition.tick || !definition.tickDelay) return
    const delay = definition.tickDelay(game.state)
    if (delay === null) return
    this.tickFor = game.state
    this.tickTimer = setTimeout(() => {
      this.tickTimer = null
      if (this.game !== game || game.state !== this.tickFor) return
      try {
        game.state = definition.tick!(game.state)
      } catch (error) {
        console.error('Tick failed', error)
        return
      }
      this.broadcastState()
    }, delay)
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
    this.gameOptions = defaultOptions(games[0]!)
    this.pickedIds = []
    this.emptyTimer = null
    if (this.tickTimer) clearTimeout(this.tickTimer)
    this.tickTimer = null
    this.tickFor = null
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
