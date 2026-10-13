import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame, EGG_TYPES, DEMON_TYPES, TRAILS, LOCATIONS } from './engine.js';

// All actions below use actual movement/contact. Only the injected wall clock
// advances the 1–3 minute incubation deadline; the production UI has no bypass.
function fixture(random = 0) {
  let wallTime = 100000, randomValue = random;
  const game = createGame({ now: () => wallTime, random: () => randomValue });
  game.start();
  return {
    game, get time() { return wallTime; }, setTime(value) { wallTime = value; }, setRandom(value) { randomValue = value; },
    step(dt, input = {}) { wallTime += Math.max(0, dt) * 1000; game.update(dt, input); }
  };
}
function near(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} ≈ ${expected}`); }
function walkTo(f, x, z) {
  for (let frame = 0; frame < 500; frame++) {
    const p = f.game.state.player, dx = x - p.x, dz = z - p.z, distance = Math.hypot(dx, dz);
    if (distance <= .8) return;
    f.step(.05, { moveX: dx / distance, moveZ: dz / distance });
  }
  assert.fail(`Movement cannot reach ${x},${z}`);
}
function stealAndDeposit(f, kind = 'frost', nestId = 'nest-2') {
  const state = f.game.state;
  const preferredSlot = { ember: 0, frost: 1, mystic: 2, celestial: 3 }[kind];
  let egg = state.wildEggs.find((entry) => entry.slot === preferredSlot);
  for (let frame = 0; frame < 200 && !egg; frame++) {
    f.step(.05);
    egg = state.wildEggs.find((entry) => entry.slot === preferredSlot);
  }
  assert.ok(egg, `The chosen ${kind} field route has respawned through actual simulation`);
  // Approach the guarded far-west egg via the outside edge, then escape along
  // that edge; no teleports, guard edits, health hacks or free reward mutations.
  if (kind === 'celestial') { walkTo(f, -28, 8); walkTo(f, -28, egg.z); }
  walkTo(f, egg.x, egg.z);
  const pickup = f.game.pickupEgg(egg.id); assert.equal(pickup.ok, true);
  assert.equal(state.carrying.secured, false); assert.equal(state.player.inSafeZone, false);
  if (kind === 'celestial') { walkTo(f, -28, egg.z); walkTo(f, -28, 10); }
  walkTo(f, 0, 16);
  assert.ok(state.carrying, 'Escaping through real movement keeps the egg');
  assert.equal(state.player.inSafeZone, true); assert.equal(state.carrying.secured, true);
  const nest = state.nests.find((entry) => entry.id === nestId); walkTo(f, nest.x, nest.z);
  const deposited = f.game.depositEgg(nest.id); assert.equal(deposited.ok, true);
  assert.equal(state.carrying, null); assert.equal(nest.egg.kind, kind);
  assert.equal(nest.egg.ready, false); near(nest.egg.readyAt - nest.egg.depositedAt, EGG_TYPES[kind].duration * 1000);
  return nest;
}
function hatchAtDeadline(f, nest) {
  f.setTime(nest.egg.readyAt); f.game.update(0);
  return f.game.hatchEgg(nest.id);
}
function finiteEconomy(state) {
  assert.ok(Number.isFinite(state.money) && state.money >= 0);
  for (const item of [state.player, ...state.guards, ...state.demons]) for (const [key, value] of Object.entries(item)) if (typeof value === 'number') assert.ok(Number.isFinite(value), `${key} remains finite`);
}

test('legitimate frost theft → protection →90s hatch →fixed-price sale →trail purchase produces faster movement', () => {
  const f = fixture(), { game } = f;
  const startX = game.state.player.x; for (let frame = 0; frame < 10; frame++) f.step(.05, { moveX: 1 });
  const originalTravel = game.state.player.x - startX; near(originalTravel, 4);
  walkTo(f, 0, 16);
  const nest = stealAndDeposit(f);
  f.setTime(nest.egg.readyAt - 1); game.update(0);
  assert.equal(game.hatchEgg(nest.id).reason, 'not_ready'); assert.equal(game.state.money, 0); assert.equal(game.state.demons.length, 0);
  const hatch = hatchAtDeadline(f, nest); assert.equal(hatch.ok, true); assert.equal(hatch.outcome, 'demon');
  assert.equal(hatch.demon.species, 'leaf'); assert.equal(hatch.value, 85); assert.equal(nest.egg, null);
  const duplicateHatch = game.hatchEgg(nest.id); assert.equal(duplicateHatch.ok, false); assert.equal(game.state.demons.length, 1);
  assert.equal(game.sellDemon(hatch.demon.id).reason, 'too_far'); assert.equal(game.state.money, 0);
  walkTo(f, LOCATIONS.sales.x, LOCATIONS.sales.z);
  const sold = game.sellDemon(hatch.demon.id); assert.equal(sold.ok, true); assert.equal(sold.value, DEMON_TYPES.leaf.sellPrice);
  assert.equal(game.state.money, 85); assert.equal(game.state.demons.length, 0);
  assert.equal(game.sellDemon(hatch.demon.id).ok, false); assert.equal(game.state.money, 85);
  assert.equal(game.buyTrail('spark').reason, 'too_far');
  walkTo(f, LOCATIONS.shop.x, LOCATIONS.shop.z);
  const oldSpeed = game.state.player.speed, bought = game.buyTrail('spark'); assert.equal(bought.ok, true);
  assert.equal(game.state.money, 5); assert.equal(game.state.trailId, 'spark'); near(game.state.player.speed, oldSpeed + 2);
  assert.equal(game.buyTrail('spark').reason, 'already_owned'); assert.equal(game.state.money, 5);
  assert.equal(game.buyTrail('rainbow').ok, false); assert.equal(game.state.money, 5);
  const boostedStart = game.state.player.x; for (let frame = 0; frame < 10; frame++) f.step(.05, { moveX: 1 });
  const boostedTravel = game.state.player.x - boostedStart; near(boostedTravel, 5); assert.ok(boostedTravel > originalTravel);
  finiteEconomy(game.state);
  console.log(`Earned MyEgg loop: leaf sale85 →spark cost80 →wallet5 →speed${oldSpeed}→${game.state.player.speed}; 0.5s travel${originalTravel}→${boostedTravel.toFixed(1)}`);
});

test('incubation uses real injected wall time across pause/background, never simulation fast-forward', () => {
  const f = fixture(), nest = stealAndDeposit(f, 'ember'), { game } = f;
  const deadline = nest.egg.readyAt;
  game.drainEvents(); assert.equal(game.pause(), true);
  const player = JSON.stringify(game.state.player), guards = JSON.stringify(game.state.guards);
  for (let frame = 0; frame < 100; frame++) game.update(.05, { moveX: 1 });
  assert.equal(nest.egg.remaining, 60, 'Many simulation calls without wall-clock passage cannot mature an egg');
  assert.equal(JSON.stringify(game.state.player), player); assert.equal(JSON.stringify(game.state.guards), guards);
  f.setTime(deadline - 1); game.update(0); assert.equal(nest.egg.ready, false); near(nest.egg.remaining, .001);
  f.setTime(deadline); game.update(0); assert.equal(nest.egg.ready, true); assert.equal(nest.egg.remaining, 0);
  assert.equal(game.state.demons.length, 0); assert.equal(game.hatchEgg(nest.id).reason, 'paused');
  assert.equal(game.drainEvents().filter((event) => event.type === 'ready').length, 1);
  game.update(0); game.update(0); assert.equal(game.drainEvents().filter((event) => event.type === 'ready').length, 0);
  assert.equal(game.resume(), true); assert.equal(game.hatchEgg(nest.id).ok, true);
  assert.equal(game.hatchEgg(nest.id).ok, false);
});

test('every 60–180s egg gives its intended money branch and fixed species sale prices', () => {
  const seenSpecies = new Set();
  for (const [kind, type] of Object.entries(EGG_TYPES)) {
    assert.ok(type.duration >= 60 && type.duration <= 180);
    const cash = fixture(.99), cashNest = stealAndDeposit(cash, kind);
    cash.setTime(cashNest.egg.readyAt - .001); cash.game.update(0); assert.equal(cash.game.hatchEgg(cashNest.id).ok, false);
    const reward = hatchAtDeadline(cash, cashNest); assert.equal(reward.outcome, 'money'); assert.equal(reward.value, type.moneyReward);
    assert.equal(cash.game.state.money, type.moneyReward); assert.equal(cash.game.state.demons.length, 0);
    assert.equal(cash.game.hatchEgg(cashNest.id).ok, false); assert.equal(cash.game.state.money, type.moneyReward);
    for (const random of [0, .79]) {
      const f = fixture(random), nest = stealAndDeposit(f, kind), hatched = hatchAtDeadline(f, nest);
      assert.equal(hatched.outcome, 'demon');
      const species = type.species[random === 0 ? 0 : 1]; assert.equal(hatched.demon.species, species); seenSpecies.add(species);
      walkTo(f, LOCATIONS.sales.x, LOCATIONS.sales.z);
      const sale = f.game.sellDemon(hatched.demon.id); assert.equal(sale.ok, true); assert.equal(sale.value, DEMON_TYPES[species].sellPrice);
      assert.equal(f.game.state.money, DEMON_TYPES[species].sellPrice); finiteEconomy(f.game.state);
    }
  }
  assert.deepEqual([...seenSpecies].sort(), Object.keys(DEMON_TYPES).sort());
});

test('proximity, carrying and occupied-nest limits reject actions without consuming resources', () => {
  const f = fixture(), { game } = f, egg = game.state.wildEggs[0];
  assert.equal(game.pickupEgg(egg.id).reason, 'too_far'); assert.equal(game.state.wildEggs.length, 6);
  assert.equal(game.depositEgg('nest-2').reason, 'too_far'); assert.equal(game.state.money, 0);
  walkTo(f, 0, 22); assert.equal(game.depositEgg('nest-2').reason, 'no_egg');
  const nest = stealAndDeposit(f), firstEggId = nest.egg.id;
  const next = game.state.wildEggs.find((entry) => entry.kind === 'ember'); walkTo(f, next.x, next.z);
  assert.equal(game.pickupEgg(next.id).ok, true);
  assert.equal(game.pickupEgg(game.state.wildEggs[0].id).reason, 'already_carrying');
  walkTo(f, 0, 16); walkTo(f, nest.x, nest.z);
  assert.equal(game.depositEgg(nest.id).reason, 'nest_occupied'); assert.equal(nest.egg.id, firstEggId); assert.ok(game.state.carrying);
  const empty = game.state.nests.find((entry) => !entry.egg); walkTo(f, empty.x, empty.z); assert.equal(game.depositEgg(empty.id).ok, true);
  walkTo(f, LOCATIONS.shop.x, LOCATIONS.shop.z);
  assert.equal(game.buyTrail('spark').ok, false); assert.equal(game.state.money, 0); assert.equal(game.state.trailId, 'none');
  const before = JSON.stringify(game.state.player); game.update(NaN, { moveX: Infinity }); assert.equal(JSON.stringify(game.state.player), before);
  finiteEconomy(game.state);
});

test('12-pet capacity remains bounded with a real extra hatch paid at the fixed species price', () => {
  const f = fixture(), { game } = f;
  for (let cycle = 0; cycle < 13; cycle++) {
    // An instant test-clock incubation jump does not advance patrol movement.
    // Wait safely in the base until pursuers return to their actual field patrol,
    // rather than walking back into a guard left near the previous escape lane.
    for (let frame = 0; frame < 600 && game.state.guards.some((guard) => Math.abs(guard.x) < 10 || guard.z > -9); frame++) f.step(.05);
    assert.ok(game.state.guards.every((guard) => Math.abs(guard.x) >= 10 && guard.z <= -9), 'Guards return to patrol through legitimate simulation');
    const nest = stealAndDeposit(f), hatch = hatchAtDeadline(f, nest);
    assert.equal(hatch.ok, true);
    if (cycle < 12) { assert.equal(hatch.outcome, 'demon'); assert.equal(game.state.demons.length, cycle + 1); assert.equal(game.state.money, 0); }
    else { assert.equal(hatch.outcome, 'money'); assert.equal(hatch.capacityFallback, true); assert.equal(hatch.value, DEMON_TYPES.leaf.sellPrice); }
    assert.ok(game.state.demons.length <= 12); finiteEconomy(game.state);
  }
  assert.equal(game.state.demons.length, 12); assert.equal(game.state.money, 85);
  const oldId = game.state.demons[0].id;
  game.restart(); assert.equal(game.state.phase, 'playing'); assert.equal(game.state.demons.length, 0); assert.equal(game.state.money, 0);
  assert.equal(game.state.carrying, null); assert.ok(game.state.nests.every((nest) => !nest.egg));
  assert.equal(game.state.trailId, 'none'); assert.equal(game.state.player.speed, 8); assert.equal(game.state.trainingLevel, 0);
  walkTo(f, LOCATIONS.sales.x, LOCATIONS.sales.z); assert.equal(game.sellDemon(oldId).ok, false); assert.equal(game.state.money, 0);
});

test('actual field guards confiscate an exposed egg while the protected zone keeps a returned egg safe', () => {
  const exposed = fixture(), first = exposed.game.state.wildEggs.find((egg) => egg.slot === 0);
  walkTo(exposed, first.x, first.z); assert.equal(exposed.game.pickupEgg(first.id).ok, true);
  for (let frame = 0; frame < 500 && exposed.game.state.carrying; frame++) exposed.step(.05);
  assert.equal(exposed.game.state.carrying, null, 'Standing in the field lets a real guard catch the thief');
  assert.equal(exposed.game.state.money, 0); assert.equal(exposed.game.state.demons.length, 0);
  assert.ok(exposed.game.drainEvents().some((event) => event.type === 'confiscated'));

  const safe = fixture(), egg = safe.game.state.wildEggs.find((entry) => entry.slot === 1);
  walkTo(safe, egg.x, egg.z); assert.equal(safe.game.pickupEgg(egg.id).ok, true);
  walkTo(safe, 0, 8); assert.equal(safe.game.state.player.inSafeZone, true); assert.equal(safe.game.state.carrying.secured, true);
  const securedId = safe.game.state.carrying.id;
  for (let frame = 0; frame < 200; frame++) safe.step(.05);
  assert.equal(safe.game.state.carrying.id, securedId); assert.ok(safe.game.state.guards.every((guard) => guard.z <= 5));
  walkTo(safe, 0, 22); assert.equal(safe.game.depositEgg('nest-2').ok, true); finiteEconomy(safe.game.state);
});
