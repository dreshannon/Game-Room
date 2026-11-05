import type { Room } from './room'

export interface Env {
  Room: DurableObjectNamespace<Room>
  ROOM_CREATION_LIMITER: RateLimit
}
