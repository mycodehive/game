// Shared, DOM-free simulation. Coordinates are centers; +y points down.
export const ARENA = Object.freeze({ width: 100, height: 140 });
export const ITEMS = Object.freeze({
  multi: Object.freeze({ label: '멀티볼', description: '공을 두 개 더 분열합니다. 최대 6개까지 동시에 플레이합니다.', color: '#60eaff' }),
  pierce: Object.freeze({ label: '관통 코어', description: '8초 동안 공이 벽돌을 관통합니다.', color: '#bd8aff' }),
  laser: Object.freeze({ label: '레이저', description: '10초 동안 발사 버튼으로 쌍열 레이저를 쏩니다.', color: '#ff668c' }),
  expand: Object.freeze({ label: '와이드 패들', description: '10초 동안 패들이 넓어집니다.', color: '#76f4a9' }),
  shield: Object.freeze({ label: '하단 실드', description: '바닥에 떨어지는 공을 한 번 튕겨냅니다. 최대 3회 충전.', color: '#72bfff' }),
  slow: Object.freeze({ label: '슬로 필드', description: '8초 동안 공의 이동 속도를 낮춥니다.', color: '#ffc96a' }),
  heal: Object.freeze({ label: '생명 회복', description: '생명을 1 회복합니다. 최대 6까지 회복할 수 있습니다.', color: '#ff88c7' })
});
export const UPGRADES = Object.freeze({
  damage: Object.freeze({ label: '임팩트 증폭', description: '공과 레이저의 벽돌 피해량이 영구적으로 1 증가합니다.' }),
  width: Object.freeze({ label: '패들 확장', description: '패들의 기본 너비가 영구적으로 2 증가합니다.' }),
  speed: Object.freeze({ label: '퀵 코어', description: '키보드 패들 이동 속도와 레이저 연사 속도가 영구적으로 증가합니다.' }),
  itemdrop: Object.freeze({ label: '럭키 드롭', description: '벽돌을 부술 때 아이템이 등장할 확률이 영구적으로 증가합니다.' }),
  extrahealth: Object.freeze({ label: '생명 보충', description: '생명을 1 회복합니다. 생명이 가득 차면 보너스 점수를 받습니다.' })
});

const LIMITS = Object.freeze({ balls: 6, drops: 18, shots: 24, events: 256 });
const RANK_LIMITS = Object.freeze({ damage: 6, width: 5, speed: 5, itemdrop: 5, extrahealth: 5 });
const ITEM_KINDS = Object.keys(ITEMS);
const ROW_COLORS = ['#56e1ff', '#8b9dff', '#d781ff', '#ff899e', '#ffc76b', '#89f5bb', '#ff80d9'];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;

export function createGame({ random = Math.random } = {}) {
  const state = {
    phase: 'ready', level: 1, score: 0, lives: 3, combo: 0, elapsed: 0,
    paddle: { x: 50, y: 130, width: 18, height: 2.8 },
    balls: [], bricks: [], drops: [], shots: [],
    effects: { expand: 0, laser: 0, pierce: 0, slow: 0, shield: 0 },
    upgradeChoices: [], upgradeRanks: {}, stageKills: 0, stageCount: 0
  };
  let events = [], ids = 0, shotCooldown = 0;
  const hitCooldowns = new Map();
  const rng = () => clamp(finite(random(), .5), 0, 1 - Number.EPSILON);
  const uid = () => ++ids;
  const rank = id => state.upgradeRanks[id] || 0;
  const speedForLevel = () => Math.min(92, 43 + state.level * 3.5);
  const damage = () => 1 + Math.min(rank('damage'), RANK_LIMITS.damage);
  const widthForEffects = () => Math.min(40, (18 + Math.min(rank('width'), 5) * 2) * (state.effects.expand > 0 ? 1.55 : 1));
  const emit = (type, x = 50, y = 70, extra = {}) => {
    if (events.length === LIMITS.events) events.shift();
    events.push({ type, x: finite(x, 50), y: finite(y, 70), ...extra });
  };
  function attachedBall() {
    const speed = speedForLevel();
    return { id: uid(), x: state.paddle.x, y: state.paddle.y - state.paddle.height / 2 - 1.25, vx: speed * .35, vy: -speed * Math.sqrt(1 - .35 ** 2), radius: 1.15, attached: true };
  }
  function resetEffects() {
    Object.assign(state.effects, { expand: 0, laser: 0, pierce: 0, slow: 0, shield: 0 });
    state.paddle.width = widthForEffects();
  }
  function buildStage() {
    state.bricks = [];
    const rows = Math.min(7, 3 + Math.floor(state.level / 2));
    const bossStage = state.level % 3 === 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < 8; col++) {
        const pattern = row * 8 + col + state.level;
        let type = 'normal';
        if (row === 0 && pattern % 3 === 0) type = 'armor';
        if (state.level >= 2 && pattern % 11 === 0) type = 'blast';
        if (state.level >= 2 && row > 0 && pattern % 7 === 0) type = 'moving';
        const hp = type === 'blast' ? 1 : type === 'armor' ? Math.min(8, 2 + Math.floor(state.level / 3)) : type === 'moving' ? 2 + Math.min(3, Math.floor(state.level / 6)) : Math.min(6, 1 + Math.floor(state.level / 6));
        const x = 9.4 + col * 11.6;
        state.bricks.push({ id: uid(), x, y: (bossStage ? 30 : 20) + row * 7.4, w: 10.4, h: 4.7, hp, maxHp: hp, type, alive: true, baseX: x, motionPhase: col * .85 + row, color: type === 'blast' ? '#ff9366' : type === 'armor' ? '#c8d6ff' : type === 'moving' ? '#80ffdf' : ROW_COLORS[row] });
      }
    }
    if (bossStage) {
      const hp = Math.min(120, 14 + state.level * 2);
      state.bricks.push({ id: uid(), x: 50, y: 16, w: 26, h: 7, hp, maxHp: hp, type: 'boss', alive: true, baseX: 50, motionPhase: 0, color: '#ff6bb5' });
    }
    state.stageKills = 0;
    state.stageCount = state.bricks.length;
    state.paddle.x = 50;
    state.paddle.width = widthForEffects();
    state.balls = [attachedBall()];
    state.drops = [];
    state.shots = [];
    state.combo = 0;
    state.upgradeChoices = [];
    shotCooldown = 0;
    hitCooldowns.clear();
  }
  function reset(phase) {
    events = [];
    ids = 0;
    Object.assign(state, { phase, level: 1, score: 0, lives: 3, combo: 0, elapsed: 0, upgradeRanks: {} });
    resetEffects();
    buildStage();
  }
  function start() { reset('playing'); }
  function restart() { reset('playing'); }
  function launch() {
    if (state.phase !== 'playing') return false;
    let launched = false;
    state.balls.forEach((ball, index) => {
      if (!ball.attached) return;
      ball.attached = false;
      const speed = speedForLevel(), angle = (.35 + index * .18) * (index % 2 ? -1 : 1);
      ball.vx = Math.sin(angle) * speed;
      ball.vy = -Math.cos(angle) * speed;
      launched = true;
      emit('launch', ball.x, ball.y, { color: '#60eaff' });
    });
    return launched;
  }
  function pause() { if (state.phase === 'playing') state.phase = 'paused'; }
  function resume() { if (state.phase === 'paused') state.phase = 'playing'; }
  function drainEvents() { const drained = events; events = []; return drained; }

  function chooseUpgrades() {
    const pool = Object.keys(UPGRADES).filter(id => rank(id) < RANK_LIMITS[id]);
    if (!pool.length) pool.push('extrahealth');
    const result = [];
    while (pool.length && result.length < 3) result.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    return result;
  }
  function applyUpgrade(id) {
    if (state.phase !== 'upgrade' || !state.upgradeChoices.includes(id)) return false;
    state.upgradeRanks[id] = rank(id) + 1;
    if (id === 'extrahealth') {
      if (state.lives < 6) state.lives += 1;
      else state.score += 500;
    }
    state.level += 1;
    resetEffects();
    buildStage();
    state.phase = 'playing';
    emit('upgrade', 50, 70, { kind: id, value: rank(id), color: '#b78aff' });
    return true;
  }
  function checkStageClear() {
    if (state.phase !== 'playing' || !state.bricks.length || state.bricks.some(brick => brick.alive)) return false;
    state.score += state.level * 100;
    state.phase = 'upgrade';
    state.upgradeChoices = chooseUpgrades();
    state.drops = [];
    state.shots = [];
    emit('level-clear', 50, 65, { value: state.level, color: '#8bfff0' });
    return true;
  }
  function spawnDrop(brick) {
    if (state.drops.length >= LIMITS.drops || rng() >= .22 + Math.min(rank('itemdrop'), 5) * .07) return;
    const kind = ITEM_KINDS[Math.floor(rng() * ITEM_KINDS.length)];
    state.drops.push({ id: uid(), x: brick.x, y: brick.y, kind });
  }
  function hitBrick(initialBrick, power) {
    const queue = [{ brick: initialBrick, power }], blasted = new Set();
    // An iterative queue allows dense blast chains without recursive stack growth.
    while (queue.length) {
      const { brick, power: force } = queue.shift();
      if (!brick.alive) continue;
      brick.hp = Math.max(0, brick.hp - force);
      emit('brick-hit', brick.x, brick.y, { color: brick.color, value: force, kind: brick.type });
      if (brick.hp > 0) continue;
      brick.alive = false;
      state.stageKills += 1;
      state.combo = Math.min(99, state.combo + 1);
      const base = brick.type === 'boss' ? 300 : brick.type === 'armor' ? 70 : brick.type === 'blast' ? 80 : 50;
      const value = Math.round(base * (1 + Math.min(20, state.combo - 1) * .1));
      state.score += value;
      emit('brick-break', brick.x, brick.y, { color: brick.color, kind: brick.type, combo: state.combo, value });
      spawnDrop(brick);
      if (brick.type === 'blast' && !blasted.has(brick.id)) {
        blasted.add(brick.id);
        state.bricks.forEach(neighbor => {
          if (neighbor.alive && Math.hypot(neighbor.x - brick.x, neighbor.y - brick.y) <= 15) queue.push({ brick: neighbor, power: 2 + Math.min(rank('damage'), 6) });
        });
      }
    }
  }
  function collectItem(kind, x, y) {
    switch (kind) {
      case 'expand': state.effects.expand = 10; state.paddle.width = widthForEffects(); break;
      case 'laser': state.effects.laser = 10; break;
      case 'pierce': state.effects.pierce = 8; break;
      case 'slow': state.effects.slow = 8; break;
      case 'shield': state.effects.shield = Math.min(3, state.effects.shield + 1); break;
      case 'heal':
        if (state.lives < 6) state.lives += 1;
        else state.score += 100;
        break;
      case 'multi': {
        const source = state.balls.find(ball => !ball.attached) || state.balls[0];
        if (!source) break;
        const speed = Math.hypot(source.vx, source.vy) || speedForLevel();
        const currentAngle = Math.atan2(source.vx, Math.abs(source.vy));
        for (const offset of [-.44, .44]) {
          if (state.balls.length >= LIMITS.balls) break;
          const angle = clamp(currentAngle + offset, -1.13, 1.13);
          state.balls.push({ id: uid(), x: source.x, y: source.y - 1, vx: Math.sin(angle) * speed, vy: -Math.max(speed * .36, Math.abs(Math.cos(angle) * speed)), radius: source.radius, attached: source.attached });
        }
        break;
      }
      default: return;
    }
    state.score += 15;
    emit('item', x, y, { kind, color: ITEMS[kind].color, value: kind === 'heal' ? 1 : undefined });
  }
  function loseLife() {
    state.lives = Math.max(0, state.lives - 1);
    state.combo = 0;
    state.drops = [];
    state.shots = [];
    hitCooldowns.clear();
    resetEffects();
    emit('life-lost', state.paddle.x, state.paddle.y, { value: state.lives, color: '#ff668c' });
    if (!state.lives) {
      state.phase = 'gameover';
      emit('gameover', 50, 70, { value: state.score, color: '#ff668c' });
    } else state.balls = [attachedBall()];
  }

  function circleRect(ball, rect) {
    const left = rect.x - rect.w / 2, right = rect.x + rect.w / 2;
    const top = rect.y - rect.h / 2, bottom = rect.y + rect.h / 2;
    const dx = ball.x - clamp(ball.x, left, right), dy = ball.y - clamp(ball.y, top, bottom);
    const distance = Math.hypot(dx, dy);
    if (distance >= ball.radius) return null;
    if (distance > 1e-9) return { nx: dx / distance, ny: dy / distance, push: ball.radius - distance + .001 };
    const faces = [
      { gap: ball.x - left, nx: -1, ny: 0 }, { gap: right - ball.x, nx: 1, ny: 0 },
      { gap: ball.y - top, nx: 0, ny: -1 }, { gap: bottom - ball.y, nx: 0, ny: 1 }
    ];
    faces.sort((a, b) => a.gap - b.gap);
    return { ...faces[0], push: faces[0].gap + ball.radius + .001 };
  }
  function normalizeVelocity(ball) {
    const targetSpeed = clamp(Math.hypot(ball.vx, ball.vy) || speedForLevel(), 25, 100);
    const vertical = Math.max(Math.abs(ball.vy), targetSpeed * .33);
    const horizontal = Math.sqrt(Math.max(0, targetSpeed ** 2 - Math.min(targetSpeed, vertical) ** 2));
    ball.vy = (ball.vy < 0 ? -1 : 1) * Math.min(targetSpeed, vertical);
    ball.vx = (ball.vx < 0 ? -1 : 1) * horizontal;
  }
  function stepBalls(step) {
    const survivors = [];
    for (const ball of state.balls) {
      if (ball.attached) {
        ball.x = state.paddle.x;
        ball.y = state.paddle.y - state.paddle.height / 2 - ball.radius - .05;
        survivors.push(ball);
        continue;
      }
      const motion = step * (state.effects.slow > 0 ? .62 : 1);
      ball.x += ball.vx * motion; ball.y += ball.vy * motion;
      if (ball.x < ball.radius || ball.x > ARENA.width - ball.radius) {
        ball.x = clamp(ball.x, ball.radius, ARENA.width - ball.radius);
        ball.vx = ball.x <= ball.radius ? Math.abs(ball.vx) : -Math.abs(ball.vx);
        emit('wall-hit', ball.x, ball.y, { color: '#56e1ff' });
      }
      if (ball.y < ball.radius) {
        ball.y = ball.radius; ball.vy = Math.abs(ball.vy);
        emit('wall-hit', ball.x, ball.y, { color: '#56e1ff' });
      }
      const paddle = { x: state.paddle.x, y: state.paddle.y, w: state.paddle.width, h: state.paddle.height };
      if (ball.vy > 0 && ball.y <= paddle.y + paddle.h / 2 && circleRect(ball, paddle)) {
        const speed = clamp(Math.hypot(ball.vx, ball.vy) || speedForLevel(), 25, 100);
        const offset = clamp((ball.x - paddle.x) / (paddle.w / 2), -1, 1);
        const angle = offset * 1.12;
        ball.x = clamp(ball.x, ball.radius, ARENA.width - ball.radius);
        ball.y = paddle.y - paddle.h / 2 - ball.radius - .01;
        ball.vx = Math.sin(angle) * speed; ball.vy = -Math.cos(angle) * speed;
        state.combo = 0;
        emit('paddle-hit', ball.x, ball.y, { color: '#56e1ff' });
      }
      for (const brick of state.bricks) {
        if (!brick.alive) continue;
        const hit = circleRect(ball, brick);
        if (!hit) continue;
        const key = `${ball.id}:${brick.id}`;
        const canDamage = (hitCooldowns.get(key) || 0) <= state.elapsed;
        // Refresh while overlapping: piercing hits once per passage through a brick.
        hitCooldowns.set(key, state.elapsed + .16);
        if (canDamage) hitBrick(brick, damage());
        if (state.effects.pierce > 0) continue;
        ball.x += hit.nx * hit.push; ball.y += hit.ny * hit.push;
        const dot = ball.vx * hit.nx + ball.vy * hit.ny;
        if (dot < 0) { ball.vx -= 2 * dot * hit.nx; ball.vy -= 2 * dot * hit.ny; }
        normalizeVelocity(ball);
        break;
      }
      if (ball.y > ARENA.height - ball.radius && ball.vy > 0 && state.effects.shield > 0) {
        state.effects.shield -= 1;
        ball.y = ARENA.height - ball.radius;
        ball.vy = -Math.abs(ball.vy);
        emit('wall-hit', ball.x, ball.y, { kind: 'shield', color: ITEMS.shield.color });
      }
      if (ball.y - ball.radius > ARENA.height) continue;
      survivors.push(ball);
    }
    state.balls = survivors;
  }
  function stepShots(step, fire) {
    shotCooldown = Math.max(0, shotCooldown - step);
    if (fire && state.effects.laser > 0 && shotCooldown <= 0 && state.shots.length <= LIMITS.shots - 2) {
      [-1, 1].forEach(side => {
        const shot = { id: uid(), x: state.paddle.x + side * state.paddle.width * .32, y: state.paddle.y - 3 };
        state.shots.push(shot);
        emit('shot', shot.x, shot.y, { color: ITEMS.laser.color });
      });
      shotCooldown = Math.max(.12, .24 - Math.min(rank('speed'), 5) * .02);
    }
    state.shots = state.shots.filter(shot => {
      shot.y -= 115 * step;
      if (shot.y < -2) return false;
      const hit = state.bricks.find(brick => brick.alive && Math.abs(shot.x - brick.x) < brick.w / 2 + .4 && Math.abs(shot.y - brick.y) < brick.h / 2 + 1.2);
      if (hit) { hitBrick(hit, damage()); return false; }
      return true;
    });
  }
  function stepDrops(step) {
    state.drops = state.drops.filter(drop => {
      drop.y += 24 * step;
      if (Math.abs(drop.x - state.paddle.x) <= state.paddle.width / 2 + 2 && Math.abs(drop.y - state.paddle.y) <= state.paddle.height / 2 + 2) {
        collectItem(drop.kind, drop.x, drop.y);
        return false;
      }
      return drop.y < ARENA.height + 3;
    });
  }
  function update(dt, input = {}) {
    if (state.phase !== 'playing') return;
    const delta = clamp(finite(dt, 0), 0, .05);
    if (!delta) return;
    const substeps = Math.ceil(delta / (1 / 240)), step = delta / substeps;
    for (let iteration = 0; iteration < substeps; iteration++) {
      if (state.phase !== 'playing') break;
      state.elapsed += step;
      for (const effect of ['expand', 'laser', 'pierce', 'slow']) state.effects[effect] = Math.max(0, state.effects[effect] - step);
      state.paddle.width = widthForEffects();
      if (Number.isFinite(input.paddleX)) state.paddle.x = input.paddleX;
      else state.paddle.x += clamp(finite(input.axis, 0), -1, 1) * (86 + Math.min(rank('speed'), 5) * 15) * step;
      state.paddle.x = clamp(state.paddle.x, state.paddle.width / 2 + .7, ARENA.width - state.paddle.width / 2 - .7);
      state.bricks.forEach(brick => {
        if (!brick.alive) return;
        if (brick.type === 'moving') brick.x = brick.baseX + Math.sin(state.elapsed * (1.1 + state.level * .06) + brick.motionPhase) * 1.1;
        if (brick.type === 'boss') brick.x = 50 + Math.sin(state.elapsed * (1 + state.level * .025)) * 22;
      });
      stepBalls(step);
      stepShots(step, Boolean(input.fire));
      stepDrops(step);
      for (const [key, expires] of hitCooldowns) if (expires <= state.elapsed) hitCooldowns.delete(key);
      // Clearing and ball loss can coincide: clearing the stage takes priority.
      if (checkStageClear()) break;
      if (!state.balls.length) { loseLife(); break; }
    }
  }
  reset('ready');
  return { state, start, restart, launch, pause, resume, update, applyUpgrade, drainEvents };
}
