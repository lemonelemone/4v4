// ==UserScript==
// @name         NitroClash — Hosted 4v4
// @namespace    nc-local-4v4
// @version      3.7.2
// @description  Connects NitroClash game sockets to the hosted 4v4 server
// @homepageURL  https://github.com/lemonelemone/4v4
// @updateURL    https://raw.githubusercontent.com/lemonelemone/4v4/main/nitroclash-hosted-4v4.user.js
// @downloadURL  https://raw.githubusercontent.com/lemonelemone/4v4/main/nitroclash-hosted-4v4.user.js
// @match        *://nitroclash.io/*
// @match        *://www.nitroclash.io/*
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";
  const win = unsafeWindow;
  const NativeWebSocket = win.WebSocket;
  const NativeXMLHttpRequest = win.XMLHttpRequest;
  const defaultServerCode = "EU1";
  const serverChoices = Object.freeze({
    EU1: Object.freeze({
      label: "Europe",
      fakeUri: "eu6.nitroclash.io:8003",
      url: "wss://nitroclashio.duckdns.org",
    }),
  });
  const serverListResponse = Object.fromEntries(Object.entries(serverChoices).map(([code, choice]) => [
    code,
    { uri: choice.fakeUri, p0: 0, p1: 0, p2: 0, p3: 0, p4: 0, p5: 0 },
  ]));
  const selectedServerCode = () => {
    const code = String(document.getElementById("server")?.value || "");
    return serverChoices[code] ? code : defaultServerCode;
  };
  const serverCodeForSocketUrl = (url) => {
    try {
      const hostname = new URL(String(url)).hostname.toLowerCase();
      const match = Object.entries(serverChoices).find(([, choice]) =>
        choice.fakeUri.split(":", 1)[0].toLowerCase() === hostname);
      if (match) return match[0];
    } catch (_) {}
    return selectedServerCode();
  };
  const reconnectStorageName = "nc4v4-reconnect-session";
  let reconnectRequested = false;
  let spectateRequested = false;
  let pendingGameSocketIntent = null;
  let connectionAttemptActive = false;
  const captureGameSocketIntent = () => {
    pendingGameSocketIntent = spectateRequested
      ? "spectate-live"
      : reconnectRequested ? "reconnect" : "play";
  };
  const readReconnectSession = () => {
    try {
      const session = JSON.parse(win.localStorage.getItem(reconnectStorageName) || "null");
      if (!session || !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) {
        win.localStorage.removeItem(reconnectStorageName);
        return null;
      }
      return session;
    } catch (_) { return null; }
  };
  const saveReconnectSession = (route, expiresAt = Date.now() + 60000, serverCode = selectedServerCode()) => {
    try {
      win.localStorage.setItem(reconnectStorageName, JSON.stringify({
        expiresAt,
        kind: route ? "private" : "public",
        partyCode: route?.partyCode || null,
        team: route?.team ?? null,
        serverCode: serverChoices[serverCode] ? serverCode : defaultServerCode,
      }));
    } catch (_) {}
  };
  const probeGameServer = (gameServerUrl) => new Promise((resolve) => {
    const startedAt = Date.now();
    const probe = () => {
      let settled = false;
      let socket;
      const retry = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        try { socket?.close(); } catch (_) {}
        if (Date.now() - startedAt >= 90000) {
          console.warn("[nc-local-4v4] hosted server wake-up timed out; allowing NitroClash to retry");
          resolve(false);
        } else {
          setTimeout(probe, 1500);
        }
      };
      const timeout = setTimeout(retry, 15000);
      try {
        socket = new NativeWebSocket(`${gameServerUrl}/?wake=${Date.now()}`);
        socket.onopen = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          console.log("[nc-local-4v4] hosted game socket is awake");
          try { socket.close(); } catch (_) {}
          resolve(true);
        };
        socket.onerror = retry;
        socket.onclose = () => { if (!settled) retry(); };
      } catch (_) {
        retry();
      }
    };
    probe();
  });
  const gameServerReady = new Promise((resolve) => {
    let failures = 0;
    let settled = false;
    for (const choice of Object.values(serverChoices)) {
      probeGameServer(choice.url).then((ready) => {
        if (settled) return;
        if (ready) {
          settled = true;
          resolve(true);
        } else if (++failures === Object.keys(serverChoices).length) {
          settled = true;
          resolve(false);
        }
      });
    }
  });
  const reservationStorageName = "nc4v4-tab-reservation-key";
  function createReservationKey() {
    const random = new Uint32Array(1);
    if (win.crypto?.getRandomValues) win.crypto.getRandomValues(random);
    else random[0] = Math.floor(Math.random() * 0x7ffffffe) + 1;
    return (random[0] & 0x7fffffff) || 1;
  }
  let reservationKey = (() => {
    try {
      const existing = Number(win.sessionStorage.getItem(reservationStorageName));
      const navigationType = win.performance?.getEntriesByType?.("navigation")?.[0]?.type;
      // A duplicated tab can inherit the opener's sessionStorage. Keep the key
      // across a genuine reload (for reconnect), but mint a new one for a fresh
      // navigation so two tabs never claim the same player identity.
      if (navigationType !== "navigate" && Number.isInteger(existing) &&
          existing > 0 && existing <= 0x7fffffff) return existing;
      const created = createReservationKey();
      win.sessionStorage.setItem(reservationStorageName, String(created));
      return created;
    } catch (_) {
      return createReservationKey();
    }
  })();

  // Chrome copies sessionStorage when a tab is duplicated. Ask already-open
  // NitroClash tabs whether this key is in use; only the newly opened requester
  // changes its key. This preserves the key on an ordinary refresh/reconnect.
  try {
    const tabNonce = `${Date.now()}-${createReservationKey()}`;
    const channel = new win.BroadcastChannel("nc4v4-tab-reservations");
    channel.onmessage = ({ data }) => {
      if (!data || data.nonce === tabNonce) return;
      if (data.type === "probe" && data.key === reservationKey) {
        channel.postMessage({ type: "occupied", key: reservationKey, target: data.nonce, nonce: tabNonce });
      } else if (data.type === "occupied" && data.target === tabNonce && data.key === reservationKey) {
        reservationKey = createReservationKey();
        win.sessionStorage.setItem(reservationStorageName, String(reservationKey));
        console.log("[nc-local-4v4] duplicated tab detected; created a separate player identity");
      }
    };
    channel.postMessage({ type: "probe", key: reservationKey, nonce: tabNonce });
  } catch (_) {}

  // NitroClash normally downloads its server list and asks its public
  // matchmaker for a reservation before opening the game socket. A local game
  // should not become unavailable just because either public endpoint is down.
  class LocalXMLHttpRequest extends win.EventTarget {
    constructor() {
      super();
      this._native = new NativeXMLHttpRequest();
      this._fake = null;
      this._readyState = 0;
      this._status = 0;
      this._statusText = "";
      this._responseText = "";
      this._response = null;
      this._responseType = "";
      this._timeout = 0;
      this._withCredentials = false;
      this.onreadystatechange = null;
      this.onload = null;
      this.onerror = null;
      this.onabort = null;
      this.ontimeout = null;
      this.onloadend = null;
      this.onloadstart = null;
      this.onprogress = null;
      for (const type of ["readystatechange", "load", "error", "abort", "timeout", "loadend", "loadstart", "progress"]) {
        this._native.addEventListener(type, () => this._emit(type));
      }
    }
    _emit(type) {
      const event = new win.Event(type);
      const handler = this[`on${type}`];
      if (typeof handler === "function") handler.call(this, event);
      this.dispatchEvent(event);
    }
    open(method, url, async = true, username, password) {
      const text = String(url);
      let parsed = null;
      try { parsed = new URL(text, win.location.href); } catch (_) {}
      const localHost = parsed && /^s\.nitroclash\.io$/i.test(parsed.hostname);
      const serverList = localHost && String(method).toUpperCase() === "GET" && parsed.pathname === "/servers";
      const reservation = localHost && String(method).toUpperCase() === "POST" && parsed.pathname === "/" &&
        parsed.searchParams.has("r") && parsed.searchParams.has("m");
      if (serverList || reservation) {
        this._fake = { kind: serverList ? "servers" : "reservation", url: text, async: async !== false };
        this._readyState = 1;
        this._emit("readystatechange");
        return;
      }
      this._fake = null;
      return username === undefined
        ? this._native.open(method, url, async)
        : this._native.open(method, url, async, username, password);
    }
    send(body = null) {
      if (!this._fake) return this._native.send(body);
      const finish = () => {
        if (this._fake.kind === "reservation") captureGameSocketIntent();
        this._status = 200;
        this._statusText = "OK";
        this._readyState = 4;
        this._responseText = this._fake.kind === "servers"
          ? JSON.stringify(serverListResponse)
          : `${serverChoices[selectedServerCode()].fakeUri} ${reservationKey}`;
        this._response = this._responseType === "json" ? JSON.parse(this._responseText) : this._responseText;
        this._emit("readystatechange");
        this._emit("load");
        this._emit("loadend");
        console.log(`[nc-local-4v4] supplied local ${this._fake.kind} response`);
      };
      if (this._fake.kind === "servers") {
        gameServerReady.then(finish, finish);
      } else if (this._fake.async) setTimeout(finish, 0);
      else finish();
    }
    abort() {
      if (!this._fake) return this._native.abort();
      this._readyState = 0;
      this._emit("abort");
      this._emit("loadend");
    }
    setRequestHeader(name, value) { if (!this._fake) return this._native.setRequestHeader(name, value); }
    overrideMimeType(type) { if (!this._fake) return this._native.overrideMimeType(type); }
    getResponseHeader(name) {
      if (!this._fake) return this._native.getResponseHeader(name);
      return /^content-type$/i.test(name) ? (this._fake.kind === "servers" ? "application/json" : "text/plain") : null;
    }
    getAllResponseHeaders() {
      if (!this._fake) return this._native.getAllResponseHeaders();
      return `content-type: ${this._fake.kind === "servers" ? "application/json" : "text/plain"}\r\n`;
    }
    get readyState() { return this._fake ? this._readyState : this._native.readyState; }
    get status() { return this._fake ? this._status : this._native.status; }
    get statusText() { return this._fake ? this._statusText : this._native.statusText; }
    get responseText() { return this._fake ? this._responseText : this._native.responseText; }
    get response() { return this._fake ? this._response : this._native.response; }
    get responseURL() { return this._fake ? this._fake.url : this._native.responseURL; }
    get responseXML() { return this._fake ? null : this._native.responseXML; }
    get upload() { return this._native.upload; }
    get responseType() { return this._fake ? this._responseType : this._native.responseType; }
    set responseType(value) { this._responseType = value; if (!this._fake) this._native.responseType = value; }
    get timeout() { return this._fake ? this._timeout : this._native.timeout; }
    set timeout(value) { this._timeout = value; if (!this._fake) this._native.timeout = value; }
    get withCredentials() { return this._fake ? this._withCredentials : this._native.withCredentials; }
    set withCredentials(value) { this._withCredentials = value; if (!this._fake) this._native.withCredentials = value; }
  }
  for (const [name, value] of [["UNSENT", 0], ["OPENED", 1], ["HEADERS_RECEIVED", 2], ["LOADING", 3], ["DONE", 4]]) {
    Object.defineProperty(LocalXMLHttpRequest, name, { value });
    Object.defineProperty(LocalXMLHttpRequest.prototype, name, { value });
  }
  win.XMLHttpRequest = LocalXMLHttpRequest;
  // Prefer the browser's own XHR implementation and redirect only the two
  // matchmaking calls to native same-origin blob responses. This avoids CORS,
  // mixed-content and private-network checks before the actual game socket.
  const localServersBlob = win.URL.createObjectURL(new win.Blob([
    JSON.stringify(serverListResponse),
  ], { type: "application/json" }));
  let localReservationBlob = null;
  const makeLocalReservationBlob = () => {
    captureGameSocketIntent();
    if (localReservationBlob) win.URL.revokeObjectURL(localReservationBlob);
    localReservationBlob = win.URL.createObjectURL(new win.Blob([
      `${serverChoices[selectedServerCode()].fakeUri} ${reservationKey}`,
    ], { type: "text/plain" }));
    return localReservationBlob;
  };
  const nativeXhrOpen = NativeXMLHttpRequest.prototype.open;
  NativeXMLHttpRequest.prototype.open = function (method, url, ...rest) {
    let finalMethod = method;
    let finalUrl = url;
    try {
      const parsed = new URL(String(url), win.location.href);
      if (/^s\.nitroclash\.io$/i.test(parsed.hostname)) {
        if (String(method).toUpperCase() === "GET" && parsed.pathname === "/servers") {
          finalMethod = "GET";
          finalUrl = localServersBlob;
          console.log("[nc-local-4v4] supplied local server list");
        } else if (String(method).toUpperCase() === "POST" && parsed.pathname === "/" &&
          parsed.searchParams.has("r") && parsed.searchParams.has("m")) {
          finalMethod = "GET";
          finalUrl = makeLocalReservationBlob();
          console.log("[nc-local-4v4] supplied local reservation");
        }
      }
    } catch (_) {}
    return nativeXhrOpen.call(this, finalMethod, finalUrl, ...rest);
  };
  // Keep the wrapper installed so the server-list response can wait for a
  // sleeping free Render instance to wake before NitroClash opens its one-shot
  // latency socket. The native prototype redirect above remains as a fallback
  // for any library that cached the browser constructor before this script ran.
  win.XMLHttpRequest = LocalXMLHttpRequest;
  function currentPrivatePartyRoute() {
    const partyCode = String(win.location.hash || "").replace(/^#/, "").toUpperCase();
    const privateGame = document.getElementById("private-game")?.checked === true;
    if (!privateGame || !/^[A-HJ-NP-Z0-9]{6}$/.test(partyCode)) return null;

    // The stock party socket renders the authoritative Team 1/Team 2 lists
    // before it starts every member's game connection. Preserve that choice
    // when the displayed name identifies exactly one side; otherwise let the
    // private server balance the player safely.
    const username = String(document.getElementById("username")?.value || "Player").trim() || "Player";
    const listHasPlayer = (id) => [...(document.getElementById(id)?.children || [])].some((row) =>
      String(row.textContent || "").replace(/\s*\[Host\]\s*$/, "").trim() === username.slice(0, 12));
    const inTeam1 = listHasPlayer("teammates-list");
    const inTeam2 = listHasPlayer("teammates-list-2");
    const team = inTeam1 !== inTeam2 ? (inTeam1 ? 0 : 1) : null;
    return { partyCode, team };
  }

  function LocalWebSocket(url, protocols) {
    const text = String(url);
    const isNitroSocket = /^wss?:\/\/[^/]*nitroclash\.io(?::\d+)?\/\d+\/?$/i.test(text);
    const pagePrivateRoute = isNitroSocket ? currentPrivatePartyRoute() : null;
    let socketIntent = null;
    if (isNitroSocket && pendingGameSocketIntent) {
      socketIntent = pendingGameSocketIntent;
      pendingGameSocketIntent = null;
    } else if (isNitroSocket && spectateRequested) {
      socketIntent = "spectate-live";
    } else if (isNitroSocket && reconnectRequested) {
      socketIntent = "reconnect";
    } else if (isNitroSocket && pagePrivateRoute) {
      // Party starts can open the game socket directly without the public
      // reservation request used by ordinary matchmaking.
      socketIntent = "play";
    }
    const reconnectSocket = socketIntent === "reconnect";
    const spectatorSocket = socketIntent === "spectate-live";
    const savedReconnect = reconnectSocket ? readReconnectSession() : null;
    const requestedServerCode = isNitroSocket ? serverCodeForSocketUrl(text) : defaultServerCode;
    const gameServerCode = reconnectSocket && serverChoices[savedReconnect?.serverCode]
      ? savedReconnect.serverCode
      : requestedServerCode;
    const gameServerUrl = serverChoices[gameServerCode].url;
    let finalUrl = isNitroSocket ? gameServerUrl : url;
    const privateRoute = isNitroSocket ? (savedReconnect?.kind === "private" ? savedReconnect : pagePrivateRoute) : null;
    let spectatorFollowPending = false;
    if (spectatorSocket) {
      try {
        const savedCamera = win.localStorage.getItem("cameraFullScreen");
        spectatorFollowPending = savedCamera === "1" ||
          (savedCamera === null && win.localStorage.getItem("initialCameraFullScreen") === "1");
      } catch (_) {}
    }
    if (privateRoute) {
      const teamQuery = privateRoute.team === null ? "" : `&team=${privateRoute.team}`;
      finalUrl += `/?private=1&party=${encodeURIComponent(privateRoute.partyCode)}${teamQuery}`;
      console.log(`[nc-local-4v4] private party ${privateRoute.partyCode}${privateRoute.team === null ? "" : `, team ${privateRoute.team + 1}`}`);
    }
    if (spectatorSocket) finalUrl += `${finalUrl.includes("?") ? "&" : "/?"}spectate=1`;
    if (reconnectSocket) finalUrl += `${finalUrl.includes("?") ? "&" : "/?"}reconnect=1`;
    if (isNitroSocket) console.log(`[nc-local-4v4] ${text} → ${finalUrl}`);
    const socket = protocols === undefined ? new NativeWebSocket(finalUrl) : new NativeWebSocket(finalUrl, protocols);
    if (isNitroSocket && socketIntent) {
      let playerJoinSent = false;
      let matchEnded = false;
      let reconnectRefreshTimer = null;
      reconnectRequested = false;
      spectateRequested = false;
      connectionAttemptActive = true;
      const nativeSend = socket.send;
      socket.send = function (data) {
        try {
          const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) :
            ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null;
          // Server ping sockets send opcode 99. Record reconnect eligibility
          // only when the stock client sends a real player join (opcode 1).
          if (!spectatorSocket && bytes?.[0] === 1) {
            playerJoinSent = true;
            saveReconnectSession(privateRoute, Date.now() + 60000, gameServerCode);
            clearInterval(reconnectRefreshTimer);
            reconnectRefreshTimer = setInterval(() =>
              saveReconnectSession(privateRoute, Date.now() + 60000, gameServerCode), 15000);
          }
        } catch (_) {}
        return nativeSend.call(this, data);
      };
      socket.addEventListener("open", () => { connectionAttemptActive = false; });
      socket.addEventListener("message", ({ data }) => {
        try {
          const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) :
            ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null;
          if (!spectatorSocket && bytes?.[0] === 14) {
            matchEnded = true;
            clearInterval(reconnectRefreshTimer);
            try { win.localStorage.removeItem(reconnectStorageName); } catch (_) {}
          }
          if (spectatorSocket && spectatorFollowPending && bytes?.[0] === 5) {
            spectatorFollowPending = false;
            // The stock client has now applied its first live state. Toggle its
            // saved full-pitch camera to follow the selected real player.
            setTimeout(() => win.dispatchEvent(new win.KeyboardEvent("keyup", { key: "c", keyCode: 67, which: 67 })), 0);
          }
        } catch (_) {}
      });
      socket.addEventListener("close", (event) => {
        clearInterval(reconnectRefreshTimer);
        connectionAttemptActive = false;
        const reason = String(event.reason || "");
        if (/Reconnect expired|Match full|Previous match no longer exists|Private match no longer exists/i.test(reason)) {
          try { win.localStorage.removeItem(reconnectStorageName); } catch (_) {}
        }
        win.__nc4v4LastConnectionMessage = reason;
        if (!spectatorSocket && playerJoinSent && !matchEnded &&
            !/Reconnect expired|Match full|Previous match no longer exists|Private match no longer exists/i.test(reason)) {
          // Eligibility starts when the connection is lost, not when a
          // potentially five-minute match originally began.
          saveReconnectSession(privateRoute, Date.now() + 60000, gameServerCode);
        }
        if (spectatorSocket && reason) setTimeout(() => win.alert(reason), 0);
      });
    }
    return socket;
  }
  LocalWebSocket.prototype = NativeWebSocket.prototype;
  for (const name of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) LocalWebSocket[name] = NativeWebSocket[name];
  win.WebSocket = LocalWebSocket;

  // The trainer finds its ball by walking the live PIXI display tree and using
  // lastPhysicsPosition, which the closed client stamps onto body-driven
  // sprites. Do the same for the spare players: only the two player sprites at
  // the server's deliberately impossible (-100,-100) coordinates are hidden.
  // Their marker is the next sibling in NitroClash's ge/me construction pair.
  // This keeps every genuine player's off-screen arrow intact.
  function installSpareSlotFilter() {
    if (win.__nc4v4SpareFilterInstalled) return true;
    if (!win.PIXI) return false;
    const rendererPrototypes = [
      win.PIXI.WebGLRenderer?.prototype,
      win.PIXI.CanvasRenderer?.prototype,
    ].filter(Boolean);
    if (!rendererPrototypes.some((prototype) => typeof prototype.render === "function")) return false;
    try {
      const hideForThisFrame = (sprite) => {
        if (!sprite) return;
        sprite.visible = false;
        sprite.renderable = false;
        sprite.__nc4v4UnusedSlot = true;
      };
      const restoreOccupiedSlot = (player, marker) => {
        if (player?.__nc4v4UnusedSlot) {
          player.visible = true;
          player.renderable = true;
          delete player.__nc4v4UnusedSlot;
        }
        if (marker?.__nc4v4UnusedSlot) {
          // Marker visibility is camera-controlled by the game. Restore its
          // ability to render without forcing an on-screen arrow to appear.
          marker.renderable = true;
          delete marker.__nc4v4UnusedSlot;
        }
      };
      const hideSpareSlots = (stage) => {
        if (!stage) return;
        const queue = [stage];
        while (queue.length) {
          const node = queue.shift();
          const children = node?.children;
          if (!children?.length) continue;
          for (let index = 0; index < children.length; index++) {
            const child = children[index];
            const position = child?.lastPhysicsPosition;
            // Match the trainer's body-driven-sprite predicate instead of
            // depending on the player's current skin texture. Players are
            // square and ~1.22 world units wide; the ball is ~2.15.
            const playerSized = typeof child?.width === "number" && typeof child?.height === "number" &&
              Math.abs(child.width - child.height) < 0.1 && child.width < 1.6;
            if (position && playerSized) {
              const outsideArena = position.x < -20 || position.x > 120 || position.y < -20 || position.y > 80;
              if (outsideArena) {
                hideForThisFrame(child);
              // The closed client constructs the scene in exact pairs:
              // player[slot], marker[slot], player[slot + 1], marker[slot + 1].
              // Hide the immediate sibling instead of guessing from textures;
              // skins can replace textures and made the old red-marker check
              // unreliable. Only a body-driven player at the impossible spare
              // coordinates reaches this branch, so real-player arrows remain.
                hideForThisFrame(children[index + 1]);
              } else {
                // An empty slot can become occupied after this client has
                // already joined. Undo our old hidden state immediately.
                restoreOccupiedSlot(child, children[index + 1]);
              }
            }
            if (child?.children?.length) queue.push(child);
          }
        }
      };
      let wrapped = 0;
      for (const prototype of rendererPrototypes) {
        const originalRender = prototype.render;
        if (typeof originalRender !== "function" || originalRender.__nc4v4SpareWrapped) continue;
        const render = function (stage, ...args) {
          hideSpareSlots(stage);
          return originalRender.call(this, stage, ...args);
        };
        render.__nc4v4SpareWrapped = true;
        prototype.render = render;
        wrapped++;
      }
      if (!wrapped) return false;
      win.__nc4v4SpareFilterInstalled = true;
      console.log("[nc-local-4v4] direct spare-player/arrow-pair filter installed");
      return true;
    } catch (error) {
      console.warn("[nc-local-4v4] could not install position-based spare-slot filter", error);
      return false;
    }
  }
  const filterPoll = setInterval(() => { if (installSpareSlotFilter()) clearInterval(filterPoll); }, 50);
  installSpareSlotFilter();

  function installInterface() {
    if (!document.body) return false;
    const installReconnectButton = (panel, suffix) => {
      if (!panel || document.getElementById(`nc-local-4v4-reconnect-${suffix}`)) return;
      const button = document.createElement("button");
      button.id = `nc-local-4v4-reconnect-${suffix}`;
      button.type = "button";
      button.className = "button";
      button.textContent = "Reconnect";
      button.title = "Try to rejoin your previous 4v4 match within 60 seconds";
      Object.assign(button.style, suffix === "home"
        ? { display: "inline-block", margin: "10px 0 0 10px", padding: "10px 24px" }
        : { display: "block", margin: "18px auto 0", padding: "10px 24px" });
      button.addEventListener("click", () => {
        if (connectionAttemptActive || !readReconnectSession()) return;
        reconnectRequested = true;
        connectionAttemptActive = true;
        button.disabled = true;
        button.textContent = "Reconnecting...";
        try {
          if (suffix === "lost") panel.style.display = "none";
          win.nitroclash.backToHomepage();
          setTimeout(() => {
            win.nitroclash.selectMode(4);
            win.nitroclash.clickPlay();
          }, 100);
        } catch (error) {
          button.disabled = false;
          button.textContent = "Reconnect";
          console.warn("[nc-local-4v4] reconnect failed", error);
        }
      });
      if (suffix === "home" && document.getElementById("spectate-button"))
        document.getElementById("spectate-button").insertAdjacentElement("afterend", button);
      else
        panel.appendChild(button);
    };
    const relabel = () => {
      const serverSelect = document.getElementById("server");
      if (serverSelect) {
        let serverLabelsChanged = false;
        const hostedOptionsReady = Object.keys(serverChoices).every((code) =>
          [...serverSelect.options].some((candidate) => candidate.value === code));
        if (hostedOptionsReady && !win.__nc4v4ServerDefaultApplied) {
          win.__nc4v4ServerDefaultApplied = true;
          serverSelect.value = defaultServerCode;
          serverSelect.dispatchEvent(new win.Event("change", { bubbles: true }));
          serverLabelsChanged = true;
        }
        for (const [code, choice] of Object.entries(serverChoices)) {
          const option = [...serverSelect.options].find((candidate) => candidate.value === code);
          if (!option) continue;
          const players = option.dataset.players || "0";
          const label = `${choice.label} (${players})`;
          if (option.textContent !== label) {
            option.textContent = label;
            serverLabelsChanged = true;
          }
        }
        if (serverLabelsChanged) {
          try { win.jQuery?.(serverSelect)?.selectmenu?.("refresh"); } catch (_) {}
        }
        const selectedChoice = serverChoices[serverSelect.value];
        const selectedOption = [...serverSelect.options].find((candidate) => candidate.value === serverSelect.value);
        const serverButtonText = document.querySelector("#server-button .ui-selectmenu-text");
        if (selectedChoice && selectedOption && serverButtonText)
          serverButtonText.textContent = selectedOption.textContent;
      }
      const button = document.getElementById("gamemode-4") ||
        [...document.querySelectorAll("button")].find((candidate) => /5\s*(?:vs\.?|v)\s*5/i.test(candidate.textContent));
      if (button) {
        button.dataset.nc4v4 = "1";
        for (const node of button.childNodes) {
          if (node.nodeType === Node.TEXT_NODE) node.textContent = node.textContent.replace(/5\s*(?:vs\.?|v)\s*5/i, "4 VS 4");
        }
        if (/5\s*(?:vs\.?|v)\s*5/i.test(button.textContent))
          button.textContent = button.textContent.replace(/5\s*(?:vs\.?|v)\s*5/i, "4 VS 4");
        button.title = "Hosted 4v4 (internally uses the 5v5 client layout)";
      }
      const session = readReconnectSession();
      installReconnectButton(document.getElementById("connection-lost"), "lost");
      installReconnectButton(document.getElementById("homepage-loaded"), "home");
      for (const reconnectButton of document.querySelectorAll('[id^="nc-local-4v4-reconnect-"]')) {
        reconnectButton.style.display = session
          ? (reconnectButton.id.endsWith("-home") ? "inline-block" : "block")
          : "none";
        if (!connectionAttemptActive && reconnectButton.textContent === "Reconnecting...") {
          reconnectButton.disabled = false;
          reconnectButton.textContent = win.__nc4v4LastConnectionMessage || "Reconnect";
        }
      }
      if (win.nitroclash && !win.nitroclash.clickSpectate?.__nc4v4Wrapped) {
        const originalSpectate = win.nitroclash.clickSpectate;
        if (typeof originalSpectate === "function") {
          const wrappedSpectate = function (...args) {
            spectateRequested = true;
            reconnectRequested = false;
            return originalSpectate.apply(this, args);
          };
          wrappedSpectate.__nc4v4Wrapped = true;
          win.nitroclash.clickSpectate = wrappedSpectate;
        }
      }
      const badge = document.getElementById("nc-local-4v4-badge");
      const homepage = document.getElementById("homepage");
      if (badge && homepage) {
        const homepageVisible = homepage.style.display !== "none" &&
          (!win.getComputedStyle || win.getComputedStyle(homepage).display !== "none");
        badge.style.display = homepageVisible ? "block" : "none";
      }
    };
    relabel();
    if (!win.__nc4v4RelabelTimer) win.__nc4v4RelabelTimer = setInterval(relabel, 500);
    if (document.getElementById("nc-local-4v4-badge")) return true;
    const badge = document.createElement("div");
    badge.id = "nc-local-4v4-badge";
    badge.textContent = "HOSTED 4v4 v3.7.2";
    Object.assign(badge.style, {
      position: "fixed", top: "8px", right: "8px", zIndex: 999999,
      padding: "5px 9px", color: "#fff", background: "#7c2d12",
      border: "1px solid #fb923c", borderRadius: "4px", font: "bold 12px monospace",
    });
    document.body.appendChild(badge);
    return true;
  }
  if (document.readyState === "loading") win.addEventListener("DOMContentLoaded", installInterface, { once: true });
  if (!installInterface()) {
    const interfacePoll = setInterval(() => { if (installInterface()) clearInterval(interfacePoll); }, 50);
  }
})();
