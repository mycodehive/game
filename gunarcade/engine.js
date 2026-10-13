// Deterministic XZ-plane simulation shared by the 3D presentation and input UI.
export const HEROES = Object.freeze([
  Object.freeze({ id: 'scout', name: '카이', role: '기동 정찰병', description: '빠른 이동으로 적의 포위를 벗어나는 민첩한 정찰병.', color: '#5ce7ff', stats: Object.freeze({ health: 85, power: .9, speed: 12, tech: 1 }) }),
  Object.freeze({ id: 'tank', name: '브릭', role: '중장갑 돌격병', description: '높은 체력과 강력한 한 발로 전선을 밀어붙이는 돌격병.', color: '#ff9b70', stats: Object.freeze({ health: 150, power: 1.35, speed: 7.8, tech: .85 }) }),
  Object.freeze({ id: 'ranger', name: '아린', role: '균형형 레인저', description: '체력·기동·화력이 고르게 갖춰진 균형형 전투 전문가.', color: '#9ef5bd', stats: Object.freeze({ health: 110, power: 1, speed: 9.8, tech: 1.1 }) }),
  Object.freeze({ id: 'engineer', name: '노바', role: '테크 엔지니어', description: '고급 무기 튜닝으로 빠른 연사와 풍부한 산탄을 사용하는 엔지니어.', color: '#c095ff', stats: Object.freeze({ health: 100, power: .85, speed: 9, tech: 1.5 }) })
]);
export const WEAPONS = Object.freeze({
  rifle: Object.freeze({ name: '펄스 라이플', description: '빠르고 정확한 단발 펄스. 중거리에서 안정적인 화력을 냅니다.', color: '#5ce7ff', baseDamage: 22, baseCooldown: .24, range: 38, pellets: 1, pierce: 0 }),
  shotgun: Object.freeze({ name: '스펙트럼 샷건', description: '넓은 부채꼴로 산탄을 발사해 가까운 적을 빠르게 제압합니다.', color: '#ffbf69', baseDamage: 9, baseCooldown: .72, range: 19, pellets: 7, pierce: 0 }),
  rail: Object.freeze({ name: '네온 레일건', description: '긴 사거리의 고속 관통탄. 한 발이 최대 네 적을 관통합니다.', color: '#ce91ff', baseDamage: 70, baseCooldown: .95, range: 66, pellets: 1, pierce: 3 }),
  burst: Object.freeze({ name: '트리플 블래스터', description: '좁은 각도로 세 발을 동시에 발사하는 고속 근중거리 무기.', color: '#ff6da4', baseDamage: 14, baseCooldown: .4, range: 31, pellets: 3, pierce: 0 })
});

const HALF = 32, PLAYER_RADIUS = .8;
const LIMITS = Object.freeze({ enemies: 60, bullets: 192, events: 256, weapons: 3 });
const SPEEDS = Object.freeze({ rifle: 70, shotgun: 55, rail: 120, burst: 80 });
const ENEMY_COLORS = Object.freeze({ scout: '#ff718c', brute: '#ffab76', shooter: '#ed79ff', boss: '#bc7cff' });
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

export function createGame({ random = Math.random } = {}) {
  const state = {
    phase: 'select', pausePhase: null, heroId: 'ranger', stage: 1, prepRemaining: 30,
    score: 0, kills: 0, stageEnemyTotal: 0, failureReason: '', arenaHalf: HALF,
    player: { x: 0, z: 0, yaw: Math.PI, hp: 110, maxHp: 110, speed: 9.8 },
    weapons: [], selectedWeapon: 0, pickups: [], enemies: [], bullets: [], obstacles: []
  };
  let ids = 0, events = [], weaponCooldown = 0;
  const attackCooldowns = new Map();
  const navigation = new Map();
  const rng = () => clamp(finite(random(), .5), 0, 1 - Number.EPSILON);
  const uid = () => ++ids;
  const hero = () => HEROES.find(character => character.id === state.heroId) || HEROES[2];
  const emit = (type, x = state.player.x, z = state.player.z, extra = {}) => {
    if (events.length === LIMITS.events) events.shift();
    events.push({ type, x: finite(x), z: finite(z), ...extra });
  };
  const addScore = value => { state.score = Math.min(Number.MAX_SAFE_INTEGER, state.score + Math.max(0, Math.round(value))); };
  function applyHero() {
    const character = hero();
    Object.assign(state.player, { x: 0, z: 0, yaw: Math.PI, hp: character.stats.health, maxHp: character.stats.health, speed: character.stats.speed });
  }
  function buildObstacles() {
    state.obstacles = [
      [-11, 0, 4, 11, 2.8], [11, 0, 4, 11, 2.8], [0, -17, 12, 3, 2.6], [0, 17, 12, 3, 2.6],
      [-22, -12, 4, 4, 3.5], [22, -12, 4, 4, 3.5], [-22, 12, 4, 4, 3.5], [22, 12, 4, 4, 3.5]
    ].map(([x, z, w, d, h]) => ({ id: uid(), x, z, w, d, h }));
  }
  function buildPickups() {
    const layout = [
      [0, -4, 'rifle'], [-8, -10, 'shotgun'], [8, -10, 'rail'], [0, 10, 'burst'],
      [-22, -22, 'rail'], [22, -22, 'shotgun'], [-22, 22, 'burst'], [22, 22, 'rifle']
    ];
    const baseTier = Math.min(3, 1 + Math.floor((state.stage - 1) / 4));
    state.pickups = layout.map(([x, z, kind], index) => ({ id: uid(), x, z, kind, collected: false, tier: index === 0 ? baseTier : Math.min(3, baseTier + (rng() < .18 ? 1 : 0)) }));
  }
  function prepareStage() {
    state.phase = 'prepare';
    state.pausePhase = null;
    state.prepRemaining = 30;
    state.failureReason = '';
    state.kills = 0;
    state.stageEnemyTotal = 0;
    state.weapons = [];
    state.selectedWeapon = 0;
    state.enemies = [];
    state.bullets = [];
    weaponCooldown = 0;
    attackCooldowns.clear();
    navigation.clear();
    applyHero();
    buildObstacles();
    buildPickups();
    emit('stage-start', 0, 0, { value: state.stage, color: hero().color });
  }
  function resetCampaign() {
    ids = 0; events = [];
    state.stage = 1; state.score = 0;
    prepareStage();
  }
  function start() { resetCampaign(); }
  function restart() { resetCampaign(); }
  function selectCharacter(id) {
    if (!['select', 'gameover'].includes(state.phase) || !HEROES.some(character => character.id === id)) return false;
    state.heroId = id;
    applyHero();
    return true;
  }
  function pause() {
    if (!['prepare', 'combat'].includes(state.phase)) return false;
    state.pausePhase = state.phase; state.phase = 'paused'; return true;
  }
  function resume() {
    if (state.phase !== 'paused') return false;
    state.phase = state.pausePhase; state.pausePhase = null; return true;
  }
  function nextStage() {
    if (state.phase !== 'cleared') return false;
    state.stage += 1;
    prepareStage();
    return true;
  }
  function drainEvents() { const drained = events; events = []; return drained; }

  function weaponFromPickup(pickup) {
    const base = WEAPONS[pickup.kind], character = hero();
    const tier = clamp(pickup.tier || 1, 1, 3), quality = 1 + (tier - 1) * .18;
    const extraPellets = base.pellets > 1 ? Math.max(0, Math.floor((character.stats.tech - 1) * 4)) : 0;
    return {
      id: uid(), kind: pickup.kind, name: base.name, color: base.color,
      damage: base.baseDamage * character.stats.power * quality,
      cooldown: base.baseCooldown / (character.stats.tech * (1 + (tier - 1) * .1)),
      range: base.range * (1 + (tier - 1) * .05), pellets: base.pellets + extraPellets,
      pierce: base.pierce, tier
    };
  }
  function collectNearby() {
    state.pickups.forEach(pickup => {
      if (pickup.collected || Math.hypot(pickup.x - state.player.x, pickup.z - state.player.z) > 1.7) return;
      const weapon = weaponFromPickup(pickup);
      let index = state.weapons.findIndex(existing => existing.kind === pickup.kind);
      if (index >= 0) {
        if (weapon.tier > state.weapons[index].tier) state.weapons[index] = weapon;
      } else if (state.weapons.length < LIMITS.weapons) {
        index = state.weapons.length;
        state.weapons.push(weapon);
      } else {
        index = state.selectedWeapon;
        state.weapons[index] = weapon;
      }
      pickup.collected = true;
      if (state.weapons.length === 1) state.selectedWeapon = 0;
      addScore(20);
      emit('pickup', pickup.x, pickup.z, { color: weapon.color, kind: pickup.kind, value: weapon.tier });
    });
  }
  function insideObstacle(x, z, radius) {
    return state.obstacles.some(obstacle => {
      const dx = x - clamp(x, obstacle.x - obstacle.w / 2, obstacle.x + obstacle.w / 2);
      const dz = z - clamp(z, obstacle.z - obstacle.d / 2, obstacle.z + obstacle.d / 2);
      return dx * dx + dz * dz < radius * radius;
    });
  }
  function moveEntity(entity, dx, dz, radius) {
    const limit = HALF - radius - .1;
    const x = clamp(entity.x + dx, -limit, limit);
    if (!insideObstacle(x, entity.z, radius)) entity.x = x;
    const z = clamp(entity.z + dz, -limit, limit);
    if (!insideObstacle(entity.x, z, radius)) entity.z = z;
  }
  function enemySpec(type) {
    const scale = 1 + (state.stage - 1) * .12;
    const specs = {
      scout: { hp: 35, speed: 4.1, radius: .85 },
      brute: { hp: 85, speed: 2.65, radius: 1.2 },
      shooter: { hp: 46, speed: 3.15, radius: .9 },
      boss: { hp: 240, speed: 2.8, radius: 1.8 }
    };
    const spec = specs[type];
    return { hp: Math.round(spec.hp * scale), speed: Math.min(spec.speed + 2.2, spec.speed + (state.stage - 1) * .13), radius: spec.radius };
  }
  function spawnEnemies() {
    const count = Math.min(LIMITS.enemies, 4 + state.stage * 2), chosen = [];
    const valid = (x, z, radius) => Math.hypot(x - state.player.x, z - state.player.z) >= 12 && !insideObstacle(x, z, radius) && chosen.every(enemy => Math.hypot(x - enemy.x, z - enemy.z) >= radius + enemy.radius + .6);
    // Randomized ring candidates, then a deterministic grid guarantee finite groups.
    const fallback = [];
    for (let x = -28; x <= 28; x += 4) for (let z = -28; z <= 28; z += 4) fallback.push({ x, z });
    fallback.sort((a, b) => Math.hypot(a.x - state.player.x, a.z - state.player.z) - Math.hypot(b.x - state.player.x, b.z - state.player.z));
    for (let i = 0; i < count; i++) {
      const type = state.stage % 3 === 0 && i === count - 1 ? 'boss' : i % 5 === 4 ? 'brute' : i % 3 === 2 ? 'shooter' : 'scout';
      const spec = enemySpec(type), limit = HALF - spec.radius - .5;
      let point = null;
      for (let attempt = 0; attempt < 24; attempt++) {
        const angle = rng() * Math.PI * 2 + i * 2.399, distance = 12.5 + rng() * 10;
        const x = clamp(state.player.x + Math.sin(angle) * distance, -limit, limit);
        const z = clamp(state.player.z + Math.cos(angle) * distance, -limit, limit);
        if (valid(x, z, spec.radius)) { point = { x, z }; break; }
      }
      if (!point) point = fallback.find(candidate => valid(candidate.x, candidate.z, spec.radius));
      // The grid has over 150 free candidates, even at maximum count and a corner.
      if (!point) throw new Error('No valid enemy spawn position');
      const enemy = { id: uid(), x: point.x, z: point.z, type, hp: spec.hp, maxHp: spec.hp, speed: spec.speed, radius: spec.radius, alive: true };
      chosen.push(enemy);
      attackCooldowns.set(enemy.id, .7 + rng() * .4);
    }
    state.enemies = chosen;
    state.stageEnemyTotal = chosen.length;
  }
  function beginCombat() {
    state.prepRemaining = 0;
    if (!state.weapons.length) { fail('no_weapon'); return; }
    spawnEnemies();
    state.phase = 'combat';
    emit('combat-start', state.player.x, state.player.z, { value: state.stageEnemyTotal, color: '#ff8c9f' });
  }
  function fail(reason) {
    if (state.phase === 'gameover') return;
    state.phase = 'gameover'; state.failureReason = reason;
    state.bullets = [];
    emit('gameover', state.player.x, state.player.z, { kind: reason, value: state.score, color: '#ff668a' });
  }
  function hurtPlayer(amount) {
    if (state.phase !== 'combat') return;
    state.player.hp = Math.max(0, state.player.hp - amount);
    emit('hurt', state.player.x, state.player.z, { value: amount, color: '#ff668a' });
    if (state.player.hp <= 0) fail('defeated');
  }
  function damageEnemy(enemy, amount, color) {
    if (!enemy.alive || state.phase !== 'combat') return;
    enemy.hp = Math.max(0, enemy.hp - amount);
    emit('hit', enemy.x, enemy.z, { kind: enemy.type, color, value: amount });
    if (enemy.hp > 0) return;
    enemy.alive = false;
    state.kills += 1;
    const value = Math.round(({ scout: 100, brute: 160, shooter: 180, boss: 500 })[enemy.type] * (1 + (state.stage - 1) * .08));
    addScore(value);
    emit('kill', enemy.x, enemy.z, { kind: enemy.type, color: ENEMY_COLORS[enemy.type], value });
    if (state.enemies.length && state.enemies.every(target => !target.alive)) {
      state.phase = 'cleared'; state.bullets = [];
      addScore(state.stage * 200);
      emit('stage-clear', state.player.x, state.player.z, { value: state.stage, color: '#9ef5bd' });
    }
  }
  function aimDirection(input) {
    let dx, dz;
    if (Number.isFinite(input.aimX) && Number.isFinite(input.aimZ)) {
      dx = input.aimX - state.player.x; dz = input.aimZ - state.player.z;
    } else {
      let nearest = null, distance = Infinity;
      state.enemies.forEach(enemy => {
        if (!enemy.alive) return;
        const candidate = Math.hypot(enemy.x - state.player.x, enemy.z - state.player.z);
        if (candidate < distance) { nearest = enemy; distance = candidate; }
      });
      if (nearest) { dx = nearest.x - state.player.x; dz = nearest.z - state.player.z; }
    }
    const length = Math.hypot(dx || 0, dz || 0);
    if (length > .001) { state.player.yaw = Math.atan2(dx, dz); return { x: dx / length, z: dz / length }; }
    return { x: Math.sin(state.player.yaw), z: Math.cos(state.player.yaw) };
  }
  function fireWeapon(direction) {
    const weapon = state.weapons[state.selectedWeapon];
    if (!weapon || weaponCooldown > 0) return;
    weaponCooldown = weapon.cooldown;
    const angle = Math.atan2(direction.x, direction.z), spread = weapon.kind === 'shotgun' ? .72 / Math.sqrt(hero().stats.tech) : weapon.kind === 'burst' ? .13 / Math.sqrt(hero().stats.tech) : 0;
    for (let pellet = 0; pellet < weapon.pellets && state.bullets.length < LIMITS.bullets; pellet++) {
      const offset = weapon.pellets > 1 ? (pellet / (weapon.pellets - 1) - .5) * spread : 0;
      const dx = Math.sin(angle + offset), dz = Math.cos(angle + offset), speed = SPEEDS[weapon.kind];
      state.bullets.push({ id: uid(), x: state.player.x + dx * .95, z: state.player.z + dz * .95, vx: dx * speed, vz: dz * speed, radius: weapon.kind === 'rail' ? .14 : .12, damage: weapon.damage, enemy: false, kind: weapon.kind, color: weapon.color, rangeRemaining: weapon.range, pierce: weapon.pierce, hitIds: [] });
    }
    emit('shot', state.player.x, state.player.z, { kind: weapon.kind, color: weapon.color, value: weapon.pellets });
  }
  function blockingCover(x, z, targetX, targetZ, radius) {
    return state.obstacles.map(obstacle => ({ obstacle, at: segmentBox(x, z, targetX, targetZ, obstacle, radius) })).filter(hit => hit.at !== null).sort((a, b) => a.at - b.at);
  }
  function pursuitTarget(enemy, step, blocked) {
    if (!blocked.length) { navigation.delete(enemy.id); return state.player; }
    let waypoint = navigation.get(enemy.id);
    if (waypoint) waypoint.remaining -= step;
    if (!waypoint || waypoint.remaining <= 0 || Math.hypot(enemy.x - waypoint.x, enemy.z - waypoint.z) < .3 || Math.hypot(state.player.x - waypoint.goalX, state.player.z - waypoint.goalZ) > 3) {
      const box = blocked[0].obstacle, margin = enemy.radius + .55, candidates = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = box.x + sx * (box.w / 2 + margin), z = box.z + sz * (box.d / 2 + margin);
        const approach = Math.hypot(x - enemy.x, z - enemy.z);
        if (approach < .25 || Math.abs(x) + enemy.radius >= HALF || Math.abs(z) + enemy.radius >= HALF || insideObstacle(x, z, enemy.radius) || blockingCover(enemy.x, enemy.z, x, z, enemy.radius).length) continue;
        const onward = blockingCover(x, z, state.player.x, state.player.z, enemy.radius).length;
        candidates.push({ x, z, cost: approach + Math.hypot(x - state.player.x, z - state.player.z) + onward * 15 });
      }
      candidates.sort((a, b) => a.cost - b.cost);
      waypoint = candidates[0] ? { ...candidates[0], remaining: .5, goalX: state.player.x, goalZ: state.player.z } : null;
      if (waypoint) navigation.set(enemy.id, waypoint); else navigation.delete(enemy.id);
    }
    return waypoint || state.player;
  }
  function stepEnemies(step) {
    for (const enemy of state.enemies) {
      if (!enemy.alive || state.phase !== 'combat') continue;
      attackCooldowns.set(enemy.id, Math.max(0, (attackCooldowns.get(enemy.id) || 0) - step));
      const dx = state.player.x - enemy.x, dz = state.player.z - enemy.z, distance = Math.hypot(dx, dz);
      const blocked = blockingCover(enemy.x, enemy.z, state.player.x, state.player.z, enemy.radius);
      if (distance > .001 && (enemy.type !== 'shooter' || distance > 12 || blocked.length)) {
        const target = pursuitTarget(enemy, step, blocked);
        const routeX = target.x - enemy.x, routeZ = target.z - enemy.z, routeDistance = Math.hypot(routeX, routeZ);
        const travel = Math.min(enemy.speed * step, routeDistance, Math.max(0, distance - enemy.radius - PLAYER_RADIUS + .1));
        const oldX = enemy.x, oldZ = enemy.z;
        if (routeDistance > .001) moveEntity(enemy, routeX / routeDistance * travel, routeZ / routeDistance * travel, enemy.radius);
        if (Math.hypot(enemy.x - oldX, enemy.z - oldZ) < travel * .1 && travel > 0) {
          const sign = enemy.id % 2 ? 1 : -1;
          moveEntity(enemy, -dz / distance * travel * sign, dx / distance * travel * sign, enemy.radius);
        }
      }
      const currentDistance = Math.hypot(enemy.x - state.player.x, enemy.z - state.player.z);
      if (currentDistance <= enemy.radius + PLAYER_RADIUS + .15 && attackCooldowns.get(enemy.id) <= 0) {
        hurtPlayer((enemy.type === 'boss' ? 22 : enemy.type === 'brute' ? 16 : 10) + Math.min(12, state.stage * .6));
        attackCooldowns.set(enemy.id, .85);
      } else if (enemy.type === 'shooter' && currentDistance <= 25 && currentDistance > 4 && attackCooldowns.get(enemy.id) <= 0) {
        if (state.bullets.length < LIMITS.bullets) {
          const ux = (state.player.x - enemy.x) / currentDistance, uz = (state.player.z - enemy.z) / currentDistance;
          const speed = Math.min(22, 13 + state.stage * .2);
          state.bullets.push({ id: uid(), x: enemy.x + ux * 1.1, z: enemy.z + uz * 1.1, vx: ux * speed, vz: uz * speed, radius: .24, damage: 8 + Math.min(14, state.stage * .7), enemy: true, kind: 'orb', color: '#ff79ca', rangeRemaining: 55, pierce: 0, hitIds: [] });
        }
        attackCooldowns.set(enemy.id, Math.max(.8, 1.6 - state.stage * .025));
      }
    }
  }
  function segmentCircle(x, z, nx, nz, cx, cz, radius) {
    const fx = x - cx, fz = z - cz, dx = nx - x, dz = nz - z;
    const c = fx * fx + fz * fz - radius * radius;
    if (c <= 0) return 0;
    const a = dx * dx + dz * dz;
    if (a <= 1e-12) return null;
    const b = 2 * (fx * dx + fz * dz), discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return null;
    const hit = (-b - Math.sqrt(discriminant)) / (2 * a);
    return hit >= 0 && hit <= 1 ? hit : null;
  }
  function segmentBox(x, z, nx, nz, box, radius) {
    let near = 0, far = 1;
    const dx = nx - x, dz = nz - z;
    for (const [origin, direction, low, high] of [[x, dx, box.x - box.w / 2 - radius, box.x + box.w / 2 + radius], [z, dz, box.z - box.d / 2 - radius, box.z + box.d / 2 + radius]]) {
      if (Math.abs(direction) < 1e-10) { if (origin < low || origin > high) return null; continue; }
      const a = (low - origin) / direction, b = (high - origin) / direction;
      near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
      if (near > far) return null;
    }
    return near >= 0 && near <= 1 ? near : null;
  }
  function stepBullets(step) {
    state.bullets = state.bullets.filter(bullet => {
      if (state.phase !== 'combat') return false;
      const speed = Math.hypot(bullet.vx, bullet.vz), travel = Math.min(speed * step, bullet.rangeRemaining);
      if (!travel || !Number.isFinite(travel)) return false;
      const nx = bullet.x + bullet.vx / speed * travel, nz = bullet.z + bullet.vz / speed * travel;
      let blockedAt = Infinity;
      state.obstacles.forEach(obstacle => {
        const hit = segmentBox(bullet.x, bullet.z, nx, nz, obstacle, bullet.radius);
        if (hit !== null) blockedAt = Math.min(blockedAt, hit);
      });
      if (bullet.enemy) {
        const hit = segmentCircle(bullet.x, bullet.z, nx, nz, state.player.x, state.player.z, PLAYER_RADIUS + bullet.radius);
        if (hit !== null && hit <= blockedAt) { hurtPlayer(bullet.damage); return false; }
      } else {
        const hits = state.enemies.filter(enemy => enemy.alive && !bullet.hitIds.includes(enemy.id)).map(enemy => ({ enemy, at: segmentCircle(bullet.x, bullet.z, nx, nz, enemy.x, enemy.z, enemy.radius + bullet.radius) })).filter(hit => hit.at !== null && hit.at <= blockedAt).sort((a, b) => a.at - b.at);
        for (const hit of hits) {
          bullet.hitIds.push(hit.enemy.id);
          damageEnemy(hit.enemy, bullet.damage, bullet.color);
          if (state.phase !== 'combat') return false;
          if (bullet.pierce <= 0) return false;
          bullet.pierce -= 1;
        }
      }
      if (blockedAt <= 1) return false;
      bullet.x = nx; bullet.z = nz; bullet.rangeRemaining -= travel;
      return bullet.rangeRemaining > .001 && Math.abs(nx) < HALF && Math.abs(nz) < HALF;
    });
    if (state.phase !== 'combat') state.bullets = [];
  }
  function update(dt, input = {}) {
    if (!['prepare', 'combat'].includes(state.phase)) return;
    const delta = clamp(finite(dt), 0, .05);
    if (!delta) return;
    const substeps = Math.ceil(delta / (1 / 120)), step = delta / substeps;
    for (let iteration = 0; iteration < substeps; iteration++) {
      if (!['prepare', 'combat'].includes(state.phase)) break;
      const mx = clamp(finite(input.moveX), -1, 1), mz = clamp(finite(input.moveZ), -1, 1), magnitude = Math.hypot(mx, mz);
      if (magnitude > 0) moveEntity(state.player, mx / Math.max(1, magnitude) * state.player.speed * step, mz / Math.max(1, magnitude) * state.player.speed * step, PLAYER_RADIUS);
      collectNearby();
      if (Number.isInteger(input.slot) && input.slot >= 0 && input.slot < state.weapons.length) state.selectedWeapon = input.slot;
      const direction = aimDirection(input);
      if (state.phase === 'prepare') {
        state.prepRemaining = Math.max(0, state.prepRemaining - step);
        if (state.prepRemaining <= 1e-7) beginCombat();
        continue;
      }
      weaponCooldown = Math.max(0, weaponCooldown - step);
      if (input.fire) fireWeapon(direction);
      stepEnemies(step);
      if (state.phase === 'combat') stepBullets(step);
    }
  }
  applyHero(); buildObstacles(); buildPickups();
  return { state, selectCharacter, start, restart, pause, resume, nextStage, update, drainEvents };
}
