import { useCallback, useEffect, useRef, useState } from 'react'
import Menu from './ui/Menu'
import { Game } from './game/Game'
import { PeerLink } from './net/PeerLink'

interface Session {
  link: PeerLink
  isHost: boolean
}

function GameView({ session, onExit }: { session: Session; onExit: (reason?: string) => void }) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const hudRef = useRef<HTMLDivElement>(null)
  const exitRef = useRef(onExit)
  exitRef.current = onExit

  useEffect(() => {
    const canvasHost = canvasRef.current
    const hudHost = hudRef.current
    if (!canvasHost || !hudHost) return

    const game = new Game(canvasHost, hudHost, session.link, session.isHost, (reason) => {
      exitRef.current(reason)
    })
    return () => game.dispose()
  }, [session])

  return (
    <div className="game-view">
      <div className="canvas-host" ref={canvasRef} />
      <div className="hud-host" ref={hudRef} />
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const initialCode = new URLSearchParams(window.location.search).get('code')?.toUpperCase() ?? ''

  const leave = useCallback((reason?: string) => {
    setSession((current) => {
      current?.link.close()
      return null
    })
    if (reason) setError(reason)
  }, [])

  const remember = (name: string) => {
    localStorage.setItem('neon-arena-name', name.trim())
  }

  const host = async (name: string) => {
    if (busy) return
    remember(name)
    setError('')
    setBusy('Opening arena…')
    try {
      const link = await PeerLink.createHost(name)
      setSession({ link, isHost: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy('')
    }
  }

  const join = async (name: string, code: string) => {
    if (busy) return
    remember(name)
    setError('')
    setBusy('Connecting…')
    try {
      const link = await PeerLink.createClient(code, name)
      setSession({ link, isHost: false })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy('')
    }
  }

  if (session) return <GameView session={session} onExit={leave} />

  return (
    <Menu
      busy={busy}
      error={error}
      initialCode={initialCode}
      onHost={host}
      onJoin={join}
    />
  )
}
