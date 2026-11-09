import { randomUUID } from 'node:crypto'
import { WebSocket, WebSocketServer } from 'ws'

const server = new WebSocketServer({
  port: Number(process.env.PORT || 8080),
  maxPayload: 16 * 1024,
})
const rooms = new Map()

function send(socket, message) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
}

server.on('connection', (socket) => {
  const id = randomUUID()
  let room
  let code
  let isHost = false
  let alive = true
  const timeout = setTimeout(() => socket.close(1008, 'Room request required'), 10000)
  const heartbeat = setInterval(() => {
    if (!alive) return socket.terminate()
    alive = false
    socket.ping()
  }, 30000)
  socket.on('pong', () => { alive = true })
  socket.on('error', () => socket.terminate())

  socket.on('message', (data) => {
    let packet
    try { packet = JSON.parse(data.toString()) } catch { return }
    if (!packet || typeof packet !== 'object') return

    if (!room) {
      if (!['host', 'join'].includes(packet.action) ||
          typeof packet.code !== 'string' || !/^[A-Z0-9]{5}$/.test(packet.code)) {
        socket.close(1008, 'Invalid room request')
        return
      }
      code = packet.code
      isHost = packet.action === 'host'
      const existing = rooms.get(code)
      const error = isHost ? (existing && 'unavailable-id')
        : !existing ? 'No arena found with that code.'
          : existing.guests.size >= 7 ? 'That arena is full.' : null
      if (error) {
        send(socket, { error })
        socket.close()
        return
      }
      clearTimeout(timeout)
      if (isHost) {
        room = { host: socket, guests: new Map() }
        rooms.set(code, room)
      } else {
        room = existing
        room.guests.set(id, socket)
      }
      send(socket, { id })
      return
    }

    if (rooms.get(code) !== room) return
    const { msg, to, except } = packet
    if (!msg || typeof msg !== 'object') return
    if (!isHost) {
      if (!['hello', 'state', 'fire', 'ping'].includes(msg.t)) return
      send(room.host, { from: id, msg })
    } else if (typeof to === 'string') {
      const guest = room.guests.get(to)
      if (guest) send(guest, { from: id, msg })
    } else {
      for (const [guestId, guest] of room.guests) {
        if (guestId !== except) send(guest, { from: id, msg })
      }
    }
  })

  socket.on('close', () => {
    clearTimeout(timeout)
    clearInterval(heartbeat)
    if (!room || rooms.get(code) !== room) return
    if (isHost) {
      rooms.delete(code)
      for (const guest of room.guests.values()) guest.close(1001, 'Host left')
    } else {
      room.guests.delete(id)
      send(room.host, { left: id })
    }
  })
})


