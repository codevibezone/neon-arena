import {
  emptyPlayer, normalizeCode, randomCode, sanitizeName,
  type ClientMsg, type HostMsg, type Msg, type PlayerNet,
} from './protocol'

export interface LinkHandlers {
  onMessage: (from: string, msg: Msg) => void
  onJoin: (player: PlayerNet) => void
  onLeave: (id: string) => void
}

type Role = 'host' | 'client'
type Packet =
  | { error: string }
  | { id: string }
  | { left: string }
  | { from: string; msg: Msg }

export class PeerLink {
  selfId = ''
  readonly players = new Map<string, PlayerNet>()
  onHostLost: (() => void) | null = null
  onError: ((message: string) => void) | null = null
  getPlayers: (() => PlayerNet[]) | null = null
  private handlers: LinkHandlers | null = null
  private pending: Packet[] = []
  private closed = false

  private constructor(
    readonly role: Role,
    private readonly socket: WebSocket,
    readonly code: string,
    readonly name: string,
  ) {}

  static async createHost(rawName: string): Promise<PeerLink> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await PeerLink.connect('host', randomCode(), sanitizeName(rawName))
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'unavailable-id') throw error
      }
    }
    throw new Error('Could not reserve an invite code. Please try again.')
  }

  static async createClient(rawCode: string, rawName: string): Promise<PeerLink> {
    const code = normalizeCode(rawCode)
    if (code.length !== 5) throw new Error('Enter a five-character invite code.')
    return PeerLink.connect('client', code, sanitizeName(rawName))
  }

  private static async connect(role: Role, code: string, name: string): Promise<PeerLink> {
    const url = import.meta.env.VITE_MULTIPLAYER_URL ||
      (import.meta.env.DEV ? 'ws://localhost:8080' : '')
    if (!url) throw new Error('The multiplayer server URL is missing from this build.')

    const socket = new WebSocket(url)
    const link = new PeerLink(role, socket, code, name)
    return new Promise((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => fail('Timed out connecting to the arena.'), 10000)
      const fail = (message: string) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        link.close()
        reject(new Error(message))
      }
      const ready = () => {
        settled = true
        clearTimeout(timer)
        resolve(link)
      }

      socket.onopen = () => link.write({ action: role === 'host' ? 'host' : 'join', code })
      socket.onerror = () => fail('Could not reach the multiplayer server.')
      socket.onclose = () => {
        if (!settled) return fail('The multiplayer server closed the connection.')
        if (link.closed) return
        link.closed = true
        if (role === 'client') link.onHostLost?.()
        else link.onError?.('Disconnected from the multiplayer server.')
      }
      socket.onmessage = (event) => {
        const packet = JSON.parse(event.data) as Packet
        if ('error' in packet) return fail(packet.error)
        if ('id' in packet) {
          link.selfId = packet.id
          if (role === 'host') {
            link.players.set(packet.id, emptyPlayer(packet.id, name))
            ready()
          } else {
            link.send({ t: 'hello', name })
          }
          return
        }
        if (role === 'client' && !settled) {
          if ('msg' in packet && packet.msg.t === 'welcome') {
            for (const player of packet.msg.players) link.players.set(player.id, player)
            ready()
          }
          return
        }
        if (link.handlers) link.receive(packet)
        else link.pending.push(packet)
      }
    })
  }

  attach(handlers: LinkHandlers) {
    this.handlers = handlers
    for (const packet of this.pending) this.receive(packet)
    this.pending = []
  }

  private receive(packet: Packet) {
    const handlers = this.handlers
    if (!handlers) return
    if ('left' in packet) {
      if (this.players.delete(packet.left)) handlers.onLeave(packet.left)
      return
    }
    if (!('msg' in packet)) return
    const { from, msg } = packet
    if (this.role === 'host') {
      if (msg.t === 'hello') {
        if (this.players.has(from) || typeof msg.name !== 'string') return
        const player = emptyPlayer(from, sanitizeName(msg.name))
        this.players.set(from, player)
        handlers.onJoin(player)
        this.sendTo(from, {
          t: 'welcome', selfId: from, code: this.code,
          players: this.getPlayers?.() ?? [...this.players.values()],
        })
        return
      }
      if (!this.players.has(from)) return
    }
    handlers.onMessage(from, msg)
  }

  private write(packet: object) {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(packet))
  }

  send(msg: ClientMsg | HostMsg) {
    this.write({ msg })
  }

  sendTo(id: string, msg: HostMsg) {
    if (this.role === 'host') this.write({ to: id, msg })
  }

  broadcast(msg: HostMsg, exceptId?: string) {
    if (this.role === 'host') this.write({ msg, except: exceptId })
  }

  close() {
    if (this.closed) return
    this.closed = true
    this.socket.close()
  }
}

