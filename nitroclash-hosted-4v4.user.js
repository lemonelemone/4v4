// ==UserScript==
// @name         NitroClash — Hosted 4v4
// @namespace    nc-local-4v4
// @version      3.3.1
// @description  Connects NitroClash game sockets to the hosted 4v4 server
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
  const gameServerUrl = "wss://fourv4-s2fb.onrender.com";
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
        this._status = 200;
        this._statusText = "OK";
        this._readyState = 4;
        this._responseText = this._fake.kind === "servers"
          ? JSON.stringify({ EU1: { uri: "eu6.nitroclash.io:8003", p0: 0, p1: 0, p2: 0, p3: 0, p4: 0, p5: 0 } })
          : `eu6.nitroclash.io:8003 ${reservationKey}`;
        this._response = this._responseType === "json" ? JSON.parse(this._responseText) : this._responseText;
        this._emit("readystatechange");
        this._emit("load");
        this._emit("loadend");
        console.log(`[nc-local-4v4] supplied local ${this._fake.kind} response`);
      };
      if (this._fake.async) setTimeout(finish, 0); else finish();
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
  const localServersBlob = win.URL.createObjectURL(new win.Blob([JSON.stringify({
    EU1: { uri: "eu6.nitroclash.io:8003", p0: 0, p1: 0, p2: 0, p3: 0, p4: 0, p5: 0 },
  })], { type: "application/json" }));
  let localReservationBlob = null;
  const makeLocalReservationBlob = () => {
    if (localReservationBlob) win.URL.revokeObjectURL(localReservationBlob);
    localReservationBlob = win.URL.createObjectURL(new win.Blob([
      `eu6.nitroclash.io:8003 ${reservationKey}`,
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
  win.XMLHttpRequest = NativeXMLHttpRequest;
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
    let finalUrl = isNitroSocket ? gameServerUrl : url;
    const privateRoute = isNitroSocket ? currentPrivatePartyRoute() : null;
    if (privateRoute) {
      const teamQuery = privateRoute.team === null ? "" : `&team=${privateRoute.team}`;
      finalUrl += `/?private=1&party=${encodeURIComponent(privateRoute.partyCode)}${teamQuery}`;
      console.log(`[nc-local-4v4] private party ${privateRoute.partyCode}${privateRoute.team === null ? "" : `, team ${privateRoute.team + 1}`}`);
    }
    if (isNitroSocket) console.log(`[nc-local-4v4] ${text} → ${finalUrl}`);
    return protocols === undefined ? new NativeWebSocket(finalUrl) : new NativeWebSocket(finalUrl, protocols);
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
            if (position && playerSized &&
                (position.x < -20 || position.x > 120 || position.y < -20 || position.y > 80)) {
              hideForThisFrame(child);
              // The closed client constructs the scene in exact pairs:
              // player[slot], marker[slot], player[slot + 1], marker[slot + 1].
              // Hide the immediate sibling instead of guessing from textures;
              // skins can replace textures and made the old red-marker check
              // unreliable. Only a body-driven player at the impossible spare
              // coordinates reaches this branch, so real-player arrows remain.
              hideForThisFrame(children[index + 1]);
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
    const installReconnectButton = () => {
      const panel = document.getElementById("connection-lost");
      if (!panel || document.getElementById("nc-local-4v4-reconnect")) return;
      const button = document.createElement("button");
      button.id = "nc-local-4v4-reconnect";
      button.type = "button";
      button.className = "button";
      button.textContent = "Reconnect";
      button.title = "Try to rejoin your previous public match within 60 seconds";
      Object.assign(button.style, { display: "block", margin: "18px auto 0", padding: "10px 24px" });
      button.addEventListener("click", () => {
        button.disabled = true;
        button.textContent = "Reconnecting...";
        try {
          panel.style.display = "none";
          win.nitroclash.backToHomepage();
          setTimeout(() => {
            win.nitroclash.selectMode(4);
            win.nitroclash.clickPlay();
            button.disabled = false;
            button.textContent = "Reconnect";
          }, 100);
        } catch (error) {
          button.disabled = false;
          button.textContent = "Reconnect";
          console.warn("[nc-local-4v4] reconnect failed", error);
        }
      });
      panel.appendChild(button);
    };
    const relabel = () => {
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
      installReconnectButton();
    };
    relabel();
    if (!win.__nc4v4RelabelTimer) win.__nc4v4RelabelTimer = setInterval(relabel, 500);
    if (document.getElementById("nc-local-4v4-badge")) return true;
    const badge = document.createElement("div");
    badge.id = "nc-local-4v4-badge";
    badge.textContent = "HOSTED 4v4 v3.3.1";
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
