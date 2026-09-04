// ==UserScript==
// @name         NitroClash — Hosted 4v4
// @namespace    nc-local-4v4
// @version      3.14.3
// @description  Connects NitroClash game sockets to the hosted 4v4 server
// @homepageURL  https://github.com/lemonelemone/4v4
// @updateURL    https://raw.githubusercontent.com/lemonelemone/4v4/main/nitroclash-hosted-4v4.user.js
// @downloadURL  https://raw.githubusercontent.com/lemonelemone/4v4/main/nitroclash-hosted-4v4.user.js
// @match        *://nitroclash.io/*
// @match        *://www.nitroclash.io/*
// @grant        unsafeWindow
// @run-at       document-start
// @noframes
// ==/UserScript==

(function () {
  "use strict";
  const win = unsafeWindow;
  if (win.top !== win.self) return;
  const initialUrl = new URL(win.location.href);
  let hostedMode = initialUrl.searchParams.get("ncMode") !== "official";
  let selectedMode = hostedMode ? 4 : Number(initialUrl.searchParams.get("ncGameMode") ?? 4);
  if (!Number.isInteger(selectedMode) || selectedMode < 0 || selectedMode > 5) selectedMode = 4;
  const NativeWebSocket = win.WebSocket;
  const NativeXMLHttpRequest = win.XMLHttpRequest;
  const nativeXhrOpen = NativeXMLHttpRequest.prototype.open;
  let partySocket = null;
  let partyIsHost = true;
  let partyRegion = null;
  let hostedMatchActive = false;
  let preferredHostedRegion = "NC4EU";
  let preferredOfficialRegion = "EU1";
  let stockSelectMode = null;
  function changeNetworkMode(official, mode = 4) {
    if (partySocket?.readyState === 1 && !partyIsHost) return;
    if (document.getElementById("play-button")?.disabled) return;
    hostedMode = !official;
    hostedMatchActive = false;
    selectedMode = mode;
    partyRegion = null;
    // The stock lobby sends its current region with mode changes. Select the
    // right region BEFORE calling it; its roster echo remains authoritative.
    const select = document.getElementById("server");
    if (select) {
      const code = hostedMode ? preferredHostedRegion : preferredOfficialRegion;
      if (![...select.options].some(option => option.value === code)) {
        const option = document.createElement("option");
        option.value = code;
        option.textContent = serverChoices[code]?.label || code;
        select.appendChild(option);
      }
      select.value = code;
    }
    (stockSelectMode || win.nitroclash?.selectMode)?.call(win.nitroclash, mode);
    refreshModeControls();
  }
  document.addEventListener?.("click", (event) => {
    const button = event.target.closest?.('[id^="gamemode-"]');
    if (!button) return;
    const mode = Number(button.id.replace("gamemode-", ""));
    if (!Number.isInteger(mode) || mode < 0 || mode > 5) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    changeNetworkMode(true, mode);
  }, true);
  const defaultServerCode = "NC4EU";
  const serverChoices = Object.freeze({
    NC4EU: Object.freeze({
      label: "Europe",
      fakeUri: "nc-europe.nitroclash.io:8003",
      url: "wss://nitroclashio.duckdns.org",
    }),
    NC4OLD: Object.freeze({
      label: "Europe 2",
      fakeUri: "nc-old.nitroclash.io:8003",
      url: "wss://fourv4-s2fb.onrender.com",
    }),
  });
  const serverListResponse = Object.fromEntries(Object.entries(serverChoices).map(([code, choice]) => [
    code,
    { uri: choice.fakeUri, p0: 0, p1: 0, p2: 0, p3: 0, p4: 0, p5: 0 },
  ]));
  const selectedServerCode = () => {
    const code = String(document.getElementById("server")?.value || "");
    return serverChoices[code] ? code : preferredHostedRegion;
  };
  const serverCodeForSocketUrl = (url) => {
    try {
      const hostname = new URL(String(url)).hostname.toLowerCase();
      const match = Object.entries(serverChoices).find(([, choice]) =>
        choice.fakeUri.split(":", 1)[0].toLowerCase() === hostname);
      if (match) return match[0];
    } catch (_) {}
    return null;
  };
  const reconnectStorageName = "nc4v4-reconnect-session";
  let reconnectRequested = false;
  let spectateRequested = false;
  let inGameSpectateRequested = false;
  let launchingInGameSpectate = false;
  const measuredServerPings = new Map();
  const measuredServerPlayers = new Map();
  let nextPingRefresh = 0;

  function refreshMeasuredPings() {
    const home = document.getElementById("homepage");
    if (!home || home.style.display === "none" || (win.getComputedStyle && win.getComputedStyle(home).display === "none") || Date.now() < nextPingRefresh) return;
    nextPingRefresh = Date.now() + 15000;
    for (const [code, choice] of Object.entries(serverChoices)) {
      const samples = [];
      let socket, sentAt = 0, finished = false;
      const now = () => win.performance?.now?.() ?? Date.now();
      const finish = value => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        measuredServerPings.set(code, value);
        if(value===null)measuredServerPlayers.set(code,null);
        try { socket?.close(); } catch (_) {}
        refreshModeControls();
      };
      const timeout = setTimeout(() => finish(null), 8000);
      const send = () => { if (!finished && socket.readyState === 1) { sentAt = now(); socket.send(new Uint8Array([99])); } };
      try {
        socket = new NativeWebSocket(choice.url);
        socket.binaryType = "arraybuffer";
        socket.addEventListener("open", send);
        socket.addEventListener("message", ({ data }) => {
          const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null;
          if (finished || bytes?.[0] !== 99) return;
          measuredServerPlayers.set(code,bytes.length>=5 ? new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(1) : null);
          samples.push(Math.max(1, now() - sentAt));
          if (samples.length === 3) finish(Math.round(samples.sort((a,b) => a-b)[1]));
          else setTimeout(send, 50);
        });
        socket.addEventListener("error", () => finish(null));
        socket.addEventListener("close", () => { if (!finished) finish(null); });
      } catch (_) { finish(null); }
    }
  }
  let spectatorChatSocket = null;
  let spectatorChatSupported = false;
  let spectatorChatWatching = false;
  let observerMovement = false;
  let observerMouseSupported=false, observerPointer=null, observerSprite=null, observerRenderer=null, observerSlot=-1;
  let observerKeys = 0;
  let controlBodyCapture = null;
  let chatPending = false;
  let consumedChatKey = null;
  let chatRows = [];
  let chatFadeTimer = null;
  let sentChatText = "";
  let chatConfirmTimer = null;
  const setChatStatus = text => { const el = document.getElementById("nc-spectator-chat-status"); if (el) el.textContent = text; };
  function sendSpectatorMessage(text) {
    const message = String(text || "").trim().slice(0,255);
    if (!message || chatPending) return;
    if (!spectatorChatEnabled || !spectatorChatSupported || spectatorChatSocket?.readyState !== 1) {
      setChatStatus("Chat unavailable: enable spectator chat and check the server version."); return;
    }
    const packet = new Uint8Array(3 + message.length * 2);
    packet[0]=26; packet[1]=1; packet[2]=message.length;
    const view=new DataView(packet.buffer);
    for(let i=0;i<message.length;i++)view.setUint16(3+i*2,message.charCodeAt(i));
    sentChatText = message;
    chatPending=true;
    spectatorChatSocket.send(packet);
    setChatStatus("Sending…");
    clearTimeout(chatConfirmTimer);
    chatConfirmTimer=setTimeout(()=>{chatPending=false;setChatStatus("No confirmation received. Your text is kept; press Enter to retry.");},4000);
  }
  function confirmSpectatorMessage() {
    if (!chatPending) return;
    chatPending=false; clearTimeout(chatConfirmTimer);
    const input=document.getElementById("chat-input");
    if(input && input.value.trim().slice(0,255)===sentChatText){input.value="";input.blur();}
    setChatStatus("Sent");
  }
  function sendObserverKeys() {
    if(!observerMovement || spectatorChatSocket?.readyState!==1)return;
    if(observerMouseSupported && observerPointer && !observerKeys && observerSprite && observerRenderer) {
      const rect=observerRenderer.view.getBoundingClientRect(),pos=observerSprite.getGlobalPosition();
      const dx=observerPointer.x-rect.left-pos.x*rect.width/(observerRenderer.width/observerRenderer.resolution);
      const dy=observerPointer.y-rect.top-pos.y*rect.height/(observerRenderer.height/observerRenderer.resolution);
      const packet=new Uint8Array(10),view=new DataView(packet.buffer);packet[0]=27;packet[1]=32;
      view.setFloat32(2,Math.atan2(dy,dx));view.setFloat32(6,Math.min(1,Math.max(0,(Math.hypot(dx,dy)-8)/40)));
      spectatorChatSocket.send(packet);return;
    }
    spectatorChatSocket.send(new Uint8Array([27,observerKeys]));
  }
  win.addEventListener("mousemove",event=>{
    if(!observerMovement || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || ""))return;
    observerPointer={x:event.clientX,y:event.clientY};
  },true);
  function sendMatchChat(text) {
    if(spectatorChatWatching){sendSpectatorMessage(text);return;}
    const message=String(text).trim().slice(0,255);
    if(message && spectatorChatSocket?.readyState===1) {
      const packet=new Uint8Array(2+message.length*2),view=new DataView(packet.buffer);
      packet[0]=4;packet[1]=message.length;
      for(let i=0;i<message.length;i++)view.setUint16(2+i*2,message.charCodeAt(i));
      spectatorChatSocket.send(packet);
    }
    const input=document.getElementById("chat-input");if(input){input.value="";input.blur();}
  }
  // Chat owns game shortcuts and pointer controls until it is sent or cancelled.
  for(const type of ["pointerdown","pointerup","mousedown","mouseup","mousemove","click","wheel"])win.addEventListener(type,event=>{
    if(spectatorChatSocket?.readyState!==1 || document.activeElement?.id!=="chat-input")return;
    event.stopImmediatePropagation();
    if(event.target?.id!=="chat-input" || type==="wheel")event.preventDefault();
  },{capture:true,passive:false});
  // Capture before the game's keyboard handlers, preserving normal text input.
  for(const type of ["keydown","keyup","keypress"]) win.addEventListener(type,event=>{
    if(consumedChatKey===event.key) {
      event.preventDefault();event.stopImmediatePropagation();
      if(type==="keyup")consumedChatKey=null;
      return;
    }
    if(spectatorChatSocket?.readyState===1) {
      const input=document.getElementById("chat-input");
      const typing=/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName || "") || event.target?.isContentEditable;
      if(event.target===input || document.activeElement===input) {
        event.stopImmediatePropagation();
        if(event.key==="Tab")event.preventDefault();
        if(event.key==="Enter") {
          event.preventDefault();
          if(type==="keydown" && !event.repeat){
            consumedChatKey="Enter";
            if(input.value.trim())sendMatchChat(input.value);
            else input.blur();
          }
        } else if(event.key==="Escape") {
          event.preventDefault();consumedChatKey="Escape";input.value="";input.blur();
          setChatStatus("Chat cancelled · T to chat");
        }
        else if(type==="keydown" && event.defaultPrevented && event.key?.length===1 && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing) {
          // A previously registered game/extension handler may cancel typing.
          // Recover only cancelled printable input, preserving native editing/IME.
          input.setRangeText(event.key,input.selectionStart,input.selectionEnd,"end");
          input.dispatchEvent(new Event("input",{bubbles:true}));
        }
        return;
      }
      if(!typing && (event.key?.toLowerCase()==="t" || event.key==="Enter")) {
        event.preventDefault();event.stopImmediatePropagation();
        if(type==="keyup" && input) {
          input.disabled=false;input.readOnly=false;
          const block=document.getElementById("chat-block");if(block)block.style.display="block";
          input.focus();
          const history=document.getElementById("chat-history");
          if(history){history.style.display="block";history.style.opacity="1";}
          if(!spectatorChatEnabled)setChatStatus("Spectator chat is off. Enable it on the homepage.");
          else if(!spectatorChatSupported)setChatStatus("Spectator chat needs the updated server.");
        }
        return;
      }
    }
    if(!observerMovement || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName || "") || event.target?.isContentEditable) return;
    const bit=({w:1,ArrowUp:1,s:2,ArrowDown:2,a:4,ArrowLeft:4,d:8,ArrowRight:8,Shift:16})[event.key?.length===1?event.key.toLowerCase():event.key];
    if(!bit)return;
    observerPointer=null;
    event.preventDefault();event.stopImmediatePropagation();
    if(type==="keydown")observerKeys|=bit;
    if(type==="keyup")observerKeys&=~bit;
    sendObserverKeys();
  },true);
  win.addEventListener("blur",()=>{observerKeys=0;observerPointer=null;sendObserverKeys();});
  document.addEventListener?.("focusin",event=>{if(/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName || "")){observerKeys=0;observerPointer=null;sendObserverKeys();}});
  setInterval(sendObserverKeys,50);
  function installObserverSensors() {
    const prototype=win.planck?.Body?.prototype;
    if(!prototype?.setTransform || prototype.setTransform.__ncObserverSensors)return;
    const original=prototype.setTransform;
    const transform=function(...args){
      if(controlBodyCapture && controlBodyCapture.index<10) {
        const slot=controlBodyCapture.index++;
        if(slot>=8)for(let f=this.getFixtureList();f;f=f.getNext())f.setSensor(true);
      }
      return original.apply(this,args);
    };
    transform.__ncObserverSensors=true;prototype.setTransform=transform;
  }
  let spectatorChatEnabled = true;
  try { spectatorChatEnabled = win.localStorage.getItem("nc4v4-spectator-chat") !== "off"; } catch (_) {}

  function renderMatchChat() {
    const history=document.getElementById("chat-history");
    if(!history)return;
    history.replaceChildren(...chatRows.map(row=>row.cloneNode(true)));
    history.style.display="block";history.style.opacity="1";
    clearTimeout(chatFadeTimer);
    chatFadeTimer=setTimeout(()=>{if(document.activeElement?.id!=="chat-input")history.style.display="none";},10000);
  }
  function appendMatchChat(row) {
    chatRows.push(row.cloneNode(true));
    if(chatRows.length>8)chatRows.shift();
    renderMatchChat();
  }
  function refreshSpectatorChat() {
    const status=document.getElementById("nc-spectator-chat-status");
    if(status)status.style.display=spectatorChatWatching && spectatorChatSocket?.readyState===1 ? "block" : "none";
  }

  function subscribeSpectatorChat() {
    if (spectatorChatSupported && spectatorChatSocket?.readyState === 1)
      spectatorChatSocket.send(new Uint8Array([26, 0, spectatorChatEnabled ? 1 : 0]));
    refreshSpectatorChat();
  }

  function installSpectatorChat() {
    const home = document.getElementById("homepage-loaded");
    if (home && !document.getElementById("nc-spectator-chat-toggle")) {
      const label = document.createElement("label");
      label.style.cssText = "display:block;margin:8px;color:#a7f3d0;font:14px Arial";
      const toggle = document.createElement("input");
      toggle.id = "nc-spectator-chat-toggle";
      toggle.type = "checkbox";
      toggle.checked = spectatorChatEnabled;
      toggle.addEventListener("change", () => {
        spectatorChatEnabled = toggle.checked;
        try { win.localStorage.setItem("nc4v4-spectator-chat", spectatorChatEnabled ? "on" : "off"); } catch (_) {}
        chatRows=chatRows.filter(row=>!row.classList.contains("nc-spectator-message"));
        if(spectatorChatSocket?.readyState===1)renderMatchChat();
        subscribeSpectatorChat();
      });
      label.appendChild(toggle);
      const caption = document.createElement("span");
      caption.textContent = " Spectator chat (4v4)";
      label.appendChild(caption);
      home.appendChild(label);
    }
    const chat=document.getElementById("chat-block");
    if(!chat || document.getElementById("nc-spectator-chat-status"))return;
    const status=document.createElement("div");
    status.id="nc-spectator-chat-status";
    status.style.cssText="display:none;font:11px Arial;color:#a7f3d0;margin-top:3px;pointer-events:none";
    status.textContent="Press T to chat with players";
    chat.appendChild(status);
    for(const type of ["mousedown","mouseup","click"])win.addEventListener(type,event=>{
      if(spectatorChatWatching && spectatorChatSocket?.readyState===1 && event.target?.id==="chat-input")event.stopImmediatePropagation();
    },true);
  }

  function receiveSpectatorChat(bytes) {
    if(bytes[1]===4){confirmSpectatorMessage();return;}
    if(bytes[1]===3){chatPending=false;clearTimeout(chatConfirmTimer);setChatStatus("Please wait one second, then press Enter again.");return;}
    if (bytes[1] === 0) {
      spectatorChatSupported = true;
      setChatStatus((observerMovement ? "Move: mouse or WASD/arrows · T: chat" : "Press T to chat with players · Enter to send"));
      chatRows=[];
      subscribeSpectatorChat();
      return;
    }
    if (bytes[1] !== 1 || !spectatorChatEnabled) return;
    let offset = 2;
    const read = () => {
      const length = bytes[offset++];
      if (length === undefined || offset + length * 2 > bytes.length) throw new Error("Invalid chat packet");
      let value = "";
      for (let i = 0; i < length; i++, offset += 2) value += String.fromCharCode(bytes[offset] * 256 + bytes[offset + 1]);
      return value;
    };
    const name = read(), message = read();
    if(name===String(document.getElementById("username")?.value || "").slice(0,12))confirmSpectatorMessage();

    const row = document.createElement("div"), label = document.createElement("strong"), body = document.createElement("span");
    row.className="nc-spectator-message";
    label.style.color = "#6ee7a0";
    label.textContent = name + " [Spectator]: ";
    body.textContent = message;
    row.appendChild(label); row.appendChild(body); appendMatchChat(row);
  }
  let pendingGameSocketIntent = null;
  let connectionAttemptActive = false;
  let pendingPartyRoute = null;
  let pendingPartyServer = null;
  const captureGameSocketIntent = () => {
    pendingGameSocketIntent = inGameSpectateRequested ? "spectate-ingame" : spectateRequested
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
      // Migrate reconnect records created before the hosted regions were namespaced.
      if (session.serverCode === "EU1") session.serverCode = "NC4EU";
      if (session.serverCode === "USE1") session.serverCode = "NC4OLD";
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
  // Keep the original region addresses and player counts alongside separate
  // hosted aliases. Never substitute a hosted endpoint for an official region.
  const officialServersReady = new Promise(resolve => {
    const xhr = new NativeXMLHttpRequest();
    const finish = () => {
      try {
        if (xhr.status === 200) Object.assign(serverListResponse, JSON.parse(xhr.responseText));
      } catch (_) {}
      resolve();
    };
    xhr.addEventListener("load", finish);
    xhr.addEventListener("error", () => resolve());
    xhr.addEventListener("timeout", () => resolve());
    xhr.timeout = 8000;
    nativeXhrOpen.call(xhr, "GET", "https://s.nitroclash.io/servers", true);
    xhr.send();
  });
  function isHostedReservation(parsed) {
    return parsed.searchParams.get("m") === "4" &&
      (hostedMode || reconnectRequested);
  }
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
        parsed.searchParams.has("r") && isHostedReservation(parsed);
      if (serverList || reservation) {
        const requestedCode = parsed.searchParams.get("r");
        this._fake = { kind: serverList ? "servers" : "reservation", url: text, async: async !== false,
          code: serverChoices[requestedCode] ? requestedCode : selectedServerCode() };
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
          : `${serverChoices[this._fake.code].fakeUri} ${reservationKey}`;
        this._response = this._responseType === "json" ? JSON.parse(this._responseText) : this._responseText;
        this._emit("readystatechange");
        this._emit("load");
        this._emit("loadend");
        console.log(`[nc-local-4v4] supplied local ${this._fake.kind} response`);
      };
      if (this._fake.kind === "servers") {
        Promise.all([officialServersReady, gameServerReady]).then(finish, finish);
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
  // The original client still requests HTTP matchmaking on an HTTPS page.
  // Upgrade the transport without changing original regions or reservations.
  NativeXMLHttpRequest.prototype.open = function (method, url, ...rest) {
    let target = url;
    try {
      const parsed = new URL(String(url), win.location.href);
      if (parsed.hostname === "s.nitroclash.io" && parsed.protocol === "http:") {
        parsed.protocol = "https:";
        target = parsed.href;
      }
    } catch (_) {}
    return nativeXhrOpen.call(this, method, target, ...rest);
  };
  function trackPartySocket(socket) {
    partySocket = socket;
    partyIsHost = true;
    partyRegion = null;
    let name = "Player", code = "", rosterRoute = null, generation = 0, started = false;
    socket.addEventListener("close", () => {
      if (partySocket === socket) { partySocket = null; partyRegion = null; partyIsHost = true; }
    });
    const bytesOf = (data) => data instanceof ArrayBuffer ? new Uint8Array(data) :
      ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null;
    const textAt = (bytes, offset) => {
      const length = bytes[offset];
      if (length === undefined || offset + 1 + length * 2 > bytes.length) throw new Error("Invalid party text");
      let result = "";
      for (let i = 0; i < length; i++) result += String.fromCharCode(bytes[offset + 1 + i * 2] * 256 + bytes[offset + 2 + i * 2]);
      return result;
    };
    const send = socket.send;
    socket.send = function (data) {
      try {
        const bytes = bytesOf(data);
        if (bytes?.[0] === 2) name = textAt(bytes, 1) || "Player";
        if (bytes?.[0] === 1) code = textAt(bytes, 1).toUpperCase();
        if (bytes?.[0] === 4) {
          // Stock latency updates may propose their fastest original region.
          // Keep the explicitly selected network, including during party creation.
          const requested = textAt(bytes, 2);
          if (hostedMode && serverChoices[requested]) preferredHostedRegion = requested;
          if (!hostedMode && requested && !serverChoices[requested]) preferredOfficialRegion = requested;
          const region = hostedMode ? preferredHostedRegion : preferredOfficialRegion;
          const packet = new Uint8Array(4 + region.length * 2);
          packet[0] = 4;
          packet[1] = hostedMode ? 4 : bytes[1];
          packet[2] = region.length;
          for (let i = 0; i < region.length; i++)
            new DataView(packet.buffer).setUint16(3 + i * 2, region.charCodeAt(i));
          packet[packet.length - 1] = bytes[bytes.length - 1];
          data = packet.buffer;
        }
      } catch (_) {}
      return send.call(this, data);
    };
    socket.addEventListener("message", ({ data }) => {
      try {
        const bytes = bytesOf(data);
        if (bytes?.[0] === 1) {
          let offset = 2;
          const matches = [];
          let everyoneReady = bytes[1] > 0;
          for (let i = 0; i < bytes[1]; i++) {
            everyoneReady = everyoneReady && bytes[offset + 2] === 1;
            const player = textAt(bytes, offset + 3) || "Player";
            if (player === name) matches.push(bytes[offset + 1]);
            offset += 4 + bytes[offset + 3] * 2;
          }
          rosterRoute = /^[A-HJ-NP-Z0-9]{6}$/.test(code) ? {
            partyCode: code,
            team: matches.length === 1 && (matches[0] === 0 || matches[0] === 1) ? matches[0] : null,
          } : null;
          const revision = ++generation;
          if (offset + 3 < bytes.length) {
            const mode = bytes[offset];
            const region = textAt(bytes, offset + 3);
            partyIsHost = bytes[offset + 2] === 1;
            if (mode !== 200 && region) {
              selectedMode = mode;
              hostedMode = mode === 4 && !!serverChoices[region];
              if (!hostedMode) hostedMatchActive = false;
              partyRegion = region;
              if (hostedMode) preferredHostedRegion = region;
              else preferredOfficialRegion = region;
              // Run after the stock handler has applied the authoritative mode.
              setTimeout(refreshModeControls, 0);
              if (hostedMode && everyoneReady && !started) {
                // The official lobby relays our region tag and ready flags,
                // but cannot allocate hosted arenas. Start only after all
                // members are ready, on the shared party-code arena.
                setTimeout(() => {
                  if (started || revision !== generation || socket.readyState !== 1) return;
                  started = true;
                  const uri = serverChoices[region].fakeUri;
                  const packet = new Uint8Array(6 + uri.length * 2);
                  packet[0] = 3;
                  new DataView(packet.buffer).setInt32(1, reservationKey);
                  packet[5] = uri.length;
                  for (let i = 0; i < uri.length; i++)
                    new DataView(packet.buffer).setUint16(6 + i * 2, uri.charCodeAt(i));
                  socket.dispatchEvent(new win.MessageEvent("message", { data: packet.buffer }));
                }, 0);
              }
            }
          }
        } else if (bytes?.[0] === 3) {
          // This listener runs before the stock client clears the party hash.
          pendingPartyRoute = hostedMode ? (rosterRoute || currentPrivatePartyRoute()) : null;
          pendingPartyServer = hostedMode ? (partyRegion || selectedServerCode()) : null;
        }
      } catch (error) { console.warn("[nc4v4] Invalid party update", error); }
    });
    return socket;
  }
  function currentPrivatePartyRoute() {
    const partyCode = String(win.location.hash || "").replace(/^#/, "").toUpperCase();
    if (!/^[A-HJ-NP-Z0-9]{6}$/.test(partyCode)) return null;

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
    if (/\/team\/?(?:\?|$)/.test(new URL(text, win.location.href).pathname)) {
      return trackPartySocket(protocols === undefined ? new NativeWebSocket(url) : new NativeWebSocket(url, protocols));
    }
    const isNitroSocket = /^wss?:\/\/[^/]*nitroclash\.io(?::\d+)?\/\d+\/?$/i.test(text);
    const hostedAlias = serverCodeForSocketUrl(text);
    // Official play, spectate and latency sockets keep their original URLs.
    if (!hostedAlias && !pendingPartyServer) {
      return protocols === undefined ? new NativeWebSocket(url) : new NativeWebSocket(url, protocols);
    }
    const pagePrivateRoute = isNitroSocket ? (pendingPartyRoute ||
      (pendingGameSocketIntent ? currentPrivatePartyRoute() : null)) : null;
    let socketIntent = null;
    if (isNitroSocket && pendingGameSocketIntent) {
      socketIntent = pendingGameSocketIntent;
      pendingGameSocketIntent = null;
    } else if (isNitroSocket && reconnectRequested) {
      socketIntent = "reconnect";
    } else if (isNitroSocket && pagePrivateRoute) {
      // Party starts can open the game socket directly without the public
      // reservation request used by ordinary matchmaking.
      socketIntent = "play";
    }
    const reconnectSocket = socketIntent === "reconnect";
    const inGameSpectatorSocket = socketIntent === "spectate-ingame";
    const spectatorSocket = socketIntent === "spectate-live" || inGameSpectatorSocket;
    const savedReconnect = reconnectSocket ? readReconnectSession() : null;
    const requestedServerCode = pendingPartyServer || (isNitroSocket ? serverCodeForSocketUrl(text) : defaultServerCode);
    const gameServerCode = reconnectSocket && serverChoices[savedReconnect?.serverCode]
      ? savedReconnect.serverCode
      : requestedServerCode;
    const gameServerUrl = serverChoices[gameServerCode].url;
    let finalUrl = isNitroSocket ? gameServerUrl : url;
    const privateRoute = isNitroSocket && !spectatorSocket ? (savedReconnect?.kind === "private" ? savedReconnect : pagePrivateRoute) : null;
    let spectatorFollowPending = false;
    if (spectatorSocket) {
      try {
        const savedCamera = win.localStorage.getItem("cameraFullScreen");
        const fullPitch = savedCamera === "1" ||
          (savedCamera === null && win.localStorage.getItem("initialCameraFullScreen") === "1");
        spectatorFollowPending = !inGameSpectatorSocket && fullPitch;
      } catch (_) {}
    }
    if (privateRoute) {
      if (privateRoute.team !== 0 && privateRoute.team !== 1) {
        const message = "Cannot identify your party team. Use a unique player name, rejoin the party, then try again.";
        win.alert(message);
        throw new Error(message);
      }
      const teamQuery = privateRoute.team === null ? "" : `&team=${privateRoute.team}`;
      finalUrl += `/?private=1&party=${encodeURIComponent(privateRoute.partyCode)}${teamQuery}`;
      console.log(`[nc-local-4v4] private party ${privateRoute.partyCode}${privateRoute.team === null ? "" : `, team ${privateRoute.team + 1}`}`);
    }
    if (spectatorSocket) finalUrl += `${finalUrl.includes("?") ? "&" : "/?"}${inGameSpectatorSocket ? "ingameSpectate" : "spectate"}=1`;
    if (reconnectSocket) finalUrl += `${finalUrl.includes("?") ? "&" : "/?"}reconnect=1`;
    if (isNitroSocket) console.log(`[nc-local-4v4] ${text} → ${finalUrl}`);
    const socket = protocols === undefined ? new NativeWebSocket(finalUrl) : new NativeWebSocket(finalUrl, protocols);
    if (isNitroSocket && socketIntent) {
      hostedMatchActive = true;
      spectatorChatSocket = socket;
      observerMovement=false;observerKeys=0;observerPointer=null;observerSprite=null;observerMouseSupported=false;chatPending=false;clearTimeout(chatConfirmTimer);setChatStatus("");
      spectatorChatWatching = spectatorSocket;
      spectatorChatSupported = false;
      chatRows=[];clearTimeout(chatFadeTimer);
      let playerJoinSent = false;
      let matchEnded = false;
      let reconnectRefreshTimer = null;
      let pendingObserverJoin = null;
      let observerCapabilityTimer = null;
      let observerSupported = false;
      reconnectRequested = false;
      spectateRequested = false;
      inGameSpectateRequested = false;
      connectionAttemptActive = true;
      const nativeSend = socket.send;
      socket.send = function (data) {
        try {
          const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) :
            ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null;
          if(spectatorSocket && bytes?.[0]===4) {
            let text="";for(let i=0;i<(bytes[1]||0) && 3+i*2<bytes.length;i++)text+=String.fromCharCode(bytes[2+i*2]*256+bytes[3+i*2]);
            sendSpectatorMessage(text);return;
          }
          // Server ping sockets send opcode 99. Record reconnect eligibility
          if (inGameSpectatorSocket && (bytes?.[0] === 1 || (bytes?.[0] === 7 && bytes[1] === 1)) && !observerSupported) {
            if (pendingObserverJoin) return;
            pendingObserverJoin = bytes.slice();
            observerCapabilityTimer = setTimeout(() => {
              pendingObserverJoin = null;
              socket.close();
              win.alert("In-game spectate needs the updated 4v4 server. Ordinary Spectate is still available.");
            }, 5000);
            return nativeSend.call(this, new Uint8Array([26, 2]));
          }
          // only when the stock client sends a real player join (opcode 1).
          if (!spectatorSocket && bytes?.[0] === 1) {
            // The stock party start can share a reservation among members.
            // Give each hosted player its persistent, tab-specific identity.
            const packet = bytes.slice();
            new DataView(packet.buffer).setInt32(1, reservationKey);
            data = packet;
            pendingPartyRoute = null;
            pendingPartyServer = null;
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
      socket.addEventListener("message", (event) => {
        const { data } = event;
        try {
          const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) :
            ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null;
          if (bytes?.[0] === 26) {
            event.stopImmediatePropagation?.();
            if (inGameSpectatorSocket && bytes[1] === 2 && pendingObserverJoin) {
              observerSupported = true;
              observerMovement=bytes[2]>=1;observerMouseSupported=bytes[2]>=2;
              if(!observerMouseSupported) {
                clearTimeout(observerCapabilityTimer);pendingObserverJoin=null;
                win.alert("This server needs the latest server.mjs and a restart for mouse-controlled in-game spectators. Please ask the host to update it.");
                socket.close();return;
              }
              clearTimeout(observerCapabilityTimer);
              const join = pendingObserverJoin;
              pendingObserverJoin = null;
              nativeSend.call(socket, join);
              return;
            }
            if (spectatorChatSocket === socket) receiveSpectatorChat(bytes);
            return;
          }
          if (!spectatorSocket && bytes?.[0] === 14) {
            matchEnded = true;
            clearInterval(reconnectRefreshTimer);
            try { win.localStorage.removeItem(reconnectStorageName); } catch (_) {}
          }
          if(bytes?.[0]===13 && spectatorChatSocket===socket) {
            const previousChat=document.getElementById("chat-history")?.innerHTML;
            setTimeout(()=>{
              if(spectatorChatSocket!==socket || document.getElementById("chat-history")?.innerHTML===previousChat)return;
              const row=document.getElementById("chat-history")?.lastElementChild;
              if(row && !row.classList.contains("nc-spectator-message"))appendMatchChat(row);
            });
          }
          if(bytes?.[0]===7) {
            observerSlot=bytes[2];
            chatRows=[];clearTimeout(chatFadeTimer);
            installObserverSensors();
            const capture={index:0};controlBodyCapture=capture;
            setTimeout(()=>{if(controlBodyCapture===capture)controlBodyCapture=null;},0);
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
        clearTimeout(observerCapabilityTimer);
        pendingObserverJoin = null;
        if (spectatorChatSocket === socket) {
          observerMovement=false;observerKeys=0;observerPointer=null;observerSprite=null;observerMouseSupported=false;chatPending=false;clearTimeout(chatConfirmTimer);
          spectatorChatSocket = null;
          spectatorChatSupported = false;
          refreshSpectatorChat();
        }
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
      let observerTexture=null;
      const greenObserver = (sprite,marker) => {
        if(!observerTexture) {
          const canvas=document.createElement("canvas");canvas.width=64;canvas.height=64;
          const ctx=canvas.getContext("2d");ctx.beginPath();ctx.arc(32,32,29,0,Math.PI*2);
          ctx.fillStyle="#43d981";ctx.fill();ctx.lineWidth=4;ctx.strokeStyle="#166b3c";ctx.stroke();
          observerTexture=win.PIXI.Texture.fromCanvas(canvas);
        }
        const width=sprite.width,height=sprite.height;
        sprite.texture=observerTexture;sprite.tint=0xffffff;sprite.width=width;sprite.height=height;
        sprite.__ncObserverSkin=true;
        if(marker){marker.visible=false;marker.renderable=false;}
      };
      const hideSpareSlots = (stage) => {
        if (!stage) return;
        let playerIndex=0;
        const queue = [stage];
        while (queue.length) {
          const node = queue.shift();
          const children = node?.children;
          if (!children?.length) continue;
          // The stock control packet rebuilds ten player Text labels but leaves
          // previous batches attached. Only name labels have animScaleX;
          // remove stale batches, preserving the current labels and other HUD text.
          const labels = children.filter(child => typeof child?.text === "string" && typeof child.animScaleX === "number");
          for (const stale of labels.slice(0, Math.max(0, labels.length - 10))) {
            node.removeChild(stale);
            stale.destroy?.();
          }
          for (let index = 0; index < children.length; index++) {
            const child = children[index];
            const position = child?.lastPhysicsPosition;
            // Match the trainer's body-driven-sprite predicate instead of
            // depending on the player's current skin texture. Players are
            // square and ~1.22 world units wide; the ball is ~2.15.
            const playerSized = typeof child?.width === "number" && typeof child?.height === "number" &&
              Math.abs(child.width - child.height) < 0.1 && child.width < 1.6;
            if (position && playerSized) {
              if(observerMovement && playerIndex===observerSlot)observerSprite=child;
              playerIndex++;
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
                if(playerIndex===9 || playerIndex===10)greenObserver(child,children[index+1]);
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
          if (hostedMatchActive) hideSpareSlots(stage);observerRenderer=this;
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

  function refreshModeControls() {
    const stock = document.getElementById("gamemode-4");
    if (!stock || !win.nitroclash) return;
    if (!stockSelectMode) {
      stockSelectMode = win.nitroclash.selectMode;
      // Also cover the site's mode shortcuts, which call this API directly.
      win.nitroclash.selectMode = mode => changeNetworkMode(true, mode);
    }
    let button = document.getElementById("nc-hosted-mode");
    if (!button) {
      button = document.createElement(stock.tagName || "div");
      button.id = "nc-hosted-mode";
      button.type = "button";
      button.textContent = "4 vs 4";
      button.title = "Hosted 4v4 — Europe / Europe 2";
      button.addEventListener("click", () => changeNetworkMode(false, 4));
      stock.insertAdjacentElement("beforebegin", button);
      button.insertAdjacentText?.("afterend", " ");
    }
    const base = String(stock.className || "").replace(/\bselected\b/g, "").trim();
    button.className = base + (hostedMode ? " selected" : "");
    stock.className = base + (!hostedMode && selectedMode === 4 ? " selected" : "");
    button.disabled = partySocket?.readyState === 1 && !partyIsHost;
    const select = document.getElementById("server");
    if (!select) return;
    let changed = false;
    for (const option of [...select.options]) {
      if (!!serverChoices[option.value] !== hostedMode) {
        option.remove();
        changed = true;
      } else if (serverChoices[option.value]) {
        const ping = measuredServerPings.has(option.value) ? measuredServerPings.get(option.value) : undefined;
        const shownPing = ping === undefined ? "measuring…" : ping === null ? "unavailable" : String(ping);
        const cachedPing = win.jQuery?.(option)?.data?.("ping");
        if (option.dataset.ping !== shownPing || (cachedPing !== undefined && String(cachedPing) !== shownPing)) {
          option.dataset.ping = shownPing;
          win.jQuery?.(option)?.data?.("ping", shownPing);
          changed = true;
        }
        const population=measuredServerPlayers.get(option.value);
        const shownPopulation=population==null ? "?" : String(population);
        if(option.dataset.players!==shownPopulation || String(win.jQuery?.(option)?.data?.("players"))!==shownPopulation) {
          option.dataset.players=shownPopulation;win.jQuery?.(option)?.data?.("players",shownPopulation);changed=true;
        }
        const label = serverChoices[option.value].label + " (" + shownPopulation + ")";
        if (option.textContent !== label) { option.textContent = label; changed = true; }
      }
    }
    // Mode changes rebuild the stock select. Preserve the host's region or the
    // last local choice, never the stock client's fastest opposite-network ping.
    const wanted = partyRegion || (hostedMode ? preferredHostedRegion : preferredOfficialRegion);
    if ([...select.options].some(option => option.value === wanted) && select.value !== wanted) {
      select.value = wanted;
      changed = true;
    }
    if (!select.__ncModeListener) {
      select.__ncModeListener = true;
      const rememberRegion = () => {
        if (serverChoices[select.value]) preferredHostedRegion = select.value;
        else if (select.value) preferredOfficialRegion = select.value;
      };
      select.addEventListener("change", rememberRegion);
      win.jQuery?.(select)?.on?.("selectmenuchange", rememberRegion);
    }
    if (changed) try { win.jQuery?.(select)?.selectmenu?.("refresh"); } catch (_) {}
    // Keep the share URL free from an obsolete official/hosted page preference;
    // the host's live lobby state is what selects the mode now.
    const link = document.getElementById("team-share-link");
    if (link && win.location.hash) link.value = win.location.origin + "/" + win.location.hash;
  }

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
            preferredHostedRegion = readReconnectSession()?.serverCode || defaultServerCode;
            changeNetworkMode(false, 4);
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
      refreshMeasuredPings();
      installSpectatorChat();
      refreshSpectatorChat();
      if (win.nitroclash && !win.__nc4v4InitialModeApplied &&
          document.getElementById("homepage-loaded")?.style.display === "block") {
        win.__nc4v4InitialModeApplied = true;
        if (!partySocket) changeNetworkMode(!hostedMode, selectedMode);
      }
      refreshModeControls();
      if (win.nitroclash && !win.nitroclash.clickPlay?.__nc4v4Wrapped) {
        const originalPlay = win.nitroclash.clickPlay;
        if (typeof originalPlay === "function") {
          const wrappedPlay = function (...args) {
            refreshModeControls();
            spectateRequested = false;
            inGameSpectateRequested = false;
            return originalPlay.apply(this, args);
          };
          wrappedPlay.__nc4v4Wrapped = true;
          win.nitroclash.clickPlay = wrappedPlay;
        }
      }
      const session = readReconnectSession();
      const nativeSpectateButton = document.getElementById("spectate-button");
      if (nativeSpectateButton && !document.getElementById("nc-ingame-spectate")) {
        const button = document.createElement(nativeSpectateButton.tagName || "button");
        button.id = "nc-ingame-spectate";
        button.type = "button";
        button.textContent = "In-game spectate";
        button.title = "Watch from outside the pitch. Two spaces per active public 4v4 match.";
        button.className=nativeSpectateButton.className;
        button.style.cssText="box-sizing:border-box!important;width:auto!important;min-width:0!important;max-width:90vw!important;height:auto!important;min-height:44px!important;padding:12px 20px!important;margin:10px!important;font:600 clamp(14px,2vw,22px)/1.25 Arial!important;white-space:nowrap!important;vertical-align:middle!important;border:1px solid #c2d0d0!important;border-radius:8px!important;background:#879e9b!important;color:white!important;box-shadow:0 4px 0 #627c78!important;cursor:pointer";
        button.addEventListener("click", () => {
          if (!hostedMode || partySocket?.readyState === 1) return;
          reconnectRequested = false;
          launchingInGameSpectate = true;
          try { win.nitroclash.clickSpectate(); } finally { launchingInGameSpectate = false; }
        });
        nativeSpectateButton.insertAdjacentElement("afterend", button);
      }
      const inGameButton = document.getElementById("nc-ingame-spectate");
      if (inGameButton) {
        inGameButton.style.display = hostedMode ? "inline-block" : "none";
        inGameButton.disabled = partySocket?.readyState === 1 || !!document.getElementById("play-button")?.disabled;
      }
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
            refreshModeControls();
            inGameSpectateRequested = launchingInGameSpectate;
            spectateRequested = hostedMode;
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
    badge.textContent = "HOSTED 4v4 v3.14.3";
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
