# NitroClash local 4v4 prototype

Current userscript version: **3.2.0**

This is an early multiplayer compatibility server, not a finished public deployment. It implements the stock NitroClash WebSocket handshake, puts up to eight browsers into a shared arena, runs a Planck/Box2D physics world at 60 Hz, and emits authoritative state frames at 30 Hz.

During a goal replay, a left click/boost press votes to skip. The replay ends early once every currently connected player has voted. If everyone leaves an arena, that match is discarded; the next player starts a fresh match with a new 3-2-1-GO kickoff.

Stock party links and the **Private game** checkbox now route matches by their six-character party code. Each code owns an isolated arena, the displayed Team 1/Team 2 choice is preserved when the player name identifies one side, and private disconnects reserve that exact slot for 60 seconds. Public matchmaking never enters a private arena.

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

The results screen now advertises a replay. **Download Replay** asks this local server for the match and saves a standard `.ncr` file containing 5v5-layout frames, the eight visible player names, scoring actions, goals, overtime and victory events. No replay data is requested from the official or third-party server.

Every kickoff randomly selects four of the five official 5v5 spawn-pad pairs. Blue and red always receive exact mirrored counterparts, while the overall selection does not have to be vertically symmetrical.

## Run it

1. Disable the other **NitroClash — Custom Server** userscript so the two redirectors do not conflict.
2. In Tampermonkey, create a new script and replace its contents with `nitroclash-local-4v4.user.js`, then save it.
3. Double-click `start-server.cmd`. Leave the terminal window open. Other players on the same development server must each use a separate browser tab/window with the v3 script.
4. Reload `https://nitroclash.io`.
5. Confirm that the orange **LOCAL 4v4** badge appears.
6. Choose the mode that is labelled **4v4** (it was originally the 5v5 button), then click Play.

For a local multiplayer check, open NitroClash independently in a second tab or browser window with the same v3 userscript, choose 4v4 and press Play. The terminal should show both names entering the same arena with different slot numbers. Each tab keeps a distinct player identity, while refreshing a tab retains its reconnect identity.

For a private test, create a party using NitroClash's normal **Create party** button, share its `#XXXXXX` link, arrange Team 1/Team 2, choose 4v4, tick **Private game**, and start normally. Terminal join messages should name the private party code. The visible party lobby still uses NitroClash's official `/team` coordination service; actual matches, physics and reconnect reservations use only this server.

The userscript answers NitroClash's server-list and reservation requests with native in-page blob responses, then redirects the resulting game socket to your own computer. Joining therefore no longer depends on NitroClash's public server-list/matchmaking endpoint and does not require a cross-origin localhost HTTP request. Other unrelated website requests are left alone.

## Current limitations

- Up to eight real browser connections now share each public arena and receive unique player slots. This is still local development: the userscript points to `127.0.0.1` until the Render deployment step.
- Player acceleration, boost, braking, arena walls, player collisions and ball collisions now use Planck with the constants exposed by NitroClash's browser client.
- Public slot allocation and one-minute reconnect identity are implemented. A public slot is released immediately; reconnect restores the original slot if free, otherwise prefers a free slot on the same team, and is refused when the previous match is full.
- Private party routing and one-minute private slot reservation are implemented through the stock party interface. Post-game rematches/team changes and the Render deployment configuration are still future stages.
- The closed client still allocates ten compatibility slots internally. The userscript follows the trainer's display-tree technique: it finds only player sprites whose live physics position is deliberately outside the map and hides those sprites plus their paired markers at render time. The spare server bodies do not exist, while all real-player off-screen arrows stay enabled.
- This version is for local protocol testing only.

## Stop it

Close the server terminal window or press `Ctrl+C` in it. Disable the local userscript to return NitroClash to its normal servers.
