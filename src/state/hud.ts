import { reactive } from 'vue'

export interface FeedEntry {
  id: number
  killer: string
  victim: string
  killerIsMe: boolean
  victimIsMe: boolean
  born: number
}

export interface ScoreRow {
  id: string
  name: string
  kills: number
  deaths: number
  me: boolean
  alive: boolean
}

/**
 * Vue-reactive HUD store. The Three.js game loop writes into it (throttled),
 * the Vue HUD component renders it. Kept outside Vue so the game never needs
 * to know about components.
 */
export const hud = reactive({
  phase: 'live' as 'live' | 'dead' | 'connecting' | 'over',
  locked: false,
  hp: 100,
  ammo: 30,
  magSize: 30,
  reloading: false,
  reloadProgress: 0,
  kills: 0,
  deaths: 0,
  alive: true,
  respawnIn: 0,
  showScore: false,
  code: '',
  isHost: true,
  playerCount: 1,
  ping: 0,
  fps: 0,
  spread: 0,
  hitKey: 0,
  headshotKey: 0,
  damageFlash: 0,
  killedBy: '',
  notice: '',
  feed: [] as FeedEntry[],
  scoreboard: [] as ScoreRow[],
})

/** Wired up by the Game instance; called from Vue UI buttons. */
export const hudActions = {
  requestLock: () => {},
  leave: () => {},
  copyInvite: () => {},
  refreshInvite: () => {},
}

export function resetHud() {
  hud.phase = 'live'
  hud.locked = false
  hud.hp = 100
  hud.ammo = 30
  hud.reloading = false
  hud.reloadProgress = 0
  hud.kills = 0
  hud.deaths = 0
  hud.alive = true
  hud.respawnIn = 0
  hud.showScore = false
  hud.code = ''
  hud.playerCount = 1
  hud.ping = 0
  hud.fps = 0
  hud.spread = 0
  hud.hitKey = 0
  hud.headshotKey = 0
  hud.damageFlash = 0
  hud.killedBy = ''
  hud.notice = ''
  hud.feed = []
  hud.scoreboard = []
}
