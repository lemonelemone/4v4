# NitroClash hosted 4v4

Current release version: **3.24.5**

Version 3.24.5 replaces the server's complete ball/contact physics path with the actual v3.22.1 implementation, rather than merely setting later tuning multipliers to neutral values. The server file is byte-for-byte identical to the v3.22.1 server: it uses the original fixed ball fixture, density and contact processing and contains no later radius, density or per-contact speed hooks. The userscript retains the fully suppressed SUPER NC goal overlay, `0:00` display fix and party-announcement stacking fix. Nothing was deployed.

Version 3.24.4 moves the 11 vs 11 release announcement underneath NitroClash's visible party lobby layer, so the Leave party and Switch side buttons, player names and team lists remain unobstructed. The announcement keeps its original appearance and prominence outside a party lobby. Gameplay and server physics are unchanged from v3.24.3. Nothing was deployed.

Version 3.24.3 restores SUPER NC ball physics to the v3.22.1 settings: normal radius, normal density, no extra per-contact speed multiplier, `0.27` linear damping and `1.08` restitution. The entire native goal overlay is now suppressed in SUPER NC, including both the GOAAAAL banner and scorer/details panel. The compact scoreboard still updates normally, and newer unrelated fixes and features remain in place. Normal hosted 4v4 is unchanged. Nothing was deployed.

Version 3.24.2 keeps the SUPER NC ball at the exact normal visual and physical radius, while reducing only its mode-specific density to `1 / 1.3` of normal. This balances the existing `1.3×` post-contact speed so the ball no longer carries extra momentum into the next player and causes excessive knockback or visible correction jitter. Normal hosted 4v4 retains its original ball radius, density and physics. Nothing was deployed.

Version 3.24.1 returns the SUPER NC ball and goal openings to the exact normal-mode size. `FAST_MODE_BALL_RADIUS_MULTIPLIER`, `FAST_MODE_BALL_SCALE` and `FAST_MODE_GOAL_HEIGHT_MULTIPLIER` are now all `1`, so the ball's visual size, physical hitbox, goal collision opening and scoring region match normal hosted 4v4. SUPER NC keeps its faster ball hits, unlimited boost, three-minute match, `0:00` clock fix and goal-overlay cleanup. Nothing was deployed.

Version 3.24.0 fixes the SUPER NC scoreboard finishing at `0:01`: receiving the end-of-game packet now advances its compact clock to `0:00` before the results screen. SUPER NC goal openings are also `1.75×` taller through the clearly named `FAST_MODE_GOAL_HEIGHT_MULTIPLIER` constant. Both the Planck boundary opening and goal/shot detection expand symmetrically from the original centre, from `23.4375–32.8125` to `19.921875–36.328125`; normal hosted 4v4 retains the stock opening. The website's field artwork is a single baked playfield texture, so this release changes the real collision/scoring opening rather than distorting the whole pitch image. All v3.23.3 ball settings and the goal-overlay fix are preserved. Nothing was deployed.

Version 3.23.3 makes each SUPER NC player-to-ball hit leave the ball moving exactly `1.3×` faster through the clearly named `FAST_MODE_BALL_SPEED_MULTIPLIER` constant. The multiplier is applied once per new player-ball contact, avoiding continuous exponential acceleration while preserving the existing damping and controllability between touches. Player speed, the `1.75×` physical/visual ball size, goal-overlay fix and every normal hosted 4v4 setting are unchanged. Nothing was deployed.

Version 3.23.2 fixes the real NitroClash goal overlay directly. NitroClash renders **GOAAAAL!** and its scorer panel in the HTML element `#goal`, outside the PIXI canvas. During SUPER NC, a mode-scoped DOM guard now always hides `#goal .bottom` and force-hides the whole `#goal` element after the `0.3`-second banner deadline. The guard persists across tab changes and cannot be overridden by the game's later inline display changes. Normal hosted 4v4 retains its original goal display and replay flow. SUPER NC keeps the v3.23.1 faster-ball setting; nothing was deployed.

Version 3.23.1 makes only the SUPER NC ball faster by reducing its clearly named linear-damping constant from `0.27` to `0.25`; player acceleration and maximum speed remain `0.94` and `12.4`. Goal-overlay removal is also hardened against background-tab timer throttling and missed kickoff timing: the scorer/shot/assist panel is suppressed on every SUPER NC render, while GOAAAAL has an absolute `0.3`-second deadline in addition to kickoff-packet cleanup. Normal hosted 4v4 is unchanged. This release requires the updated server and userscript; nothing was deployed.

Version 3.23.0 makes the SUPER NC ball `1.75×` larger both physically and visually through the clearly named `FAST_MODE_BALL_RADIUS_MULTIPLIER` and `FAST_MODE_BALL_SCALE` constants. Visual detection follows NitroClash's shared `ballWFG` texture, so the default ball, URL-selected custom balls and compatible NitroClash Skinner replacements are enlarged. Normal hosted 4v4 restores and retains the original ball size. Goal-overlay cleanup is strengthened and triggered directly by the SUPER NC kickoff packet, recognising both compact and spaced scorer/shot labels so the banner and information cannot remain effectively visible after kickoff. No other gameplay settings changed. This release requires the updated server and userscript; nothing was deployed.

Version 3.22.1 makes the compact SUPER NC scoreboard thinner, reducing its height from `46px` to `36px` and scaling its score/clock text to fit. It also restores the SUPER NC ball exactly to its previous v3.21 setting by returning `FAST_MODE_BALL_LINEAR_DAMPING` from `0.28` to `0.27`. Player speed, kickoff timing, goal-overlay cleanup, 5v5 capacity and normal hosted 4v4 are unchanged. This release requires the updated server and userscript; nothing was deployed.

Version 3.22.0 keeps the smaller label-free SUPER NC scoreboard from the unfinished v3.21.1 package and fixes the lingering goal overlay: **GOAAAAL!** and any scorer panel now clear as soon as kickoff begins. SUPER NC kickoff waits are `0.6` seconds longer through the clearly named `FAST_MODE_KICKOFF_EXTRA_MS` constant. Player acceleration is reduced very slightly from `0.95` to `0.94`, maximum speed from `12.5` to `12.4`, and ball linear damping increases slightly from `0.27` to `0.28`. Unlimited boost, 5v5 capacity and normal hosted 4v4 are unchanged. This release requires the updated server and userscript; nothing was deployed.

Version 3.21.1 makes the SUPER NC scoreboard considerably smaller and removes the written **BLUE** and **RED** labels. The blue score remains on the left and the red score remains on the right, with the compact SUPER NC clock in the middle. Gameplay and normal hosted 4v4 are unchanged. This is a userscript-only display update; nothing was deployed.

Version 3.21.0 expands **SUPER NC** to up to **5 vs 5** and gives it a new top-centre scoreboard with cool blue and red gradients. Its scores are synchronised by the server, including for ordinary spectators who join during a match, while the native Tab scoreboard and ping remain available. SUPER NC now uses all ten stock positions as player places, so its In-game spectate button is hidden and the server rejects old direct in-game-spectator links; ordinary spectating, spectator chat and Join this match remain. Normal hosted 4v4 keeps its existing scoreboard, eight player places and two purple in-game spectator places unchanged. This release also includes the v3.20.3 slightly slower ball and launch-race fix. It requires replacing/restarting the server and installing the new userscript; nothing was deployed.

Version 3.20.3 makes only the SUPER NC ball slightly slower by increasing its clearly named linear-damping constant from `0.24` to `0.27`. It also fixes a mode-launch race where a stale normal-4v4 reservation could override a visibly selected SUPER NC button, causing normal speed, finite boost and goal replays. The selected hosted variant is now captured authoritatively for the game connection. SUPER NC player speed remains `0.95 / 12.5`, boost remains unlimited, ball restitution remains `1.08`, and normal hosted 4v4 is unchanged. This release requires the updated server and userscript; nothing was deployed.

Version 3.20.2 adds a homepage-only announcement card on the left side reading **11 VS 11 — RELEASES 26/09/2026**, with the small-print note **after the 2v2 final**. It uses a glowing purple, pink and orange gradient, adapts its position on narrower screens, and disappears when a match begins. This is a userscript-only update; the v3.20.1 server remains compatible and nothing was deployed.

Version 3.20.1 returns SUPER NC player acceleration and unboosted maximum speed to the previous v3.19.0 values of `0.95` and `12.5`. It also reconciles every mode button after local clicks and authoritative party updates, preventing an old traditional mode and hosted 4v4 from remaining highlighted together. A non-host's mode press cannot override or visually conflict with the host's selection. This release requires the updated server and userscript; nothing was deployed.

Version 3.20.0 moves the two-line **SUPER / NC** button to the far left of the homepage mode row, fits both words inside the button, and gives it a red/orange/pink/purple gradient with a brighter selected glow. In every hosted mode, **Enter** now opens match chat exactly like **T**; Enter still sends while the chat box is open, and Escape still cancels. NitroClash's traditional modes retain their native chat handling. This is a userscript-only update; `server.mjs` remains compatible with v3.19.1 and nothing was deployed.

Version 3.19.1 gives SUPER NC a tiny speed increase: player acceleration is now `0.96` and unboosted maximum speed is `12.7`. Its goal display is reduced to **GOAAAAL!** for **0.3 seconds**, with the scorer, shot-speed and assist panel hidden, before the immediate kickoff reset. SUPER NC now scores at the mode-only goal lines `91.3` on the right and `8.7` on the left. Normal hosted 4v4 keeps its original speed, goal lines and full celebration/replay display. This release requires the updated server and userscript; no deployment was performed.

Version 3.19.0 slightly reduces SUPER NC player acceleration from `0.98` to `0.95` and unboosted maximum speed from `13` to `12.5`; unlimited boost and the faster ball remain. SUPER NC matches now last **3 minutes**. After a goal, the score and goal information are recorded, the goal moment lasts **0.5 seconds**, and play restarts at kickoff with no in-game replay or additional countdown. Normal hosted 4v4 retains its five-minute clock and existing celebration/replay sequence. This release requires the updated server and userscript; no deployment was performed.

Version 3.18.1 renames the Fast-mode homepage button to a two-line **SUPER / NC** label, with NC directly beneath SUPER. The hosted server labels are now **Amsterdam** and **Frankfurt** in both normal and SUPER NC modes. Their underlying addresses, server codes and gameplay behavior are unchanged. This is a userscript/display-only follow-up to the v3.18.0 server; no additional server code change is required if v3.18.0 is already installed.

Version 3.18.0 adds a separate Fast 4v4 homepage mode while leaving normal hosted **4 vs 4** unchanged. Fast mode uses clearly grouped server constants: player acceleration `0.98` (normal `0.75`), unboosted maximum speed `13` (normal `10`), boost multiplier `2`, unlimited boost, ball linear damping `0.24` (normal `0.4`) and ball restitution `1.08` (normal `1`). `FAST_MODE_MAX_PLAYERS_PER_TEAM` is initially `4`. Normal and Fast public matchmaking, private party arenas, spectating, population counts, reconnects and spectator quick-join are isolated by mode. Party members follow the host's Fast/normal selection and hosted server through distinct party region tags. This release requires replacing and restarting `server.mjs` on both hosts and updating every player's userscript. No deployment was performed.

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

This is an early multiplayer compatibility server, not a finished public deployment. It implements the stock NitroClash WebSocket handshake, puts up to eight browsers in normal 4v4 or ten in SUPER NC into a shared arena, runs a Planck/Box2D physics world at 60 Hz, and emits authoritative state frames at 30 Hz.

During a goal replay, a left click/boost press votes to skip. The replay ends early once every currently connected player has voted. If everyone leaves an arena, that match is discarded; the next player starts a fresh match with a new 3-2-1-GO kickoff.

Stock party links and the **Private game** checkbox now route matches by their six-character party code. Each code owns an isolated arena, the displayed Team 1/Team 2 choice is preserved when the player name identifies one side, and private disconnects reserve that exact slot for 60 seconds. Public matchmaking never enters a private arena.

In-game text and quick chat are relayed only to players in the same arena, with length and rate limits. At the results screen, **Change Team** leaves the ended match and enters an available non-full match; if none exists, the server creates a fresh arena and starts its kickoff. Selecting **Rematch** keeps that player in the same arena and team. When the 30-second results timer expires, all rematch voters begin a reset match with a normal 3-2-1-GO kickoff; players who did not select Rematch are detached from that finished arena.

The closed browser client has hard-coded layouts for 1v1, 2v2, 3v3 and 5v5. Normal hosted 4v4 uses the 5v5 layout while keeping one slot on each team for its two in-game spectators. SUPER NC uses all ten positions as players and therefore supports 5v5 without in-game spectator places.

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

Every normal kickoff randomly selects four of the five official 5v5 spawn-pad pairs; SUPER NC uses all five pairs. Blue and red always receive exact mirrored counterparts, while the normal selection does not have to be vertically symmetrical.

## Join the hosted server

1. Disable the other **NitroClash — Custom Server** userscript so the two redirectors do not conflict.
2. In Tampermonkey, create a new script and replace its contents with `nitroclash-hosted-4v4.user.js`, then save it.
3. Reload `https://nitroclash.io`.
4. Confirm that the orange **HOSTED 4v4 v3.24.5** badge appears on the homepage.
5. Choose normal hosted **4 vs 4** or the separate two-line **SUPER / NC** button, then choose **Amsterdam** (VPS) or **Frankfurt** (Render). Choose **1 VS 1**, **2 VS 2**, **3 VS 3**, **5 VS 5** or **Classic** for NitroClash's original servers. **Train** remains the original local training mode. Mode changes update the server list immediately, without refreshing.
6. Click Play. The normal hosted mode, Fast mode and original modes remain separate.

For a multiplayer check, open NitroClash independently in a second tab or browser window with the hosted userscript, choose 4v4 and press Play. Each tab keeps a distinct player identity, while refreshing a tab retains its reconnect identity.

For linked games, everyone should install **v3.18.0 or later** to use Fast mode. Create/join a party and let the host choose normal/Fast mode and server. Members follow the host's live selection without refreshing and cannot override it. In either hosted 4v4 mode, all members press Play to mark themselves ready; the match starts when everyone is ready. Arrange Team 1/Team 2: **Team 1 is blue; Team 2 is red**. Hosted linked parties are isolated by party code even when **Private game** is not ticked. The visible party lobby still uses NitroClash's official `/team` coordination service; actual matches, physics and reconnect reservations use only this server.

The userscript merges NitroClash's live official server list with separate hosted region tags. **Amsterdam** sends hosted 4v4 to `wss://nitroclashio.duckdns.org`; **Frankfurt** uses `wss://fourv4-s2fb.onrender.com`. Original modes retain their official matchmaking reservations and game addresses. The position-based spare-player filter runs only for hosted games. Hosted linked games use the official party lobby only to exchange names, sides, mode and readiness; their match traffic and physics go to the selected hosted backend. Original modes and the party lobby still depend on NitroClash's services being available. Never mix this userscript with another server redirector.

## Current limitations

- Normal hosted 4v4 accepts eight players and retains its two in-game spectator places. SUPER NC accepts ten players (5v5); its per-team maximum is the clearly named `FAST_MODE_MAX_PLAYERS_PER_TEAM` constant, currently `5`. Full public arenas create another isolated match automatically.
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
