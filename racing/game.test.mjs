import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from './libs/three.module.js';
import * as CANNON from './libs/cannon-es.js';

// Exercise game code with real geometry/vehicle physics and a minimal DOM adapter.
class Element {
  constructor(tag = 'div') { this.tag = tag; this.style = {}; this.children = []; this.childElementCount = 0; this.dataset = {}; this.classList = { add() {}, remove() {}, toggle() {} }; }
  appendChild(node) { this.children.push(node); this.childElementCount = this.children.length; return node; }
  insertBefore(node) { this.appendChild(node); }
  remove() {}
  setAttribute() {}
  addEventListener() {}
  querySelector() { return new Element(); }
  querySelectorAll() { return []; }
  focus() {}
  closest() { return this.tag === 'input' ? this : null; }
  getContext() { return new Proxy({ createLinearGradient: () => ({ addColorStop() {} }) }, { get: (target, key) => key in target ? target[key] : () => {} }); }
}
class RendererAdapter {
  constructor() { this.domElement = new Element('canvas'); this.shadowMap = {}; }
  setPixelRatio() {}
  setSize() {}
}
const eventHandlers = new Map();
const menu = new Element();
const records = new Map();
const document = { createElement: (tag) => new Element(tag), getElementById: () => menu, querySelector: () => null, addEventListener() {} };
const context = vm.createContext({
  ...CANNON, THREE: { ...THREE, WebGLRenderer: RendererAdapter }, Element, document, console, setTimeout, clearTimeout, AbortController,
  localStorage: { getItem: (key) => records.get(key), setItem: (key, value) => records.set(key, value) },
  window: { devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720, addEventListener: (type, fn) => { const handlers = eventHandlers.get(type) || []; handlers.push(fn); eventHandlers.set(type, handlers); } },
  requestAnimationFrame() {}, fetch: async () => ({ ok: false })
});
const source = fs.readFileSync(new URL('./main.js', import.meta.url), 'utf8').replace(/^import[\s\S]*?;\n/gm, '');
vm.runInContext(source.slice(0, source.indexOf('const loadingTextEl')) + '\nglobalThis.api = { Game, TRACKS, CONTROL_PRESETS, keys, getInput, escapeHtml, readLocalRecords };', context);
const { Game, TRACKS, CONTROL_PRESETS, keys, getInput, escapeHtml, readLocalRecords } = context.api;

// Name input retains normal browser typing; blur never leaves throttle stuck.
let prevented = false;
eventHandlers.get('keydown')[0]({ target: new Element('input'), code: 'KeyW', preventDefault: () => { prevented = true; } });
assert.equal(prevented, false); assert.equal(keys.size, 0);
eventHandlers.get('keydown')[0]({ target: new Element(), code: 'KeyW', preventDefault() {} });
assert.equal(getInput(CONTROL_PRESETS.single).accelerate, true);
eventHandlers.get('blur')[0](); assert.equal(keys.size, 0);
assert.equal(escapeHtml('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;');

const game = new Game();
game.track = TRACKS[0]; game.scene = new THREE.Scene(); game.physics = new CANNON.World();
game.physics.gravity.set(0, -9.82, 0); game.physics.broadphase = new CANNON.SAPBroadphase(game.physics);
game.bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
game.spline = new THREE.CatmullRomCurve3(game.track.spline.map((p) => new THREE.Vector3(...p)), true, 'catmullrom', .5);
game.startPoint = game.spline.getPointAt(0); game.startTangent = game.spline.getTangentAt(0).normalize();
game.startSide = new THREE.Vector3().crossVectors(game.startTangent, new THREE.Vector3(0, 1, 0)).normalize();
game.startYaw = Math.atan2(game.startTangent.x, game.startTangent.z);
game.checkpoints = [0, .25, .5, .75].map((t) => ({ position: game.spline.getPointAt(t).toArray(), forward: game.spline.getTangentAt(t).toArray(), width: game.track.width }));
game.initWorld();
const ground = game.physics.bodies.find((body) => body.shapes.some((shape) => shape instanceof CANNON.Plane));
assert.ok(ground);
// Regression: rotation must invalidate the plane's pre-rotation AABB on both Z sides.
for (const z of [-300, 300]) {
  const result = new CANNON.RaycastResult();
  assert.ok(game.physics.raycastClosest(new CANNON.Vec3(0, .4, z), new CANNON.Vec3(0, -.2, z), {}, result));
  assert.equal(result.body, ground);
}
const player = game.createPlayer(0, CONTROL_PRESETS.single, '테스트');
assert.equal(player.vehicle.wheelInfos.length, 4);
const origin = player.chassisBody.position.clone();
for (let frame = 0; frame < 120; frame++) game.physics.step(1 / 60);
keys.add('KeyW');
for (let frame = 0; frame < 180; frame++) { game.applyInput(player, 1 / 60); game.physics.step(1 / 60); game.syncPlayerVisual(player); }
keys.clear();
const distance = player.chassisBody.position.distanceTo(origin);
assert.ok(distance > 5, `Expected real forward travel, got ${distance}m`);
assert.ok(Math.abs(game.getSpeed(player)) > 10, `Expected driving speed, got ${game.getSpeed(player)}km/h`);
keys.add('KeyW'); keys.add('KeyQ'); const energy = player.boostEnergy; game.applyInput(player, 1);
assert.ok(player.boostEnergy < energy); assert.equal(player.vehicle.wheelInfos[2].engineForce, -7200);
keys.clear(); game.applyInput(player, 1); assert.ok(player.boostEnergy > energy - .28);

// Lap completes only after checkpoints 1→2→3→0, with a forward start-line crossing.
const lapGame = Object.create(Game.prototype);
Object.assign(lapGame, { started: true, track: { laps: 3, width: 14 }, checkpoints: [0, 100, 200, 300].map((x) => ({ position: [x, 0, 0], forward: [1, 0, 0] })) });
const lapPlayer = { finished: false, raceTime: 0, currentCheckpoint: 1, checkpointPreviousSide: null, chassisGroup: { position: new THREE.Vector3() }, lapTimes: [], bestLap: Infinity, lapStartTime: 0, currentLap: 1 };
const cross = (gate, reverse = false) => {
  const x = lapGame.checkpoints[gate].position[0];
  lapPlayer.chassisGroup.position.set(x + (reverse ? 2 : -2), 1, 0); lapGame.updateRace(lapPlayer, 1);
  lapPlayer.chassisGroup.position.set(x + (reverse ? -2 : 2), 1, 0); lapGame.updateRace(lapPlayer, 1);
};
cross(1, true); assert.equal(lapPlayer.currentCheckpoint, 1);
lapPlayer.checkpointPreviousSide = null;
cross(1); cross(2); cross(3); assert.equal(lapPlayer.lapTimes.length, 0); assert.equal(lapPlayer.currentCheckpoint, 0);
cross(0); assert.equal(lapPlayer.lapTimes.length, 1); assert.equal(lapPlayer.currentLap, 2); assert.equal(lapPlayer.currentCheckpoint, 1);

// Pause freezes physics and timers, including countdown; resume starts without held keys.
Object.assign(game, { players: [player], finished: false, started: true, paused: false, menuRoot: new Element(), raceControls: new Element(), touchKeys: new Map(), clock: { getDelta: () => 1 / 60 }, app: new Element(), audio: {}, accum: 0 });
game.renderScene = () => {};
keys.add('KeyW'); game.setPaused(true); assert.equal(keys.size, 0);
const before = player.chassisBody.position.clone(), beforeTime = player.raceTime;
game.loop(); assert.equal(player.chassisBody.position.distanceTo(before), 0); assert.equal(player.raceTime, beforeTime);
game.setPaused(false); assert.equal(game.paused, false); assert.equal(keys.size, 0);

// Static hosting still stores valid local results when the optional API is absent.
player.finishTime = 42; player.bestLap = 12;
await game.saveRecord('test-track', player);
assert.equal(readLocalRecords('test-track')[0].totalTimeMs, 42000);
assert.equal((await game.fetchTrackTop5('test-track'))[0].player, '테스트');
records.set('arcade-racing:broken', '{}'); assert.equal(readLocalRecords('broken').length, 0);
console.log(`PASS racing: real Three/Cannon scene, ${distance.toFixed(1)}m driving, bidirectional ground contacts, full laps, keyboard typing/blur, boost, pause, safe names, local records`);
