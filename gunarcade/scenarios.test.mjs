import assert from 'node:assert/strict';
import test from 'node:test';
import { HEROES, WEAPONS, createGame } from './engine.js';

// These campaign checks use public actions and movement/contact, without changing
// health, enemy positions or weapon inventory to force a successful encounter.
function rng(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
function newCampaign(hero = 'ranger', seed = 42) {
  const game = createGame({ random: rng(seed) });
  assert.equal(game.selectCharacter(hero), true);
  game.start();
  return game;
}
function near(actual, expected, epsilon = 1e-6) { assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} ≈ ${expected}`); }
function seconds(game, duration, input = {}) {
  const frames = Math.floor(duration / .05 + 1e-8);
  for (let frame = 0; frame < frames; frame++) game.update(.05, input);
  const remainder = duration - frames * .05;
  if (remainder > 1e-8) game.update(remainder, input);
}
function walkTo(game, x, z, maxSeconds = 12) {
  for (let frame = 0; frame < maxSeconds / .05; frame++) {
    const p = game.state.player, dx = x - p.x, dz = z - p.z, distance = Math.hypot(dx, dz);
    if (distance <= 1.15) return;
    game.update(.05, { moveX: dx / distance, moveZ: dz / distance });
  }
  assert.fail(`Unreachable movement goal (${x},${z}) from (${game.state.player.x},${game.state.player.z})`);
}
function getRifle(game) {
  walkTo(game, 0, -4);
  assert.ok(game.state.weapons.some((weapon) => weapon.kind === 'rifle'), 'Walking into the supply crate equips a rifle');
}
function finishPrep(game) {
  for (let frame = 0; frame < 610 && game.state.phase === 'prepare'; frame++) game.update(.05, {});
  assert.notEqual(game.state.phase, 'prepare', 'Preparation must expire in finite time');
}
function kiteWave(game, maxSeconds = 80) {
  let elapsed = 0;
  for (let frame = 0; frame < maxSeconds / .05 && game.state.phase === 'combat'; frame++) {
    const p = game.state.player;
    // Orbit in the open central lane, away from the side barricades. Aim at the
    // actual nearest living enemy rather than editing or removing enemies.
    const angle = elapsed * .45, targetX = Math.sin(angle) * 7, targetZ = Math.cos(angle) * 7;
    const dx = targetX - p.x, dz = targetZ - p.z, distance = Math.hypot(dx, dz);
    const enemies = game.state.enemies.filter((enemy) => enemy.alive);
    enemies.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    const target = enemies[0];
    game.update(.05, { moveX: distance > .01 ? dx / distance : 0, moveZ: distance > .01 ? dz / distance : 0, aimX: target?.x, aimZ: target?.z, fire: true });
    elapsed += .05;
  }
  return elapsed;
}
function finiteSimulation(state) {
  for (const entity of [state.player, ...state.weapons, ...state.enemies, ...state.bullets, ...state.pickups]) {
    for (const [name, value] of Object.entries(entity)) if (typeof value === 'number') assert.ok(Number.isFinite(value), `${name} remains finite`);
  }
}

test('four heroes have distinct attributes and weapon acquisition applies actual power/tech', () => {
  assert.equal(HEROES.length, 4);
  assert.equal(new Set(HEROES.map((hero) => hero.id)).size, 4);
  assert.equal(new Set(HEROES.map((hero) => JSON.stringify(hero.stats))).size, 4);
  const stats = [];
  for (const hero of HEROES) {
    const game = newCampaign(hero.id, 314);
    assert.equal(game.state.player.maxHp, hero.stats.health);
    assert.equal(game.state.player.speed, hero.stats.speed);
    assert.equal(game.state.weapons.length, 0);
    getRifle(game);
    const rifle = game.state.weapons[0];
    near(rifle.damage, WEAPONS.rifle.baseDamage * hero.stats.power);
    near(rifle.cooldown, WEAPONS.rifle.baseCooldown / hero.stats.tech);
    stats.push([rifle.damage, rifle.cooldown]);
    assert.equal(game.selectCharacter('tank'), false, 'Character cannot change midway through a stage');
    finiteSimulation(game.state);
  }
  assert.equal(new Set(stats.map((value) => JSON.stringify(value))).size, 4);
});

test('exact 30-second no-weapon deadline: no early enemies or bullets and meaningful loss', () => {
  const game = newCampaign();
  seconds(game, 29.95, { fire: true });
  assert.equal(game.state.phase, 'prepare'); near(game.state.prepRemaining, .05);
  assert.equal(game.state.enemies.length, 0); assert.equal(game.state.bullets.length, 0);
  game.update(.049, { fire: true }); assert.equal(game.state.phase, 'prepare'); near(game.state.prepRemaining, .001);
  game.update(.001, { fire: true }); assert.equal(game.state.phase, 'gameover');
  assert.equal(game.state.failureReason, 'no_weapon'); assert.equal(game.state.prepRemaining, 0);
  assert.equal(game.state.enemies.length, 0); assert.equal(game.state.bullets.length, 0);
  const event = game.drainEvents().find((event) => event.type === 'gameover'); assert.equal(event.kind, 'no_weapon');
  const before = JSON.stringify(game.state); seconds(game, 3, { fire: true, moveX: 1 }); assert.equal(JSON.stringify(game.state), before);
});

test('pickup/contact, movement boundaries, pause and full prep remain independent of firing', () => {
  const game = newCampaign('scout');
  getRifle(game);
  const remaining = game.state.prepRemaining;
  game.update(.05, { fire: true });
  assert.equal(game.state.phase, 'prepare'); assert.equal(game.state.bullets.length, 0); assert.equal(game.state.enemies.length, 0);
  near(game.state.prepRemaining, remaining - .05);
  assert.equal(game.pause(), true);
  const paused = JSON.stringify(game.state); seconds(game, 6, { fire: true, moveX: 1 }); assert.equal(JSON.stringify(game.state), paused);
  assert.equal(game.resume(), true); assert.equal(game.state.phase, 'prepare');
  walkTo(game, 0, -10); walkTo(game, 26, -26);
  const p = { ...game.state.player };
  finishPrep(game); assert.equal(game.state.phase, 'combat');
  assert.equal(game.state.stageEnemyTotal, 6);
  for (const enemy of game.state.enemies) {
    assert.ok(Math.hypot(enemy.x - p.x, enemy.z - p.z) >= 12 - 1e-6, 'Enemy spawns around the current player, at a fair distance');
    assert.ok(Math.abs(enemy.x) < game.state.arenaHalf && Math.abs(enemy.z) < game.state.arenaHalf);
  }
  const original = new Map(game.state.enemies.map((enemy) => [enemy.id, Math.hypot(enemy.x - p.x, enemy.z - p.z)]));
  seconds(game, .5, {});
  assert.ok(game.state.enemies.some((enemy) => Math.hypot(enemy.x - p.x, enemy.z - p.z) < original.get(enemy.id) - .5), 'Live enemies actually approach the player');
  assert.equal(game.pause(), true);
  const combatPaused = JSON.stringify(game.state); seconds(game, 2, { moveZ: -1, fire: true }); assert.equal(JSON.stringify(game.state), combatPaused);
  assert.equal(game.resume(), true);
  seconds(game, 1, { moveX: 1, moveZ: -1 });
  assert.ok(Math.abs(game.state.player.x) <= game.state.arenaHalf - .8 && Math.abs(game.state.player.z) <= game.state.arenaHalf - .8);
  finiteSimulation(game.state);
});

test('engineer collects four actual crates, switches capped slots and fires finite rail/pellet weapons', () => {
  const game = newCampaign('engineer', 910);
  getRifle(game); walkTo(game, -8, -10); walkTo(game, 8, -10); walkTo(game, 0, 10);
  assert.equal(game.state.weapons.length, 3);
  assert.deepEqual(game.state.weapons.map((weapon) => weapon.kind), ['burst', 'shotgun', 'rail']);
  assert.equal(game.state.pickups.filter((pickup) => pickup.collected).length, 4);
  assert.ok(game.state.prepRemaining > 20, 'All weapon kinds are reachable during the 30-second preparation');
  assert.ok(game.state.weapons[1].pellets > WEAPONS.shotgun.pellets, 'Engineer tech produces extra pellets');
  game.update(.05, { slot: 2, fire: true }); assert.equal(game.state.bullets.length, 0);
  finishPrep(game); game.drainEvents();
  game.update(.05, { slot: 2, aimX: 0, aimZ: -31, fire: true });
  const rail = game.state.bullets.find((bullet) => bullet.kind === 'rail');
  assert.ok(rail); assert.equal(rail.pierce, 3); assert.equal(rail.enemy, false); assert.equal(rail.hitIds.length, 0);
  assert.ok(rail.rangeRemaining > 0 && rail.rangeRemaining < game.state.weapons[2].range);
  seconds(game, 1.1, {}); game.drainEvents();
  game.update(.05, { slot: 1, aimX: 0, aimZ: 31, fire: true });
  const shotgunEvent = game.drainEvents().find((event) => event.type === 'shot');
  assert.equal(shotgunEvent.kind, 'shotgun'); assert.equal(shotgunEvent.value, game.state.weapons[1].pellets);
  const pellets = game.state.bullets.filter((bullet) => bullet.kind === 'shotgun');
  assert.ok(pellets.length >= 7); assert.ok(new Set(pellets.map((bullet) => bullet.vx.toFixed(3))).size > 4);
  seconds(game, .6, {}); game.drainEvents(); game.update(.05, { slot: 0, aimX: 0, aimZ: 31, fire: true });
  const burstEvent = game.drainEvents().find((event) => event.type === 'shot'); assert.equal(burstEvent.kind, 'burst');
  assert.equal(burstEvent.value, game.state.weapons[0].pellets);
  game.update(.05, { slot: -1 }); assert.equal(game.state.selectedWeapon, 0);
  const before = JSON.stringify(game.state); game.update(NaN, { moveX: Infinity, aimX: NaN }); assert.equal(JSON.stringify(game.state), before);
  finiteSimulation(game.state);
});

test('all four heroes can earn a first-stage clear under real combat across three seeded layouts', () => {
  const reports = [];
  for (const hero of HEROES) for (const seed of [17, 42, 2026]) {
    const game = newCampaign(hero.id, seed); getRifle(game); finishPrep(game);
    const elapsed = kiteWave(game);
    assert.equal(game.state.phase, 'cleared', `${hero.id}/${seed}: actual combat clears rather than stalling or killing the player`);
    assert.equal(game.state.kills, 6); assert.equal(game.state.enemies.filter((enemy) => enemy.alive).length, 0);
    assert.ok(game.state.player.hp > 0); assert.ok(game.state.score >= 800); assert.equal(game.state.bullets.length, 0);
    assert.ok(game.drainEvents().some((event) => event.type === 'stage-clear'));
    finiteSimulation(game.state);
    reports.push(`${hero.id}/${seed} ${elapsed.toFixed(1)}s HP${game.state.player.hp.toFixed(0)}`);
  }
  console.log(`Campaign bot wins: ${reports.join(' | ')}`);
});

test('earned next stage resets weapons/entities/cooldowns and increases real enemy difficulty', () => {
  const game = newCampaign('ranger', 321); getRifle(game); finishPrep(game);
  const firstScout = game.state.enemies.find((enemy) => enemy.type === 'scout');
  const firstHealth = firstScout.maxHp, firstSpeed = firstScout.speed;
  kiteWave(game); assert.equal(game.state.phase, 'cleared');
  const earnedScore = game.state.score;
  game.drainEvents(); assert.equal(game.nextStage(), true);
  assert.equal(game.state.stage, 2); assert.equal(game.state.phase, 'prepare'); assert.equal(game.state.prepRemaining, 30);
  assert.equal(game.state.score, earnedScore); assert.equal(game.state.kills, 0); assert.equal(game.state.stageEnemyTotal, 0);
  assert.equal(game.state.weapons.length, 0); assert.equal(game.state.selectedWeapon, 0);
  assert.equal(game.state.enemies.length, 0); assert.equal(game.state.bullets.length, 0);
  assert.ok(game.state.pickups.every((pickup) => !pickup.collected));
  assert.equal(game.state.player.hp, game.state.player.maxHp); assert.equal(game.nextStage(), false);
  getRifle(game); finishPrep(game); assert.equal(game.state.phase, 'combat'); assert.equal(game.state.stageEnemyTotal, 8);
  const secondScout = game.state.enemies.find((enemy) => enemy.type === 'scout');
  assert.ok(secondScout.maxHp > firstHealth); assert.ok(secondScout.speed > firstSpeed);
  game.drainEvents(); game.update(.001, { fire: true });
  assert.ok(game.drainEvents().some((event) => event.type === 'shot'), 'Previous-stage cooldown cannot block the first fresh shot');
  kiteWave(game); assert.equal(game.state.phase, 'cleared'); assert.equal(game.state.kills, 8);
  assert.ok(game.state.score > earnedScore);
  game.restart(); assert.equal(game.state.stage, 1); assert.equal(game.state.score, 0); assert.equal(game.state.prepRemaining, 30);
  assert.equal(game.state.weapons.length, 0); assert.equal(game.state.enemies.length, 0); assert.equal(game.state.bullets.length, 0);
});


test('rail pierces multiple real pursuers in a playable run and passive combat reaches defeat', () => {
  const railGame = newCampaign('engineer', 2);
  getRifle(railGame); walkTo(railGame, 8, -10); finishPrep(railGame);
  const railSlot = railGame.state.weapons.findIndex((weapon) => weapon.kind === 'rail');
  assert.ok(railSlot >= 0);
  let maximumHitCount = 0;
  for (let frame = 0; frame < 1400 && railGame.state.phase === 'combat'; frame++) {
    const p = railGame.state.player, angle = frame * .05 * .45;
    const dx = Math.sin(angle) * 7 - p.x, dz = Math.cos(angle) * 7 - p.z, distance = Math.hypot(dx, dz);
    railGame.update(.05, { moveX: dx / distance, moveZ: dz / distance, slot: railSlot, fire: true });
    for (const bullet of railGame.state.bullets) {
      maximumHitCount = Math.max(maximumHitCount, bullet.hitIds.length);
      assert.ok(new Set(bullet.hitIds).size === bullet.hitIds.length, 'Piercing does not damage one enemy twice with the same projectile');
    }
  }
  assert.ok(maximumHitCount >= 2, 'A real rail projectile passes through at least two enemies');
  assert.equal(railGame.state.phase, 'cleared'); finiteSimulation(railGame.state);

  const passive = newCampaign('scout', 42); getRifle(passive); finishPrep(passive);
  for (let frame = 0; frame < 1200 && passive.state.phase === 'combat'; frame++) passive.update(.05, {});
  assert.equal(passive.state.phase, 'gameover'); assert.equal(passive.state.failureReason, 'defeated');
  assert.equal(passive.state.player.hp, 0); assert.equal(passive.state.bullets.length, 0);
  assert.equal(passive.selectCharacter('tank'), true); passive.restart();
  assert.equal(passive.state.phase, 'prepare'); assert.equal(passive.state.heroId, 'tank'); assert.equal(passive.state.player.hp, 150);
});
