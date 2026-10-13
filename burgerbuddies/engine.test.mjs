import assert from 'node:assert/strict';
import { createGame, INGREDIENTS } from './engine.js';

let checks = 0;
function test(name, fn) { fn(); checks++; console.log(`✓ ${name}`); }
const complete = game => { game.state.target.forEach(id => assert.equal(game.addIngredient(id).ok, true)); return game.submit(); };
const elapse = (game, seconds) => { for (let i = 0; i < seconds * 4; i++) game.update(.25); };

test('Ingredient roster has finite 3D dimensions and child-friendly names', () => {
  assert.equal(Object.keys(INGREDIENTS).length, 10);
  for (const item of Object.values(INGREDIENTS)) { assert.ok(item.name && item.description && /^#[a-f0-9]{6}$/i.test(item.color)); assert.ok(item.height > 0 && item.height < 1); }
});
test('Initial screen waits for start and starts a bounded sandwich', () => {
  const g = createGame({random: () => .5});
  g.update(.25); assert.equal(g.state.phase, 'intro'); assert.equal(g.state.remaining, 45);
  assert.equal(g.addIngredient('patty').ok, false); assert.equal(g.nextStage().ok, false);
  assert.equal(g.start().ok, true); assert.equal(g.state.phase, 'playing'); assert.equal(g.state.target.length, 3);
  assert.equal(g.state.target[0], 'bottom_bun'); assert.equal(g.state.target.at(-1), 'top_bun');
});
test('Exact order earns score once; cleared stage timer is frozen', () => {
  const g = createGame(); g.start(); elapse(g, 3);
  assert.equal(complete(g).ok, true); assert.equal(g.state.phase, 'cleared'); assert.equal(g.state.score, 510);
  const remaining = g.state.remaining; g.update(.25); assert.equal(g.state.remaining, remaining);
  assert.equal(g.submit().ok, false); assert.equal(g.state.score, 510); assert.equal(g.addIngredient('egg').ok, false);
});
test('Wrong length or wrong order preserves editable stack with gentle penalty', () => {
  const g = createGame(); g.start(); g.addIngredient('top_bun');
  assert.equal(g.submit().reason, 'mismatch'); assert.equal(g.state.remaining, 43); assert.deepEqual(g.state.stack, ['top_bun']);
  g.clearStack(); [...g.state.target].reverse().forEach(id => g.addIngredient(id));
  assert.equal(g.submit().ok, false); assert.equal(g.state.score, 0); assert.equal(g.state.remaining, 41);
  assert.equal(g.undo().ok, true); assert.equal(g.clearStack().ok, true); assert.deepEqual(g.state.stack, []);
  assert.equal(g.undo().reason, 'empty'); assert.equal(g.addIngredient('unknown').reason, 'ingredient');
});
test('Pause freezes time and edit actions; resume preserves progress', () => {
  const g = createGame(); g.start(); g.addIngredient('bottom_bun'); elapse(g, 2);
  g.pause(); elapse(g, 100); assert.equal(g.state.remaining, 43); assert.equal(g.undo().ok, false); assert.equal(g.submit().ok, false);
  g.resume(); assert.equal(g.state.phase, 'playing'); assert.deepEqual(g.state.stack, ['bottom_bun']); elapse(g, 1); assert.equal(g.state.remaining, 42);
});
test('Timeout retry retains recipe/stage/score, restart starts fresh', () => {
  const g = createGame(); g.start(); complete(g); const score = g.state.score; g.nextStage();
  const target = [...g.state.target]; elapse(g, 43); assert.equal(g.state.phase, 'gameover'); assert.equal(g.state.remaining, 0);
  assert.equal(g.addIngredient('patty').ok, false); assert.equal(g.retry().ok, true); assert.deepEqual(g.state.target, target);
  assert.equal(g.state.stage, 2); assert.equal(g.state.score, score); assert.equal(g.state.remaining, 43); assert.deepEqual(g.state.stack, []);
  g.restart(); assert.equal(g.state.stage, 1); assert.equal(g.state.score, 0); assert.equal(g.state.remaining, 45);
});
test('Campaign gets faster and more complex with bounded randomized recipes', () => {
  const g = createGame({random: () => 0}); g.start();
  let lastTarget = ''; let lastTime = Infinity; let lastLength = 0;
  for (let stage = 1; stage <= 60; stage++) {
    assert.equal(g.state.stage, stage); assert.ok(g.state.timeLimit <= lastTime && g.state.timeLimit >= 15);
    assert.ok(g.state.target.length >= lastLength && g.state.target.length <= 12);
    assert.notEqual(g.state.target.join(','), lastTarget); assert.equal(g.state.target[0], 'bottom_bun'); assert.equal(g.state.target.at(-1), 'top_bun');
    assert.ok(g.state.target.every(id => INGREDIENTS[id]));
    lastTarget = g.state.target.join(','); lastTime = g.state.timeLimit; lastLength = g.state.target.length;
    assert.equal(complete(g).ok, true); g.nextStage(); assert.deepEqual(g.state.stack, []);
  }
});
test('Stack cap and bad delta cannot corrupt the game', () => {
  const g = createGame({random: () => NaN}); g.start();
  for (let i = 0; i < 12; i++) assert.equal(g.addIngredient('patty').ok, true);
  assert.equal(g.addIngredient('patty').reason, 'full'); assert.equal(g.state.stack.length, 12);
  for (const dt of [NaN, Infinity, -1, 0]) g.update(dt); assert.equal(g.state.remaining, 45);
  g.update(100); assert.equal(g.state.remaining, 44.75);
  g.drainEvents(); assert.deepEqual(g.drainEvents(), []);
});
test('Penalty at deadline ends the stage without negative time', () => {
  const g = createGame(); g.start(); elapse(g, 44); assert.equal(g.submit().ok, false);
  assert.equal(g.state.remaining, 0); assert.equal(g.state.phase, 'gameover');
});
console.log(`${checks} Burger Buddies engine tests passed.`);
