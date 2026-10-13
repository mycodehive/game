// DOM-free collection economy. Incubation uses the injected real wall clock.
export const EGG_TYPES = Object.freeze({
  ember: Object.freeze({ name: '불씨 알', color: '#ffb080', duration: 60, moneyReward: 25, species: Object.freeze(['spark', 'leaf']) }),
  frost: Object.freeze({ name: '서리 알', color: '#8bdcff', duration: 90, moneyReward: 45, species: Object.freeze(['leaf', 'bat']) }),
  mystic: Object.freeze({ name: '신비 알', color: '#c6a0ff', duration: 120, moneyReward: 70, species: Object.freeze(['bat', 'fox']) }),
  celestial: Object.freeze({ name: '별빛 알', color: '#ffe58f', duration: 180, moneyReward: 120, species: Object.freeze(['fox', 'dragon']) })
});
export const DEMON_TYPES = Object.freeze({
  spark: Object.freeze({ name: '불씨 임프', color: '#ff986e', sellPrice: 55 }),
  leaf: Object.freeze({ name: '풀잎 꼬마', color: '#a0efad', sellPrice: 85 }),
  bat: Object.freeze({ name: '달빛 박쥐', color: '#91c6ff', sellPrice: 160 }),
  fox: Object.freeze({ name: '별빛 여우', color: '#d1a1ff', sellPrice: 280 }),
  dragon: Object.freeze({ name: '수정 드래곤', color: '#ffe58f', sellPrice: 450 })
});
export const TRAILS = Object.freeze({
  none: Object.freeze({ name: '기본 걸음', description: '아직 장착한 트레일이 없습니다.', color: '#b9e9df', price: 0, speedBonus: 0 }),
  spark: Object.freeze({ name: '반짝 트레일', description: '반짝이는 발자국과 이동 속도 +2.', color: '#ffe49a', price: 80, speedBonus: 2 }),
  rainbow: Object.freeze({ name: '무지개 트레일', description: '무지개 발자국과 이동 속도 +4.', color: '#f2a6ff', price: 200, speedBonus: 4 }),
  galaxy: Object.freeze({ name: '은하 트레일', description: '은하수 발자국과 이동 속도 +7.', color: '#a7bbff', price: 450, speedBonus: 7 })
});
export const LOCATIONS = Object.freeze({
  arenaHalf: 32,
  protectedZone: Object.freeze({ minX: -12, maxX: 12, minZ: 7, maxZ: 30 }),
  nests: Object.freeze(Array.from({ length: 6 }, (_, index) => Object.freeze({ id: `nest-${index + 1}`, x: [-5, 0, 5][index % 3], z: index < 3 ? 22 : 27 }))),
  treadmill: Object.freeze({ x: -8, z: 14 }), sales: Object.freeze({ x: 8, z: 14 }), shop: Object.freeze({ x: 8, z: 24 })
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const safePosition = (x, z) => x >= LOCATIONS.protectedZone.minX && x <= LOCATIONS.protectedZone.maxX && z >= LOCATIONS.protectedZone.minZ && z <= LOCATIONS.protectedZone.maxZ;
const WILD_SLOTS = Object.freeze([
  { x: -7, z: -15, kind: 'ember' }, { x: 0, z: -20, kind: 'frost' },
  { x: 7, z: -16, kind: 'mystic' }, { x: -20, z: -22, kind: 'celestial' },
  { x: 20, z: -22, kind: 'frost' }, { x: 0, z: -29, kind: 'ember' }
]);

export function createGame({ random = Math.random, now = Date.now } = {}) {
  const state = {
    phase: 'intro', player: { x: 0, z: 16, yaw: 0, speed: 8, inSafeZone: true },
    money: 0, carrying: null, nests: [], wildEggs: [], demons: [], guards: [],
    trailId: 'none', ownedTrails: ['none'], trainingLevel: 0, trainingProgress: 0
  };
  let events = [], ids = 0, simulationTime = 0;
  let wallNow = finite(now(), 0);
  const respawns = new Map(), guardCooldowns = new Map();
  const uid = prefix => `${prefix}-${++ids}`;
  const rng = () => clamp(finite(random(), .5), 0, 1 - Number.EPSILON);
  const clock = () => { wallNow = Math.max(wallNow, finite(now(), wallNow)); return wallNow; };
  const distance = target => Math.hypot(state.player.x - target.x, state.player.z - target.z);
  const nearby = target => distance(target) <= 3;
  const result = (ok, reason, extra = {}) => ({ ok, ...(reason ? { reason } : {}), ...extra });
  const emit = (type, x = state.player.x, z = state.player.z, extra = {}) => {
    if (events.length >= 128) events.shift();
    events.push({ type, x, z, ...extra });
  };
  function refreshSpeed() {
    state.player.speed = (8 + state.trainingLevel * .5 + TRAILS[state.trailId].speedBonus) * (state.carrying ? .72 : 1);
  }
  function refreshProtection() {
    state.player.inSafeZone = safePosition(state.player.x, state.player.z);
    if (state.carrying && state.player.inSafeZone && !state.carrying.secured) {
      state.carrying.secured = true;
      emit('secured', state.player.x, state.player.z, { kind: state.carrying.kind, color: state.carrying.color });
    }
  }
  function spawnEgg(slot) {
    const spot = WILD_SLOTS[slot], type = EGG_TYPES[spot.kind];
    state.wildEggs.push({ id: uid('egg'), slot, x: spot.x, z: spot.z, kind: spot.kind, name: type.name, color: type.color, duration: type.duration });
  }
  function reset(phase) {
    ids = 0; events = []; simulationTime = 0; wallNow = finite(now(), wallNow);
    respawns.clear(); guardCooldowns.clear();
    state.phase = phase;
    Object.assign(state.player, { x: 0, z: 16, yaw: 0, speed: 8, inSafeZone: true });
    state.money = 0; state.carrying = null; state.demons = []; state.wildEggs = [];
    state.nests = LOCATIONS.nests.map(nest => ({ ...nest, egg: null }));
    state.trailId = 'none'; state.ownedTrails = ['none']; state.trainingLevel = 0; state.trainingProgress = 0;
    WILD_SLOTS.forEach((_, index) => spawnEgg(index));
    state.guards = [{ id: 'guard-1', x: -16, z: -10, yaw: 0, chasing: false }, { id: 'guard-2', x: 16, z: -14, yaw: 0, chasing: false }];
  }
  function start() { reset('playing'); }
  function restart() { reset('playing'); }
  function pause() { if (state.phase !== 'playing') return false; state.phase = 'paused'; return true; }
  function resume() { if (state.phase !== 'paused') return false; state.phase = 'playing'; return true; }
  function drainEvents() { const drained = events; events = []; return drained; }
  function actionGate() { return state.phase === 'playing' ? null : result(false, state.phase === 'paused' ? 'paused' : 'not_started'); }
  function updateIncubation() {
    const timestamp = clock();
    state.nests.forEach(nest => {
      if (!nest.egg) return;
      nest.egg.remaining = Math.max(0, (nest.egg.readyAt - timestamp) / 1000);
      if (!nest.egg.ready && timestamp >= nest.egg.readyAt) {
        nest.egg.ready = true;
        emit('ready', nest.x, nest.z, { kind: nest.egg.kind, color: nest.egg.color, nestId: nest.id });
      }
    });
  }
  function pickupEgg(id) {
    const blocked = actionGate(); if (blocked) return blocked;
    if (state.carrying) return result(false, 'already_carrying');
    const index = state.wildEggs.findIndex(egg => egg.id === id);
    if (index < 0) return result(false, 'egg_missing');
    const egg = state.wildEggs[index];
    if (!nearby(egg)) return result(false, 'too_far');
    state.wildEggs.splice(index, 1);
    state.carrying = { ...egg, secured: false };
    respawns.set(egg.slot, simulationTime + 8);
    refreshProtection(); refreshSpeed();
    emit('pickup', egg.x, egg.z, { kind: egg.kind, color: egg.color });
    return result(true, null, { egg: { ...state.carrying } });
  }
  function depositEgg(id) {
    const blocked = actionGate(); if (blocked) return blocked;
    const nest = state.nests.find(target => target.id === id);
    if (!nest) return result(false, 'nest_missing');
    if (!nearby(nest)) return result(false, 'too_far');
    if (!state.carrying) return result(false, 'no_egg');
    refreshProtection();
    if (!state.player.inSafeZone || !state.carrying.secured) return result(false, 'not_secured');
    if (nest.egg) return result(false, 'nest_occupied');
    const timestamp = clock(), carried = state.carrying;
    nest.egg = { id: carried.id, kind: carried.kind, name: carried.name, color: carried.color, duration: carried.duration, depositedAt: timestamp, readyAt: timestamp + carried.duration * 1000, ready: false, remaining: carried.duration };
    state.carrying = null; refreshSpeed();
    emit('deposit', nest.x, nest.z, { kind: nest.egg.kind, color: nest.egg.color, value: nest.egg.duration, nestId: id });
    return result(true, null, { nestId: id, duration: nest.egg.duration });
  }
  function hatchEgg(id) {
    updateIncubation();
    const blocked = actionGate(); if (blocked) return blocked;
    const nest = state.nests.find(target => target.id === id);
    if (!nest) return result(false, 'nest_missing');
    if (!nearby(nest)) return result(false, 'too_far');
    if (!nest.egg) return result(false, 'nest_empty');
    if (!nest.egg.ready) return result(false, 'not_ready', { remaining: nest.egg.remaining });
    const egg = nest.egg, type = EGG_TYPES[egg.kind];
    const moneyOutcome = rng() >= .8;
    const species = type.species[Math.floor(rng() * type.species.length)], metadata = DEMON_TYPES[species];
    // Consume first; subsequent clicks cannot duplicate rewards.
    nest.egg = null;
    if (moneyOutcome || state.demons.length >= 12) {
      const value = moneyOutcome ? type.moneyReward : metadata.sellPrice;
      state.money += value;
      emit('hatch', nest.x, nest.z, { outcome: 'money', kind: egg.kind, color: '#ffe49a', value, capacityFallback: !moneyOutcome });
      return result(true, null, { outcome: 'money', value, capacityFallback: !moneyOutcome });
    }
    const demon = { id: uid('demon'), species, name: metadata.name, color: metadata.color, sellPrice: metadata.sellPrice, x: state.player.x, z: state.player.z - 1.5 };
    state.demons.push(demon);
    emit('hatch', nest.x, nest.z, { outcome: 'demon', kind: species, color: metadata.color, value: metadata.sellPrice, name: metadata.name });
    return result(true, null, { outcome: 'demon', demon: { ...demon }, value: metadata.sellPrice });
  }
  function sellDemon(id) {
    const blocked = actionGate(); if (blocked) return blocked;
    if (!nearby(LOCATIONS.sales)) return result(false, 'too_far');
    const index = state.demons.findIndex(demon => demon.id === id);
    if (index < 0) return result(false, 'demon_missing');
    const demon = state.demons[index], price = DEMON_TYPES[demon.species].sellPrice;
    state.demons.splice(index, 1); state.money += price;
    emit('sell', LOCATIONS.sales.x, LOCATIONS.sales.z, { kind: demon.species, color: demon.color, value: price, name: demon.name });
    return result(true, null, { value: price, species: demon.species });
  }
  function buyTrail(id) {
    const blocked = actionGate(); if (blocked) return blocked;
    const trail = TRAILS[id];
    if (!trail) return result(false, 'trail_missing');
    if (!nearby(LOCATIONS.shop)) return result(false, 'too_far');
    if (state.ownedTrails.includes(id)) return result(false, 'already_owned');
    if (trail.speedBonus <= TRAILS[state.trailId].speedBonus) return result(false, 'not_an_upgrade');
    if (state.money < trail.price) return result(false, 'not_enough_money', { required: trail.price });
    state.money -= trail.price; state.trailId = id; state.ownedTrails.push(id); refreshSpeed();
    emit('buy-trail', LOCATIONS.shop.x, LOCATIONS.shop.z, { kind: id, color: trail.color, value: trail.price });
    return result(true, null, { trailId: id, value: trail.price });
  }
  function interact() {
    updateIncubation();
    const blocked = actionGate(); if (blocked) return blocked;
    const nearestNest = state.nests.filter(nearby).sort((a, b) => distance(a) - distance(b))[0];
    if (state.carrying) return nearestNest ? depositEgg(nearestNest.id) : result(false, 'find_nest');
    const egg = state.wildEggs.filter(nearby).sort((a, b) => distance(a) - distance(b))[0];
    if (egg) return pickupEgg(egg.id);
    if (nearestNest?.egg) return hatchEgg(nearestNest.id);
    if (nearby(LOCATIONS.sales)) return state.demons.length ? sellDemon(state.demons[0].id) : result(false, 'no_demons');
    if (nearby(LOCATIONS.shop)) return result(true, null, { action: 'shop' });
    if (nearby(LOCATIONS.treadmill)) return result(true, null, { action: 'training', remaining: state.trainingLevel < 4 ? 15 - state.trainingProgress : 0 });
    return result(false, 'nothing_nearby');
  }
  function stepGuards(step) {
    state.guards.forEach((guard, index) => {
      guard.chasing = Boolean(state.carrying && !state.player.inSafeZone && Math.hypot(guard.x - state.player.x, guard.z - state.player.z) < 18);
      const originX = index ? 16 : -16, originZ = index ? -18 : -14;
      const target = guard.chasing ? state.player : { x: originX + Math.sin(simulationTime * .32 + index * 2) * 4, z: originZ + Math.cos(simulationTime * .27 + index) * 5 };
      const dx = target.x - guard.x, dz = target.z - guard.z, length = Math.hypot(dx, dz), speed = guard.chasing ? 4.4 : 2.2;
      if (length > .05) {
        const travel = Math.min(speed * step, length);
        guard.x = clamp(guard.x + dx / length * travel, -30, 30);
        guard.z = clamp(guard.z + dz / length * travel, -30, 5);
        guard.yaw = Math.atan2(dx, dz);
      }
      if (guard.chasing && state.carrying && Math.hypot(guard.x - state.player.x, guard.z - state.player.z) < 1.5 && (guardCooldowns.get(guard.id) || 0) <= simulationTime) {
        const carried = state.carrying;
        state.carrying = null; refreshSpeed(); guard.chasing = false;
        guardCooldowns.set(guard.id, simulationTime + 2);
        emit('confiscated', state.player.x, state.player.z, { kind: carried.kind, color: '#ff8899' });
      }
    });
  }
  function stepFollowers(step) {
    state.demons.forEach((demon, index) => {
      const row = Math.floor(index / 4) + 1, column = index % 4;
      const tx = state.player.x + (column - 1.5) * 1.3, tz = state.player.z - row * 1.5;
      const smooth = 1 - Math.exp(-step * 4);
      demon.x += (tx - demon.x) * smooth; demon.z += (tz - demon.z) * smooth;
      demon.x = clamp(demon.x, -31, 31); demon.z = clamp(demon.z, -31, 31);
    });
  }
  function update(dt, input = {}) {
    updateIncubation(); // Real time keeps incubating in pause or background updates.
    if (state.phase !== 'playing') return;
    const delta = clamp(finite(dt), 0, .05);
    if (!delta) { refreshProtection(); return; }
    const substeps = Math.ceil(delta / (1 / 120)), step = delta / substeps;
    for (let iteration = 0; iteration < substeps; iteration++) {
      simulationTime += step;
      const mx = clamp(finite(input.moveX), -1, 1), mz = clamp(finite(input.moveZ), -1, 1), length = Math.hypot(mx, mz);
      refreshSpeed();
      if (length > .001) {
        state.player.x = clamp(state.player.x + mx / Math.max(1, length) * state.player.speed * step, -31, 31);
        state.player.z = clamp(state.player.z + mz / Math.max(1, length) * state.player.speed * step, -31, 31);
        state.player.yaw = Math.atan2(mx, mz);
      }
      refreshProtection();
      if (state.trainingLevel < 4 && distance(LOCATIONS.treadmill) <= 2 && length < .15) {
        state.trainingProgress += step;
        if (state.trainingProgress >= 15 - 1e-8) {
          state.trainingLevel += 1; state.trainingProgress = 0; refreshSpeed();
          emit('training', LOCATIONS.treadmill.x, LOCATIONS.treadmill.z, { value: state.trainingLevel, color: '#98efbc' });
        }
      }
      for (const [slot, availableAt] of respawns) {
        if (availableAt <= simulationTime) { if (!state.wildEggs.some(egg => egg.slot === slot)) spawnEgg(slot); respawns.delete(slot); }
      }
      stepGuards(step); stepFollowers(step);
    }
  }
  reset('intro');
  return { state, start, restart, pause, resume, update, interact, pickupEgg, depositEgg, hatchEgg, sellDemon, buyTrail, drainEvents };
}
