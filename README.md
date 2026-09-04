# NitroClash hosted 4v4

Current release version: **3.17.1**

Version 3.17.1 closes and disables the chat input on sending/cancelling; only T reopens it. Join-status requests are independent of spectator chat, sent on connection/control assignment and retried every three seconds. Requires the existing server v3.16.0 or newer for Join this match (v3.17.0 for browser RTT); no new server changes in 3.17.1.

Version 3.17.0 measures Tab ping with browser-echoed application packets, avoiding proxy heartbeat latency. Update both server.mjs (restart) and the userscript. Homepage counts refresh every ten seconds and the visible selected label is reconciled with fresh population data. A count includes connected players across matches on that server, excluding spectators. Localhost can legitimately measure 1 ms.

Version 3.16.0 allows duplicate party display names without the previous unique-name join error. Team routing uses the initial official roster and retains the local team when repeated names make later matching ambiguous; unresolved routes use server balancing. Guests cannot send mode/server overrides and follow authoritative host settings. The official party protocol has no supported kick action/member identifiers: a kick button is not included and requires a separate party service.

Hosted servers now remove idle players (30-second server fallback) and dead connections (15 seconds without a matching pong), clearing the live slot immediately. Private disconnects no longer reserve a place: reconnect succeeds only while that place remains free. Native kick/connection-loss screens close their hosted socket automatically. Typing counts as activity.

Ordinary and in-game spectators get a top-right Join this match button when their current public hosted 4v4 arena has room. It reloads directly into that same arena as a player, with server-side full/private/ended checks; spectators cannot use it for private games or original modes. Full/old servers show no offer. Sending spectator chat clears/blurs the input immediately; press T to write again, while failed text is restored without stealing focus. Update server.mjs and restart both backends, then update the userscript. No deployment performed.

Version 3.15.2 adds a homepage Show in-game spectators checkbox, enabled by default and saved in this browser. Turning it off hides the two spectator characters and their on-pitch name labels on your screen only. Other viewers, players, spectator movement and the separate spectator chat setting are unaffected. Turning it back on restores the characters and labels. Userscript-only update; server unchanged.

Version 3.15.1 changes spectator characters and spectator chat names to purple. This is a userscript-only colour update; server.mjs is unchanged from v3.15.0. All earlier fixes remain.

Version 3.15.0 darkens spectator chat names, reduces In-game spectate button padding/font, and gives Reconnect a single blue fill without the native grey shadow. Two occupied spectator slots are green and arrowless for all updated userscript viewers, verified with two spectators and a player. Stock/older clients need the updated userscript for these visuals. Ghost positions are clamped to x=5..95 and y=-6..62, retaining a small margin around the pitch. Goals with no recent active scoring-team touch are now uncredited (255), instead of assigning a potentially empty player slot that makes the native replay camera follow an off-map parked player. Such goals still count for the correct team, with no invented player goal award. Active-player scoring credit remains. Server.mjs must be replaced and restarted for bounds and replay fix, and viewers must update the userscript. No deployment performed.

Version 3.14.3 removes the automatic full-pitch toggle on in-game spectator entry, retaining the native saved camera mode and fixed zoom from the first view. Normal spectator follow behavior is unchanged. Hosted game chat now takes keyboard and game-pointer priority for players and spectators: Tab stays in chat, camera/movement/scoreboard shortcuts and wheel zoom are blocked while typing, Enter sends, and Escape cancels. Editing keys remain usable. Server code is unchanged from v3.14.2; install the updated userscript and refresh, with no additional host update needed. If an older script already saved fullscreen as your preference, choose your preferred camera once with C/X and zoom; subsequent in-game spectator joins retain it.

Version 3.14.2 starts the rematch early once every remaining player has selected Ready/Rematch. Change Team and Leave/disconnect remove that player from the decision count; spectators never delay it. The normal kickoff countdown is preserved. If a player remains undecided, the existing endgame timeout still applies. If nobody stays, the arena is retired instead of starting an empty match. This change requires replacing server.mjs and restarting each host; the userscript has only a version bump.

Version 3.14.1 sends spectator chat on Enter keydown, suppresses the matching release to prevent reopening, and adds Escape to discard/cancel and empty Enter to close. Native T chat is retained. Occupied in-game spectator slots use green circular characters with hidden off-screen arrows; regular players retain their appearance and arrows. These visuals require the updated userscript on each viewer. Server code is unchanged from v3.14.0; no additional host update is needed if v3.14.0 is already installed.

Version 3.14.0 adds mouse steering to in-game spectators; WASD/arrows remain supported. Movement is collision-free and stops when chat is focused or the window loses focus. Servers without mouse movement support show an update message instead of admitting a stationary observer. The In-game spectate button now sizes itself around one line of text. Hosted server counts are measured every 15 seconds on the homepage and show active connected players across matches, excluding spectators and probes. Unavailable/older servers show (?) instead of a false zero. Update server.mjs and restart both hosted backends, and install the updated userscript. No deployment performed.

Version 3.13.0 replaces the separate spectator chat box with the normal game chat. Spectators press T, type, and press Enter. Spectator messages and player replies share the main chat history; spectator names are green and labelled [Spectator]. Both players and spectators need the updated userscript to see spectator messages. Ordinary Spectate and In-game spectate are supported on hosted 4v4. Server code is unchanged from v3.12.1: no further host update is needed if that server is installed.

Version 3.12.1 makes in-game spectators movable with WASD or arrow keys (Shift for faster movement). They spawn outside the pitch and can move through the background and pitch without colliding with players, walls or the ball. The competitive physics remain unchanged. Chat input is shielded from game keyboard handlers, includes a Send button, and keeps unsent text until delivery is confirmed or explains a failure. In-game spectate matches the native Spectate button, and 4 vs 4 has matching spacing and capitalization. This release needs the updated server for observer movement and chat acknowledgements, plus the updated userscript. Nothing has been deployed.

Version 3.11.0 adds **In-game spectate** alongside ordinary Spectate on the hosted 4v4 homepage. It joins an existing public match using one of two spare positions outside the pitch, with a full-pitch camera by default. The eight competitive slots are unchanged. Observers have no server physics bodies and cannot touch the ball, vote to skip replays or vote for rematches. They can use spectator chat, remain through a rematch if players stay, and release their observer place immediately on disconnect. If the busiest match has no observer place, another active public match is tried. No private match is selected and no new match is created just for an observer. The button is unavailable in parties and other modes. Ordinary Spectate remains separate and does not use these two places. A capability check blocks entry on older backends before any join is sent.

Hosted dropdown pings now use the median of three real WebSocket round trips, refreshed every 15 seconds while on the homepage. The native dropdown's attribute and jQuery cache are both updated; measuring/unavailable is shown instead of an invented number. These are estimates and can differ from in-match latency as network conditions change. Tab pings are measured by server WebSocket ping/pong, smoothed and refreshed during matches, rather than the previous fixed 1. Empty, not-yet-measured or stale entries show 0.

Version 3.10.0 fixes accumulating spectator nametags when switching arenas and the spectator's name replacing the followed player's name. Switching when only one public arena exists is now a no-op. Spectate intent is bound to the game reservation so a latency probe cannot consume it.

**Spectator chat (4v4)** is an on/off checkbox on the homepage, enabled by default and saved in this browser. Spectators press T and type in the normal game chat input, then press Enter. Their names appear in green with a [Spectator] label. Players with this version read these messages in the main chat history and reply there normally. Turning the checkbox off disables sending and receiving spectator chat and removes spectator messages from the local history while preserving normal chat. Messages follow the current public arena only; switching arenas clears the panel. No player slots are allocated to chat users. Messages are limited to 255 characters, one per second, and the shared chat history retains at most eight messages.

Spectator chat is currently limited to hosted 4v4. The original servers are not controlled by this project, and no reliable shared match identifier was found in the inspected client protocol for attaching a separate chat relay. Original modes and their existing chat remain unchanged. Both the userscript and server need this release; on an older backend the chat panel explains that a server update is needed.

Version 3.9.1 fixes the ten seconds lost after goals: the next kickoff resumes at the exact goal time, whether the replay finishes or is skipped. Kickoff countdowns remain paused. Regulation and overtime exclude celebration/replay time, while downloaded replay frames and events retain a continuous timeline. This fix requires updating server.mjs and restarting each hosted backend; installing the userscript alone does not update the server. No deployment has been performed as part of packaging this release.

This is an early multiplayer compatibility server, not a finished public deployment. It implements the stock NitroClash WebSocket handshake, puts up to eight browsers into a shared arena, runs a Planck/Box2D physics world at 60 Hz, and emits authoritative state frames at 30 Hz.

During a goal replay, a left click/boost press votes to skip. The replay ends early once every currently connected player has voted. If everyone leaves an arena, that match is discarded; the next player starts a fresh match with a new 3-2-1-GO kickoff.

Stock party links and the **Private game** checkbox now route matches by their six-character party code. Each code owns an isolated arena, the displayed Team 1/Team 2 choice is preserved when the player name identifies one side, and private disconnects reserve that exact slot for 60 seconds. Public matchmaking never enters a private arena.

In-game text and quick chat are relayed only to players in the same arena, with length and rate limits. At the results screen, **Change Team** leaves the ended match and enters an available non-full match; if none exists, the server creates a fresh arena and starts its kickoff. Selecting **Rematch** keeps that player in the same arena and team. When the 30-second results timer expires, all rematch voters begin a reset match with a normal 3-2-1-GO kickoff; players who did not select Rematch are detached from that finished arena.

The closed browser client has hard-coded layouts for 1v1, 2v2, 3v3 and 5v5. The prototype uses its 5v5 layout while hiding one unused slot on each team. The server therefore has eight visible player positions without requiring the original source code.

Goals trigger the stock explosion, a controllable three-second celebration, a five-second replay, a short replay celebration, and a fresh 3-2-1 kickoff. Goal scorer and assister use recent ball-touch tracking, and goal speed uses the ball velocity at the line.

At the end of regulation, a leading team wins immediately. A tied game resets to one overtime kickoff and the next goal ends the match. The stock results screen receives the final score, player goals, assists, saves, points and MVP selection.

The stock Tab scoreboard is refreshed once per second and after every scoring event. Connected players and in-game observers report measured round-trip ping; empty, not-yet-measured or stale slots report 0. Account levels/ranks are 0 because this server has no NitroClash account database.

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
4. Confirm that the orange **HOSTED 4v4 v3.11.0** badge appears on the homepage.
5. For hosted **4 VS 4**, choose **Europe** (VPS) or **Europe 2** (Render). Choose **1 VS 1**, **2 VS 2**, **3 VS 3**, **5 VS 5** or **Classic** for NitroClash's original servers. **Train** remains the original local training mode. Mode changes update the server list immediately, without refreshing.
6. Choose your mode, then click Play. The separate **4 VS 4** and **5 VS 5** buttons remain available throughout.

For a multiplayer check, open NitroClash independently in a second tab or browser window with the hosted userscript, choose 4v4 and press Play. Each tab keeps a distinct player identity, while refreshing a tab retains its reconnect identity.

For linked games, everyone should install **v3.9.0 or later**. Create/join a party and let the host choose the mode and server. Members follow the host's live selection without refreshing—even from hosted 4v4 to original 3v3, or from original 5v5 back to hosted 4v4. In hosted 4v4, all members press Play to mark themselves ready; the match starts when everyone is ready. Arrange Team 1/Team 2: **Team 1 is blue; Team 2 is red**. Hosted linked parties are isolated by party code even when **Private game** is not ticked. Use unique names within the party; ambiguous names are rejected instead of silently assigning the wrong side. The visible party lobby still uses NitroClash's official `/team` coordination service; actual matches, physics and reconnect reservations use only this server.

The userscript merges NitroClash's live official server list with separate hosted region tags. **Europe** sends hosted 4v4 to `wss://nitroclashio.duckdns.org`; **Europe 2** uses `wss://fourv4-s2fb.onrender.com`. Original modes retain their official matchmaking reservations and game addresses. The position-based spare-player filter runs only for hosted games. Hosted linked games use the official party lobby only to exchange names, sides, mode and readiness; their match traffic and physics go to the selected hosted backend. Original modes and the party lobby still depend on NitroClash's services being available. Never mix this userscript with another server redirector.

## Current limitations

- Up to eight real browser connections share each public arena and receive unique player slots. Full arenas cause the server to create another isolated match automatically.
- Player acceleration, boost, braking, arena walls, player collisions and ball collisions now use Planck with the constants exposed by NitroClash's browser client.
- Public slot allocation and one-minute reconnect identity are implemented. A public slot is released immediately; reconnect restores the original slot if free, otherwise prefers a free slot on the same team, and is refused when the previous match is full.
- Private party routing and one-minute private slot reservation are implemented through the stock party interface. **Change Team** matchmaking and results-timer rematches are implemented.
- A Reconnect button appears after a dropped connection and on the homepage while the saved one-minute session is valid. It prevents overlapping attempts and reports expired, full and missing-match failures. Reloading retains the reconnect identity; private reconnects retain their party code, team and exact reserved slot.
- The stock **Spectate** button uses NitroClash's native spectator protocol. It selects the most populated active public 4v4 arena, works when all eight player slots are occupied, receives the complete match broadcast, and has no player body, controls, votes or capacity cost. Private arenas are never listed or selected. If no public match is active, the browser reports **No active 4v4 games**.
- Version 3.5.1 fixes the native spectator startup sequence: the selected arena state is sent immediately after the map because spectator clients do not emit the normal player-ready packet. Real player names are preserved, left/right switches active public arenas, and a previously saved full-pitch camera is changed to follow the selected player when spectating begins.
- Version 3.5.2 keeps reconnect identity current for the entire match and starts its 60-second expiry when the connection is actually lost. While a valid session exists, the homepage Reconnect button is placed directly beside the normal Play/Spectate controls; it remains hidden when no resumable session exists.
- Version 3.5.3 shows the orange hosted-version badge only on the homepage. It is hidden while playing, spectating, reconnecting or viewing an interrupted match, and returns after going back home.
- Version 3.6.0 made ordinary **Spectate** enter the most populated public arena at its current live turn.
- Version 3.6.0 also binds reconnect intent to NitroClash's reservation response so the latency-check socket cannot consume it. The real game socket receives the saved public/private identity, party and team exactly once.
- Version 3.6.1 removes the experimental **Watch from Start** spectator playback and its button. Spectating is live-only again; player capacity, private-game isolation and reconnect routing are unchanged.
- Version 3.7.0 introduced the new Europe-hosted VPS through NitroClash's existing server selector.
- Version 3.7.1 removes the older Render fallback from the userscript. The Europe server is now the only advertised and selectable hosted 4v4 endpoint.
- Version 3.7.2 renames the visible hosted server choice from **Frankfurt 1** to **Europe** without changing its address or match routing.
- The closed client still allocates ten compatibility slots internally. The userscript follows the trainer's display-tree technique: it finds only player sprites whose live physics position is deliberately outside the map and hides those sprites plus their paired markers at render time. The spare server bodies do not exist, while all real-player off-screen arrows stay enabled.
- The userscript tests the hosted game WebSocket directly before supplying matchmaking, avoiding browser-dependent cross-site health requests.

## Return to normal NitroClash

Choose an original mode (1v1, 2v2, 3v3, 5v5 or Classic) without refreshing. Alternatively, disable the userscript and reload for the completely unmodified website.

## Version 3.8.0

- Restores the Render endpoint as **Europe 2**, secondary to **Europe**.
- Adds an original **5 VS 5** button alongside hosted **4 VS 4**. Other original modes reload into the original frontend network path; official availability still depends on NitroClash.
- Captures party roster sides and the selected server before the stock client clears the party hash at match start. Team 1 maps to blue (even slots), Team 2 to red (odd slots), regardless of connection order.
- Gives every hosted party member a separate persistent tab reservation key. Unidentifiable/duplicate party names fail clearly instead of assigning a random team.
- Both userscripts now share the same routing/reconnect logic. Keep only one enabled.
- This release changes userscripts/documentation only. The VPS backend is unchanged and does not need restarting. Pushing to GitHub updates the userscript download; a configured Render auto-deploy can still restart that service and disconnect its matches.

## Version 3.9.0 — seamless modes and host following

- Switch among all original modes and hosted 4v4 on the same page. No mode-switch reloads.
- Party members follow the host's authoritative mode and region updates, including the distinction between hosted 4v4 and original 5v5.
- Hosted party readiness starts the party-code arena directly, without allocating an original game. Repeated ready updates cannot create duplicate starts.
- Preserves Team 1 = blue / Team 2 = red, separate tab identities, both hosted endpoints, spectator routing and reconnect records (including older saved region names).
- Hosted 4v4 now matches the original mode-button styling; only the actual selected mode is highlighted.
- Regression checks: two real stock browser clients followed all competitive modes and joined original 3v3 and hosted 4v4, receiving live state; tested both hosted team sides, endpoint switching, ready gating and single-start routing. Automated spare-slot, reconnect/spectator, chat/change-team and rematch checks are included in the development workspace.
- This is a userscript-only runtime update: **no VPS backend restart is needed**.

### Publish this release

1. Extract `nitroclash-github-update-v3.9.0.zip`.
2. Replace its three files in your GitHub Desktop `4v4` folder: `server.mjs`, `README.md`, and `nitroclash-hosted-4v4.user.js`.
3. **Commit to main**, then **Push origin**. The ZIP includes the unchanged backend for the normal release workflow.
4. A configured Render auto-deploy may restart Europe 2 and disconnect matches in progress. The Europe VPS needs no restart for this release.
5. In Tampermonkey, use **Check for userscript updates**, then reload NitroClash once to load the new script. After this initial installation reload, mode changes require no refresh.
6. Confirm **HOSTED 4v4 v3.9.0** on the homepage. Everyone in a hosted party must update.
