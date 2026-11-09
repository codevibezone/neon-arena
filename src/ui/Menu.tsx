import { useState } from 'react'

interface MenuProps {
  busy: string
  error: string
  initialCode: string
  onHost: (name: string) => void
  onJoin: (name: string, code: string) => void
}

export default function Menu({ busy, error, initialCode, onHost, onJoin }: MenuProps) {
  const [name, setName] = useState(() => localStorage.getItem('neon-arena-name') ?? '')
  const [code, setCode] = useState(initialCode)

  const disabled = busy !== ''

  return (
    <div className="menu">
      <div className="menu-glow" aria-hidden="true" />
      <main className="menu-card">
        <p className="eyebrow">Online multiplayer · 1 weapon · 1 arena</p>
        <h1>
          NEON <span>ARENA</span>
        </h1>
        <p className="lede">
          A tiny 3D deathmatch that you play in your browser. Host a match, share the
          five-character invite code, and fight.
        </p>

        <label className="field">
          <span>Your callsign</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={14}
            placeholder="Recruit"
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <div className="panels">
          <section className="panel host">
            <h2>Host a match</h2>
            <p>You become the arena authority: damage, scores and respawns run on your machine.</p>
            <button className="btn primary" disabled={disabled} onClick={() => onHost(name)}>
              {busy && busy.startsWith('Opening') ? busy : 'Create arena'}
            </button>
          </section>

          <section className="panel join">
            <h2>Join with code</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                onJoin(name, code)
              }}
            >
              <input
                className="code-input"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABC12"
                maxLength={5}
                autoComplete="off"
                spellCheck={false}
                aria-label="Invite code"
              />
              <button className="btn" type="submit" disabled={disabled || code.trim().length !== 5}>
                {busy && busy.startsWith('Connecting') ? busy : 'Join arena'}
              </button>
            </form>
            <p className="fine">Codes are not case sensitive.</p>
          </section>
        </div>

        {error ? <div className="error">{error}</div> : null}
        {busy ? <div className="busy">{busy}</div> : null}

        <footer>
          <span>React shell</span>
          <span className="dot">·</span>
          <span>Vue HUD</span>
          <span className="dot">·</span>
          <span>Three.js</span>
          <span className="dot">·</span>
          <span>WebSocket</span>
        </footer>
      </main>

      <aside className="menu-note">
        <h3>Controls</h3>
        <ul>
          <li><kbd>WASD</kbd> move</li>
          <li><kbd>Shift</kbd> sprint</li>
          <li><kbd>Space</kbd> jump</li>
          <li><kbd>Mouse</kbd> look</li>
          <li><kbd>Click</kbd> fire</li>
          <li><kbd>R</kbd> reload</li>
          <li><kbd>Tab</kbd> scoreboard</li>
          <li><kbd>Esc</kbd> release mouse</li>
        </ul>
        <p>Headshots drop a player instantly. Body shots take four.</p>
      </aside>
    </div>
  )
}
