export type Vec3 = [number, number, number]

/** The host is authoritative for every value below except x/y/z/yaw/pitch of a
 *  remote player, which that player's own client reports. */
export interface PlayerNet {
  id: string
  name: string
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  hp: number
  kills: number
  deaths: number
  alive: boolean
  moving: boolean
}

export type ClientMsg =
  | { t: 'hello'; name: string }
  | { t: 'state'; x: number; y: number; z: number; yaw: number; pitch: number; moving: boolean }
  | { t: 'fire'; ox: number; oy: number; oz: number; dx: number; dy: number; dz: number }
  | { t: 'ping'; ts: number }

export type HostMsg =
  | { t: 'welcome'; selfId: string; code: string; players: PlayerNet[] }
  | { t: 'snap'; players: PlayerNet[] }
  | { t: 'shot'; ox: number; oy: number; oz: number; ex: number; ey: number; ez: number; hit: boolean }
  | { t: 'hit'; head: boolean; dmg: number }
  | { t: 'killed'; killer: string; victim: string }
  | { t: 'respawn'; pos: Vec3 }
  | { t: 'pong'; ts: number }
  | { t: 'full' }

export type Msg = ClientMsg | HostMsg

export const MAX_PLAYERS = 8

/** No I, O, 0 or 1 so codes survive being read aloud or copied by hand. */
const CODE_ALPHABET = 'ACDEFGHJKLMNPQRTUVWXY23456789'

export function randomCode(length = 5): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  return out
}

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
}

export function sanitizeName(raw: string): string {
  const clean = raw.replace(/\s+/g, ' ').trim().slice(0, 14)
  return clean.length > 0 ? clean : 'Recruit'
}

export function emptyPlayer(id: string, name: string): PlayerNet {
  return {
    id,
    name,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    hp: 100,
    kills: 0,
    deaths: 0,
    alive: true,
    moving: false,
  }
}
