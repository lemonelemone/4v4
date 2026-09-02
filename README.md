# NitroClash hosted 4v4

Current userscript version: **3.5.0**

This is an early multiplayer compatibility server, not a finished public deployment. It implements the stock NitroClash WebSocket handshake, puts up to eight browsers into a shared arena, runs a Planck/Box2D physics world at 60 Hz, and emits authoritative state frames at 30 Hz.

During a goal replay, a left click/boost press votes to skip. The replay ends early once every currently connected player has voted. If everyone leaves an arena, that match is discarded; the next player starts a fresh match with a new 3-2-1-GO kickoff.

Stock party links and the **Private game** checkbox now route matches by their six-character party code. Each code owns an isolated arena, the displayed Team 1/Team 2 choice is preserved when the player name identifies one side, and private disconnects reserve that exact slot for 60 seconds. Public matchmaking never enters a private arena.

In-game text and quick chat are relayed only to players in the same arena, with length and rate limits. At the results screen, **Change Team** leaves the ended match and enters an available non-full match; if none exists, the server creates a fresh arena and starts its kickoff. Selecting **Rematch** keeps that player in the same arena and team. When the 30-second results timer expires, all rematch voters begin a reset match with a normal 3-2-1-GO kickoff; players who did not select Rematch are detached from that finished arena.

The closed browser client has hard-coded layouts for 1v1, 2v2, 3v3 and 5v5. The prototype uses its 5v5 layout while hiding one unused slot on each team. The server therefore has eight visible player positions without requiring the original source code.

Goals trigger the stock explosion, a controllable three-second celebration, a five-second replay, a short replay celebration, and a fresh 3-2-1 kickoff. Goal scorer and assister use recent ball-touch tracking, and goal speed uses the ball velocity at the line.

At the end of regulation, a leading team wins immediately. A tied game resets to one overtime kickoff and the next goal ends the match. The stock results screen receives the final score, player goals, assists, saves, points and MVP selection.

The stock Tab scoreboard is refreshed once per second and after every scoring event. Connected browser players report a small nonzero development ping; empty slots report 0 ms. Account levels/ranks are 0 because this server has no NitroClash account database.

Point values match the game's action protocol:

- Goal: 50
- Assist: 50
- Save: 50
- Shot on target: 30
- First touch: 10
- Long goal bonus: 20
- Overtime goal bonus: 50
- Hat-trick bonus: 50

First touch and goal bonuses are exact state events. Shot and save awards use trajectory and pitch-zone checks reconstructed on the local server; the original server's unpublished distance/cooldown thresholds are not present in the browser code. Centre-ball and clear-ball awards are intentionally disabled.

The results screen now advertises a replay. **Download Replay** asks this server for the match and saves a standard `.ncr` file containing 5v5-layout frames, the eight visible player names, scoring actions, goals, overtime and victory events. No replay data is requested from the official or third-party server.

Every kickoff randomly selects four of the five official 5v5 spawn-pad pairs. Blue and red always receive exact mirrored counterparts, while the overall selection does not have to be vertically symmetrical.

## Join the hosted server

1. Disable the other **NitroClash — Custom Server** userscript so the two redirectors do not conflict.
2. In Tampermonkey, create a new script and replace its contents with `nitroclash-hosted-4v4.user.js`, then save it.
3. Reload `https://nitroclash.io`.
4. Confirm that the orange **HOSTED 4v4 v3.5.0** badge appears.
5. Choose the mode that is labelled **4v4** (it was originally the 5v5 button), then click Play.

For a multiplayer check, open NitroClash independently in a second tab or browser window with the hosted userscript, choose 4v4 and press Play. Each tab keeps a distinct player identity, while refreshing a tab retains its reconnect identity.

For a private test, create a party using NitroClash's normal **Create party** button, share its `#XXXXXX` link, arrange Team 1/Team 2, choose 4v4, tick **Private game**, and start normally. The visible party lobby still uses NitroClash's official `/team` coordination service; actual matches, physics and reconnect reservations use only this server.

The userscript answers NitroClash's server-list and reservation requests with native in-page blob responses, then redirects the resulting game socket to `wss://fourv4-s2fb.onrender.com`. Joining therefore no longer depends on NitroClash's public game matchmaking endpoint. Other unrelated website requests are left alone.

## Current limitations

- Up to eight real browser connections share each public arena and receive unique player slots. Full arenas cause the server to create another isolated match automatically.
- Player acceleration, boost, braking, arena walls, player collisions and ball collisions now use Planck with the constants exposed by NitroClash's browser client.
- Public slot allocation and one-minute reconnect identity are implemented. A public slot is released immediately; reconnect restores the original slot if free, otherwise prefers a free slot on the same team, and is refused when the previous match is full.
- Private party routing and one-minute private slot reservation are implemented through the stock party interface. **Change Team** matchmaking and results-timer rematches are implemented.
- A Reconnect button appears after a dropped connection and on the homepage while the saved one-minute session is valid. It prevents overlapping attempts and reports expired, full and missing-match failures. Reloading retains the reconnect identity; private reconnects retain their party code, team and exact reserved slot.
- The stock **Spectate** button uses NitroClash's native spectator protocol. It selects the most populated active public 4v4 arena, works when all eight player slots are occupied, receives the complete match broadcast, and has no player body, controls, votes or capacity cost. Private arenas are never listed or selected. If no public match is active, the browser reports **No active 4v4 games**.
- The closed client still allocates ten compatibility slots internally. The userscript follows the trainer's display-tree technique: it finds only player sprites whose live physics position is deliberately outside the map and hides those sprites plus their paired markers at render time. The spare server bodies do not exist, while all real-player off-screen arrows stay enabled.
- Render's free service can sleep after an idle period, so the first connection after inactivity can take longer while the server wakes. The userscript tests the hosted game WebSocket directly before supplying matchmaking, avoiding browser-dependent cross-site health requests.

## Return to normal NitroClash

Disable the hosted userscript to return NitroClash to its normal servers.
