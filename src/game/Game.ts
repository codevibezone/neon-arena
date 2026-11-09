import * as THREE from 'three'
import { ARENA_HALF, buildArena, SPAWNS, type Arena, type SpawnPoint } from './arena'
import { colorForId, createAvatar, type AvatarView } from './avatar'
import { WeaponView } from './weapon'
import { Input } from './input'
import { AudioKit } from './audio'
import type { PeerLink } from '../net/PeerLink'
import { hud, hudActions, resetHud } from '../state/hud'
import { mountHud } from '../vue/mountHud'
import type { Msg, PlayerNet } from '../net/protocol'

const PLAYER_RADIUS = 0.36
const EYE = 1.66
const STEP = 0.45
const GRAVITY = 20
const WALK = 5.4
const SPRINT = 8.2
const JUMP = 6.8
const MAG = 30
const RELOAD_MS = 1500
const FIRE_MS = 105
const BODY_DMG = 26
const HEAD_DMG = 100
const RESPAWN_MS = 2600
const STATE_HZ = 20
const SNAP_HZ = 15
const MAX_RANGE = 90
const SENS = 0.0022

interface Effect {
  obj: THREE.Object3D
  life: number
  ttl: number
  mat: THREE.Material
  geo?: THREE.BufferGeometry
  grow: boolean
}

interface RemoteView {
  avatar: AvatarView
  tx: number
  ty: number
  tz: number
  tyaw: number
}

function raySphere(ray: THREE.Ray, center: THREE.Vector3, radius: number): number | null {
  const ocx = ray.origin.x - center.x
  const ocy = ray.origin.y - center.y
  const ocz = ray.origin.z - center.z
  const b = ocx * ray.direction.x + ocy * ray.direction.y + ocz * ray.direction.z
  const c = ocx * ocx + ocy * ocy + ocz * ocz - radius * radius
  const disc = b * b - c
  if (disc < 0) return null
  const t = -b - Math.sqrt(disc)
  return t >= 0 ? t : null
}

/**
 * One Three.js arena. Framework agnostic: the React shell creates it and the
 * Vue HUD renders the reactive store it writes into.
 *
 * Authority: the host owns health, kills and respawns. Each client simulates
 * its own movement and reports its position; the host re-runs hitscan traces
 * against the positions it knows, so damage cannot be faked by the shooter.
 */
export class Game {
  private readonly link: PeerLink
  private readonly isHost: boolean
  private readonly onExit: (reason?: string) => void
  private readonly unmountHud: () => void
  private readonly resizeObserver: ResizeObserver
  private readonly host: HTMLElement

  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly renderer: THREE.WebGLRenderer
  private readonly arena: Arena
  private readonly weapon = new WeaponView()
  private readonly input: Input
  private readonly audio = new AudioKit()
  private lastTime = 0

  private readonly players = new Map<string, PlayerNet>()
  private readonly views = new Map<string, RemoteView>()
  private readonly respawnQueue: { id: string; at: number }[] = []
  private effects: Effect[] = []

  private pos = new THREE.Vector3()
  private vel = new THREE.Vector3()
  private yaw = 0
  private pitch = 0
  private recoilPitch = 0
  private grounded = true
  private hp = 100
  private kills = 0
  private deaths = 0
  private alive = true
  private ammo = MAG
  private nextFire = 0
  private reloadEnd = 0
  private deadUntil = 0
  private moving = false

  private raf = 0
  private disposed = false
  private lastStateAt = 0
  private lastSnapAt = 0
  private lastHudAt = 0
  private lastPingAt = 0
  private pingMs = 0
  private feedId = 1
  private notice = ''
  private noticeUntil = 0
  private fps = 60
  private killedBy = ''

  constructor(
    canvasHost: HTMLElement,
    hudHost: HTMLElement,
    link: PeerLink,
    isHost: boolean,
    onExit: (reason?: string) => void,
  ) {
    this.link = link
    this.isHost = isHost
    this.onExit = onExit
    this.host = canvasHost

    this.scene.background = new THREE.Color(0x05070f)
    this.scene.fog = new THREE.Fog(0x05070f, 32, 82)

    this.camera = new THREE.PerspectiveCamera(78, 1, 0.05, 220)
    this.camera.rotation.order = 'YXZ'
    this.scene.add(this.camera)
    this.camera.add(this.weapon.group)

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.domElement.className = 'game-canvas'
    canvasHost.appendChild(this.renderer.domElement)

    this.arena = buildArena()
    this.scene.add(this.arena.group)
    this.addLights()

    resetHud()
    hud.code = link.code
    hud.isHost = isHost

    const spawn = this.pickSpawn()
    this.pos.set(spawn.pos[0], spawn.pos[1], spawn.pos[2])
    this.yaw = spawn.yaw
    this.camera.position.set(this.pos.x, this.pos.y + EYE, this.pos.z)
    this.camera.rotation.set(0, this.yaw, 0)

    this.input = new Input(
      canvasHost,
      this.renderer.domElement,
      (locked) => {
        hud.locked = locked
      },
      () => this.audio.ensure(),
    )

    this.players.set(link.selfId, {
      id: link.selfId,
      name: link.name,
      x: this.pos.x,
      y: this.pos.y,
      z: this.pos.z,
      yaw: this.yaw,
      pitch: 0,
      hp: 100,
      kills: 0,
      deaths: 0,
      alive: true,
      moving: false,
    })

    if (isHost) {
      link.getPlayers = () => [...this.players.values()]
    } else {
      this.players.clear()
      for (const p of link.players.values()) this.players.set(p.id, { ...p })
      const self = this.players.get(link.selfId)
      if (self) {
        this.pos.set(self.x, self.y, self.z)
        this.yaw = self.yaw
        this.camera.position.set(this.pos.x, this.pos.y + EYE, this.pos.z)
      }
      for (const p of this.players.values()) if (p.id !== link.selfId) this.addView(p)
    }

    link.attach({
      onMessage: this.handleMessage,
      onJoin: this.handleJoin,
      onLeave: this.handleLeave,
    })
    link.onHostLost = () => {
      if (!this.disposed) this.onExit('The host left the arena.')
    }
    link.onError = (message) => {
      if (!this.disposed) this.pushNotice(message, 5000)
    }

    hudActions.requestLock = () => {
      this.audio.ensure()
      this.input.requestLock()
    }
    hudActions.leave = () => this.onExit()
    hudActions.copyInvite = () => {
      const code = this.link.code
      if (navigator.clipboard) {
        navigator.clipboard.writeText(code).then(
          () => this.pushNotice(`Invite code ${code} copied`),
          () => this.pushNotice(`Invite code: ${code}`, 6000),
        )
      } else {
        this.pushNotice(`Invite code: ${code}`, 6000)
      }
    }

    this.unmountHud = mountHud(hudHost)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvasHost)
    this.resize()

    this.lastTime = performance.now()
    this.raf = requestAnimationFrame(this.tick)

    if (!isHost) this.pushNotice('Joined the arena', 2200)
  }

  /* ---------------------------------------------------------------- setup */

  private addLights() {
    this.scene.add(new THREE.HemisphereLight(0x38597d, 0x04060c, 0.85))

    const sun = new THREE.DirectionalLight(0xdfefff, 2.1)
    sun.position.set(16, 28, 12)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.left = -28
    sun.shadow.camera.right = 28
    sun.shadow.camera.top = 28
    sun.shadow.camera.bottom = -28
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 80
    sun.shadow.bias = -0.0006
    this.scene.add(sun)

    const cyan = new THREE.PointLight(0x2ee6ff, 260, 46, 2)
    cyan.position.set(-17, 5, -17)
    this.scene.add(cyan)

    const pink = new THREE.PointLight(0xff3ea5, 260, 46, 2)
    pink.position.set(17, 5, 17)
    this.scene.add(pink)

    const violet = new THREE.PointLight(0x9b7bff, 220, 40, 2)
    violet.position.set(0, 8, 0)
    this.scene.add(violet)
  }

  private resize() {
    const w = Math.max(1, this.host.clientWidth)
    const h = Math.max(1, this.host.clientHeight)
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  /* -------------------------------------------------------------- network */

  private handleMessage = (from: string, msg: Msg) => {
    if (this.isHost) this.hostMessage(from, msg)
    else this.clientMessage(msg)
  }

  private hostMessage(from: string, msg: Msg) {
    const player = this.players.get(from)
    if (!player) return

    switch (msg.t) {
      case 'state': {
        if (!player.alive) return
        player.x = msg.x
        player.y = msg.y
        player.z = msg.z
        player.yaw = msg.yaw
        player.pitch = msg.pitch
        player.moving = msg.moving
        const view = this.views.get(from)
        if (view) {
          view.tx = msg.x
          view.ty = msg.y
          view.tz = msg.z
          view.tyaw = msg.yaw
          view.avatar.setMoving(msg.moving)
        }
        break
      }
      case 'fire': {
        if (!player.alive) return
        this.resolveShot(
          from,
          new THREE.Vector3(msg.ox, msg.oy, msg.oz),
          new THREE.Vector3(msg.dx, msg.dy, msg.dz).normalize(),
        )
        break
      }
      case 'ping':
        this.link.sendTo(from, { t: 'pong', ts: msg.ts })
        break
      default:
        break
    }
  }

  private clientMessage(msg: Msg) {
    switch (msg.t) {
      case 'snap':
        this.applySnapshot(msg.players)
        break
      case 'shot': {
        const start = new THREE.Vector3(msg.ox, msg.oy, msg.oz)
        const end = new THREE.Vector3(msg.ex, msg.ey, msg.ez)
        this.spawnTracer(start, end)
        if (msg.hit) this.spawnSpark(end)
        break
      }
      case 'hit': {
        hud.damageFlash = Math.min(1, hud.damageFlash + 0.55)
        this.audio.hurt()
        break
      }
      case 'killed': {
        const killer = this.players.get(msg.killer)
        const victim = this.players.get(msg.victim)
        const victimIsMe = msg.victim === this.link.selfId
        this.addFeed(
          killer?.name ?? 'Unknown',
          victim?.name ?? 'Unknown',
          msg.killer === this.link.selfId,
          victimIsMe,
        )
        if (victim) {
          victim.alive = false
          victim.hp = 0
        }
        const view = this.views.get(msg.victim)
        if (view) view.avatar.group.visible = false
        if (victimIsMe) this.localDeath(killer?.name ?? 'Unknown')
        else if (msg.killer === this.link.selfId) this.audio.hit(true)
        break
      }
      case 'respawn':
        this.applyRespawn(msg.pos)
        break
      case 'pong':
        this.pingMs = Math.max(0, performance.now() - msg.ts)
        break
      case 'full':
        this.pushNotice('The arena is full.', 5000)
        break
      default:
        break
    }
  }

  private applySnapshot(list: PlayerNet[]) {
    for (const net of list) {
      const local = this.players.get(net.id)
      if (net.id === this.link.selfId) {
        const prevHp = this.hp
        this.hp = net.hp
        this.kills = net.kills
        this.deaths = net.deaths
        this.alive = net.alive
        if (net.hp < prevHp && net.alive) {
          hud.damageFlash = Math.min(1, hud.damageFlash + 0.35)
        }
        if (local) {
          local.name = net.name
          local.x = this.pos.x
          local.y = this.pos.y
          local.z = this.pos.z
          local.yaw = this.yaw
          local.pitch = this.pitch
          local.hp = net.hp
          local.kills = net.kills
          local.deaths = net.deaths
          local.alive = net.alive
        }
        continue
      }

      if (!local) {
        this.players.set(net.id, { ...net })
        this.addView(net)
        continue
      }
      local.name = net.name
      local.x = net.x
      local.y = net.y
      local.z = net.z
      local.yaw = net.yaw
      local.pitch = net.pitch
      local.hp = net.hp
      local.kills = net.kills
      local.deaths = net.deaths
      local.alive = net.alive
      local.moving = net.moving

      const view = this.views.get(net.id)
      if (view) {
        view.tx = net.x
        view.ty = net.y
        view.tz = net.z
        view.tyaw = net.yaw
        view.avatar.group.visible = net.alive
        view.avatar.setMoving(net.moving)
        view.avatar.setHp(net.hp)
      }
    }
  }

  private handleJoin = (player: PlayerNet) => {
    if (player.id === this.link.selfId) return
    const spawn = this.pickSpawn()
    const entry: PlayerNet = {
      ...player,
      x: spawn.pos[0],
      y: spawn.pos[1],
      z: spawn.pos[2],
      yaw: spawn.yaw,
      hp: 100,
      alive: true,
    }
    this.players.set(entry.id, entry)
    this.addView(entry)
    this.pushNotice(`${entry.name} joined the arena`, 2600)
  }

  private handleLeave = (id: string) => {
    const player = this.players.get(id)
    this.players.delete(id)
    const view = this.views.get(id)
    if (view) {
      this.scene.remove(view.avatar.group)
      view.avatar.dispose()
      this.views.delete(id)
    }
    if (player) this.pushNotice(`${player.name} left the arena`, 2600)
  }

  private pushNotice(text: string, ms = 2600) {
    this.notice = text
    this.noticeUntil = performance.now() + ms
  }

  private addFeed(killer: string, victim: string, killerIsMe: boolean, victimIsMe: boolean) {
    hud.feed.push({
      id: this.feedId++,
      killer,
      victim,
      killerIsMe,
      victimIsMe,
      born: performance.now(),
    })
    while (hud.feed.length > 5) hud.feed.shift()
  }

  /* ---------------------------------------------------------------- views */

  private addView(player: PlayerNet) {
    if (player.id === this.link.selfId || this.views.has(player.id)) return
    const avatar = createAvatar(player.name, colorForId(player.id))
    avatar.group.position.set(player.x, player.y, player.z)
    avatar.group.rotation.y = player.yaw
    avatar.group.visible = player.alive
    avatar.setHp(player.hp)
    this.scene.add(avatar.group)
    this.views.set(player.id, {
      avatar,
      tx: player.x,
      ty: player.y,
      tz: player.z,
      tyaw: player.yaw,
    })
  }

  private updateViews(dt: number) {
    for (const view of this.views.values()) {
      const group = view.avatar.group
      group.position.x = THREE.MathUtils.damp(group.position.x, view.tx, 13, dt)
      group.position.y = THREE.MathUtils.damp(group.position.y, view.ty, 13, dt)
      group.position.z = THREE.MathUtils.damp(group.position.z, view.tz, 13, dt)
      let delta = view.tyaw - group.rotation.y
      while (delta > Math.PI) delta -= Math.PI * 2
      while (delta < -Math.PI) delta += Math.PI * 2
      group.rotation.y += delta * Math.min(1, dt * 13)
      view.avatar.update(dt)
    }
  }

  /* ------------------------------------------------------------- shooting */

  private trace(origin: THREE.Vector3, dir: THREE.Vector3, shooterId: string) {
    const ray = new THREE.Ray(origin, dir)
    const tmp = new THREE.Vector3()
    let best = MAX_RANGE

    for (const box of this.arena.solids) {
      const hit = ray.intersectBox(box, tmp)
      if (!hit) continue
      const dist = hit.distanceTo(origin)
      if (dist > 0.05 && dist < best) best = dist
    }

    let victim: string | null = null
    let head = false
    const probe = new THREE.Vector3()
    const spheres: [number, number, boolean][] = [
      [0.42, 0.34, false],
      [1.12, 0.4, false],
      [1.7, 0.25, true],
    ]

    for (const player of this.players.values()) {
      if (player.id === shooterId || !player.alive) continue
      for (const [dy, radius, isHead] of spheres) {
        probe.set(player.x, player.y + dy, player.z)
        const t = raySphere(ray, probe, radius)
        if (t !== null && t < best) {
          best = t
          victim = player.id
          head = isHead
        }
      }
    }

    return { point: origin.clone().addScaledVector(dir, best), victim, head }
  }

  /** Host only: authoritative damage + broadcast of the tracer. */
  private resolveShot(shooterId: string, origin: THREE.Vector3, dir: THREE.Vector3) {
    const result = this.trace(origin, dir, shooterId)
    this.spawnTracer(origin, result.point)
    if (result.victim) {
      this.spawnSpark(result.point)
      if (shooterId === this.link.selfId) {
        hud.hitKey += 1
        if (result.head) hud.headshotKey += 1
      }
    }

    this.link.broadcast(
      {
        t: 'shot',
        ox: origin.x,
        oy: origin.y,
        oz: origin.z,
        ex: result.point.x,
        ey: result.point.y,
        ez: result.point.z,
        hit: Boolean(result.victim),
      },
      shooterId,
    )

    if (!result.victim) return
    const victim = this.players.get(result.victim)
    if (!victim) return

    const dmg = result.head ? HEAD_DMG : BODY_DMG
    victim.hp = Math.max(0, victim.hp - dmg)

    if (victim.id === this.link.selfId) {
      this.hp = victim.hp
      hud.damageFlash = Math.min(1, hud.damageFlash + 0.5)
      this.audio.hurt()
    } else {
      this.link.sendTo(victim.id, { t: 'hit', head: result.head, dmg })
    }

    if (victim.hp <= 0) this.registerKill(shooterId, victim)
  }

  private registerKill(killerId: string, victim: PlayerNet) {
    victim.alive = false
    victim.hp = 0
    victim.deaths += 1

    const killer = this.players.get(killerId)
    if (killer && killer.id !== victim.id) killer.kills += 1

    this.link.broadcast({ t: 'killed', killer: killerId, victim: victim.id })
    this.addFeed(
      killer ? killer.name : 'The arena',
      victim.name,
      killerId === this.link.selfId,
      victim.id === this.link.selfId,
    )

    if (victim.id === this.link.selfId) this.localDeath(killer ? killer.name : 'The arena')
    const view = this.views.get(victim.id)
    if (view) view.avatar.group.visible = false

    this.respawnQueue.push({ id: victim.id, at: performance.now() + RESPAWN_MS })
  }

  private localDeath(killerName: string) {
    this.hp = 0
    this.alive = false
    this.killedBy = killerName
    this.deadUntil = performance.now() + RESPAWN_MS
    this.input.firing = false
    this.audio.death()
    this.pushNotice(`Eliminated by ${killerName}`, 2200)
  }

  private processRespawns(now: number) {
    for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
      const item = this.respawnQueue[i]
      if (item.at > now) continue
      this.respawnQueue.splice(i, 1)
      const player = this.players.get(item.id)
      if (!player) continue
      const spawn = this.pickSpawn()
      player.alive = true
      player.hp = 100
      player.x = spawn.pos[0]
      player.y = spawn.pos[1]
      player.z = spawn.pos[2]
      player.yaw = spawn.yaw
      player.pitch = 0

      if (item.id === this.link.selfId) {
        this.applyRespawn(spawn.pos)
      } else {
        const view = this.views.get(item.id)
        if (view) {
          view.tx = spawn.pos[0]
          view.ty = spawn.pos[1]
          view.tz = spawn.pos[2]
          view.tyaw = spawn.yaw
          view.avatar.group.position.set(spawn.pos[0], spawn.pos[1], spawn.pos[2])
          view.avatar.group.visible = true
          view.avatar.setHp(100)
        }
        this.link.sendTo(item.id, { t: 'respawn', pos: spawn.pos })
      }
    }
  }

  private applyRespawn(pos: [number, number, number]) {
    this.pos.set(pos[0], pos[1], pos[2])
    this.vel.set(0, 0, 0)
    this.hp = 100
    this.alive = true
    this.ammo = MAG
    this.reloadEnd = 0
    this.deadUntil = 0
    this.killedBy = ''
    this.camera.position.set(pos[0], pos[1] + EYE, pos[2])
  }

  private pickSpawn(): SpawnPoint {
    const taken: THREE.Vector3[] = []
    for (const player of this.players.values()) {
      if (player.id === this.link.selfId || !player.alive) continue
      taken.push(new THREE.Vector3(player.x, player.y, player.z))
    }
    if (taken.length === 0) {
      return SPAWNS[Math.floor(Math.random() * SPAWNS.length)]
    }
    let best = SPAWNS[0]
    let bestDist = -1
    for (const spawn of SPAWNS) {
      let nearest = Number.POSITIVE_INFINITY
      for (const other of taken) {
        nearest = Math.min(nearest, Math.hypot(spawn.pos[0] - other.x, spawn.pos[2] - other.z))
      }
      if (nearest > bestDist) {
        bestDist = nearest
        best = spawn
      }
    }
    return best
  }

  /* ---------------------------------------------------------- local update */

  private tick = () => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.tick)
    const now = performance.now()
    const dt = Math.min((now - this.lastTime) / 1000, 0.05)
    this.lastTime = now

    this.updateLocal(dt, now)
    this.updateViews(dt)
    this.updateEffects(dt)
    this.processRespawns(now)
    this.networkTick(now)
    this.hudTick(dt, now)

    this.renderer.render(this.scene, this.camera)
  }

  private updateLocal(dt: number, now: number) {
    const [dx, dy] = this.input.consumeLook()
    const canPlay = this.alive && this.input.locked

    if (canPlay) {
      this.yaw -= dx * SENS
      this.pitch = THREE.MathUtils.clamp(this.pitch - dy * SENS, -1.45, 1.45)
    }

    this.recoilPitch = THREE.MathUtils.damp(this.recoilPitch, 0, 9, dt)
    const pitchTotal = THREE.MathUtils.clamp(this.pitch + this.recoilPitch, -1.5, 1.5)
    this.camera.rotation.set(pitchTotal, this.yaw, 0)

    if (canPlay) {
      const forward = (this.input.isDown('KeyW') ? 1 : 0) - (this.input.isDown('KeyS') ? 1 : 0)
      const strafe = (this.input.isDown('KeyD') ? 1 : 0) - (this.input.isDown('KeyA') ? 1 : 0)
      const sprinting = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight')
      const speed = sprinting ? SPRINT : WALK
      const sin = Math.sin(this.yaw)
      const cos = Math.cos(this.yaw)
      let wx = -sin * forward + cos * strafe
      let wz = -cos * forward - sin * strafe
      const len = Math.hypot(wx, wz)
      if (len > 0) {
        wx = (wx / len) * speed
        wz = (wz / len) * speed
      }
      const accel = this.grounded ? 15 : 4.5
      this.vel.x = THREE.MathUtils.damp(this.vel.x, wx, accel, dt)
      this.vel.z = THREE.MathUtils.damp(this.vel.z, wz, accel, dt)
      if (this.input.takePressed('Space') && this.grounded) {
        this.vel.y = JUMP
        this.grounded = false
      }
    } else {
      this.vel.x = THREE.MathUtils.damp(this.vel.x, 0, 12, dt)
      this.vel.z = THREE.MathUtils.damp(this.vel.z, 0, 12, dt)
      this.input.takePressed('Space')
    }

    if (this.alive) this.collide(dt)
    this.camera.position.set(this.pos.x, this.pos.y + EYE, this.pos.z)

    const horizontal = Math.hypot(this.vel.x, this.vel.z)
    this.moving = horizontal > 0.8
    this.weapon.update(dt, horizontal, this.grounded, dx, dy)

    if (canPlay) {
      if (this.input.takePressed('KeyR')) this.startReload(now)
      if (this.input.firing) this.tryFire(now)
    } else {
      this.input.clearPressed()
    }

    if (this.reloadEnd > 0 && now >= this.reloadEnd) {
      this.reloadEnd = 0
      this.ammo = MAG
    }
  }

  private collide(dt: number) {
    const pos = this.pos
    const vel = this.vel
    const limit = ARENA_HALF - 0.7

    if (vel.x !== 0) {
      const nx = pos.x + vel.x * dt
      if (!this.blocked(nx, pos.z, pos.y)) pos.x = nx
      else vel.x = 0
    }
    if (vel.z !== 0) {
      const nz = pos.z + vel.z * dt
      if (!this.blocked(pos.x, nz, pos.y)) pos.z = nz
      else vel.z = 0
    }

    pos.x = THREE.MathUtils.clamp(pos.x, -limit, limit)
    pos.z = THREE.MathUtils.clamp(pos.z, -limit, limit)

    vel.y -= GRAVITY * dt
    pos.y += vel.y * dt

    const ground = this.groundAt(pos.x, pos.z, pos.y + 0.02)
    if (pos.y <= ground) {
      pos.y = ground
      if (vel.y < 0) vel.y = 0
      this.grounded = true
    } else {
      this.grounded = false
    }
  }

  private blocked(x: number, z: number, feetY: number) {
    const r = PLAYER_RADIUS
    for (const box of this.arena.solids) {
      if (box.max.y <= feetY + STEP) continue
      if (box.min.y >= feetY + 1.7) continue
      if (x + r > box.min.x && x - r < box.max.x && z + r > box.min.z && z - r < box.max.z) return true
    }
    return false
  }

  private groundAt(x: number, z: number, feetY: number) {
    const r = PLAYER_RADIUS
    let ground = 0
    for (const box of this.arena.solids) {
      if (box.max.y > feetY + STEP) continue
      if (x + r > box.min.x && x - r < box.max.x && z + r > box.min.z && z - r < box.max.z) {
        ground = Math.max(ground, box.max.y)
      }
    }
    return ground
  }

  private currentSpread(): number {
    const speed = Math.hypot(this.vel.x, this.vel.z)
    const airborne = this.grounded ? 0 : 0.02
    return 0.006 + speed * 0.0026 + airborne + this.recoilPitch * 0.16
  }

  private startReload(now: number) {
    if (this.reloadEnd > 0 || this.ammo === MAG || !this.alive) return
    this.reloadEnd = now + RELOAD_MS
    this.audio.reload()
  }

  private tryFire(now: number) {
    if (!this.alive || now < this.nextFire || this.reloadEnd > 0) return
    if (this.ammo <= 0) {
      this.audio.dryFire()
      this.startReload(now)
      return
    }

    this.ammo -= 1
    this.nextFire = now + FIRE_MS
    this.recoilPitch = Math.min(this.recoilPitch + 0.017, 0.09)
    this.weapon.kick()
    this.audio.shot()

    const origin = this.camera.position.clone()
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion)
    const spread = this.currentSpread()
    dir.x += (Math.random() - 0.5) * spread
    dir.y += (Math.random() - 0.5) * spread
    dir.z += (Math.random() - 0.5) * spread
    dir.normalize()

    if (this.isHost) {
      this.resolveShot(this.link.selfId, origin, dir)
    } else {
      // Predict the tracer locally for instant feedback; the host decides damage.
      const prediction = this.trace(origin, dir, this.link.selfId)
      this.spawnTracer(origin, prediction.point)
      if (prediction.victim) {
        this.spawnSpark(prediction.point)
        hud.hitKey += 1
        if (prediction.head) hud.headshotKey += 1
      }
      this.link.send({ t: 'fire', ox: origin.x, oy: origin.y, oz: origin.z, dx: dir.x, dy: dir.y, dz: dir.z })
    }
  }

  /* --------------------------------------------------------------- effects */

  private spawnTracer(from: THREE.Vector3, to: THREE.Vector3) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to])
    const mat = new THREE.LineBasicMaterial({ color: 0xa8ecff, transparent: true, opacity: 0.9 })
    const line = new THREE.Line(geo, mat)
    line.frustumCulled = false
    this.scene.add(line)
    this.effects.push({ obj: line, life: 0.1, ttl: 0.1, mat, geo, grow: false })
  }

  private spawnSpark(at: THREE.Vector3) {
    const geo = new THREE.SphereGeometry(0.08, 8, 8)
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd479, transparent: true, opacity: 1 })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.copy(at)
    this.scene.add(mesh)
    this.effects.push({ obj: mesh, life: 0.24, ttl: 0.24, mat, geo, grow: true })
  }

  private updateEffects(dt: number) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i]
      effect.life -= dt
      if (effect.life <= 0) {
        this.disposeEffect(effect)
        this.effects.splice(i, 1)
        continue
      }
      const k = effect.life / effect.ttl
      const mat = effect.mat as THREE.LineBasicMaterial | THREE.MeshBasicMaterial
      mat.opacity = k
      if (effect.grow) {
        const scale = 1 + (1 - k) * 2.5
        effect.obj.scale.setScalar(scale)
      }
    }
  }

  private disposeEffect(effect: Effect) {
    this.scene.remove(effect.obj)
    effect.geo?.dispose()
    effect.mat.dispose()
  }

  /* ------------------------------------------------------------- networking */

  private networkTick(now: number) {
    if (now - this.lastStateAt >= 1000 / STATE_HZ) {
      this.lastStateAt = now
      if (!this.isHost) {
        this.link.send({
          t: 'state',
          x: this.pos.x,
          y: this.pos.y,
          z: this.pos.z,
          yaw: this.yaw,
          pitch: this.pitch,
          moving: this.moving,
        })
        if (now - this.lastPingAt > 2000) {
          this.lastPingAt = now
          this.link.send({ t: 'ping', ts: performance.now() })
        }
      }
    }

    if (!this.isHost) return
    const self = this.players.get(this.link.selfId)
    if (self) {
      self.x = this.pos.x
      self.y = this.pos.y
      self.z = this.pos.z
      self.yaw = this.yaw
      self.pitch = this.pitch
      self.hp = this.hp
      self.kills = this.kills
      self.deaths = this.deaths
      self.alive = this.alive
      self.moving = this.moving
    }

    if (now - this.lastSnapAt >= 1000 / SNAP_HZ) {
      this.lastSnapAt = now
      this.link.broadcast({ t: 'snap', players: [...this.players.values()] })
    }
  }

  /* -------------------------------------------------------------------- HUD */

  private hudTick(dt: number, now: number) {
    hud.damageFlash = Math.max(0, hud.damageFlash - dt * 1.6)
    this.fps = THREE.MathUtils.lerp(this.fps, 1 / Math.max(dt, 0.0001), 0.06)

    if (now - this.lastHudAt < 80) return
    this.lastHudAt = now

    while (hud.feed.length > 0 && now - hud.feed[0].born > 6000) hud.feed.shift()

    const reloading = this.reloadEnd > 0
    hud.hp = Math.max(0, Math.round(this.hp))
    hud.ammo = this.ammo
    hud.magSize = MAG
    hud.reloading = reloading
    hud.reloadProgress = reloading
      ? THREE.MathUtils.clamp(1 - (this.reloadEnd - now) / RELOAD_MS, 0, 1)
      : 0
    hud.kills = this.kills
    hud.deaths = this.deaths
    hud.alive = this.alive
    hud.phase = this.alive ? 'live' : 'dead'
    hud.respawnIn = this.alive ? 0 : Math.max(0, (this.deadUntil - now) / 1000)
    hud.killedBy = this.killedBy
    hud.locked = this.input.locked
    hud.showScore = this.input.isDown('Tab')
    hud.playerCount = this.players.size
    hud.ping = Math.round(this.pingMs)
    hud.fps = Math.round(this.fps)
    hud.spread = this.currentSpread() * 260
    hud.notice = now < this.noticeUntil ? this.notice : ''
    hud.isHost = this.isHost
    hud.code = this.link.code

    hud.scoreboard = [...this.players.values()]
      .map((p) => ({
        id: p.id,
        name: p.name,
        kills: p.kills,
        deaths: p.deaths,
        me: p.id === this.link.selfId,
        alive: p.alive,
      }))
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
  }

  /* --------------------------------------------------------------- teardown */

  dispose() {
    if (this.disposed) return
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.input.dispose()
    this.resizeObserver.disconnect()

    this.link.onHostLost = null
    this.link.onError = null
    this.link.getPlayers = null
    this.link.close()

    hudActions.requestLock = () => {}
    hudActions.leave = () => {}
    hudActions.copyInvite = () => {}

    this.unmountHud()

    for (const view of this.views.values()) {
      this.scene.remove(view.avatar.group)
      view.avatar.dispose()
    }
    this.views.clear()
    for (const effect of this.effects) this.disposeEffect(effect)
    this.effects = []

    this.scene.remove(this.arena.group)
    this.arena.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      mesh.geometry?.dispose()
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
      else mat?.dispose()
    })

    this.weapon.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      mesh.geometry?.dispose()
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
      else mat?.dispose()
    })

    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.audio.dispose()
  }
}
