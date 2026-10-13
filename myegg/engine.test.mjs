import test from 'node:test';
import assert from 'node:assert/strict';
import { EGG_TYPES, DEMON_TYPES, TRAILS, LOCATIONS, createGame } from './engine.js';

const almost = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
function fresh(random = () => 0) {
  let timestamp = 1_000_000;
  const game = createGame({ random, now: () => timestamp }); game.start();
  return { game, advance: milliseconds => { timestamp += milliseconds; }, get time() { return timestamp; } };
}
function moveTo(game, target) { game.state.player.x = target.x; game.state.player.z = target.z; game.update(0); }
function frames(game, seconds, input = {}) { for (let frame = 0; frame < Math.round(seconds * 60); frame++) game.update(1 / 60, input); }
function deposit(game, kind = 'ember', nestIndex = 0) {
  const egg = game.state.wildEggs.find(target => target.kind === kind);
  moveTo(game, egg); assert.equal(game.pickupEgg(egg.id).ok, true);
  const nest = game.state.nests[nestIndex]; moveTo(game, nest);
  assert.equal(game.depositEgg(nest.id).ok, true);
  return nest;
}

test('world, four real incubation durations, fixed species prices and trail prices are complete', () => {
  assert.deepEqual(Object.values(EGG_TYPES).map(type => type.duration), [60, 90, 120, 180]);
  assert.equal(LOCATIONS.nests.length, 6); assert.equal(LOCATIONS.arenaHalf, 32);
  assert.deepEqual(Object.values(TRAILS).map(trail => trail.price), [0, 80, 200, 450]);
  assert.deepEqual(Object.values(TRAILS).map(trail => trail.speedBonus), [0, 2, 4, 7]);
  for (const type of Object.values(EGG_TYPES)) assert.ok(type.species.every(species => DEMON_TYPES[species]?.sellPrice > 0));
  const game = createGame(); assert.equal(game.state.phase, 'intro'); assert.equal(game.state.wildEggs.length, 6);
  assert.equal(game.pickupEgg(game.state.wildEggs[0].id).reason, 'not_started');
});

test('movement is normalized and bounded; carrying is slower and safe entry secures it', () => {
  const { game } = fresh();
  game.update(.05, { moveX: 1, moveZ: -1 });
  almost(Math.hypot(game.state.player.x, game.state.player.z - 16), .4);
  const egg = game.state.wildEggs[0]; moveTo(game, egg); game.pickupEgg(egg.id);
  assert.equal(game.state.carrying.secured, false); assert.equal(game.state.player.inSafeZone, false);
  almost(game.state.player.speed, 8 * .72);
  moveTo(game, { x: 0, z: 7 }); assert.equal(game.state.carrying.secured, true);
  assert.equal(game.state.player.inSafeZone, true);
  moveTo(game, { x: 30.9, z: 30.9 }); frames(game, 1, { moveX: 1, moveZ: 1 });
  assert.ok(game.state.player.x <= 31 && game.state.player.z <= 31);
});

test('pickup and nest actions enforce proximity, empty occupancy and single carry', () => {
  const { game } = fresh(); const first = game.state.wildEggs[0], second = game.state.wildEggs[1];
  assert.equal(game.pickupEgg(first.id).reason, 'too_far');
  moveTo(game, first); assert.equal(game.pickupEgg(first.id).ok, true);
  assert.equal(game.pickupEgg(second.id).reason, 'already_carrying');
  assert.equal(game.depositEgg('missing').reason, 'nest_missing');
  assert.equal(game.depositEgg(game.state.nests[0].id).reason, 'too_far');
  const nest = game.state.nests[0]; moveTo(game, nest); assert.equal(game.depositEgg(nest.id).ok, true);
  assert.equal(game.state.carrying, null); almost(game.state.player.speed, 8);
  moveTo(game, second); assert.equal(game.pickupEgg(second.id).ok, true);
  moveTo(game, nest); assert.equal(game.depositEgg(nest.id).reason, 'nest_occupied');
  assert.ok(game.state.carrying);
});

test('all egg timers are absolute real time and no gameplay dt can accelerate incubation', () => {
  for (const [kind, metadata] of Object.entries(EGG_TYPES)) {
    const fixture = fresh(), { game } = fixture, nest = deposit(game, kind);
    assert.equal(nest.egg.readyAt - nest.egg.depositedAt, metadata.duration * 1000);
    frames(game, 10); assert.equal(nest.egg.ready, false); almost(nest.egg.remaining, metadata.duration);
    fixture.advance(metadata.duration * 1000 - 1); game.update(0);
    assert.equal(game.hatchEgg(nest.id).reason, 'not_ready'); assert.ok(nest.egg.remaining > 0);
    fixture.advance(1); game.update(0);
    assert.equal(nest.egg.ready, true); assert.equal(nest.egg.remaining, 0);
    const outcome = game.hatchEgg(nest.id); assert.equal(outcome.ok, true); assert.equal(outcome.outcome, 'demon');
    assert.equal(game.hatchEgg(nest.id).reason, 'nest_empty');
    assert.equal(game.drainEvents().filter(event => event.type === 'ready').length, 1);
  }
});

test('paused/background clock completes eggs while movement, guards and training stay frozen', () => {
  const { game, advance } = fresh(), nest = deposit(game);
  game.pause();
  const player = JSON.stringify(game.state.player), guards = JSON.stringify(game.state.guards), training = game.state.trainingProgress;
  advance(60_000); game.update(0, { moveX: 1 });
  assert.equal(nest.egg.ready, true); assert.equal(game.state.phase, 'paused');
  assert.equal(JSON.stringify(game.state.player), player); assert.equal(JSON.stringify(game.state.guards), guards);
  assert.equal(game.state.trainingProgress, training); assert.equal(game.hatchEgg(nest.id).reason, 'paused');
  game.resume(); assert.equal(game.hatchEgg(nest.id).ok, true);
});

test('money outcome credits the fixed reward once and clears the nest', () => {
  const { game, advance } = fresh(() => .99), nest = deposit(game, 'mystic');
  advance(120_000); game.update(0); const result = game.hatchEgg(nest.id);
  assert.equal(result.outcome, 'money'); assert.equal(result.value, EGG_TYPES.mystic.moneyReward);
  assert.equal(game.state.money, result.value); assert.equal(nest.egg, null);
  assert.equal(game.hatchEgg(nest.id).ok, false); assert.equal(game.state.money, result.value);
  const event = game.drainEvents().find(entry => entry.type === 'hatch'); assert.equal(event.outcome, 'money');
});

test('selling uses immutable species price, enforces sales location and cannot repeat', () => {
  const { game, advance } = fresh(), nest = deposit(game, 'celestial');
  advance(180_000); const hatch = game.hatchEgg(nest.id), pet = hatch.demon;
  assert.equal(hatch.outcome, 'demon'); assert.equal(game.sellDemon(pet.id).reason, 'too_far');
  // A mutable display value cannot override the actual species price.
  game.state.demons[0].sellPrice = 999999;
  moveTo(game, LOCATIONS.sales); const sale = game.sellDemon(pet.id);
  assert.equal(sale.value, DEMON_TYPES[pet.species].sellPrice); assert.equal(game.state.money, sale.value);
  assert.equal(game.sellDemon(pet.id).reason, 'demon_missing'); assert.equal(game.state.money, sale.value);
});

test('trail purchase is transactional, permanent until restart and cannot repeat or downgrade', () => {
  const { game } = fresh();
  assert.equal(game.buyTrail('spark').reason, 'too_far'); moveTo(game, LOCATIONS.shop);
  assert.equal(game.buyTrail('spark').reason, 'not_enough_money'); assert.equal(game.state.money, 0);
  game.state.money = 1000;
  assert.equal(game.buyTrail('spark').ok, true); assert.equal(game.state.money, 920); almost(game.state.player.speed, 10);
  assert.equal(game.buyTrail('spark').reason, 'already_owned'); assert.equal(game.state.money, 920);
  assert.equal(game.buyTrail('galaxy').ok, true); assert.equal(game.state.money, 470); almost(game.state.player.speed, 15);
  assert.equal(game.buyTrail('rainbow').reason, 'not_an_upgrade'); assert.equal(game.state.money, 470);
  assert.deepEqual(game.state.ownedTrails, ['none', 'spark', 'galaxy']);
});

test('treadmill requires fifteen active still seconds per level and caps free speed at +2', () => {
  const { game } = fresh(); moveTo(game, LOCATIONS.treadmill);
  frames(game, 14.9); assert.equal(game.state.trainingLevel, 0);
  game.pause(); frames(game, 10); assert.equal(game.state.trainingLevel, 0);
  game.resume(); frames(game, .1); assert.equal(game.state.trainingLevel, 1); almost(game.state.player.speed, 8.5);
  frames(game, 45); assert.equal(game.state.trainingLevel, 4); almost(game.state.player.speed, 10);
  frames(game, 30); assert.equal(game.state.trainingLevel, 4); assert.equal(game.state.trainingProgress, 0);
  assert.equal(game.drainEvents().filter(event => event.type === 'training').length, 4);
});

test('outside keeper confiscates carried egg but protection blocks pursuit and confiscation', () => {
  const { game } = fresh(); const egg = game.state.wildEggs[0]; moveTo(game, egg); game.pickupEgg(egg.id);
  game.state.guards[0].x = game.state.player.x; game.state.guards[0].z = game.state.player.z;
  game.update(.01); assert.equal(game.state.carrying, null);
  assert.equal(game.drainEvents().filter(event => event.type === 'confiscated').length, 1);
  const second = game.state.wildEggs[0]; moveTo(game, second); game.pickupEgg(second.id); moveTo(game, { x: 0, z: 8 });
  game.state.guards[0].x = 0; game.state.guards[0].z = 8; game.update(.01);
  assert.ok(game.state.carrying?.secured); assert.equal(game.state.guards[0].chasing, false);
});

test('wild egg replacement is bounded and its gameplay cooldown freezes on pause', () => {
  const { game } = fresh(); const egg = game.state.wildEggs[0]; moveTo(game, egg); game.pickupEgg(egg.id);
  moveTo(game, game.state.nests[0]); game.depositEgg(game.state.nests[0].id);
  assert.equal(game.state.wildEggs.length, 5); game.pause(); frames(game, 9); assert.equal(game.state.wildEggs.length, 5);
  game.resume(); frames(game, 8.1); assert.equal(game.state.wildEggs.length, 6);
  assert.equal(new Set(game.state.wildEggs.map(egg => egg.slot)).size, 6);
});

test('twelve pet capacity converts additional hatches to one fair cash payout', () => {
  const { game, advance } = fresh(), nest = deposit(game);
  game.state.demons = Array.from({ length: 12 }, (_, i) => ({ id: `test-${i}`, species: 'spark', name: DEMON_TYPES.spark.name, color: DEMON_TYPES.spark.color, sellPrice: 55, x: 0, z: 16 }));
  advance(60_000); const hatch = game.hatchEgg(nest.id);
  assert.equal(hatch.outcome, 'money'); assert.equal(hatch.capacityFallback, true);
  assert.equal(hatch.value, DEMON_TYPES.spark.sellPrice); assert.equal(game.state.demons.length, 12);
  assert.equal(game.state.money, 55); assert.equal(game.hatchEgg(nest.id).ok, false);
});

test('context interaction selects actual egg/nest/stalls and returns meaningful feedback', () => {
  const { game, advance } = fresh(); const egg = game.state.wildEggs[0]; moveTo(game, egg);
  assert.equal(game.interact().ok, true); assert.ok(game.state.carrying);
  assert.equal(game.interact().reason, 'find_nest'); moveTo(game, game.state.nests[0]);
  assert.equal(game.interact().ok, true); assert.equal(game.interact().reason, 'not_ready');
  advance(60_000); assert.equal(game.interact().outcome, 'demon');
  moveTo(game, LOCATIONS.sales); assert.equal(game.interact().ok, true);
  moveTo(game, LOCATIONS.shop); assert.equal(game.interact().action, 'shop');
  moveTo(game, LOCATIONS.treadmill); assert.equal(game.interact().action, 'training');
});

test('invalid or huge dt cannot accelerate movement/training, and restart clears economy', () => {
  const { game } = fresh(); moveTo(game, LOCATIONS.treadmill); game.update(999);
  almost(game.state.trainingProgress, .05);
  const frozen = JSON.stringify(game.state); game.update(-1); game.update(NaN); game.update(Infinity);
  assert.equal(JSON.stringify(game.state), frozen);
  game.state.money = 200; moveTo(game, LOCATIONS.shop); game.buyTrail('rainbow');
  game.restart(); assert.equal(game.state.money, 0); assert.equal(game.state.trailId, 'none');
  assert.equal(game.state.trainingLevel, 0); assert.equal(game.state.demons.length, 0); assert.equal(game.state.carrying, null);
  assert.ok(game.state.nests.every(nest => !nest.egg)); assert.equal(game.state.wildEggs.length, 6);
  assert.equal(game.state.phase, 'playing'); assert.deepEqual(game.drainEvents(), []);
});
