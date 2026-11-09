# Neon Arena

Browser-based 3D deathmatch with invite-code multiplayer for up to eight players.
The host browser runs match rules, including damage, scores and respawns. The
WebSocket server forwards messages and tracks room membership. Closing the host
tab ends the match.

## Run locally

Run npm install, then run npm start and npm run dev in separate terminals.
Open http://localhost:5173 in two tabs, create an arena in one and join by code
in the other. Click Enter the arena to lock the mouse.

| Input | Action |
| --- | --- |
| WASD | Move |
| Shift | Sprint |
| Space | Jump |
| Mouse | Aim |
| Left click | Fire |
| R | Reload |
| Tab | Scoreboard |
| Esc | Release the mouse |

## Play across networks

1. Deploy this project to a Node.js host that supports persistent WebSockets.
   Run npm start. The server listens on PORT, defaulting to 8080.
   Use one server instance because rooms live in its memory.
2. Use the host's public TLS WebSocket endpoint as VITE_MULTIPLAYER_URL in the
   Vercel project's Production environment, for example wss://arena.example.com.
3. Deploy the updated frontend to Vercel. Vite reads VITE_MULTIPLAYER_URL at build time.
4. Host an arena on Wi-Fi and have a friend join by code from a separate network.
