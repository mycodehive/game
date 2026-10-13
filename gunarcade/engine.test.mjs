import test from 'node:test';
import assert from 'node:assert/strict';
import { HEROES, WEAPONS, createGame } from './engine.js';

const almost = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
function fresh(id = 'ranger', random = () => .5) {
  const game = createGame({ random }); game.selectCharacter(id); game.start(); return game;
}
function frames(game, duration, input = {}) {
  for (let frame = 0; frame < Math.round(duration * 60); frame++) game.update(1 / 60, typeof input === 'function' ? input(game.state) : input);
}
function collect(game, kind) {
  const crate = game.state.pickups.find(pickup => pickup.kind === kind && !pickup.collected);
  assert.ok(crate, `missing ${kind} crate`);
  game.state.player.x = crate.x; game.state.player.z = crate.z;
  game.update(.001);
  return game.state.weapons.find(weapon => weapon.kind === kind);
}
function combat(game) {
  if (!game.state.weapons.length) collect(game, 'rifle');
  game.state.player.x = 0; game.state.player.z = 0;
  game.state.prepRemaining = .001; game.update(.001);
  assert.equal(game.state.phase, 'combat');
}
function enemy(id, x, z, hp = 30, type = 'scout') {
  return { id, x, z, type, hp, maxHp: hp, speed: 0, radius: .9, alive: true };
}

test('four heroes and four distinct weapon types expose complete metadata', () => {
  assert.equal(HEROES.length, 4); assert.equal(new Set(HEROES.map(hero => hero.id)).size, 4);
  for (const hero of HEROES) {
    assert.ok(hero.name && hero.description && hero.role && hero.color);
    assert.ok(hero.stats.health > 0 && hero.stats.power > 0 && hero.stats.speed > 0 && hero.stats.tech > 0);
  }
  assert.equal(Object.keys(WEAPONS).length, 4);
  assert.ok(WEAPONS.shotgun.pellets > WEAPONS.rifle.pellets);
  assert.ok(WEAPONS.rail.pierce > WEAPONS.rifle.pierce);
  assert.ok(WEAPONS.rail.range > WEAPONS.shotgun.range);
});

test('selection initializes correct protagonist and disallows changing active combat', () => {
  const game = createGame(); assert.equal(game.state.phase, 'select');
  assert.equal(game.selectCharacter('tank'), true); assert.equal(game.selectCharacter('missing'), false);
  game.start(); assert.equal(game.state.player.hp, 150); almost(game.state.player.speed, 7.8);
  assert.equal(game.selectCharacter('scout'), false);
  combat(game); assert.equal(game.selectCharacter('engineer'), false);
  game.state.phase = 'gameover'; assert.equal(game.selectCharacter('engineer'), true);
  game.restart(); assert.equal(game.state.player.hp, 100); assert.equal(game.state.heroId, 'engineer');
});

test('preparation lasts exactly 30 simulation seconds and has no enemies or bullets early', () => {
  const game = fresh(); collect(game, 'rifle'); game.state.player.x = game.state.player.z = 0;
  const hp = game.state.player.hp, elapsed = 30 - game.state.prepRemaining;
  for (let frame = 0; frame < 599; frame++) game.update(.05, { fire: true });
  assert.equal(game.state.phase, 'prepare'); assert.equal(game.state.enemies.length, 0);
  assert.equal(game.state.bullets.length, 0); assert.equal(game.state.player.hp, hp);
  game.update(.05 - elapsed);
  assert.equal(game.state.phase, 'combat'); almost(game.state.prepRemaining, 0);
  assert.equal(game.state.enemies.length, 6); assert.equal(game.state.stageEnemyTotal, 6);
  assert.equal(game.drainEvents().filter(event => event.type === 'combat-start').length, 1);
});

test('no weapon at countdown expiry produces clear no_weapon failure without spawning', () => {
  const game = fresh();
  for (let frame = 0; frame < 600; frame++) game.update(.05, { fire: true });
  assert.equal(game.state.phase, 'gameover'); assert.equal(game.state.failureReason, 'no_weapon');
  assert.equal(game.state.enemies.length, 0); assert.equal(game.state.bullets.length, 0);
  assert.equal(game.drainEvents().filter(event => event.type === 'gameover').length, 1);
  game.restart(); assert.equal(game.state.phase, 'prepare'); assert.equal(game.state.prepRemaining, 30);
  assert.equal(game.state.failureReason, '');
});

test('nearest rifle is reachable by movement and contact automatically collects once', () => {
  const game = fresh('tank');
  frames(game, .45, { moveZ: -1 });
  assert.equal(game.state.weapons.length, 1); assert.equal(game.state.weapons[0].kind, 'rifle');
  assert.equal(game.state.pickups[0].collected, true);
  assert.equal(game.drainEvents().filter(event => event.type === 'pickup').length, 1);
  frames(game, .1); assert.equal(game.state.weapons.length, 1);
});

test('hero power, tech and crate tier proportionally scale weapon damage and quality', () => {
  const rifleStats = new Map();
  for (const hero of HEROES) {
    const game = fresh(hero.id); const rifle = collect(game, 'rifle');
    almost(rifle.damage, WEAPONS.rifle.baseDamage * hero.stats.power);
    almost(rifle.cooldown, WEAPONS.rifle.baseCooldown / hero.stats.tech);
    rifleStats.set(hero.id, rifle);
  }
  assert.ok(rifleStats.get('tank').damage > rifleStats.get('scout').damage);
  assert.ok(rifleStats.get('engineer').cooldown < rifleStats.get('tank').cooldown);
  const ranger = fresh('ranger'), engineer = fresh('engineer');
  const plain = collect(ranger, 'shotgun'), advanced = collect(engineer, 'shotgun');
  assert.ok(advanced.pellets > plain.pellets);
  const crate = engineer.state.pickups.find(pickup => pickup.kind === 'shotgun' && !pickup.collected);
  crate.tier = 3; const old = advanced.damage;
  engineer.state.player.x = crate.x; engineer.state.player.z = crate.z; engineer.update(.001);
  const improved = engineer.state.weapons.find(weapon => weapon.kind === 'shotgun');
  assert.equal(improved.tier, 3); assert.ok(improved.damage > old); assert.ok(improved.cooldown < advanced.cooldown);
});

test('inventory is capped at three and a new fourth kind replaces selected slot', () => {
  const game = fresh(); collect(game, 'rifle'); collect(game, 'shotgun'); collect(game, 'rail');
  game.update(.001, { slot: 1 }); collect(game, 'burst');
  assert.equal(game.state.weapons.length, 3); assert.equal(game.state.weapons[1].kind, 'burst');
  assert.equal(game.state.selectedWeapon, 1);
  game.update(.001, { slot: 999 }); assert.equal(game.state.selectedWeapon, 1);
});

test('spawn follows current player at countdown expiry, stays separated and in bounds', () => {
  for (const position of [[0, 0], [29, 29], [-29, -29], [29, -29], [-29, 29]]) {
    const game = fresh('ranger', () => .5); collect(game, 'rifle');
    [game.state.player.x, game.state.player.z] = position;
    game.state.prepRemaining = .001; game.update(.001);
    assert.equal(game.state.enemies.length, 6);
    for (const enemy of game.state.enemies) {
      assert.ok(Math.hypot(enemy.x - game.state.player.x, enemy.z - game.state.player.z) >= 12 - 1e-8);
      assert.ok(Math.abs(enemy.x) + enemy.radius <= game.state.arenaHalf);
      assert.ok(Math.abs(enemy.z) + enemy.radius <= game.state.arenaHalf);
    }
  }
});

test('enemy pursuit targets the player position and melee damage respects contact cooldown', () => {
  const game = fresh(); combat(game);
  game.state.enemies = [enemy(800, 0, -10)]; game.state.enemies[0].speed = 4;
  const before = Math.hypot(game.state.enemies[0].x, game.state.enemies[0].z);
  frames(game, .5); assert.ok(Math.hypot(game.state.enemies[0].x, game.state.enemies[0].z) < before);
  game.state.enemies[0].x = game.state.enemies[0].z = 0;
  const hp = game.state.player.hp;
  game.update(.05); assert.ok(game.state.player.hp < hp);
  const after = game.state.player.hp; frames(game, .3); almost(game.state.player.hp, after);
});

test('all player weapon types hit by swept segment collision, including fast rail shots', () => {
  for (const kind of Object.keys(WEAPONS)) {
    const game = fresh(); const weapon = collect(game, kind); combat(game);
    game.state.selectedWeapon = game.state.weapons.findIndex(candidate => candidate.kind === kind);
    game.state.enemies = [enemy(800, 0, kind === 'shotgun' ? -5 : -8, 18)];
    game.state.stageEnemyTotal = 1;
    frames(game, .35, { aimX: 0, aimZ: -8, fire: true });
    assert.equal(game.state.enemies[0].alive, false, `${kind} should land damage`);
    assert.equal(game.state.phase, 'cleared'); assert.equal(game.state.kills, 1);
    assert.ok(weapon.damage > 0); assert.equal(game.state.bullets.length, 0);
  }
});

test('rail pierces aligned enemies without hitting the same enemy twice', () => {
  const game = fresh(); collect(game, 'rail'); combat(game);
  game.state.enemies = [enemy(800, 0, -5, 45), enemy(801, 0, -9, 45), enemy(802, 0, -13, 45)];
  game.state.stageEnemyTotal = 3;
  frames(game, .2, { aimX: 0, aimZ: -13, fire: true });
  assert.equal(game.state.kills, 3); assert.equal(game.state.phase, 'cleared');
  assert.equal(game.drainEvents().filter(event => event.type === 'shot').length, 1);
});

test('walls block bullets and player movement, and spread shots remain finite', () => {
  const game = fresh(); collect(game, 'rail'); combat(game);
  game.state.enemies = [enemy(800, 20, 0, 45)];
  frames(game, .7, { aimX: 20, aimZ: 0, fire: true });
  assert.equal(game.state.enemies[0].hp, 45);
  frames(game, 2, { moveX: 1 });
  assert.ok(game.state.player.x < 9, 'player cannot cross a solid obstacle');
  assert.ok(game.state.bullets.length <= 192);
});

test('ranged enemy orbs hurt player, pause freezes all clocks and resume restores phase', () => {
  const game = fresh();
  game.pause(); const snapshot = JSON.stringify(game.state);
  frames(game, 2, { moveX: 1, fire: true }); assert.equal(JSON.stringify(game.state), snapshot);
  game.resume(); assert.equal(game.state.phase, 'prepare');
  combat(game); game.state.enemies = [enemy(800, 0, 10, 999, 'shooter')];
  const hp = game.state.player.hp; frames(game, 1.5);
  assert.ok(game.state.player.hp < hp);
  game.pause(); const combatSnapshot = JSON.stringify(game.state);
  frames(game, 1, { fire: true }); assert.equal(JSON.stringify(game.state), combatSnapshot);
  game.resume(); assert.equal(game.state.phase, 'combat');
});

test('next stage is guarded until all enemies die and resets all transient stage data', () => {
  const game = fresh('tank'); collect(game, 'rifle'); collect(game, 'shotgun'); combat(game);
  assert.equal(game.nextStage(), false);
  game.state.enemies = [enemy(800, 0, -5, 18), enemy(801, 6, -6, 18)]; game.state.stageEnemyTotal = 2;
  game.state.player.hp = 75;
  frames(game, .2, { aimX: 0, aimZ: -5, fire: true });
  assert.equal(game.state.kills, 1); assert.equal(game.state.phase, 'combat'); assert.equal(game.nextStage(), false);
  frames(game, .4, { aimX: 6, aimZ: -6, fire: true });
  assert.equal(game.state.phase, 'cleared'); assert.equal(game.state.kills, 2);
  const score = game.state.score;
  assert.equal(game.nextStage(), true);
  assert.equal(game.state.stage, 2); assert.equal(game.state.phase, 'prepare');
  assert.equal(game.state.prepRemaining, 30); assert.equal(game.state.score, score);
  assert.deepEqual(game.state.weapons, []); assert.deepEqual(game.state.enemies, []); assert.deepEqual(game.state.bullets, []);
  assert.equal(game.state.selectedWeapon, 0); assert.equal(game.state.kills, 0);
  assert.equal(game.state.player.hp, 150); assert.ok(game.state.pickups.every(pickup => !pickup.collected));
  collect(game, 'rifle'); game.state.prepRemaining = .001; game.update(.001);
  assert.equal(game.state.enemies.length, 8); assert.ok(game.state.enemies[0].maxHp > 35); assert.ok(game.state.enemies[0].speed > 4.1);
});

test('defeat emits once, freezes combat and restart preserves selected hero only', () => {
  const game = fresh('scout'); combat(game);
  game.state.player.hp = 1; game.state.enemies = [enemy(800, 0, 0)];
  game.update(.05); assert.equal(game.state.phase, 'gameover'); assert.equal(game.state.failureReason, 'defeated');
  const frozen = JSON.stringify(game.state); frames(game, 1, { moveZ: 1, fire: true });
  assert.equal(JSON.stringify(game.state), frozen);
  assert.equal(game.drainEvents().filter(event => event.type === 'gameover').length, 1);
  game.restart(); assert.equal(game.state.heroId, 'scout'); assert.equal(game.state.player.hp, 85);
  assert.equal(game.state.stage, 1); assert.equal(game.state.score, 0); assert.equal(game.state.weapons.length, 0);
});

test('yaw follows Three.js +Z convention and diagonals cannot increase movement speed', () => {
  const game = fresh();
  game.update(.01, { aimX: 10, aimZ: 0 }); almost(game.state.player.yaw, Math.PI / 2);
  game.update(.01, { aimX: 0, aimZ: 10 }); almost(game.state.player.yaw, 0);
  game.state.player.x = game.state.player.z = 0;
  game.update(.05, { moveX: 1, moveZ: 1 });
  almost(Math.hypot(game.state.player.x, game.state.player.z), game.state.player.speed * .05);
});

test('large or invalid dt cannot skip preparation or emit runaway simulation events', () => {
  const game = fresh(); game.update(999); almost(game.state.prepRemaining, 29.95);
  const frozen = JSON.stringify(game.state); game.update(-1); game.update(Infinity); game.update(NaN);
  assert.equal(JSON.stringify(game.state), frozen);
  assert.ok(game.drainEvents().length <= 256);
});

test('maximum difficulty still spawns a finite bounded group near a corner', () => {
  const game = fresh('engineer', () => .5); collect(game, 'rifle');
  game.state.stage = 99; game.state.player.x = 29; game.state.player.z = 29;
  game.state.prepRemaining = .001; game.update(.001);
  assert.equal(game.state.enemies.length, 60); assert.equal(game.state.stageEnemyTotal, 60);
  assert.ok(game.state.enemies.some(target => target.type === 'boss'));
  for (const target of game.state.enemies) {
    assert.ok(target.alive && Number.isFinite(target.hp + target.x + target.z));
    assert.ok(Math.hypot(target.x - game.state.player.x, target.z - game.state.player.z) >= 12);
  }
});

test('deterministic sustained combat has finite HP/positions and bounded entities/events', () => {
  const game = fresh('engineer', () => .37); collect(game, 'burst'); combat(game);
  for (let frame = 0; frame < 9000; frame++) {
    if (game.state.phase === 'gameover') { game.restart(); collect(game, 'rifle'); combat(game); }
    if (game.state.phase === 'cleared') { game.nextStage(); collect(game, 'burst'); combat(game); }
    game.update(1 / 60, { moveX: Math.sin(frame * .013), moveZ: Math.cos(frame * .013), fire: true });
    assert.ok(Number.isFinite(game.state.player.hp + game.state.player.x + game.state.player.z + game.state.score));
    assert.ok(game.state.bullets.length <= 192); assert.ok(game.state.enemies.length <= 60); assert.ok(game.state.weapons.length <= 3);
    for (const bullet of game.state.bullets) assert.ok(Number.isFinite(bullet.x + bullet.z + bullet.vx + bullet.vz));
    if (frame % 60 === 0) assert.ok(game.drainEvents().length <= 256);
  }
});

test('pursuit navigates around cover instead of stalling behind the central wall', () => {
  const game = fresh(); combat(game);
  game.state.enemies = [enemy(800, 0, -25, 999, 'brute')];
  game.state.enemies[0].speed = 4;
  frames(game, 12);
  assert.ok(Math.hypot(game.state.enemies[0].x - game.state.player.x, game.state.enemies[0].z - game.state.player.z) < 3);
  assert.equal(game.state.enemies[0].alive, true);
});
