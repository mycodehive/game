import assert from 'node:assert/strict';
import { create2DRenderer } from './render2d.js';

class ContextAdapter {
  constructor() { this.calls = []; return new Proxy(this, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => {
        for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value), `${key}: nonfinite Canvas argument`);
        if (key === 'arc') assert.ok(args[2] >= 0, 'negative circle radius');
        target.calls.push({ method: key, args });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return { addColorStop(stop, color) { assert.ok(Number.isFinite(stop)); assert.equal(typeof color, 'string'); } };
      };
    },
    set(target, key, value) { if (typeof value === 'number') assert.ok(Number.isFinite(value), `${key}: nonfinite Canvas property`); target[key] = value; return true; }
  }); }
}
class CanvasAdapter {
  constructor() { this.style = {}; this.attributes = new Map(); this.context = new ContextAdapter(); this.rect = { left: 20, top: 40, width: 800, height: 600 }; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getContext(type) { assert.equal(type, '2d'); return this.context; }
  getBoundingClientRect() { return this.rect; }
  remove() { this.removed = true; }
}
const observers = [];
class ResizeObserverAdapter {
  constructor(callback) { this.callback = callback; observers.push(this); }
  observe(node) { this.node = node; }
  disconnect() { this.disconnected = true; }
}
const listeners = new Map();
globalThis.window = { devicePixelRatio: 3, addEventListener(type, fn) { listeners.set(type, fn); }, removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type); } };
globalThis.document = { createElement(tag) { assert.equal(tag, 'canvas'); return new CanvasAdapter(); } };
globalThis.ResizeObserver = ResizeObserverAdapter;
const container = { rect: { left: 20, top: 40, width: 800, height: 600 }, getBoundingClientRect() { return this.rect; }, appendChild(node) { this.canvas = node; } };
const renderer = create2DRenderer(container);
assert.equal(renderer.canvas, container.canvas);
assert.equal(renderer.canvas.width, 1600); assert.equal(renderer.canvas.height, 1200); // DPR limited to2.
assert.ok(renderer.canvas.attributes.get('aria-label').includes('2D'));
assert.equal(observers[0].node, container);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} should equal ${expected}`);
let point = renderer.screenToWorld(420, 340); near(point.x, 50); near(point.y, 70);
// 800×600: portrait arena has horizontal letterboxes, world origin x=(800-600/1.4)/2.
const offset = (800 - 600 / 1.4) / 2;
point = renderer.screenToWorld(20 + offset, 40); near(point.x, 0); near(point.y, 0);
point = renderer.screenToWorld(20 + 800, 40 + 600); assert.ok(point.x > 100); near(point.y, 140); // Engine owns clamping.
// Actual CSS scaling is included even if layout changes before ResizeObserver fires.
renderer.canvas.rect = { left: 10, top: 30, width: 400, height: 300 };
point = renderer.screenToWorld(210, 180); near(point.x, 50); near(point.y, 70);
container.rect = { left: 10, top: 30, width: 300, height: 600 }; renderer.canvas.rect = { ...container.rect }; observers[0].callback();
assert.equal(renderer.canvas.width, 600); assert.equal(renderer.canvas.height, 1200);
point = renderer.screenToWorld(160, 330); near(point.x, 50); near(point.y, 70);
// Portrait arena letterboxes vertically: 300×420 arena centered in600px display.
point = renderer.screenToWorld(10, 120); near(point.x, 0); near(point.y, 0);

const base = {
  phase: 'playing', level: 3, score: 400, lives: 3, combo: 5,
  paddle: { x: 50, y: 130, width: 20, height: 2.7 },
  balls: [{ id: 'one', x: 30, y: 70, vx: 4, vy: -20, radius: 1, attached: false }, { id: 'two', x: 55, y: 125, vx: 0, vy: 0, radius: .9, attached: true }],
  bricks: ['normal', 'armor', 'blast', 'moving', 'boss'].map((type, index) => ({ id: `brick${index}`, type, x: 14 + index * 17, y: 20, w: 12, h: 5, hp: index + 1, maxHp: index + 2, alive: true })),
  drops: ['multi', 'pierce', 'laser', 'expand', 'shield', 'slow', 'heal'].map((kind, index) => ({ id: index, x: 10 + index * 12, y: 98, kind })),
  shots: [{ id: 'shot', x: 45, y: 109 }], effects: { expand: 2, laser: 3, pierce: 2, slow: 0, shield: 1 }
};
const events = ['brick-hit', 'brick-break', 'paddle-hit', 'wall-hit', 'item', 'life-lost', 'level-clear', 'launch', 'shot', 'upgrade', 'gameover'].map((type, index) => ({ type, x: 14 + index, y: 20, kind: 'laser', combo: index, color: '#ff75aa' }));
const snapshot = JSON.stringify(base), eventSnapshot = JSON.stringify(events);
renderer.render(base, events, 1 / 60);
renderer.render({ ...base, balls: base.balls.map((ball) => ({ ...ball, x: ball.x + 1, y: ball.y - 1 })) }, [], 1 / 60);
assert.equal(JSON.stringify(base), snapshot); assert.equal(JSON.stringify(events), eventSnapshot);
const calls = renderer.canvas.context.calls;
assert.ok(calls.some((call) => call.method === 'clip'));
assert.ok(calls.some((call) => call.method === 'fillText' && call.args[0] === 'M'));
assert.ok(calls.some((call) => call.method === 'fillText' && call.args[0] === '◆'));
assert.ok(calls.some((call) => call.method === 'fillText' && call.args[0] === 'S'));
assert.ok(calls.some((call) => call.method === 'fillText' && call.args[0] === 'W'));
assert.ok(calls.filter((call) => call.method === 'arc').length > 10);
for (const phase of ['ready', 'paused', 'upgrade', 'gameover']) renderer.render({ ...base, phase }, [], .016);
renderer.render({ ...base, effects: { slow: 2 }, balls: [{ id: 'slow', x: NaN, y: Infinity, radius: -2 }] }, [{ type: 'launch', x: NaN }], Infinity);

// Event storms cannot grow drawing workload without a cap (220 sparks+24 rings).
const empty = { phase: 'playing', level: 1, bricks: [], balls: [], drops: [], shots: [], effects: {} };
renderer.canvas.context.calls.length = 0;
renderer.render(empty, Array.from({ length: 1000 }, () => ({ type: 'brick-break', x: 50, y: 50 })), 0);
assert.equal(renderer.canvas.context.calls.filter((call) => call.method === 'arc').length, 24);
assert.ok(renderer.canvas.context.calls.filter((call) => call.method === 'fillRect').length <= 290);
renderer.canvas.context.calls.length = 0;
for (let frame = 0; frame < 60; frame++) renderer.render(empty, [], .06);
renderer.canvas.context.calls.length = 0; renderer.render(empty, [], .06);
assert.equal(renderer.canvas.context.calls.filter((call) => call.method === 'arc').length, 0);

const reduced = create2DRenderer(container, { reducedMotion: true });
reduced.render(empty, [{ type: 'brick-break', x: 50, y: 50 }, { type: 'life-lost', x: 30, y: 120 }], .016);
assert.ok(reduced.canvas.context.calls.filter((call) => call.method === 'translate').every((call) => call.args[0] === 0 && call.args[1] === 90)); // Board viewport only, no camera shake.
assert.equal(reduced.canvas.context.calls.filter((call) => call.method === 'fillRect').length, 67); // Cosmic backdrop only, no motion particles.
const count = renderer.canvas.context.calls.length;
renderer.dispose(); assert.ok(observers[0].disconnected); assert.ok(renderer.canvas.removed); assert.equal(renderer.canvas.width, 1);
const afterDispose = renderer.canvas.context.calls.length;
renderer.render(base, events, .016); renderer.resize(); assert.equal(renderer.canvas.context.calls.length, afterDispose); assert.ok(afterDispose > count);
renderer.dispose(); reduced.dispose();

// Window resize fallback works where ResizeObserver is unavailable.
delete globalThis.ResizeObserver;
const fallback = create2DRenderer(container); assert.ok(listeners.has('resize'));
fallback.dispose(); assert.ok(!listeners.has('resize'));
console.log('PASS breakout2D: all entity/effect/event types, finite drawing, faithful letterbox/pointer mapping, DPR/resize, capped particles/rings, reduced motion, state immutability and disposal');
