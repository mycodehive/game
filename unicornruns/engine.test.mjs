import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, DIFFICULTIES, sampleTrack, createGame } from './engine.js';

const almost = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
function frames(game, seconds, input = {}) {
  for (let frame = 0; frame < Math.round(seconds * 60); frame++) game.update(1 / 60, input);
}
function ready(id = 'forest') { const game = createGame(); game.selectMap(id); game.start(); frames(game, 3); return game; }
function cross(a, b, c) { return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x); }
function intersects(a, b, c, d) { return cross(a, b, c) * cross(a, b, d) < -1e-9 && cross(c, d, a) * cross(c, d, b) < -1e-9; }

test('thirty distinct maps have ten courses per tier and smooth closed noncrossing geometry', () => {
  assert.equal(MAPS.length, 30); assert.equal(new Set(MAPS.map(map => map.id)).size, 30);
  assert.deepEqual(DIFFICULTIES.map(tier => tier.id), ['easy', 'medium', 'hard']);
  for (const [index, difficulty] of DIFFICULTIES.entries()) {
    const maps = MAPS.filter(map => map.difficulty === difficulty.id);
    assert.equal(maps.length, 10); assert.ok(maps.every(map => map.laps === index + 1));
    assert.deepEqual(maps.map(map => map.courseIndex), Array.from({ length: 10 }, (_, i) => i + 1));
  }
  assert.deepEqual(['forest', 'cloud', 'star'].map(id => MAPS.find(map => map.id === id).laps), [1, 2, 3]);
  assert.equal(new Set(MAPS.map(map => map.length.toFixed(5))).size, 30);
  assert.equal(new Set(MAPS.map(map => JSON.stringify(map.points))).size, 30);
  for (const map of MAPS) {
    assert.ok(map.name && map.description && map.color && map.length > 200 && map.width >= 8);
    const first = sampleTrack(map.id, 0), last = sampleTrack(map.id, 1);
    almost(first.x, last.x); almost(first.z, last.z);
    const samples = Array.from({ length: 257 }, (_, index) => sampleTrack(map.id, index / 256));
    for (let a = 0; a < 256; a++) {
      assert.ok(Number.isFinite(samples[a].x + samples[a].z + samples[a].yaw));
      for (let b = a + 2; b < 256; b++) {
        if (a === 0 && b === 255) continue;
        assert.equal(intersects(samples[a], samples[a + 1], samples[b], samples[b + 1]), false, `${map.id} crossed at ${a}/${b}`);
      }
    }
  }
});

test('arc-distance sampling is uniform, wraps negative/continuous laps and rejects no values', () => {
  for (const map of MAPS) {
    const distances = [];
    for (let i = 0; i < 500; i++) {
      const a = sampleTrack(map.id, i / 500), b = sampleTrack(map.id, (i + 1) / 500);
      distances.push(Math.hypot(b.x - a.x, b.z - a.z));
    }
    assert.ok(Math.max(...distances) / Math.min(...distances) < 1.025);
    const positive = sampleTrack(map.id, .35), wrapped = sampleTrack(map.id, 2.35), negative = sampleTrack(map.id, -.65);
    almost(positive.x, wrapped.x); almost(positive.z, negative.z);
  }
  assert.ok(Number.isFinite(sampleTrack('invalid', NaN).x));
});

test('3/2/1 countdown leaves pose and racing timer untouched at exact 3s boundary', () => {
  const game = createGame(); game.start();
  const pose = JSON.stringify(game.state.player);
  assert.deepEqual(game.drainEvents().map(event => event.value), [3]);
  frames(game, 1, { throttle: 1, steer: 1 });
  assert.equal(game.state.countdown, 2); assert.equal(game.state.elapsed, 0);
  assert.equal(JSON.stringify(game.state.player), pose);
  assert.deepEqual(game.drainEvents().map(event => event.value), [2]);
  frames(game, 1, { throttle: 1, steer: -1 });
  assert.equal(game.state.countdown, 1); assert.deepEqual(game.drainEvents().map(event => event.value), [1]);
  frames(game, 1, { throttle: 1, steer: 1 });
  assert.equal(game.state.phase, 'racing'); assert.equal(game.state.countdown, 0);
  assert.equal(game.state.elapsed, 0); assert.equal(JSON.stringify(game.state.player), pose);
  assert.equal(game.drainEvents()[0].type, 'race-start');
});

test('manual throttle defaults false and forward/throttle accelerate with no reverse', () => {
  const game = ready(); frames(game, 2);
  assert.equal(game.state.player.progress, 0); assert.equal(game.state.player.speed, 0);
  almost(game.state.elapsed, 2);
  frames(game, 1, { forward: true });
  assert.ok(game.state.player.progress > 0); assert.ok(game.state.player.speed > 10);
  const before = game.state.player.progress;
  frames(game, 1, { forward: -1 });
  assert.ok(game.state.player.progress >= before);
  assert.ok(game.state.player.speed < 3);
});

test('braking stops faster than releasing throttle and cannot run backwards', () => {
  const free = ready(), braking = ready(); frames(free, 2, { throttle: 1 }); frames(braking, 2, { throttle: 1 });
  const before = braking.state.player.progress;
  frames(free, .4); frames(braking, .4, { brake: true });
  assert.ok(braking.state.player.speed < free.state.player.speed);
  frames(braking, 1, { throttle: 1, brake: 1 });
  assert.equal(braking.state.player.speed, 0); assert.ok(braking.state.player.progress >= before);
});

test('steering is bounded, offtrack slows running and cannot shortcut lap progress', () => {
  const middle = ready('star'), edge = ready('star');
  frames(middle, 4, { throttle: 1 }); frames(edge, 4, { throttle: 1, steer: 1 });
  const map = MAPS.find(map => map.id === 'star');
  assert.ok(Math.abs(edge.state.player.lateral) <= map.width * .9 + 1e-8);
  assert.equal(edge.state.player.offTrack, true);
  assert.ok(edge.state.player.speed < middle.state.player.speed);
  assert.ok(edge.state.player.progress < middle.state.player.progress);
  assert.equal(edge.state.completedLaps, 0);
  const sample = sampleTrack(edge.state.mapId, edge.state.player.progress);
  almost(Math.hypot(edge.state.player.x - sample.x, edge.state.player.z - sample.z), Math.abs(edge.state.player.lateral));
  frames(edge, 2, { throttle: 1, steer: -1 });
  assert.ok(Math.abs(edge.state.player.lateral) < map.width / 2);
});

test('pause freezes countdown and entire racing state including elapsed', () => {
  const game = createGame(); game.start(); frames(game, .5); game.pause();
  let frozen = JSON.stringify(game.state); frames(game, 5, { throttle: 1 }); assert.equal(JSON.stringify(game.state), frozen);
  game.resume(); assert.equal(game.state.phase, 'countdown'); frames(game, 2.5); frames(game, 1, { throttle: 1 });
  game.pause(); frozen = JSON.stringify(game.state); frames(game, 5, { throttle: 1 }); assert.equal(JSON.stringify(game.state), frozen);
  game.resume(); assert.equal(game.state.phase, 'racing'); const elapsed = game.state.elapsed;
  frames(game, .5, { throttle: 1 }); assert.ok(game.state.elapsed > elapsed);
});

test('every map finishes its exact lap goal forward only and emits each crossing once', () => {
  for (const map of MAPS) {
    const game = ready(map.id), seen = [];
    let previous = 0;
    for (let frame = 0; frame < 10000 && game.state.phase !== 'finished'; frame++) {
      game.update(1 / 60, { throttle: 1 });
      assert.ok(game.state.player.progress >= previous); previous = game.state.player.progress;
      assert.ok(game.state.lap >= 1 && game.state.lap <= map.laps);
      seen.push(...game.drainEvents());
    }
    assert.equal(game.state.phase, 'finished');
    assert.equal(game.state.completedLaps, map.laps); assert.equal(game.state.lap, map.laps);
    almost(game.state.player.progress, map.laps);
    assert.deepEqual(seen.filter(event => event.type === 'lap').map(event => event.value), Array.from({ length: map.laps }, (_, i) => i + 1));
    assert.equal(seen.filter(event => event.type === 'finish').length, 1);
    assert.ok(game.state.elapsed > 8 && game.state.elapsed < 100);
    const frozen = JSON.stringify(game.state); frames(game, 3, { throttle: 1, steer: 1 }); assert.equal(JSON.stringify(game.state), frozen);
  }
});

test('selection/reset guards prevent changing maps midrace and return clears prior result state', () => {
  const game = ready('cloud');
  assert.equal(game.selectMap('star'), false); assert.equal(game.start(), false);
  frames(game, 1, { throttle: 1, steer: 1 }); game.returnToSelect();
  assert.equal(game.state.phase, 'select'); assert.equal(game.state.mapId, 'cloud');
  assert.equal(game.state.elapsed, 0); assert.equal(game.state.player.speed, 0); assert.equal(game.state.player.progress, 0);
  assert.equal(game.state.completedLaps, 0); assert.equal(game.state.lap, 1); assert.equal(game.state.countdown, 0);
  assert.equal(game.selectMap('invalid'), false); assert.equal(game.selectMap('star'), true);
  assert.equal(game.start(), true); assert.equal(game.state.countdown, 3);
});

test('invalid or large dt cannot skip countdown or produce nonfinite physics', () => {
  const game = createGame(); game.start(); game.update(500, { throttle: 1 });
  almost(game.state.countdown, 2.95);
  const frozen = JSON.stringify(game.state); game.update(-1); game.update(Infinity); game.update(NaN);
  assert.equal(JSON.stringify(game.state), frozen);
  frames(game, 3); game.update(.05, { throttle: NaN, steer: Infinity });
  assert.ok(Number.isFinite(game.state.player.x + game.state.player.z + game.state.elapsed));
});

test('changing frame rates preserves race timer and stable course results', () => {
  const times = [];
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    const game = createGame(); game.selectMap('star'); game.start();
    for (let frame = 0; frame < 20000 && game.state.phase !== 'finished'; frame++) game.update(dt, { throttle: 1 });
    assert.equal(game.state.phase, 'finished'); times.push(game.state.elapsed);
  }
  assert.ok(Math.max(...times) - Math.min(...times) < .03);
});


test('right steering is positive along the chase camera right vector on every course', () => {
  for (const map of MAPS) {
    for (const steer of [-1, 1]) {
      const game = ready(map.id);
      frames(game, .4, { throttle: 1, steer });
      const player = game.state.player, center = sampleTrack(map.id, player.progress);
      const screenRight = { x: -Math.cos(center.yaw), z: Math.sin(center.yaw) };
      const projection = (player.x - center.x) * screenRight.x + (player.z - center.z) * screenRight.z;
      assert.ok(projection * steer > 0, `${map.id} steer ${steer} projects in the wrong screen direction`);
      almost(projection, player.lateral);
    }
  }
});

test('course variations change intrinsic shape instead of only rotating an existing map', () => {
  const signatures = MAPS.map(map => {
    const points = Array.from({ length: 64 }, (_, index) => sampleTrack(map.id, index / 64));
    // Rotation/translation/scale invariant ratios of distances between sampled course points.
    const distances = points.map((point, index) => {
      const opposite = points[(index + 16) % points.length];
      return (Math.hypot(opposite.x - point.x, opposite.z - point.z) / map.length).toFixed(5);
    });
    return distances.join(',');
  });
  assert.equal(new Set(signatures).size, 30);
});
