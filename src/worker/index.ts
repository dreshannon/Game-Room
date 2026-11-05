import { getServerByName, routePartykitRequest } from 'partyserver'
import { ROOM_CODE_LENGTH } from '../shared/protocol'
import type { Env } from './env'

export { Room } from './room'

// Leaves out lookalikes such as 0/O and 1/I.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function generateCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH))
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('')
}

async function createRoom(request: Request, env: Env) {
  // The limit is per visitor IP. Cloudflare always sets this header in production.
  const key = request.headers.get('CF-Connecting-IP') ?? 'local'
  const { success } = await env.ROOM_CREATION_LIMITER.limit({ key })
  if (!success) {
    return Response.json(
      { error: 'Too many rooms created. Wait a minute and try again.' },
      { status: 429, headers: { 'Retry-After': '60' } },
    )
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode()
    const room = await getServerByName(env.Room, code)
    if (await room.open()) return Response.json({ code }, { status: 201 })
  }
  return Response.json({ error: 'Could not create a room.' }, { status: 503 })
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url)
    if (pathname === '/api/rooms' && request.method === 'POST') return createRoom(request, env)
    return (
      (await routePartykitRequest(request, env as unknown as Record<string, unknown>)) ??
      new Response('Not found', { status: 404 })
    )
  },
} satisfies ExportedHandler<Env>
