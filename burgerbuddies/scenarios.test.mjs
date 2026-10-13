import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame, INGREDIENTS } from './engine.js';

function rng(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
function fixture(seed = 123) { const game = createGame({ random: rng(seed) }); assert.equal(game.start().ok, true); return game; }
function build(game, recipe = game.state.target) {
  for (const id of recipe) assert.equal(game.addIngredient(id).ok, true, `Select ${id}`);
}
function advance(game, seconds) {
  while (seconds > 1e-9) { const dt = Math.min(.25, seconds); game.update(dt); seconds -= dt; }
}
function snapshot(game) { return JSON.stringify(game.state); }

test('children can match the visible recipe in selection order and earn a single stage reward', () => {
  for (const seed of [1, 42, 2026]) {
    const game = fixture(seed), recipe = [...game.state.target];
    assert.equal(recipe[0], 'bottom_bun'); assert.equal(recipe.at(-1), 'top_bun');
    recipe.forEach((id, index) => {
      assert.ok(INGREDIENTS[id]); assert.equal(game.addIngredient(id).ok, true);
      assert.deepEqual(game.state.stack, recipe.slice(0, index + 1));
    });
    advance(game, 3.5);
    assert.equal(game.submit().ok, true); assert.equal(game.state.phase, 'cleared');
    assert.equal(game.state.score, recipe.length * 100 + Math.ceil(41.5) * 5);
    const rewarded = snapshot(game);
    assert.equal(game.submit().ok, false); assert.equal(snapshot(game), rewarded);
    assert.equal(game.drainEvents().filter(event => event.type === 'stage-clear').length, 1);
  }
});

test('the same ingredients in the wrong order earn no points and can be gently corrected', () => {
  const game = fixture(), recipe = [...game.state.target];
  build(game, [...recipe].reverse());
  assert.equal(game.submit().reason, 'mismatch'); assert.equal(game.state.score, 0);
  assert.equal(game.state.phase, 'playing'); assert.ok(game.state.feedback.includes('고쳐'));
  assert.equal(game.state.remaining, 43);
  assert.deepEqual(game.state.stack, [...recipe].reverse());
  assert.equal(game.clearStack().ok, true);
  build(game, recipe.slice(0, -1));
  assert.equal(game.addIngredient('pickle').ok, true);
  assert.equal(game.undo().ok, true); assert.equal(game.addIngredient(recipe.at(-1)).ok, true);
  assert.deepEqual(game.state.stack, recipe); assert.equal(game.submit().ok, true);
  assert.ok(game.state.score > 0);
});

test('a 60 stage campaign increases complexity and speed within child friendly limits', () => {
  const game = fixture(86); let previousLength = 0, previousTime = Infinity, totalScore = 0;
  for (let stage = 1; stage <= 60; stage++) {
    assert.equal(game.state.stage, stage);
    assert.ok(game.state.target.length >= previousLength); assert.ok(game.state.target.length <= 12);
    if (stage >= 2 && stage <= 10) assert.equal(game.state.target.length, previousLength + 1);
    assert.ok(game.state.timeLimit <= previousTime); assert.ok(game.state.timeLimit >= 15);
    if (stage === 1) assert.equal(game.state.target.length, 3);
    if (stage === 3) assert.equal(game.state.target.length, 5);
    if (stage >= 10) assert.equal(game.state.target.length, 12);
    if (stage >= 16) assert.equal(game.state.timeLimit, 15);
    const previousRecipe = [...game.state.target];
    previousLength = previousRecipe.length; previousTime = game.state.timeLimit;
    build(game); assert.equal(game.submit().ok, true); totalScore += game.state.lastScore;
    assert.equal(game.state.score, totalScore);
    if (stage < 60) {
      assert.equal(game.nextStage().ok, true); assert.notDeepEqual(game.state.target, previousRecipe);
      assert.deepEqual(game.state.stack, []); assert.equal(game.state.remaining, game.state.timeLimit);
    }
  }
});

test('random recipes vary by seed and adjacent rounds differ even with a constant random source', () => {
  const recipes = new Set([1, 98765, 2026, 444].map(seed => JSON.stringify(fixture(seed).state.target)));
  assert.ok(recipes.size >= 2);
  for (const randomValue of [0, .5, .999]) {
    const game = createGame({ random: () => randomValue }); game.start();
    for (let stage = 0; stage < 25; stage++) {
      const previous = [...game.state.target]; build(game); game.submit(); game.nextStage();
      assert.notDeepEqual(game.state.target, previous);
    }
  }
});

test('pause freezes the exact deadline and timeout retry keeps recipe, stage and earned score', () => {
  const game = fixture(); build(game); game.submit(); game.nextStage();
  const recipe = [...game.state.target], score = game.state.score;
  advance(game, 2); const remaining = game.state.remaining;
  assert.equal(game.pause().ok, true); advance(game, 100);
  assert.equal(game.state.remaining, remaining); assert.equal(game.addIngredient('patty').ok, false);
  assert.equal(game.resume().ok, true); advance(game, remaining - .125);
  assert.equal(game.state.phase, 'playing'); assert.ok(Math.abs(game.state.remaining - .125) < 1e-7);
  advance(game, .125); assert.equal(game.state.phase, 'gameover'); assert.equal(game.state.remaining, 0);
  assert.equal(game.state.score, score); assert.equal(game.retry().ok, true);
  assert.equal(game.state.stage, 2); assert.deepEqual(game.state.target, recipe);
  assert.equal(game.state.score, score); assert.deepEqual(game.state.stack, []);
  assert.equal(game.state.remaining, game.state.timeLimit);
  build(game); assert.equal(game.submit().ok, true); assert.ok(game.state.score > score);
});

test('invalid actions cannot skip stages, change points or overflow the twelve layer stack', () => {
  const game = fixture(); const initial = snapshot(game);
  for (const method of ['nextStage', 'retry', 'resume', 'start']) assert.equal(game[method]().ok, false);
  for (const id of ['__proto__', 'constructor', 'unknown', null, undefined]) assert.equal(game.addIngredient(id).ok, false);
  for (const dt of [NaN, Infinity, -1, 0]) game.update(dt);
  assert.equal(snapshot(game), initial);
  for (let index = 0; index < 12; index++) assert.equal(game.addIngredient('cheese').ok, true);
  assert.equal(game.addIngredient('patty').reason, 'full'); assert.equal(game.state.stack.length, 12);
  assert.equal(game.state.score, 0); game.clearStack(); build(game); game.submit();
  const score = game.state.score; assert.equal(game.nextStage().ok, true);
  assert.equal(game.nextStage().ok, false); assert.equal(game.state.stage, 2); assert.equal(game.state.score, score);
  game.restart(); assert.equal(game.state.stage, 1); assert.equal(game.state.score, 0);
});
