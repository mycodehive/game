import assert from 'node:assert/strict';
import test from 'node:test';
import { MAPS, createGame, sampleTrack } from './engine.js';

function near(actual, expected, epsilon = 1e-7) { assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} ≈ ${expected}`); }
function seconds(game, duration, input = {}) {
  const frames = Math.floor(duration / .05 + 1e-8);
  for (let frame = 0; frame < frames; frame++) game.update(.05, input);
  const remainder = duration - frames * .05;
  if (remainder > 1e-10) game.update(remainder, input);
}
function newRace(id) {
  const game = createGame();
  assert.equal(game.selectMap(id), true); assert.equal(game.start(), true);
  return game;
}
function finitePlayer(state) {
  for (const [name, value] of Object.entries(state.player)) if (typeof value === 'number') assert.ok(Number.isFinite(value), `${name} remains finite`);
  assert.ok(Number.isFinite(state.elapsed));
}
function legitimateRun(game) {
  const map = MAPS.find((entry) => entry.id === game.state.mapId);
  const lapEvents = [];
  for (let frame = 0; frame < 4000 && game.state.phase === 'racing'; frame++) {
    const before = { progress: game.state.player.progress, completed: game.state.completedLaps, elapsed: game.state.elapsed };
    game.update(.05, { throttle: 1 });
    assert.ok(game.state.player.progress >= before.progress, 'Forward movement cannot reverse distance');
    assert.ok(game.state.player.progress - before.progress <= 26 * .05 / map.length + 1e-8, 'Progress cannot jump over track distance');
    assert.ok(game.state.completedLaps - before.completed <= 1, 'A frame cannot skip a whole lap');
    near(game.state.completedLaps, Math.min(map.laps, Math.floor(game.state.player.progress + 1e-10)));
    assert.ok(game.state.lap >= 1 && game.state.lap <= map.laps);
    assert.ok(game.state.elapsed - before.elapsed >= 0 && game.state.elapsed - before.elapsed <= .05 + 1e-7);
    const sample = sampleTrack(map.id, game.state.player.progress);
    near(game.state.player.x, sample.x); near(game.state.player.z, sample.z);
    finitePlayer(game.state);
    lapEvents.push(...game.drainEvents().filter((event) => event.type === 'lap').map((event) => event.value));
  }
  assert.equal(game.state.phase, 'finished', `${map.name} can be finished with actual throttle input`);
  assert.equal(game.state.completedLaps, map.laps); near(game.state.player.progress, map.laps);
  assert.equal(game.state.player.speed, 0);
  assert.deepEqual(lapEvents, Array.from({ length: map.laps }, (_, index) => index + 1));
  return game.state.elapsed;
}

test('three genuinely different closed maps expose valid one/two/three-lap selections', () => {
  assert.equal(MAPS.length, 3); assert.equal(new Set(MAPS.map((map) => map.id)).size, 3);
  assert.deepEqual(MAPS.map((map) => map.laps), [1, 2, 3]);
  assert.equal(new Set(MAPS.map((map) => JSON.stringify(map.points))).size, 3);
  assert.equal(new Set(MAPS.map((map) => Math.round(map.length))).size, 3);
  for (const map of MAPS) {
    assert.ok(map.length > 100); assert.ok(map.width > 0); assert.ok(map.laps <= 3);
    const start = sampleTrack(map.id, 0), end = sampleTrack(map.id, 1), negative = sampleTrack(map.id, -1);
    for (const coordinate of ['x', 'z', 'yaw']) { near(start[coordinate], end[coordinate]); near(start[coordinate], negative[coordinate]); }
    for (let sample = 0; sample < 100; sample++) {
      const point = sampleTrack(map.id, sample / 100);
      assert.ok(Object.values(point).every(Number.isFinite));
    }
    const game = createGame(); assert.equal(game.selectMap(map.id), true); assert.equal(game.state.mapId, map.id);
  }
  const game = createGame(), state = JSON.stringify(game.state);
  assert.equal(game.selectMap('missing-course'), false); assert.equal(JSON.stringify(game.state), state);
});

test('3→2→1 countdown holds exact position, speed, progress and racing time despite held controls', () => {
  for (const map of MAPS) {
    const game = newRace(map.id), player = JSON.stringify(game.state.player);
    assert.equal(game.state.phase, 'countdown'); assert.equal(game.state.countdown, 3);
    const initial = game.drainEvents(); assert.deepEqual(initial.filter((event) => event.type === 'countdown').map((event) => event.value), [3]);
    seconds(game, 1, { throttle: 1, steer: 1 });
    assert.equal(game.state.countdown, 2); assert.equal(game.state.phase, 'countdown');
    assert.equal(JSON.stringify(game.state.player), player); assert.equal(game.state.elapsed, 0);
    assert.deepEqual(game.drainEvents().filter((event) => event.type === 'countdown').map((event) => event.value), [2]);
    seconds(game, 1, { forward: true, steer: -1 });
    assert.equal(game.state.countdown, 1); assert.equal(JSON.stringify(game.state.player), player); assert.equal(game.state.elapsed, 0);
    assert.deepEqual(game.drainEvents().filter((event) => event.type === 'countdown').map((event) => event.value), [1]);
    seconds(game, .999, { throttle: 1 }); assert.equal(game.state.phase, 'countdown'); near(game.state.countdown, .001);
    assert.equal(JSON.stringify(game.state.player), player); assert.equal(game.state.elapsed, 0);
    game.update(.001, { throttle: 1 }); assert.equal(game.state.phase, 'racing'); assert.equal(game.state.countdown, 0);
    assert.equal(JSON.stringify(game.state.player), player); assert.equal(game.state.elapsed, 0);
    assert.equal(game.drainEvents().filter((event) => event.type === 'race-start').length, 1);
    game.update(.05, { throttle: 1 }); assert.ok(game.state.player.progress > 0); assert.ok(game.state.player.speed > 0); near(game.state.elapsed, .05);
  }
});

test('pause freezes countdown and racing, and leaving selection or switching maps cannot interrupt a race', () => {
  const game = newRace('cloud'); seconds(game, .8, { throttle: 1 });
  assert.equal(game.pause(), true); assert.equal(game.state.pausePhase, 'countdown');
  const pausedCountdown = JSON.stringify(game.state); seconds(game, 6, { throttle: 1, steer: 1 }); assert.equal(JSON.stringify(game.state), pausedCountdown);
  assert.equal(game.start(), false); assert.equal(game.selectMap('star'), false); assert.equal(game.resume(), true);
  seconds(game, 2.2); assert.equal(game.state.phase, 'racing'); seconds(game, 2, { throttle: 1 });
  assert.equal(game.pause(), true); assert.equal(game.state.pausePhase, 'racing');
  const pausedRace = JSON.stringify(game.state); seconds(game, 10, { throttle: 1, steer: -1 }); assert.equal(JSON.stringify(game.state), pausedRace);
  assert.equal(game.resume(), true); assert.equal(game.state.phase, 'racing');
  const progress = game.state.player.progress; game.update(.05, { forward: true }); assert.ok(game.state.player.progress > progress);
  assert.equal(game.selectMap('forest'), false); assert.equal(game.start(), false); assert.equal(game.state.mapId, 'cloud');
});

test('every map reaches all laps by legitimate throttle movement, never early, then cleanly returns to selection', () => {
  const times = [];
  for (const map of MAPS) {
    const game = newRace(map.id); seconds(game, 3); game.drainEvents();
    assert.equal(game.state.phase, 'racing'); assert.equal(game.state.elapsed, 0);
    const elapsed = legitimateRun(game); times.push(`${map.id}: ${map.laps}lap ${elapsed.toFixed(2)}s`);
    assert.ok(elapsed >= map.length * map.laps / 26, 'Finish requires physically traveling the full map length');
    const finishState = JSON.stringify(game.state); seconds(game, 5, { throttle: 1, steer: 1 }); assert.equal(JSON.stringify(game.state), finishState);
    game.returnToSelect(); assert.equal(game.state.phase, 'select'); assert.equal(game.state.mapId, map.id);
    assert.equal(game.state.completedLaps, 0); assert.equal(game.state.lap, 1); assert.equal(game.state.elapsed, 0); assert.equal(game.state.countdown, 0);
    assert.equal(game.state.player.progress, 0); assert.equal(game.state.player.speed, 0); assert.equal(game.state.player.lateral, 0);
    assert.equal(game.drainEvents().length, 0); assert.equal(game.start(), true);
    assert.deepEqual(game.drainEvents().filter((event) => event.type === 'countdown').map((event) => event.value), [3]);
  }
  console.log(`Actual full-course runs: ${times.join(' | ')}`);
});

test('lane steering cannot shortcut laps, off-track slows down, braking works, and map change clears previous race state', () => {
  const game = newRace('forest'); seconds(game, 3); seconds(game, 5, { throttle: 1, steer: 1 });
  assert.equal(game.state.player.offTrack, true); assert.ok(game.state.player.speed <= 7 + 1e-7);
  const map = MAPS[0]; assert.ok(Math.abs(game.state.player.lateral) <= map.width * .9);
  const sample = sampleTrack(map.id, game.state.player.progress);
  near(Math.hypot(game.state.player.x - sample.x, game.state.player.z - sample.z), Math.abs(game.state.player.lateral));
  assert.equal(game.state.completedLaps, 0); assert.ok(game.state.player.progress < 1);
  for (let frame = 0; frame < 200 && game.state.player.lateral > 1; frame++) game.update(.05, { throttle: 1, steer: -1 });
  assert.equal(game.state.player.offTrack, false); seconds(game, 1.5, { throttle: 1 }); assert.ok(game.state.player.speed > 7);
  seconds(game, 1.5, { brake: true, throttle: 1 }); assert.equal(game.state.player.speed, 0);
  finitePlayer(game.state);
  game.returnToSelect(); assert.equal(game.selectMap('star'), true); assert.equal(game.state.mapId, 'star');
  assert.equal(game.state.lap, 1); assert.equal(game.state.elapsed, 0); assert.equal(game.state.player.lateral, 0); assert.equal(game.state.player.offTrack, false);
  const start = sampleTrack('star', 0); near(game.state.player.x, start.x); near(game.state.player.z, start.z);
  const pristine = JSON.stringify(game.state); game.update(100, { throttle: 1 }); assert.equal(JSON.stringify(game.state), pristine);
  assert.equal(game.start(), true); const countdown = JSON.stringify(game.state);
  game.update(NaN, { steer: Infinity }); assert.equal(JSON.stringify(game.state), countdown);
});
