import PartySocket from 'partysocket'
import { onBeforeUnmount, ref, shallowRef } from 'vue'
import type { ClientMessage, ClosedReason, RoomState, ServerMessage } from '../shared/protocol'

function readSession(key: string) {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function writeSession(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    // Without storage, the player just can't reclaim their seat after a reload.
  }
}

export function useRoom(code: string) {
  const state = shallowRef<RoomState | null>(null)
  const connected = ref(false)
  const closedReason = ref<ClosedReason | null>(null)
  const toast = ref<string | null>(null)

  const tokenKey = `room:${code}:token`
  const nameKey = `room:${code}:name`
  let token = readSession(tokenKey)
  let toastTimer: ReturnType<typeof setTimeout> | undefined

  const socket = new PartySocket({ host: location.host, party: 'room', room: code })

  const send = (message: ClientMessage) => socket.send(JSON.stringify(message))

  function showToast(message: string) {
    toast.value = message
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => (toast.value = null), 4000)
  }

  socket.addEventListener('open', () => {
    connected.value = true
    const savedName = readSession(nameKey)
    if (token && savedName) send({ type: 'join', name: savedName, token })
  })

  socket.addEventListener('close', () => {
    connected.value = false
  })

  socket.addEventListener('message', (event: MessageEvent<string>) => {
    const message = JSON.parse(event.data) as ServerMessage
    switch (message.type) {
      case 'state': {
        state.value = message.state
        // Remembers the name the server accepted, so reconnecting uses the latest one.
        const me = message.state.players.find((player) => player.id === message.state.you)
        if (me) writeSession(nameKey, me.name)
        break
      }
      case 'error':
      case 'notice':
        showToast(message.message)
        break
      case 'closed':
        closedReason.value = message.reason
        socket.close()
        break
    }
  })

  function join(name: string) {
    if (!token) {
      token = crypto.randomUUID()
      writeSession(tokenKey, token)
    }
    toast.value = null
    send({ type: 'join', name, token })
  }

  const rename = (name: string) => send({ type: 'rename', name })

  onBeforeUnmount(() => {
    clearTimeout(toastTimer)
    socket.close()
  })

  return { state, connected, closedReason, toast, join, rename, send }
}
