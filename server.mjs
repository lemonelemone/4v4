import crypto from "node:crypto";
import http from "node:http";
import * as planck from "planck";

const HOST = process.env.NC_HOST || (process.env.RENDER ? "0.0.0.0" : "127.0.0.1");
const PORT = Number(process.env.PORT || process.env.NC_PORT || 8003);
const MATCH_SECONDS = Number(process.env.NC_MATCH_SECONDS || 300);
const PHYSICS_HZ = 60;
const SNAPSHOT_HZ = 30;
const TICK_MS = 1000 / PHYSICS_HZ;
const SNAPSHOT_EVERY_TICKS = PHYSICS_HZ / SNAPSHOT_HZ;
const CELEBRATION_TICKS = PHYSICS_HZ * 3;
const REPLAY_TICKS = PHYSICS_HZ * 5;
const REPLAY_HOLD_TICKS = PHYSICS_HZ * 2;
const REGULATION_TICKS = MATCH_SECONDS * PHYSICS_HZ;
const POSTGAME_MS = Number(process.env.NC_POSTGAME_MS || 30_000);
const RECONNECT_TTL_MS = Number(process.env.NC_RECONNECT_TTL_MS || 60_000);
const CLIENT_SLOTS = 10; // Use the stock 5v5 layout.
const HIDDEN_SLOTS = new Set([8, 9]); // One unused slot per team => 4v4.
const PLAYABLE_SLOTS = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7]);
const PLAYER_RADIUS = 0.6103515625;
const BALL_RADIUS = 0.9765625;
const PLAYER_MAX_SPEED = 10;
const PLAYER_BRAKE_STRENGTH = 0.005;
const PLAYER_SPEED = 0.75;
const GOAL_MIN_Y = 23.4375;
const GOAL_MAX_Y = 32.8125;
const GOAL_CENTRE_Y = (GOAL_MIN_Y + GOAL_MAX_Y) / 2;
const ACTION = Object.freeze({
  GOAL: 0,
  ASSIST: 1,
  SAVE: 2,
  LONG_GOAL: 3,
  OVERTIME_GOAL: 4,
  HAT_TRICK: 5,
  SHOT_ON_GOAL: 6,
  FIRST_TOUCH: 9,
  VICTORY: 10,
});
const ACTION_POINTS = Object.freeze({
  [ACTION.GOAL]: 50,
  [ACTION.ASSIST]: 50,
  [ACTION.SAVE]: 50,
  [ACTION.LONG_GOAL]: 20,
  [ACTION.OVERTIME_GOAL]: 50,
  [ACTION.HAT_TRICK]: 50,
  [ACTION.SHOT_ON_GOAL]: 30,
  [ACTION.FIRST_TOUCH]: 10,
});
const reconnectSessions = new Map();
const NCR_PLAYER_COUNT = CLIENT_SLOTS;
const NCR_BOOST_COUNT = 14;
const KICKOFF_PAD_PAIRS = [
  [{ x: 27.2748, y: 13.5793, angle: 0.5694 }, { x: 72.7252, y: 13.5793, angle: 2.5722 }],
  [{ x: 22.7121, y: 28.125, angle: 0 }, { x: 77.2879, y: 28.125, angle: Math.PI }],
  [{ x: 15.2314, y: 20.4294, angle: 0.2178 }, { x: 84.7686, y: 20.4294, angle: 2.9238 }],
  [{ x: 15.2314, y: 35.8206, angle: -0.2178 }, { x: 84.7686, y: 35.8206, angle: -2.9238 }],
  [{ x: 27.2748, y: 42.6707, angle: -0.5694 }, { x: 72.7252, y: 42.6707, angle: -2.5722 }],
];

function randomKickoffSpawns() {
  const pairs = KICKOFF_PAD_PAIRS.slice();
  for (let index = pairs.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [pairs[index], pairs[other]] = [pairs[other], pairs[index]];
  }
  // Four randomly selected official pad pairs. Every blue position retains
  // its exact mirrored red counterpart, without forcing vertical symmetry.
  return pairs.slice(0, 4).flatMap((pair) => pair);
}
const MAP_BORDERS = [
  [4.345703,23.4375,7.8125,23.4375,8.747321,23.065054,9.35389,22.033329,9.3727455,21.784855,9.375,15.625,9.419886,14.341579,9.554507,13.087652,9.77882,11.872826,10.092774,10.70671,10.496322,9.598909,10.989413,8.559029,11.572,7.5966754,12.244037,6.721461,13.005472,5.942987,13.856259,5.270861,14.796352,4.7146916,15.825697,4.284084,16.944252,3.988645,18.151962,3.8379812,18.762207,3.819908,34.470215,3.9541852,50.3125,3.880943],
  [95.6543,23.4375,92.1875,23.4375,91.252686,23.065052,90.64611,22.033329,90.62726,21.784855,90.625,15.625,90.58011,14.341579,90.44549,13.087652,90.221176,11.872826,89.90722,10.70671,89.50368,9.598909,89.01059,8.559029,88.427986,7.5966754,87.75597,6.721461,86.99453,5.942987,86.14373,5.270861,85.20364,4.7146916,84.17429,4.284084,83.05575,3.988645,81.84804,3.8379812,81.23779,3.819908,65.529785,3.9541852,49.6875,3.880943],
  [4.345703,32.8125,7.8125,32.8125,8.747321,33.18495,9.35389,34.21667,9.3727455,34.465145,9.375,40.625,9.419886,41.90842,9.554507,43.162342,9.77882,44.377174,10.0927725,45.543278,10.49632,46.651093,10.989413,47.690975,11.572,48.65332,12.244035,49.528538,13.005472,50.30701,13.856258,50.979137,14.796349,51.535305,15.825697,51.965916,16.94425,52.261356,18.151962,52.412018,18.762207,52.430096,34.470215,52.29581,50.3125,52.369057],
  [95.6543,32.8125,92.1875,32.8125,91.252686,33.18495,90.64611,34.21667,90.62726,34.465145,90.625,40.625,90.58011,41.90842,90.44549,43.162342,90.221176,44.377174,89.90721,45.543278,89.50368,46.651093,89.01059,47.690975,88.42799,48.65332,87.75596,49.528538,86.99452,50.30701,86.14374,50.979137,85.20364,51.535305,84.1743,51.965916,83.05575,52.261356,81.84804,52.412018,81.23779,52.430096,65.529785,52.29581,49.6875,52.369057],
  [4.375,23.4375,4.375,32.8125],
  [95.50781,23.4375,95.50781,32.8125],
];
const BOOSTS = [
  15.696192, 47.998825, 15.696192, 8.251172, 14.100928, 28.125,
  35.927097, 34.41909, 35.927097, 21.83091, 50, 50.166016,
  50, 34.41909, 50, 21.83091, 50, 6.0839844, 64.0729, 34.41909,
  64.0729, 21.83091, 84.30381, 47.998825, 85.85269, 28.125,
  84.30381, 8.251172,
];

function wsFrame(payload, opcode = 2) {
  const length = payload.length;
  let header;
  if (length < 126) {
    header = Buffer.from([0x80 | opcode, length]);
  } else if (length <= 0xffff) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  return Buffer.concat([header, payload]);
}

function readFrames(connection, chunk) {
  connection.pending = Buffer.concat([connection.pending, chunk]);
  const frames = [];
  while (connection.pending.length >= 2) {
    const first = connection.pending[0];
    const second = connection.pending[1];
    let length = second & 0x7f;
    let offset = 2;
    if (length === 126) {
      if (connection.pending.length < 4) break;
      length = connection.pending.readUInt16BE(2);
      offset = 4;
    } else if (length === 127) {
      if (connection.pending.length < 10) break;
      const big = connection.pending.readBigUInt64BE(2);
      if (big > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Frame too large");
      length = Number(big);
      offset = 10;
    }
    const masked = Boolean(second & 0x80);
    const maskBytes = masked ? 4 : 0;
    if (connection.pending.length < offset + maskBytes + length) break;
    const mask = masked ? connection.pending.subarray(offset, offset + 4) : null;
    offset += maskBytes;
    const payload = Buffer.from(connection.pending.subarray(offset, offset + length));
    if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
    frames.push({ opcode: first & 0x0f, payload });
    connection.pending = connection.pending.subarray(offset + length);
  }
  return frames;
}

function putString(buffer, offset, value) {
  const text = value.slice(0, 255);
  buffer[offset++] = text.length;
  for (let i = 0; i < text.length; i++) {
    buffer.writeUInt16BE(text.charCodeAt(i), offset);
    offset += 2;
  }
  return offset;
}

function readString(buffer, offset) {
  const length = buffer[offset++] ?? 0;
  let value = "";
  for (let i = 0; i < length && offset + 1 < buffer.length; i++) {
    value += String.fromCharCode(buffer.readUInt16BE(offset));
    offset += 2;
  }
  return { value, offset };
}

function makeWorld() {
  const physics = new planck.World();
  const boundary = physics.createBody();
  for (const points of MAP_BORDERS) {
    const vertices = [];
    for (let i = 0; i < points.length; i += 2) vertices.push(new planck.Vec2(points[i], points[i + 1]));
    boundary.createFixture(new planck.Chain(vertices), { restitution: 0.2, friction: 0.6 });
  }
  const kickoffSpawns = randomKickoffSpawns();
  const players = Array.from({ length: CLIENT_SLOTS }, (_, slot) => {
    const hidden = HIDDEN_SLOTS.has(slot);
    const spawn = hidden ? { x: -100, y: -100, angle: slot % 2 === 0 ? 0 : Math.PI } : kickoffSpawns[slot];
    const { x, y: py, angle } = spawn;
    const body = hidden ? null : physics.createDynamicBody({ position: new planck.Vec2(x, py), angle, angularDamping: 0.5 });
    if (body) {
      body.setUserData({ type: "player", slot });
      body.createFixture(new planck.Circle(PLAYER_RADIUS), { density: 0.05, friction: 0.4, restitution: 0.8 });
    }
    return {
    body,
    x, y: py, angle,
    energy: 100,
    aim: angle,
    flags: 0,
    name: HIDDEN_SLOTS.has(slot) ? "" : `Local ${slot + 1}`,
  }; });
  const ballBody = physics.createDynamicBody({ position: new planck.Vec2(50, 28.125), linearDamping: 0.4, angularDamping: 0.2 });
  ballBody.setUserData({ type: "ball" });
  ballBody.createFixture(new planck.Circle(BALL_RADIUS), { density: 0.005 / 1.2, friction: 0.4, restitution: 1 });
  const touches = [];
  const pendingTouches = [];
  physics.on("begin-contact", (contact) => {
    const first = contact.getFixtureA().getBody().getUserData();
    const second = contact.getFixtureB().getBody().getUserData();
    const player = first?.type === "player" && second?.type === "ball" ? first
      : second?.type === "player" && first?.type === "ball" ? second : null;
    if (!player) return;
    const position = ballBody.getPosition();
    const touch = { slot: player.slot, time: Date.now(), turn: worldReference?.turn || 0, x: position.x, y: position.y };
    touches.push(touch);
    pendingTouches.push(touch);
    if (touches.length > 32) touches.shift();
  });
  let worldReference = null;
  const world = {
    turn: 0,
    state: 2,
    physics,
    players,
    ball: { body: ballBody },
    touches,
    pendingTouches,
    firstTouchAwarded: false,
    activeShot: null,
    awardCooldowns: new Map(),
    replayEvents: [],
    scores: [0, 0],
    stats: Array.from({ length: CLIENT_SLOTS }, () => ({ goals: 0, assists: 0, saves: 0, points: 0 })),
    overtime: false,
    regulationFinished: false,
    boosts: Array.from({ length: BOOSTS.length / 2 }, (_, index) => ({
      x: BOOSTS[index * 2], y: BOOSTS[index * 2 + 1], active: true, respawnAt: 0,
    })),
  };
  worldReference = world;
  return world;
}

function bodyState(entity) {
  if (!entity.body) return { x: entity.x, y: entity.y, angle: entity.angle, vx: 0, vy: 0, angularVelocity: 0 };
  const position = entity.body.getPosition();
  const velocity = entity.body.getLinearVelocity();
  return {
    x: position.x, y: position.y, angle: entity.body.getAngle(),
    vx: velocity.x, vy: velocity.y, angularVelocity: entity.body.getAngularVelocity(),
  };
}

function mapPacket() {
  const buffer = Buffer.alloc(11 + BOOSTS.length * 4);
  buffer[0] = 2;
  buffer.writeInt32BE(1, 1);
  buffer.writeInt32BE(MATCH_SECONDS, 5);
  buffer[9] = BOOSTS.length / 2;
  BOOSTS.forEach((value, index) => buffer.writeFloatBE(value, 10 + index * 4));
  buffer[10 + BOOSTS.length * 4] = 4; // Stock 5v5 mode; two slots are hidden.
  return buffer;
}

function controlPacket(world, controlledSlot, username) {
  world.players[controlledSlot].name = username || "Player";
  const namesLength = world.players.reduce((sum, player) => sum + 1 + player.name.length * 2, 0);
  const buffer = Buffer.alloc(15 + CLIENT_SLOTS * 29 + 24 + namesLength + BOOSTS.length / 2);
  buffer[0] = 7;
  buffer[1] = 1;
  buffer[2] = controlledSlot;
  buffer.writeInt32BE(world.turn, 3);
  buffer.writeInt32BE(0, 7);
  buffer.writeInt16BE(world.scores[0], 11);
  buffer.writeInt16BE(world.scores[1], 13);
  let offset = 15;
  for (const player of world.players) {
    const state = bodyState(player);
    for (const value of [state.x, state.y, state.angle, state.vx, state.vy, state.angularVelocity, player.aim]) {
      buffer.writeFloatBE(value, offset);
      offset += 4;
    }
    buffer[offset++] = player.flags;
  }
  const ball = bodyState(world.ball);
  for (const value of [ball.x, ball.y, ball.angle, ball.vx, ball.vy, ball.angularVelocity]) {
    buffer.writeFloatBE(value, offset);
    offset += 4;
  }
  for (const player of world.players) offset = putString(buffer, offset, player.name);
  for (let i = 0; i < BOOSTS.length / 2; i++) buffer[offset++] = 1;
  return buffer;
}

function startPacket(world, countdownMs = 4000) {
  const buffer = Buffer.alloc(9 + CLIENT_SLOTS * 12 + 12);
  buffer[0] = 9;
  buffer.writeInt32BE(world.turn, 1);
  buffer.writeInt32BE(countdownMs, 5);
  let offset = 9;
  for (const player of world.players) {
    const state = bodyState(player);
    buffer.writeFloatBE(state.x, offset);
    buffer.writeFloatBE(state.y, offset + 4);
    buffer.writeFloatBE(state.angle, offset + 8);
    offset += 12;
  }
  const ball = bodyState(world.ball);
  buffer.writeFloatBE(ball.x, offset);
  buffer.writeFloatBE(ball.y, offset + 4);
  buffer.writeFloatBE(ball.angle, offset + 8);
  return buffer;
}

function statePacket(world) {
  const buffer = Buffer.alloc(6 + CLIENT_SLOTS * 33 + 24);
  buffer[0] = 5;
  buffer[1] = world.state;
  buffer.writeInt32BE(world.turn, 2);
  let offset = 6;
  for (const player of world.players) {
    const state = bodyState(player);
    for (const value of [state.x, state.y, state.angle, state.vx, state.vy, state.angularVelocity, player.energy, player.aim]) {
      buffer.writeFloatBE(value, offset);
      offset += 4;
    }
    buffer[offset++] = player.flags;
  }
  const ball = bodyState(world.ball);
  for (const value of [ball.x, ball.y, ball.angle, ball.vx, ball.vy, ball.angularVelocity]) {
    buffer.writeFloatBE(value, offset);
    offset += 4;
  }
  return buffer;
}

function goalPacket(world, team, scorer, assist, speed) {
  const buffer = Buffer.alloc(16);
  buffer[0] = 6;
  buffer.writeInt32BE(world.turn, 1);
  buffer[5] = team;
  buffer[6] = scorer;
  buffer[7] = assist;
  buffer.writeFloatBE(speed, 8);
  buffer.writeInt32BE(CELEBRATION_TICKS * 1000 / PHYSICS_HZ, 12);
  return buffer;
}

function replaySkipVotePacket(votes) {
  const buffer = Buffer.alloc(5);
  buffer[0] = 24;
  buffer.writeInt32BE(votes, 1);
  return buffer;
}

function actionPacket(slot, type, points) {
  const buffer = Buffer.alloc(5);
  buffer[0] = 15;
  buffer[1] = slot;
  buffer[2] = type;
  buffer.writeInt16BE(points, 3);
  return buffer;
}

function namePacket(slot, name) {
  const text = String(name || "").slice(0, 12);
  const buffer = Buffer.alloc(3 + text.length * 2);
  buffer[0] = 10;
  buffer[1] = slot;
  putString(buffer, 2, text);
  return buffer;
}

function chatPacket(slot, message) {
  const text = String(message || "").slice(0, 255);
  const buffer = Buffer.alloc(3 + text.length * 2);
  buffer[0] = 13;
  buffer[1] = slot;
  putString(buffer, 2, text);
  return buffer;
}

function liveStatsPacket(world, connectedSlots = new Set([0])) {
  const buffer = Buffer.alloc(1 + CLIENT_SLOTS * 8);
  buffer[0] = 18;
  let offset = 1;
  for (let slot = 0; slot < CLIENT_SLOTS; slot++) {
    const stats = world.stats[slot];
    buffer[offset++] = Math.min(255, stats.goals);
    buffer[offset++] = Math.min(255, stats.assists);
    buffer[offset++] = Math.min(255, stats.saves);
    buffer.writeInt16BE(Math.max(-32768, Math.min(32767, stats.points)), offset);
    offset += 2;
    // Connected browser players get a small nonzero value; empty/server-side
    // slots remain zero, matching how the stock scoreboard distinguishes AI.
    buffer.writeInt16BE(connectedSlots.has(slot) ? 1 : 0, offset);
    offset += 2;
    buffer[offset++] = 0; // No account/rank database is used by the local server.
  }
  return buffer;
}

function recordReplayEvent(world, type, slot1 = 255, slot2 = 255, speed = 0, name = "") {
  world.replayEvents.push({ turn: world.turn, type, slot1, slot2, speed, name });
}

function awardPoints(world, slot, type, points = ACTION_POINTS[type] || 0, useCooldown = false) {
  if (slot < 0 || slot >= CLIENT_SLOTS || HIDDEN_SLOTS.has(slot)) return null;
  if (useCooldown) {
    const key = `${slot}:${type}`;
    const lastTurn = world.awardCooldowns.get(key) ?? -Infinity;
    if (world.turn - lastTurn < PHYSICS_HZ * 2) return null;
    world.awardCooldowns.set(key, world.turn);
  }
  const stats = world.stats[slot];
  if (type === ACTION.GOAL) stats.goals++;
  else if (type === ACTION.ASSIST) stats.assists++;
  else if (type === ACTION.SAVE) stats.saves++;
  stats.points += points;
  recordReplayEvent(world, type, slot, 255, 0, "");
  return actionPacket(slot, type, points);
}

function gameOverPacket(world) {
  // Opcode 14 is the stock end-of-game summary with goals, assists, saves and
  // points for every client slot. The client calculates MVP from these rows.
  const buffer = Buffer.alloc(9 + CLIENT_SLOTS * 7 + 16);
  buffer[0] = 14;
  buffer.writeInt16BE(world.scores[0], 1);
  buffer.writeInt16BE(world.scores[1], 3);
  buffer.writeInt32BE(POSTGAME_MS, 5);
  let offset = 9;
  for (const stats of world.stats) {
    buffer[offset++] = stats.goals;
    buffer[offset++] = stats.assists;
    buffer[offset++] = stats.saves;
    buffer.writeInt32BE(stats.points, offset);
    offset += 4;
  }
  // The stock client reveals its Download Replay button only when four replay
  // identifier fields follow the scoreboard. They are local sentinels here;
  // opcode 8 is handled by this same process and does not contact NitroClash.
  for (const id of [0x4e433456, 1, 4, world.turn]) {
    buffer.writeInt32BE(id, offset);
    offset += 4;
  }
  return buffer;
}

function recordGoal(world, goal) {
  world.scores[goal.team]++;
  const packets = [];
  const goalAward = awardPoints(world, goal.scorer, ACTION.GOAL);
  if (goalAward) packets.push(goalAward);
  if (goal.assist !== 255) {
    const assistAward = awardPoints(world, goal.assist, ACTION.ASSIST);
    if (assistAward) packets.push(assistAward);
  }
  if (goal.longGoal) {
    const longAward = awardPoints(world, goal.scorer, ACTION.LONG_GOAL);
    if (longAward) packets.push(longAward);
  }
  if (world.overtime) {
    const overtimeAward = awardPoints(world, goal.scorer, ACTION.OVERTIME_GOAL);
    if (overtimeAward) packets.push(overtimeAward);
  }
  if (world.stats[goal.scorer].goals === 3) {
    const hatTrickAward = awardPoints(world, goal.scorer, ACTION.HAT_TRICK);
    if (hatTrickAward) packets.push(hatTrickAward);
  }
  recordReplayEvent(world, 202, goal.scorer, goal.assist, goal.speed, "");
  return packets;
}

function ncrFrameFromStatePacket(packet, boosts) {
  const frame = Buffer.alloc(4 + 32 * NCR_PLAYER_COUNT + NCR_PLAYER_COUNT + 24 + NCR_BOOST_COUNT);
  frame.writeInt32BE(packet.readInt32BE(2), 0);
  for (let slot = 0; slot < NCR_PLAYER_COUNT; slot++) {
    const source = 6 + slot * 33;
    for (let component = 0; component < 8; component++) {
      frame.writeFloatBE(packet.readFloatBE(source + component * 4), 4 + component * NCR_PLAYER_COUNT * 4 + slot * 4);
    }
    frame[4 + 32 * NCR_PLAYER_COUNT + slot] = packet[source + 32];
  }
  const sourceBall = 6 + CLIENT_SLOTS * 33;
  const destinationBall = 4 + 32 * NCR_PLAYER_COUNT + NCR_PLAYER_COUNT;
  packet.copy(frame, destinationBall, sourceBall, sourceBall + 24);
  const boostOffset = destinationBall + 24;
  for (let index = 0; index < NCR_BOOST_COUNT; index++) frame[boostOffset + index] = boosts[index]?.active ? 1 : 0;
  return frame;
}

function ncrEventBuffer(event) {
  const name = String(event.name || "").slice(0, 32767);
  const buffer = Buffer.alloc(13 + name.length * 2);
  buffer.writeInt32BE(event.turn, 0);
  buffer[4] = event.type;
  buffer[5] = event.slot1;
  buffer[6] = event.slot2;
  buffer.writeFloatBE(event.speed || 0, 7);
  buffer.writeInt16BE(name.length, 11);
  for (let index = 0; index < name.length; index++) buffer.writeUInt16BE(name.charCodeAt(index), 13 + index * 2);
  return buffer;
}

function buildNcrReplay(connection) {
  const frames = connection.fullReplayFrames.length
    ? connection.fullReplayFrames
    : [ncrFrameFromStatePacket(statePacket(connection.world), connection.world.boosts)];
  const header = Buffer.alloc(13);
  header.writeInt32BE(1, 0); // NCR format version
  header[4] = 4; // Stock 5v5 layout, with slots 8 and 9 filtered by the userscript.
  header.writeInt32BE(0, 5); // Standard map
  header.writeInt32BE(frames.length, 9);
  const events = connection.world.replayEvents.map(ncrEventBuffer);
  const eventCount = Buffer.alloc(4);
  eventCount.writeInt32BE(events.length, 0);
  return Buffer.concat([header, ...frames, eventCount, ...events]);
}

function replayStartPacket(turn, length) {
  const buffer = Buffer.alloc(9);
  buffer[0] = 23;
  buffer.writeInt32BE(turn, 1);
  buffer.writeInt32BE(length, 5);
  return buffer;
}

function replayStatePacket(recorded, turn) {
  const buffer = Buffer.from(recorded);
  buffer[1] = 7;
  buffer.writeInt32BE(turn, 2);
  return buffer;
}

function detectGoal(world) {
  const ball = bodyState(world.ball);
  if (ball.y < GOAL_MIN_Y || ball.y > GOAL_MAX_Y) return null;
  let team;
  if (ball.x <= 7.8125) team = 1;
  else if (ball.x >= 92.1875) team = 0;
  else return null;
  const recent = world.touches.filter((touch) => touch.slot % 2 === team && Date.now() - touch.time <= 15000);
  const scorer = recent.length ? recent[recent.length - 1].slot : team;
  const scoringTouch = recent.length ? recent[recent.length - 1] : null;
  let assist = 255;
  for (let index = recent.length - 2; index >= 0; index--) {
    if (recent[index].slot !== scorer) { assist = recent[index].slot; break; }
  }
  const targetX = team === 0 ? 95.50781 : 4.375;
  const longGoal = Boolean(scoringTouch && Math.hypot(targetX - scoringTouch.x, GOAL_CENTRE_Y - scoringTouch.y) >= 50);
  return { team, scorer, assist, speed: Math.hypot(ball.vx, ball.vy), longGoal };
}

function resetForKickoff(world, kickoffSpawns = randomKickoffSpawns()) {
  for (let slot = 0; slot < 8; slot++) {
    const player = world.players[slot];
    const spawn = kickoffSpawns[slot];
    player.body.setTransform(new planck.Vec2(spawn.x, spawn.y), spawn.angle);
    player.body.setLinearVelocity(new planck.Vec2(0, 0));
    player.body.setAngularVelocity(0);
    player.x = spawn.x; player.y = spawn.y; player.angle = spawn.angle;
    player.aim = spawn.angle; player.flags = 0; player.energy = 100;
  }
  world.ball.body.setTransform(new planck.Vec2(50, 28.125), 0);
  world.ball.body.setLinearVelocity(new planck.Vec2(0, 0));
  world.ball.body.setAngularVelocity(0);
  for (const boost of world.boosts) { boost.active = true; boost.respawnAt = 0; }
  world.touches.length = 0;
  world.pendingTouches.length = 0;
  world.firstTouchAwarded = false;
  world.activeShot = null;
  world.awardCooldowns.clear();
  world.state = 2;
}

function angleDifference(from, to) {
  let value = to - from;
  while (value < -Math.PI) value += Math.PI * 2;
  while (value > Math.PI) value -= Math.PI * 2;
  return value;
}

function processBallTouches(world) {
  const packets = [];
  const ball = bodyState(world.ball);
  while (world.pendingTouches.length) {
    const touch = world.pendingTouches.shift();
    const team = touch.slot % 2;
    const direction = team === 0 ? 1 : -1;
    const ownThird = team === 0 ? touch.x < 33 : touch.x > 67;

    if (!world.firstTouchAwarded) {
      world.firstTouchAwarded = true;
      const packet = awardPoints(world, touch.slot, ACTION.FIRST_TOUCH);
      if (packet) packets.push(packet);
    }

    const priorShot = world.activeShot;
    if (priorShot && priorShot.team !== team && world.turn - priorShot.turn <= PHYSICS_HZ * 6 && ownThird) {
      const packet = awardPoints(world, touch.slot, ACTION.SAVE, ACTION_POINTS[ACTION.SAVE], true);
      if (packet) packets.push(packet);
      world.activeShot = null;
    }

    const goalX = team === 0 ? 92.1875 : 7.8125;
    const movingTowardGoal = ball.vx * direction > 1.5;
    const secondsToLine = movingTowardGoal ? (goalX - ball.x) / ball.vx : -1;
    const projectedY = secondsToLine > 0 ? ball.y + ball.vy * secondsToLine : Infinity;
    if (movingTowardGoal && secondsToLine > 0 && projectedY >= GOAL_MIN_Y - 1 && projectedY <= GOAL_MAX_Y + 1) {
      const packet = awardPoints(world, touch.slot, ACTION.SHOT_ON_GOAL, ACTION_POINTS[ACTION.SHOT_ON_GOAL], true);
      if (packet) packets.push(packet);
      world.activeShot = { team, slot: touch.slot, turn: world.turn };
    }

  }
  if (world.activeShot && world.turn - world.activeShot.turn > PHYSICS_HZ * 6) world.activeShot = null;
  return packets;
}

function simulate(world) {
  const events = [];
  world.turn++;
  for (let slot = 0; slot < world.players.length; slot++) {
    if (HIDDEN_SLOTS.has(slot)) continue;
    const player = world.players[slot];
    const body = player.body;
    if (!body?.isActive()) continue;
    if (player.energy < 1) player.flags &= ~1;
    const boost = Boolean(player.flags & 1) && player.energy >= 1;
    const brake = Boolean(player.flags & 2);
    const impulse = PLAYER_SPEED / 60 * 1.5;
    if (brake) {
      const braking = body.getLinearVelocity().clone().mul(-PLAYER_BRAKE_STRENGTH * 1.5);
      body.applyLinearImpulse(braking, body.getPosition(), true);
    } else {
      if (boost) {
        player.energy = Math.max(0, player.energy - 1);
        if (player.energy < 1) player.flags &= ~1;
      }
      const velocity = body.getLinearVelocity();
      const velocityAngle = Math.atan2(velocity.y, velocity.x);
      const delta = angleDifference(player.aim, velocityAngle);
      const correction = 0.5;
      let movementAngle;
      if (delta > 0) movementAngle = delta < Math.PI / 2
        ? player.aim + correction * angleDifference(velocityAngle, player.aim)
        : player.aim - correction * angleDifference(velocityAngle + Math.PI, player.aim);
      else movementAngle = delta > -Math.PI / 2
        ? player.aim + correction * angleDifference(velocityAngle, player.aim)
        : player.aim - correction * angleDifference(velocityAngle + Math.PI, player.aim);
      const thrust = new planck.Vec2(Math.cos(movementAngle) * impulse * (boost ? 2 : 1), Math.sin(movementAngle) * impulse * (boost ? 2 : 1));
      const maxSpeed = PLAYER_MAX_SPEED * (boost ? 2 : 1);
      if (velocity.length() > maxSpeed) {
        body.applyLinearImpulse(velocity.clone().mul(-0.01 * impulse), body.getPosition(), true);
      }
      const proposed = thrust.clone().add(velocity);
      if (proposed.length() <= maxSpeed || proposed.length() < velocity.length()) {
        body.applyLinearImpulse(thrust, body.getPosition(), true);
      } else {
        proposed.normalize();
        proposed.mul(velocity.length());
        proposed.sub(velocity);
        body.applyLinearImpulse(proposed, body.getPosition(), true);
      }
    }
    const turn = angleDifference(body.getAngle(), player.aim);
    body.setTransform(body.getPosition(), body.getAngle() + Math.max(-0.1, Math.min(0.1, turn)));
  }
  world.physics.step(1 / 60);
  events.push(...processBallTouches(world));
  const now = Date.now();
  for (let boostIndex = 0; boostIndex < world.boosts.length; boostIndex++) {
    const boost = world.boosts[boostIndex];
    if (!boost.active) {
      if (now >= boost.respawnAt) {
        boost.active = true;
        events.push(Buffer.from([11, boostIndex, 255]));
      }
      continue;
    }
    for (let slot = 0; slot < world.players.length; slot++) {
      const player = world.players[slot];
      if (!player.body) continue;
      const position = player.body.getPosition();
      if (Math.hypot(position.x - boost.x, position.y - boost.y) <= 1.8) {
        player.energy = 100;
        boost.active = false;
        boost.respawnAt = now + 8000;
        events.push(Buffer.from([11, boostIndex, slot]));
        break;
      }
    }
  }
  return events;
}

// Shared public arenas. A browser connection owns only its assigned slot; the
// arena owns physics, timing, scoring and replay state, so matches continue
// when an individual socket disconnects.
const arenas = new Map();
const privateArenas = new Map();
const activeReservations = new Map();
let nextArenaId = 1;

function playerSnapshot(player) {
  const state = bodyState(player);
  return { ...state, energy: player.energy, aim: player.aim, flags: player.flags };
}

function parkSlot(arena, slot) {
  const player = arena.world.players[slot];
  if (!player?.body) return;
  player.body.setLinearVelocity(new planck.Vec2(0, 0));
  player.body.setAngularVelocity(0);
  player.body.setTransform(new planck.Vec2(-100, -100), slot % 2 ? Math.PI : 0);
  player.body.setActive(false);
  player.x = -100;
  player.y = -100;
  player.angle = slot % 2 ? Math.PI : 0;
  player.aim = player.angle;
  player.flags = 2;
  player.name = "";
}

function activateSlot(arena, slot, username, savedState = null) {
  const player = arena.world.players[slot];
  const spawn = savedState || arena.kickoffSpawns[slot] || randomKickoffSpawns()[slot];
  player.body.setActive(true);
  player.body.setTransform(new planck.Vec2(spawn.x, spawn.y), spawn.angle ?? (slot % 2 ? Math.PI : 0));
  player.body.setLinearVelocity(new planck.Vec2(savedState?.vx || 0, savedState?.vy || 0));
  player.body.setAngularVelocity(savedState?.angularVelocity || 0);
  player.x = spawn.x;
  player.y = spawn.y;
  player.angle = spawn.angle ?? (slot % 2 ? Math.PI : 0);
  player.energy = savedState?.energy ?? 100;
  player.aim = savedState?.aim ?? player.angle;
  player.flags = savedState?.flags ?? 2;
  player.name = String(username || "Player").slice(0, 12);
}

function createArena({ kind = "public", partyCode = null } = {}) {
  const world = makeWorld();
  const arena = {
    id: nextArenaId++,
    world,
    kickoffSpawns: randomKickoffSpawns(),
    connections: new Map(),
    spectators: new Set(),
    reservedSlots: new Map(),
    kind,
    partyCode,
    started: false,
    startsAt: 0,
    loopTimer: null,
    nextTickAt: 0,
    networkTick: 0,
    phase: "playing",
    phaseTicks: 0,
    history: [],
    replayFrames: [],
    replayIndex: 0,
    replaySkipVotes: new Set(),
    rematchVotes: new Set(),
    rematchTimer: null,
    fullReplayFrames: [],
    lastReplayTurn: -1,
    cachedReplay: null,
  };
  for (const slot of PLAYABLE_SLOTS) parkSlot(arena, slot);
  arenas.set(arena.id, arena);
  if (kind === "private") privateArenas.set(partyCode, arena);
  console.log(`${kind === "private" ? `Private party ${partyCode}` : "Public"} arena ${arena.id} created`);
  return arena;
}

function freeSlots(arena) {
  return PLAYABLE_SLOTS.filter((slot) => !arena.connections.has(slot) && !arena.reservedSlots.has(slot));
}

function chooseBalancedSlot(arena, preferredTeam = null) {
  const free = freeSlots(arena);
  if (!free.length) return null;
  if (preferredTeam === 0 || preferredTeam === 1) {
    const sameTeam = free.find((slot) => slot % 2 === preferredTeam);
    if (sameTeam !== undefined) return sameTeam;
  }
  const occupied = new Set([...arena.connections.keys(), ...arena.reservedSlots.keys()]);
  const blue = [...occupied].filter((slot) => slot % 2 === 0).length;
  const red = [...occupied].filter((slot) => slot % 2 === 1).length;
  const targetTeam = blue === red ? 0 : blue < red ? 0 : 1;
  return free.find((slot) => slot % 2 === targetTeam) ?? free[0];
}

function getOpenArena() {
  return [...arenas.values()].find((arena) => arena.kind === "public" && arena.phase !== "ended" && arena.phase !== "retired" && freeSlots(arena).length) || createArena();
}

function getPrivateArena(partyCode) {
  const existing = privateArenas.get(partyCode);
  if (existing && existing.phase !== "ended" && existing.phase !== "retired") return existing;
  return createArena({ kind: "private", partyCode });
}

function arenaSend(arena, payload, opcode = 2) {
  for (const connection of arena.connections.values()) {
    if (connection.ready && !connection.cleaned) connection.send(payload, opcode);
  }
  for (const spectator of arena.spectators) {
    if (spectator.ready && !spectator.cleaned) spectator.send(payload, opcode);
  }
}

function getSpectatorArena() {
  return [...arenas.values()]
    .filter((arena) => arena.kind === "public" && arena.phase !== "ended" &&
      arena.phase !== "retired" && arena.connections.size > 0)
    .sort((left, right) => right.connections.size - left.connections.size || left.id - right.id)[0] || null;
}

function arenaStatsPacket(arena) {
  return liveStatsPacket(arena.world, new Set(arena.connections.keys()));
}

function saveArenaReplayFrame(arena, snapshot) {
  if (!snapshot || snapshot[0] !== 5) return;
  const turn = snapshot.readInt32BE(2);
  if (turn <= arena.lastReplayTurn) return;
  arena.fullReplayFrames.push(ncrFrameFromStatePacket(snapshot, arena.world.boosts));
  arena.lastReplayTurn = turn;
  arena.cachedReplay = null;
}

function finishArena(arena) {
  if (arena.phase === "ended") return;
  const winner = arena.world.scores[0] > arena.world.scores[1] ? 0 : 1;
  const winnerSlots = arena.world.stats
    .map((stats, slot) => ({ stats, slot }))
    .filter(({ slot }) => !HIDDEN_SLOTS.has(slot) && slot % 2 === winner)
    .sort((a, b) => b.stats.points - a.stats.points || a.slot - b.slot);
  recordReplayEvent(arena.world, ACTION.VICTORY, winnerSlots[0]?.slot ?? winner, 255, 0, "");
  arena.phase = "ended";
  arena.rematchVotes.clear();
  arenaSend(arena, arenaStatsPacket(arena));
  arenaSend(arena, gameOverPacket(arena.world));
  if (arena.loopTimer) clearTimeout(arena.loopTimer);
  arena.loopTimer = null;
  if (arena.rematchTimer) clearTimeout(arena.rematchTimer);
  arena.rematchTimer = setTimeout(() => completeArenaRematch(arena), POSTGAME_MS);
  arena.rematchTimer.unref?.();
}

function applyArenaInputs(arena) {
  for (const [slot, connection] of arena.connections) {
    if (!connection.pendingInput) continue;
    const player = arena.world.players[slot];
    player.aim = connection.pendingInput.aim;
    player.flags = connection.pendingInput.flags;
    connection.pendingInput = null;
  }
}

function completeGoalReplay(arena) {
  arena.replaySkipVotes.clear();
  if (arena.world.turn >= REGULATION_TICKS && arena.world.scores[0] !== arena.world.scores[1]) {
    arena.world.regulationFinished = true;
    finishArena(arena);
    return null;
  }
  if (arena.world.turn >= REGULATION_TICKS) {
    arena.world.regulationFinished = true;
    arena.world.overtime = true;
    arena.world.turn = Math.max(arena.world.turn, REGULATION_TICKS + 1);
    recordReplayEvent(arena.world, 203);
  }
  arena.kickoffSpawns = randomKickoffSpawns();
  resetForKickoff(arena.world, arena.kickoffSpawns);
  for (const slot of PLAYABLE_SLOTS) if (!arena.connections.has(slot)) parkSlot(arena, slot);
  arena.phase = "playing";
  arena.history = [];
  arena.replayFrames = [];
  arena.startsAt = Date.now() + 4000;
  arenaSend(arena, startPacket(arena.world));
  const snapshot = statePacket(arena.world);
  arenaSend(arena, snapshot);
  return snapshot;
}

function activeReplayConnections(arena) {
  return [...arena.connections.values()].filter((connection) => connection.ready && !connection.cleaned);
}

function maybeCompleteReplaySkip(arena) {
  if (arena.phase !== "replay" && arena.phase !== "replay-hold") return false;
  const active = activeReplayConnections(arena);
  if (!active.length || !active.every((connection) => arena.replaySkipVotes.has(connection))) return false;
  // The closed 5v5 client hard-codes a /10 denominator. Show it as complete
  // immediately before advancing even though only connected players can vote.
  arenaSend(arena, replaySkipVotePacket(CLIENT_SLOTS));
  console.log(`Arena ${arena.id}: replay skipped by all ${active.length} active player${active.length === 1 ? "" : "s"}`);
  completeGoalReplay(arena);
  return true;
}

function registerReplaySkipVote(connection, previousFlags, nextFlags) {
  const arena = connection.arena;
  if (!arena || (arena.phase !== "replay" && arena.phase !== "replay-hold")) return;
  const clicked = (nextFlags & 1) !== 0 && (previousFlags & 1) === 0;
  if (!clicked || arena.replaySkipVotes.has(connection)) return;
  arena.replaySkipVotes.add(connection);
  arenaSend(arena, replaySkipVotePacket(arena.replaySkipVotes.size));
  maybeCompleteReplaySkip(arena);
}

function retireEmptyArena(arena) {
  if (arena.loopTimer) clearTimeout(arena.loopTimer);
  arena.loopTimer = null;
  if (arena.rematchTimer) clearTimeout(arena.rematchTimer);
  arena.rematchTimer = null;
  arena.phase = "retired";
  arenas.delete(arena.id);
  if (arena.kind === "private" && privateArenas.get(arena.partyCode) === arena)
    privateArenas.delete(arena.partyCode);
  for (const [key, saved] of reconnectSessions) {
    if (saved.arenaId === arena.id) reconnectSessions.delete(key);
  }
  for (const spectator of arena.spectators) {
    spectator.arena = null;
    spectator.send(Buffer.from([1]));
  }
  arena.spectators.clear();
  console.log(`${arena.kind === "private" ? `Private party ${arena.partyCode}` : "Public"} arena ${arena.id} emptied and was reset`);
}

function runArenaTick(arena) {
  if (arena.phase === "ended" || arena.phase === "retired") return;
  const now = performance.now();
  let steps = 0;
  while (now >= arena.nextTickAt && steps < 5) {
    let snapshot = null;
    if (Date.now() >= arena.startsAt) {
      if (arena.phase === "playing") {
        arena.world.state = 3;
        applyArenaInputs(arena);
        const events = simulate(arena.world);
        for (const event of events) arenaSend(arena, event);
        if (events.some((event) => event[0] === 15)) arenaSend(arena, arenaStatsPacket(arena));
        const recorded = statePacket(arena.world);
        saveArenaReplayFrame(arena, recorded);
        arena.history.push(recorded);
        if (arena.history.length > REPLAY_TICKS) arena.history.shift();
        const goal = detectGoal(arena.world);
        if (goal) {
          const goalActions = recordGoal(arena.world, goal);
          arena.world.state = 4;
          arenaSend(arena, goalPacket(arena.world, goal.team, goal.scorer, goal.assist, goal.speed));
          for (const action of goalActions) arenaSend(arena, action);
          arenaSend(arena, arenaStatsPacket(arena));
          const assistText = goal.assist === 255 ? "no assist" : `assisted by slot ${goal.assist + 1}`;
          console.log(`Arena ${arena.id}: ${goal.team === 0 ? "Blue" : "Red"} goal — scored by slot ${goal.scorer + 1}, ${assistText}`);
          if (arena.world.overtime) {
            finishArena(arena);
          } else {
            arena.phase = "celebration";
            arena.phaseTicks = 0;
            arena.replayFrames = arena.history.slice();
            while (arena.replayFrames.length < REPLAY_TICKS)
              arena.replayFrames.unshift(arena.replayFrames[0] || recorded);
          }
        } else if (!arena.world.regulationFinished && arena.world.turn >= REGULATION_TICKS) {
          arena.world.regulationFinished = true;
          if (arena.world.scores[0] === arena.world.scores[1]) {
            arena.world.overtime = true;
            arena.world.turn = Math.max(arena.world.turn, REGULATION_TICKS + 1);
            recordReplayEvent(arena.world, 203);
            arena.kickoffSpawns = randomKickoffSpawns();
            resetForKickoff(arena.world, arena.kickoffSpawns);
            for (const slot of PLAYABLE_SLOTS) if (!arena.connections.has(slot)) parkSlot(arena, slot);
            arena.history = [];
            arena.startsAt = Date.now() + 4000;
            arenaSend(arena, startPacket(arena.world));
          } else {
            finishArena(arena);
          }
        }
        snapshot = arena.phase === "ended" ? null : statePacket(arena.world);
      } else if (arena.phase === "celebration") {
        arena.world.state = 4;
        applyArenaInputs(arena);
        const events = simulate(arena.world);
        for (const event of events) arenaSend(arena, event);
        if (events.some((event) => event[0] === 15)) arenaSend(arena, arenaStatsPacket(arena));
        arena.world.state = 4;
        arena.phaseTicks++;
        snapshot = statePacket(arena.world);
        saveArenaReplayFrame(arena, snapshot);
        if (arena.phaseTicks >= CELEBRATION_TICKS) {
          arena.phase = "replay";
          arena.phaseTicks = 0;
          arena.replayIndex = 0;
          arena.replaySkipVotes.clear();
          arena.world.state = 7;
          arenaSend(arena, replayStartPacket(arena.world.turn, REPLAY_TICKS));
          snapshot = replayStatePacket(arena.replayFrames[0], arena.world.turn);
        }
      } else if (arena.phase === "replay") {
        arena.world.turn++;
        arena.replayIndex++;
        const index = Math.min(arena.replayIndex, arena.replayFrames.length - 1);
        snapshot = replayStatePacket(arena.replayFrames[index], arena.world.turn);
        saveArenaReplayFrame(arena, snapshot);
        if (arena.replayIndex >= REPLAY_TICKS) {
          arena.phase = "replay-hold";
          arena.phaseTicks = 0;
        }
      } else if (arena.phase === "replay-hold") {
        arena.world.turn++;
        arena.phaseTicks++;
        snapshot = replayStatePacket(arena.replayFrames[arena.replayFrames.length - 1], arena.world.turn);
        saveArenaReplayFrame(arena, snapshot);
        if (arena.phaseTicks >= REPLAY_HOLD_TICKS) {
          snapshot = completeGoalReplay(arena);
        }
      }
    }
    arena.networkTick++;
    if (arena.phase !== "ended" && arena.networkTick % PHYSICS_HZ === 0)
      arenaSend(arena, arenaStatsPacket(arena));
    if (arena.phase !== "ended" && arena.networkTick % SNAPSHOT_EVERY_TICKS === 0)
      arenaSend(arena, snapshot || statePacket(arena.world));
    arena.nextTickAt += TICK_MS;
    steps++;
  }
  if (steps === 5 && now >= arena.nextTickAt) arena.nextTickAt = now + TICK_MS;
  if (arena.phase !== "ended" && arena.phase !== "retired")
    arena.loopTimer = setTimeout(() => runArenaTick(arena), Math.max(0, arena.nextTickAt - performance.now()));
}

function startArena(arena) {
  if (arena.started) return;
  arena.started = true;
  arena.startsAt = Date.now() + 4000;
  for (const slot of PLAYABLE_SLOTS) {
    const name = arena.world.players[slot].name;
    if (name) recordReplayEvent(arena.world, 200, slot, 255, 0, name);
  }
  const initial = statePacket(arena.world);
  saveArenaReplayFrame(arena, initial);
  for (const connection of arena.connections.values()) {
    if (!connection.ready) continue;
    connection.send(startPacket(arena.world));
    connection.send(arenaStatsPacket(arena));
    connection.send(initial);
  }
  arena.nextTickAt = performance.now() + TICK_MS;
  arena.loopTimer = setTimeout(() => runArenaTick(arena), TICK_MS);
  console.log(`${arena.kind === "private" ? `Private party ${arena.partyCode}` : "Public"} arena ${arena.id} started`);
}

function releaseReconnectSession(key, saved = reconnectSessions.get(key), retireIfEmpty = true) {
  if (!saved) return;
  if (reconnectSessions.get(key) === saved) reconnectSessions.delete(key);
  const arena = arenas.get(saved.arenaId);
  if (arena?.reservedSlots.get(saved.slot) === saved) arena.reservedSlots.delete(saved.slot);
  if (retireIfEmpty && arena?.kind === "private" && arena.connections.size === 0 && arena.reservedSlots.size === 0)
    retireEmptyArena(arena);
}

function rememberReconnectSession(connection, arena, slot, playerState) {
  const saved = {
    kind: arena.kind,
    partyCode: arena.partyCode,
    arenaId: arena.id,
    slot,
    username: connection.username,
    playerState,
    expiresAt: Date.now() + RECONNECT_TTL_MS,
  };
  reconnectSessions.set(connection.reservationKey, saved);
  if (arena.kind === "private") arena.reservedSlots.set(slot, saved);
  const expiryTimer = setTimeout(() => releaseReconnectSession(connection.reservationKey, saved), RECONNECT_TTL_MS + 50);
  expiryTimer.unref?.();
  return saved;
}

function assignPublicConnection(connection) {
  const now = Date.now();
  let arena = null;
  let slot = null;
  let restoredState = null;
  let reconnect = false;
  const saved = reconnectSessions.get(connection.reservationKey);
  if (connection.reconnectRequested && (!saved || saved.expiresAt <= now)) {
    if (saved) releaseReconnectSession(connection.reservationKey, saved);
    return { error: "Reconnect expired" };
  }
  if (saved && saved.kind === "public" && saved.expiresAt > now && saved.username === connection.username) {
    arena = arenas.get(saved.arenaId);
    if (arena?.kind === "public" && arena.phase !== "ended" && arena.phase !== "retired") {
      if (!arena.connections.has(saved.slot)) slot = saved.slot;
      else slot = chooseBalancedSlot(arena, saved.slot % 2);
      if (slot === null) return { error: "Match full" };
      restoredState = slot === saved.slot ? saved.playerState : null;
      reconnect = true;
    }
  }
  if (saved) releaseReconnectSession(connection.reservationKey, saved);
  if (connection.reconnectRequested && !arena) return { error: "Previous match no longer exists" };
  if (!arena) {
    // A completely abandoned public arena remains resumable for its previous
    // player, but unrelated matchmaking must start a genuinely fresh match.
    for (const candidate of [...arenas.values()]) {
      if (candidate.kind === "public" && candidate.started && candidate.connections.size === 0)
        retireEmptyArena(candidate);
    }
    arena = getOpenArena();
    slot = chooseBalancedSlot(arena);
  }
  if (slot === null) return { error: "no public slot available" };
  connection.arena = arena;
  connection.slot = slot;
  connection.resuming = reconnect;
  arena.connections.set(slot, connection);
  activeReservations.set(connection.reservationKey, connection);
  activateSlot(arena, slot, connection.username, restoredState);
  arenaSend(arena, namePacket(slot, connection.username));
  return { arena, slot, reconnect };
}

function assignPrivateConnection(connection) {
  const now = Date.now();
  let arena = null;
  let slot = null;
  let restoredState = null;
  let reconnect = false;
  const saved = reconnectSessions.get(connection.reservationKey);
  const validSaved = saved && saved.kind === "private" && saved.partyCode === connection.partyCode &&
    saved.expiresAt > now && saved.username === connection.username;
  if (connection.reconnectRequested && !validSaved) {
    if (saved) releaseReconnectSession(connection.reservationKey, saved);
    return { error: saved?.expiresAt <= now ? "Reconnect expired" : "Private match no longer exists" };
  }
  if (validSaved) {
    arena = arenas.get(saved.arenaId);
    if (arena?.kind === "private" && arena.partyCode === connection.partyCode &&
        arena.phase !== "ended" && arena.phase !== "retired" &&
        arena.reservedSlots.get(saved.slot) === saved && !arena.connections.has(saved.slot)) {
      slot = saved.slot;
      restoredState = saved.playerState;
      reconnect = true;
    } else {
      arena = null;
      if (connection.reconnectRequested) {
        releaseReconnectSession(connection.reservationKey, saved);
        return { error: "Private match no longer exists" };
      }
    }
  }
  if (saved) releaseReconnectSession(connection.reservationKey, saved, !reconnect);
  if (!arena) arena = getPrivateArena(connection.partyCode);
  if (slot === null) {
    const free = freeSlots(arena);
    if (connection.requestedTeam === 0 || connection.requestedTeam === 1)
      slot = free.find((candidate) => candidate % 2 === connection.requestedTeam) ?? null;
    else
      slot = chooseBalancedSlot(arena);
  }
  if (slot === null) return { error: connection.requestedTeam === null ? "private match is full" : "selected private team is full" };
  connection.arena = arena;
  connection.slot = slot;
  connection.resuming = reconnect;
  arena.reservedSlots.delete(slot);
  arena.connections.set(slot, connection);
  activeReservations.set(connection.reservationKey, connection);
  activateSlot(arena, slot, connection.username, restoredState);
  arenaSend(arena, namePacket(slot, connection.username));
  return { arena, slot, reconnect };
}

function sendArenaEntry(connection, arena) {
  connection.send(controlPacket(arena.world, connection.slot, connection.username));
  connection.send(Buffer.from([11, 8, 0]));
  connection.send(Buffer.from([11, 9, 0]));
  if (!arena.started) {
    startArena(arena);
  } else {
    const countdown = Math.max(0, arena.startsAt - Date.now());
    connection.send(startPacket(arena.world, countdown));
    connection.send(arenaStatsPacket(arena));
    connection.send(statePacket(arena.world));
  }
}

function sendSpectatorEntry(connection, arena) {
  const focusSlot = [...arena.connections.keys()].sort((a, b) => a - b)[0] ?? 0;
  connection.send(controlPacket(arena.world, focusSlot, "Spectator"));
  connection.send(Buffer.from([11, 8, 0]));
  connection.send(Buffer.from([11, 9, 0]));
  connection.send(startPacket(arena.world, Math.max(0, arena.startsAt - Date.now())));
  connection.send(arenaStatsPacket(arena));
  connection.send(statePacket(arena.world));
  if (arena.phase === "ended") connection.send(gameOverPacket(arena.world));
}

function changeConnectionMatch(connection) {
  const previousArena = connection.arena;
  const previousSlot = connection.slot;
  if (!connection.ready || !previousArena || previousSlot === null || previousArena.phase !== "ended")
    return false;

  if (previousArena.connections.get(previousSlot) === connection)
    previousArena.connections.delete(previousSlot);
  previousArena.replaySkipVotes.delete(connection);
  previousArena.rematchVotes.delete(connection);
  parkSlot(previousArena, previousSlot);
  arenaSend(previousArena, namePacket(previousSlot, ""));

  connection.arena = null;
  connection.slot = null;
  connection.pendingInput = null;
  connection.lastInputFlags = 0;
  connection.resuming = false;

  const assignment = connection.kind === "private"
    ? assignPrivateConnection(connection)
    : assignPublicConnection(connection);
  if (assignment.error) {
    console.error(`Could not change match for ${connection.username}: ${assignment.error}`);
    return false;
  }

  if (previousArena.connections.size === 0 && previousArena.reservedSlots.size === 0)
    retireEmptyArena(previousArena);
  sendArenaEntry(connection, assignment.arena);
  console.log(`Change team ${connection.username}: arena ${previousArena.id} → ${assignment.arena.id}, slot ${assignment.slot + 1}`);
  return true;
}

function registerRematchVote(connection) {
  const arena = connection.arena;
  if (!connection.ready || !arena || connection.slot === null || arena.phase !== "ended")
    return false;
  arena.rematchVotes.add(connection);
  console.log(`Rematch selected by ${connection.username} in arena ${arena.id}`);
  return true;
}

function detachFinishedConnection(arena, slot, connection) {
  if (arena.connections.get(slot) === connection) arena.connections.delete(slot);
  arena.replaySkipVotes.delete(connection);
  arena.rematchVotes.delete(connection);
  if (activeReservations.get(connection.reservationKey) === connection)
    activeReservations.delete(connection.reservationKey);
  connection.arena = null;
  connection.slot = null;
  connection.joined = false;
  connection.ready = false;
  connection.pendingInput = null;
  connection.lastInputFlags = 0;
  connection.resuming = false;
}

function completeArenaRematch(arena) {
  if (arena.rematchTimer) clearTimeout(arena.rematchTimer);
  arena.rematchTimer = null;
  if (arena.phase !== "ended" || arena.phase === "retired") return false;

  // A finished match cannot carry reconnect reservations into the next game.
  for (const [key, saved] of reconnectSessions) {
    if (saved.arenaId === arena.id) reconnectSessions.delete(key);
  }
  arena.reservedSlots.clear();

  const staying = [...arena.connections.entries()].filter(([, connection]) =>
    arena.rematchVotes.has(connection) && connection.ready && !connection.cleaned);
  const stayingConnections = new Set(staying.map(([, connection]) => connection));

  for (const [slot, connection] of [...arena.connections.entries()]) {
    if (stayingConnections.has(connection)) continue;
    // Tell voters that this finished-match player is no longer in their roster,
    // then detach the non-voter without producing a connection-lost popup.
    for (const voter of stayingConnections) voter.send(namePacket(slot, ""));
    detachFinishedConnection(arena, slot, connection);
  }

  if (!staying.length) {
    retireEmptyArena(arena);
    return false;
  }

  arena.world = makeWorld();
  arena.kickoffSpawns = randomKickoffSpawns();
  for (const slot of PLAYABLE_SLOTS) parkSlot(arena, slot);
  for (const [slot, connection] of staying) {
    connection.pendingInput = null;
    connection.lastInputFlags = 0;
    activateSlot(arena, slot, connection.username);
    recordReplayEvent(arena.world, 200, slot, 255, 0, connection.username);
  }

  arena.started = true;
  arena.phase = "playing";
  arena.phaseTicks = 0;
  arena.networkTick = 0;
  arena.history = [];
  arena.replayFrames = [];
  arena.replayIndex = 0;
  arena.replaySkipVotes.clear();
  arena.rematchVotes.clear();
  arena.fullReplayFrames = [];
  arena.lastReplayTurn = -1;
  arena.cachedReplay = null;
  arena.startsAt = Date.now() + 4000;

  const initial = statePacket(arena.world);
  saveArenaReplayFrame(arena, initial);
  arenaSend(arena, startPacket(arena.world));
  arenaSend(arena, arenaStatsPacket(arena));
  arenaSend(arena, initial);
  arena.nextTickAt = performance.now() + TICK_MS;
  arena.loopTimer = setTimeout(() => runArenaTick(arena), TICK_MS);
  console.log(`Arena ${arena.id} rematch started with ${staying.length} player${staying.length === 1 ? "" : "s"}`);
  return true;
}

function createUnusedReservationKey() {
  let key;
  do key = crypto.randomInt(1, 0x80000000);
  while (activeReservations.has(key) || reconnectSessions.has(key));
  return key;
}

function installSharedUpgradeHandler(serverInstance) {
  serverInstance.on("upgrade", (request, socket) => {
    const upgradeUrl = new URL(request.url || "/", `http://${request.headers.host || `${HOST}:${PORT}`}`);
    const requestedParty = String(upgradeUrl.searchParams.get("party") || "").toUpperCase();
    const privateParty = upgradeUrl.searchParams.get("private") === "1" && /^[A-HJ-NP-Z0-9]{6}$/.test(requestedParty);
    const requestedTeamText = upgradeUrl.searchParams.get("team");
    const requestedTeam = requestedTeamText === "0" || requestedTeamText === "1" ? Number(requestedTeamText) : null;
    const reconnectRequested = upgradeUrl.searchParams.get("reconnect") === "1";
    const spectatorRequested = upgradeUrl.searchParams.get("spectate") === "1";
    const key = request.headers["sec-websocket-key"];
    if (!key) return socket.destroy();
    const accept = crypto.createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
    socket.write([
      "HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${accept}`, "\r\n",
    ].join("\r\n"));

    const connection = {
      socket,
      pending: Buffer.alloc(0),
      username: "Player",
      reservationKey: 0,
      arena: null,
      slot: null,
      joined: false,
      ready: false,
      cleaned: false,
      pendingInput: null,
      lastInputFlags: 0,
      lastChatAt: 0,
      resuming: false,
      spectator: spectatorRequested,
      reconnectRequested,
      kind: privateParty ? "private" : "public",
      partyCode: privateParty ? requestedParty : null,
      requestedTeam: privateParty ? requestedTeam : null,
      send(payload, opcode = 2) {
        if (socket.writable) socket.write(wsFrame(payload, opcode));
      },
      close(reason) {
        if (!socket.writable) return;
        const text = Buffer.from(String(reason || "Connection closed").slice(0, 120), "utf8");
        const payload = Buffer.alloc(2 + text.length);
        payload.writeUInt16BE(4000, 0);
        text.copy(payload, 2);
        socket.end(wsFrame(payload, 8));
      },
    };

    socket.on("data", (chunk) => {
      for (const frame of readFrames(connection, chunk)) {
        if (frame.opcode === 8) return socket.end(wsFrame(Buffer.alloc(0), 8));
        if (frame.opcode !== 2 || frame.payload.length === 0) continue;
        const packet = frame.payload;
        switch (packet[0]) {
          case 99:
            connection.send(Buffer.from([99]));
            break;
          case 1: {
            if (connection.spectator) break;
            if (connection.joined) break;
            connection.reservationKey = packet.length >= 5 ? packet.readInt32BE(1) : 0;
            const name = readString(packet, 5);
            connection.username = name.value || "Player";
            const active = activeReservations.get(connection.reservationKey);
            if (active && active !== connection && !active.cleaned) {
              if (connection.reconnectRequested) {
                connection.close("Reconnect already active");
                break;
              }
              const copiedKey = connection.reservationKey;
              connection.reservationKey = createUnusedReservationKey();
              console.log(`Duplicate browser-tab key ${copiedKey} for ${connection.username}; assigned a separate player identity`);
            }
            const assignment = connection.kind === "private"
              ? assignPrivateConnection(connection)
              : assignPublicConnection(connection);
            if (assignment.error) {
              console.log(`${connection.kind === "private" ? `Private party ${connection.partyCode}` : "Public"} join rejected for ${connection.username}: ${assignment.error}`);
              connection.close(assignment.error);
              break;
            }
            connection.joined = true;
            console.log(`${assignment.reconnect ? "Reconnect" : "Join"} ${connection.username} → ${connection.kind}${connection.partyCode ? ` party ${connection.partyCode}` : ""}, arena ${assignment.arena.id}, slot ${assignment.slot + 1}`);
            connection.send(mapPacket());
            break;
          }
          case 7: {
            if (!connection.spectator || packet.length < 2) break;
            if (packet[1] === 1) {
              if (connection.joined) break;
              if (connection.kind === "private") {
                connection.close("Private spectating is disabled");
                break;
              }
              const arena = getSpectatorArena();
              if (!arena) {
                connection.close("No active 4v4 games");
                break;
              }
              connection.arena = arena;
              connection.joined = true;
              arena.spectators.add(connection);
              connection.send(mapPacket());
              console.log(`Spectator joined public arena ${arena.id} (${arena.connections.size}/8 players)`);
            } else if (packet[1] === 2 && connection.joined && !connection.ready) {
              connection.ready = true;
              sendSpectatorEntry(connection, connection.arena);
            }
            // Subcommands 3/4 only request camera changes in the stock client;
            // the server deliberately applies no gameplay action.
            break;
          }
          case 2:
            if (connection.spectator) {
              connection.send(Buffer.from([4]));
              break;
            }
            if (packet.length >= 6 && connection.joined) {
              const previousFlags = connection.lastInputFlags;
              connection.lastInputFlags = packet[5];
              connection.pendingInput = { aim: packet.readFloatBE(1), flags: packet[5] };
              if (connection.ready) registerReplaySkipVote(connection, previousFlags, packet[5]);
            }
            connection.send(Buffer.from([4]));
            break;
          case 3: {
            if (connection.spectator) break;
            if (!connection.joined || connection.ready) break;
            connection.ready = true;
            const arena = connection.arena;
            sendArenaEntry(connection, arena);
            connection.resuming = false;
            break;
          }
          case 4: {
            if (connection.spectator) break;
            if (!connection.ready || !connection.arena || connection.slot === null) break;
            const now = Date.now();
            if (now - connection.lastChatAt < 350) break;
            const decoded = readString(packet, 1).value;
            const message = decoded.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 255);
            if (!message) break;
            connection.lastChatAt = now;
            arenaSend(connection.arena, chatPacket(connection.slot, message));
            break;
          }
          case 5:
            if (connection.spectator) break;
            if (packet.length < 2) break;
            if (packet[1] === 0) registerRematchVote(connection);
            else if (packet[1] === 1) changeConnectionMatch(connection);
            break;
          case 8: {
            if (!connection.ready) break;
            try {
              const arena = connection.arena;
              arena.cachedReplay ||= buildNcrReplay(arena);
              connection.send(Buffer.concat([Buffer.from([25]), arena.cachedReplay]));
              console.log(`Arena ${arena.id} replay sent (${arena.cachedReplay.length.toLocaleString()} bytes)`);
            } catch (error) {
              console.error("Could not build replay", error);
            }
            break;
          }
        }
      }
    });

    const cleanup = () => {
      if (connection.cleaned) return;
      connection.cleaned = true;
      if (activeReservations.get(connection.reservationKey) === connection)
        activeReservations.delete(connection.reservationKey);
      const arena = connection.arena;
      if (connection.spectator) {
        arena?.spectators.delete(connection);
        if (arena) console.log(`Spectator left public arena ${arena.id}`);
        return;
      }
      if (!connection.joined || !arena || connection.slot === null) return;
      const slot = connection.slot;
      const playerState = playerSnapshot(arena.world.players[slot]);
      if (arena.connections.get(slot) === connection) arena.connections.delete(slot);
      arena.replaySkipVotes.delete(connection);
      arena.rematchVotes.delete(connection);
      parkSlot(arena, slot);
      arenaSend(arena, namePacket(slot, ""));
      if (arena.kind === "private" && arena.phase !== "ended") {
        rememberReconnectSession(connection, arena, slot, playerState);
        maybeCompleteReplaySkip(arena);
      } else if (arena.phase !== "ended") {
        rememberReconnectSession(connection, arena, slot, playerState);
        maybeCompleteReplaySkip(arena);
        if (arena.connections.size === 0) {
          const retirementTimer = setTimeout(() => {
            const saved = reconnectSessions.get(connection.reservationKey);
            if (arena.connections.size === 0 && (!saved || saved.arenaId !== arena.id)) retireEmptyArena(arena);
          }, RECONNECT_TTL_MS + 100);
          retirementTimer.unref?.();
        }
      } else if (arena.connections.size === 0) {
        retireEmptyArena(arena);
      }
      console.log(`Disconnect ${connection.username} from arena ${arena.id}, slot ${slot + 1}; ${arena.kind === "private" ? "private slot reserved for 60s" : "public slot released immediately"}`);
    };
    socket.on("close", cleanup);
    socket.on("error", cleanup);
  });
}

const server = http.createServer((request, response) => {
  const path = new URL(request.url || "/", `http://${request.headers.host || `${HOST}:${PORT}`}`).pathname;
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Private-Network": "true",
    "Cache-Control": "no-store",
  };
  if (request.method === "OPTIONS") {
    response.writeHead(204, cors);
    response.end();
  } else if (path === "/health") {
    response.writeHead(200, { ...cors, "Content-Type": "application/json" });
    response.end(JSON.stringify({ status: "ok", service: "nitroclash-4v4" }));
  } else if (path === "/servers") {
    response.writeHead(200, { ...cors, "Content-Type": "application/json" });
    response.end(JSON.stringify({
      EU1: { uri: "eu6.nitroclash.io:8003", p0: 0, p1: 0, p2: 0, p3: 0, p4: 0, p5: 0 },
    }));
  } else if (path === "/reserve") {
    response.writeHead(200, { ...cors, "Content-Type": "text/plain" });
    response.end("eu6.nitroclash.io:8003 1");
  } else {
    response.writeHead(200, { ...cors, "Content-Type": "text/plain" });
    response.end("NitroClash local 4v4 prototype is running.\n");
  }
});

if (process.env.NC_LEGACY_SINGLEPLAYER === "1") server.on("upgrade", (request, socket) => {
  const key = request.headers["sec-websocket-key"];
  if (!key) return socket.destroy();
  const accept = crypto.createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "\r\n",
  ].join("\r\n"));

  const connection = {
    pending: Buffer.alloc(0), world: makeWorld(), username: "Player",
    started: false, startsAt: 0, loopTimer: null, nextTickAt: 0,
    networkTick: 0, pendingInput: null, cleaned: false,
    phase: "playing", phaseTicks: 0, history: [], replayFrames: [], replayIndex: 0,
    fullReplayFrames: [], lastReplayTurn: -1, cachedReplay: null,
    reservationKey: 0, resuming: false,
    lastChatAt: 0,
  };
  const send = (payload, opcode = 2) => socket.writable && socket.write(wsFrame(payload, opcode));
  const saveReplayFrame = (snapshot) => {
    if (!snapshot || snapshot[0] !== 5) return;
    const turn = snapshot.readInt32BE(2);
    if (turn <= connection.lastReplayTurn) return;
    connection.fullReplayFrames.push(ncrFrameFromStatePacket(snapshot, connection.world.boosts));
    connection.lastReplayTurn = turn;
    connection.cachedReplay = null;
  };
  const finishMatch = () => {
    if (connection.phase === "ended") return;
    const winner = connection.world.scores[0] > connection.world.scores[1] ? 0 : 1;
    const winnerSlots = connection.world.stats
      .map((stats, slot) => ({ stats, slot }))
      .filter(({ slot }) => !HIDDEN_SLOTS.has(slot) && slot % 2 === winner)
      .sort((a, b) => b.stats.points - a.stats.points || a.slot - b.slot);
    recordReplayEvent(connection.world, ACTION.VICTORY, winnerSlots[0]?.slot ?? winner, 255, 0, "");
    connection.phase = "ended";
    send(liveStatsPacket(connection.world));
    send(gameOverPacket(connection.world));
  };

  socket.on("data", (chunk) => {
    for (const frame of readFrames(connection, chunk)) {
      if (frame.opcode === 8) return socket.end(wsFrame(Buffer.alloc(0), 8));
      if (frame.opcode !== 2 || frame.payload.length === 0) continue;
      const packet = frame.payload;
      switch (packet[0]) {
        case 99:
          send(Buffer.from([99]));
          break;
        case 1: {
          connection.reservationKey = packet.length >= 5 ? packet.readInt32BE(1) : 0;
          let offset = 5;
          const name = readString(packet, offset);
          connection.username = name.value || "Player";
          const saved = reconnectSessions.get(connection.reservationKey);
          if (saved && saved.expiresAt > Date.now() && saved.connection.username === connection.username &&
              saved.connection.phase !== "ended") {
            const previous = saved.connection;
            for (const field of [
              "world", "startsAt", "networkTick", "phase", "phaseTicks", "history",
              "replayFrames", "replayIndex", "fullReplayFrames", "lastReplayTurn", "cachedReplay",
            ]) connection[field] = previous[field];
            connection.pendingInput = null;
            connection.resuming = true;
            reconnectSessions.delete(connection.reservationKey);
          } else if (saved) {
            reconnectSessions.delete(connection.reservationKey);
          }
          connection.joined = true;
          console.log(`${connection.resuming ? "Reconnect" : "Join"} received from ${connection.username}`);
          send(mapPacket());
          break;
        }
        case 2:
          if (packet.length >= 6) {
            connection.pendingInput = { aim: packet.readFloatBE(1), flags: packet[5] };
          }
          send(Buffer.from([4]));
          break;
        case 3:
          if (connection.started) break;
          connection.started = true;
          send(controlPacket(connection.world, 0, connection.username));
          send(Buffer.from([11, 8, 0]));
          send(Buffer.from([11, 9, 0]));
          if (connection.resuming) {
            send(startPacket(connection.world, 0));
            send(liveStatsPacket(connection.world));
            send(statePacket(connection.world));
            connection.startsAt = Date.now();
          } else {
            send(startPacket(connection.world));
            for (let slot = 0; slot < CLIENT_SLOTS; slot++) {
              if (!HIDDEN_SLOTS.has(slot)) recordReplayEvent(connection.world, 200, slot, 255, 0, connection.world.players[slot].name);
            }
            send(liveStatsPacket(connection.world));
            saveReplayFrame(statePacket(connection.world));
            connection.startsAt = Date.now() + 4000;
          }
          connection.nextTickAt = performance.now() + TICK_MS;
          const runTick = () => {
            const now = performance.now();
            let steps = 0;
            while (now >= connection.nextTickAt && steps < 5) {
              let snapshot = null;
              if (Date.now() >= connection.startsAt) {
                if (connection.phase === "playing") {
                  connection.world.state = 3;
                  if (connection.pendingInput) {
                    const player = connection.world.players[0];
                    player.aim = connection.pendingInput.aim;
                    player.flags = connection.pendingInput.flags;
                    connection.pendingInput = null;
                  }
                  const events = simulate(connection.world);
                  for (const event of events) send(event);
                  if (events.some((event) => event[0] === 15)) send(liveStatsPacket(connection.world));
                  const recorded = statePacket(connection.world);
                  saveReplayFrame(recorded);
                  connection.history.push(recorded);
                  if (connection.history.length > REPLAY_TICKS) connection.history.shift();
                  const goal = detectGoal(connection.world);
                  if (goal) {
                    const goalActions = recordGoal(connection.world, goal);
                    connection.world.state = 4;
                    send(goalPacket(connection.world, goal.team, goal.scorer, goal.assist, goal.speed));
                    for (const action of goalActions) send(action);
                    send(liveStatsPacket(connection.world));
                    const assistText = goal.assist === 255 ? "no assist" : `assisted by slot ${goal.assist + 1}`;
                    console.log(`${goal.team === 0 ? "Blue" : "Red"} goal — scored by slot ${goal.scorer + 1}, ${assistText}`);
                    if (connection.world.overtime) {
                      finishMatch();
                    } else {
                      connection.phase = "celebration";
                      connection.phaseTicks = 0;
                      connection.replayFrames = connection.history.slice();
                      while (connection.replayFrames.length < REPLAY_TICKS)
                        connection.replayFrames.unshift(connection.replayFrames[0] || recorded);
                    }
                  } else if (!connection.world.regulationFinished && connection.world.turn >= REGULATION_TICKS) {
                    connection.world.regulationFinished = true;
                    if (connection.world.scores[0] === connection.world.scores[1]) {
                      connection.world.overtime = true;
                      connection.world.turn = Math.max(connection.world.turn, REGULATION_TICKS + 1);
                      recordReplayEvent(connection.world, 203);
                      resetForKickoff(connection.world);
                      connection.history = [];
                      connection.startsAt = Date.now() + 4000;
                      send(startPacket(connection.world));
                    } else {
                      finishMatch();
                    }
                  }
                  snapshot = connection.phase === "ended" ? null : statePacket(connection.world);
                } else if (connection.phase === "celebration") {
                  connection.world.state = 4;
                  if (connection.pendingInput) {
                    const player = connection.world.players[0];
                    player.aim = connection.pendingInput.aim;
                    player.flags = connection.pendingInput.flags;
                    connection.pendingInput = null;
                  }
                  const events = simulate(connection.world);
                  for (const event of events) send(event);
                  if (events.some((event) => event[0] === 15)) send(liveStatsPacket(connection.world));
                  connection.world.state = 4;
                  connection.phaseTicks++;
                  snapshot = statePacket(connection.world);
                  saveReplayFrame(snapshot);
                  if (connection.phaseTicks >= CELEBRATION_TICKS) {
                    connection.phase = "replay";
                    connection.phaseTicks = 0;
                    connection.replayIndex = 0;
                    connection.world.state = 7;
                    send(replayStartPacket(connection.world.turn, REPLAY_TICKS));
                    snapshot = replayStatePacket(connection.replayFrames[0], connection.world.turn);
                  }
                } else if (connection.phase === "replay") {
                  connection.world.turn++;
                  connection.replayIndex++;
                  const index = Math.min(connection.replayIndex, connection.replayFrames.length - 1);
                  snapshot = replayStatePacket(connection.replayFrames[index], connection.world.turn);
                  saveReplayFrame(snapshot);
                  if (connection.replayIndex >= REPLAY_TICKS) {
                    connection.phase = "replay-hold";
                    connection.phaseTicks = 0;
                  }
                } else if (connection.phase === "replay-hold") {
                  connection.world.turn++;
                  connection.phaseTicks++;
                  snapshot = replayStatePacket(connection.replayFrames[connection.replayFrames.length - 1], connection.world.turn);
                  saveReplayFrame(snapshot);
                  if (connection.phaseTicks >= REPLAY_HOLD_TICKS) {
                    if (connection.world.turn >= REGULATION_TICKS &&
                        connection.world.scores[0] !== connection.world.scores[1]) {
                      connection.world.regulationFinished = true;
                      finishMatch();
                      snapshot = null;
                    } else {
                      if (connection.world.turn >= REGULATION_TICKS) {
                        connection.world.regulationFinished = true;
                        connection.world.overtime = true;
                        connection.world.turn = Math.max(connection.world.turn, REGULATION_TICKS + 1);
                        recordReplayEvent(connection.world, 203);
                      }
                      resetForKickoff(connection.world);
                      connection.phase = "playing";
                      connection.history = [];
                      connection.replayFrames = [];
                      connection.startsAt = Date.now() + 4000;
                      send(startPacket(connection.world));
                      snapshot = statePacket(connection.world);
                    }
                  }
                }
              }
              connection.networkTick++;
              if (connection.phase !== "ended" && connection.networkTick % PHYSICS_HZ === 0)
                send(liveStatsPacket(connection.world));
              if (connection.phase !== "ended" && connection.networkTick % SNAPSHOT_EVERY_TICKS === 0)
                send(snapshot || statePacket(connection.world));
              connection.nextTickAt += TICK_MS;
              steps++;
            }
            if (steps === 5 && now >= connection.nextTickAt) connection.nextTickAt = now + TICK_MS;
            if (connection.phase === "ended") {
              connection.loopTimer = null;
              return;
            }
            connection.loopTimer = setTimeout(runTick, Math.max(0, connection.nextTickAt - performance.now()));
          };
          connection.loopTimer = setTimeout(runTick, TICK_MS);
          console.log(connection.resuming ? "Local 4v4 arena resumed" : "Local 4v4 arena started");
          connection.resuming = false;
          break;
        case 4: {
          const now = Date.now();
          if (!connection.started || now - connection.lastChatAt < 350) break;
          const decoded = readString(packet, 1).value;
          const message = decoded.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 255);
          if (!message) break;
          connection.lastChatAt = now;
          send(chatPacket(0, message));
          break;
        }
        case 8: {
          if (!connection.started) break;
          try {
            connection.cachedReplay ||= buildNcrReplay(connection);
            send(Buffer.concat([Buffer.from([25]), connection.cachedReplay]));
            console.log(`Replay sent (${connection.cachedReplay.length.toLocaleString()} bytes)`);
          } catch (error) {
            console.error("Could not build replay", error);
          }
          break;
        }
      }
    }
  });

  const cleanup = () => {
    if (connection.cleaned) return;
    connection.cleaned = true;
    if (connection.loopTimer) clearTimeout(connection.loopTimer);
    connection.loopTimer = null;
    if (connection.joined) {
      if (connection.phase !== "ended") {
        const expiresAt = Date.now() + RECONNECT_TTL_MS;
        reconnectSessions.set(connection.reservationKey, { connection, expiresAt });
        const expiryTimer = setTimeout(() => {
          const saved = reconnectSessions.get(connection.reservationKey);
          if (saved?.connection === connection && saved.expiresAt <= Date.now())
            reconnectSessions.delete(connection.reservationKey);
        }, RECONNECT_TTL_MS + 50);
        expiryTimer.unref?.();
        console.log(`Game connection closed for ${connection.username}; reconnect available for 60s`);
      } else {
        console.log(`Game connection closed for ${connection.username}`);
      }
    }
  };
  socket.on("close", cleanup);
  socket.on("error", cleanup);
});

if (process.env.NC_LEGACY_SINGLEPLAYER !== "1") installSharedUpgradeHandler(server);

if (process.env.NC_NO_LISTEN !== "1") {
  server.listen(PORT, HOST, () => {
    console.log(`NitroClash local 4v4 prototype listening on ws://${HOST}:${PORT}`);
    console.log("Keep this window open, enable the userscript, then select the relabelled 4v4 mode.");
  });
}

export {
  ACTION,
  ACTION_POINTS,
  buildNcrReplay,
  changeConnectionMatch,
  chatPacket,
  completeArenaRematch,
  detectGoal,
  finishArena,
  gameOverPacket,
  createArena,
  liveStatsPacket,
  makeWorld,
  ncrFrameFromStatePacket,
  recordGoal,
  registerRematchVote,
  registerReplaySkipVote,
  server,
  statePacket,
};
