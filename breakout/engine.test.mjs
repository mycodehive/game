import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENA, ITEMS, UPGRADES, createGame } from './engine.js';

function game() {
  const instance = createGame({ random: () => .999 }); // No accidental drops in physics tests.
  instance.start();
  return instance;
}
function brick(id, x, y, hp = 1, type = 'normal') {
  return { id, x, y, w: 10, h: 5, hp, maxHp: hp, type, alive: true, baseX: x, motionPhase: 0, color: '#60eaff' };
}
function ball(id, x, y, vx, vy) { return { id, x, y, vx, vy, radius: 1.15, attached: false }; }
function frames(instance, seconds, input = {}) {
  for (let i = 0; i < seconds * 60; i++) instance.update(1 / 60, typeof input === 'function' ? input(instance.state) : input);
}
function pickup(instance, kind) {
  instance.state.drops.push({ id: 999, x: instance.state.paddle.x, y: instance.state.paddle.y - 2, kind });
  instance.update(1 / 60);
}
function almost(value, expected, tolerance = 1e-6) { assert.ok(Math.abs(value - expected) < tolerance, `${value} != ${expected}`); }

 test('public contract starts ready and resets campaign and drained events', () => {
  const instance = createGame({ random: () => .5 });
  assert.deepEqual(ARENA, { width: 100, height: 140 });
  assert.equal(instance.state.phase, 'ready');
  assert.equal(Object.keys(ITEMS).length, 7);
  assert.equal(Object.keys(UPGRADES).length, 5);
  instance.start();
  assert.equal(instance.state.phase, 'playing');
  assert.equal(instance.state.balls[0].attached, true);
  instance.update(.02, { paddleX: 20 });
  almost(instance.state.balls[0].x, 20);
  assert.equal(instance.launch(), true);
  assert.equal(instance.launch(), false);
  assert.equal(instance.drainEvents().filter(event => event.type === 'launch').length, 1);
  assert.deepEqual(instance.drainEvents(), []);
  instance.state.score = 1234; instance.state.lives = 1; instance.state.level = 4;
  instance.state.upgradeRanks.damage = 3; instance.state.effects.expand = 4;
  instance.restart();
  assert.equal(instance.state.score, 0); assert.equal(instance.state.level, 1);
  assert.equal(instance.state.lives, 3); assert.deepEqual(instance.state.upgradeRanks, {});
  assert.equal(instance.state.paddle.width, 18); assert.equal(instance.state.effects.expand, 0);
  assert.deepEqual(instance.drainEvents(), []);
});

test('paddle clamp, attached tracking and keyboard motion stay within arena', () => {
  const instance = game();
  instance.update(.05, { paddleX: -50 });
  assert.ok(instance.state.paddle.x >= instance.state.paddle.width / 2);
  almost(instance.state.balls[0].x, instance.state.paddle.x);
  const before = instance.state.paddle.x;
  instance.update(.05, { axis: 1 });
  assert.ok(instance.state.paddle.x > before);
  instance.update(.05, { paddleX: 500 });
  assert.ok(instance.state.paddle.x <= 100 - instance.state.paddle.width / 2);
});

test('walls and paddle restitution preserve speed and sufficient vertical component', () => {
  const instance = game();
  instance.state.balls = [ball(500, 1.2, 90, -30, -40)];
  instance.update(.01);
  assert.ok(instance.state.balls[0].vx > 0);
  almost(Math.hypot(instance.state.balls[0].vx, instance.state.balls[0].vy), 50);
  instance.state.balls = [ball(501, 50, 1.2, 15, -40)];
  instance.update(.01);
  assert.ok(instance.state.balls[0].vy > 0);
  instance.state.balls = [ball(502, 57, 126.9, 0, 50)];
  instance.update(.02);
  assert.ok(instance.state.balls[0].vy < 0);
  assert.ok(instance.state.balls[0].vx > 0);
  assert.ok(Math.abs(instance.state.balls[0].vy) >= Math.hypot(instance.state.balls[0].vx, instance.state.balls[0].vy) * .33);
  assert.ok(instance.drainEvents().some(event => event.type === 'paddle-hit'));
});

test('substeps prevent thin-brick tunneling and armor needs repeated hits', () => {
  const instance = game();
  instance.state.bricks = [brick(200, 50, 40, 2, 'armor'), brick(201, 5, 15)];
  instance.state.balls = [ball(500, 50, 44.5, 0, -92)];
  instance.update(.05);
  assert.equal(instance.state.bricks[0].hp, 1);
  assert.ok(instance.state.balls[0].vy > 0);
  frames(instance, .2);
  instance.state.balls[0].x = 50; instance.state.balls[0].y = 44.5;
  instance.state.balls[0].vx = 0; instance.state.balls[0].vy = -92;
  instance.update(.05);
  assert.equal(instance.state.bricks[0].alive, false);
  assert.ok(instance.state.score > 0);
});

test('corner collisions remain finite, separate the ball and preserve speed', () => {
  const instance = game();
  instance.state.bricks = [brick(200, 50, 40, 5, 'armor'), brick(201, 5, 15)];
  instance.state.balls = [ball(500, 44.4, 36.9, 30, 40)];
  instance.update(.01);
  const moving = instance.state.balls[0];
  assert.ok(Number.isFinite(moving.x + moving.y + moving.vx + moving.vy));
  almost(Math.hypot(moving.vx, moving.vy), 50, .0001);
  assert.ok(instance.state.bricks[0].hp < 5);
});

test('all seven pickup abilities activate, bounded multiball and heal cap', () => {
  const instance = game(); instance.launch();
  for (const kind of Object.keys(ITEMS)) pickup(instance, kind);
  assert.equal(instance.state.balls.length, 3);
  assert.ok(instance.state.effects.pierce > 7);
  assert.ok(instance.state.effects.laser > 9);
  assert.ok(instance.state.effects.expand > 9);
  assert.ok(instance.state.effects.slow > 7);
  assert.equal(instance.state.effects.shield, 1);
  assert.equal(instance.state.lives, 4);
  assert.ok(instance.state.paddle.width > 18);
  for (let i = 0; i < 8; i++) { pickup(instance, 'multi'); pickup(instance, 'shield'); pickup(instance, 'heal'); }
  assert.equal(instance.state.balls.length, 6);
  assert.equal(instance.state.effects.shield, 3);
  assert.equal(instance.state.lives, 6);
  assert.equal(instance.drainEvents().filter(event => event.type === 'item').length, 31);
});

test('slow field reduces travel and expanded paddle expires to permanent width', () => {
  const normal = game(), slow = game();
  normal.state.balls = [ball(500, 50, 90, 20, -40)];
  slow.state.balls = [ball(500, 50, 90, 20, -40)]; slow.state.effects.slow = 2;
  normal.update(.05); slow.update(.05);
  assert.ok(90 - slow.state.balls[0].y < 90 - normal.state.balls[0].y);
  slow.state.upgradeRanks.width = 2; pickup(slow, 'expand');
  assert.ok(slow.state.paddle.width > 22);
  slow.state.effects.expand = .01; slow.update(.05);
  almost(slow.state.paddle.width, 22);
});

test('piercing ball damages armor once per passage without reversing', () => {
  const instance = game();
  instance.state.bricks = [brick(200, 50, 40, 5, 'armor'), brick(201, 5, 15)];
  instance.state.balls = [ball(500, 50, 45, 0, -35)];
  instance.state.effects.pierce = 4; instance.state.effects.slow = 4;
  frames(instance, .6);
  assert.equal(instance.state.bricks[0].hp, 4);
  assert.ok(instance.state.balls[0].vy < 0);
});

test('laser emits bounded twin shots with cooldown and cannot reset ball life', () => {
  const instance = game();
  pickup(instance, 'laser');
  instance.state.bricks = [brick(200, 44.24, 116), brick(201, 95, 15)];
  const lives = instance.state.lives;
  frames(instance, .5, { fire: true });
  assert.equal(instance.state.bricks[0].alive, false);
  assert.equal(instance.state.lives, lives);
  assert.equal(instance.state.balls.length, 1);
  const count = instance.drainEvents().filter(event => event.type === 'shot').length;
  assert.ok(count >= 4 && count <= 6);
  frames(instance, 2, { fire: true });
  assert.ok(instance.state.shots.length <= 24);
});

test('shield reflects bottom ball, multiball loses one life only when all balls fall', () => {
  const instance = game();
  instance.state.effects.shield = 1;
  instance.state.balls = [ball(500, 3, 138.9, 0, 45)];
  instance.update(.01);
  assert.ok(instance.state.balls[0].vy < 0);
  assert.equal(instance.state.effects.shield, 0);
  assert.equal(instance.state.lives, 3);
  instance.state.balls = [ball(501, 2, 142, 0, 45), ball(502, 50, 90, 20, -45)];
  instance.update(.01);
  assert.equal(instance.state.lives, 3); assert.equal(instance.state.balls.length, 1);
  instance.state.balls = [ball(503, 2, 142, 0, 45), ball(504, 98, 142, 0, 45)];
  instance.update(.05);
  assert.equal(instance.state.lives, 2);
  assert.equal(instance.state.balls.length, 1); assert.equal(instance.state.balls[0].attached, true);
  assert.equal(instance.drainEvents().filter(event => event.type === 'life-lost').length, 1);
});

test('zero lives ends game once and restart restores all campaign fields', () => {
  const instance = game(); instance.state.lives = 1;
  instance.state.balls = [ball(500, 2, 142, 0, 45)];
  instance.update(.05);
  assert.equal(instance.state.phase, 'gameover');
  assert.equal(instance.state.lives, 0);
  const frozen = JSON.stringify(instance.state);
  frames(instance, 1, { fire: true });
  assert.equal(JSON.stringify(instance.state), frozen);
  assert.equal(instance.drainEvents().filter(event => event.type === 'gameover').length, 1);
  instance.restart(); assert.equal(instance.state.lives, 3); assert.equal(instance.state.phase, 'playing');
});

test('pause freezes all simulation including timers and attached ball; resume continues', () => {
  const instance = game(); instance.launch(); instance.state.effects.laser = 7;
  instance.pause();
  const frozen = JSON.stringify(instance.state);
  frames(instance, 5, { paddleX: 3, fire: true });
  assert.equal(JSON.stringify(instance.state), frozen);
  assert.equal(instance.launch(), false);
  instance.resume(); instance.update(.05);
  assert.ok(instance.state.effects.laser < 7);
});

test('clear offers distinct upgrades, freezes upgrade clock and applies only offered choice', () => {
  const instance = game();
  instance.state.bricks = [brick(200, 50, 40)];
  instance.state.balls = [ball(500, 50, 44, 0, -50)];
  instance.update(.05);
  assert.equal(instance.state.phase, 'upgrade');
  assert.equal(new Set(instance.state.upgradeChoices).size, 3);
  const frozen = JSON.stringify(instance.state); instance.update(.05, { fire: true });
  assert.equal(JSON.stringify(instance.state), frozen);
  assert.equal(instance.applyUpgrade('not-an-upgrade'), false);
  const chosen = instance.state.upgradeChoices[0];
  assert.equal(instance.applyUpgrade(chosen), true);
  assert.equal(instance.state.level, 2); assert.equal(instance.state.upgradeRanks[chosen], 1);
  assert.equal(instance.state.phase, 'playing'); assert.equal(instance.state.balls[0].attached, true);
  assert.equal(instance.applyUpgrade(chosen), false);
});

test('every permanent upgrade has measurable benefit and higher stages evolve', () => {
  for (const id of Object.keys(UPGRADES)) {
    const instance = game(); instance.state.phase = 'upgrade'; instance.state.upgradeChoices = [id];
    assert.equal(instance.applyUpgrade(id), true);
    assert.equal(instance.state.upgradeRanks[id], 1);
    if (id === 'width') assert.equal(instance.state.paddle.width, 20);
    if (id === 'extrahealth') assert.equal(instance.state.lives, 4);
    if (id === 'damage') {
      instance.state.bricks = [brick(200, 50, 40, 2, 'armor'), brick(201, 5, 15)];
      instance.state.balls = [ball(500, 50, 44, 0, -50)]; instance.update(.05);
      assert.equal(instance.state.bricks[0].alive, false);
    }
    if (id === 'speed') { instance.update(.05, { axis: 1 }); almost(instance.state.paddle.x, 55.05); }
  }
  const instance = game();
  instance.state.phase = 'upgrade'; instance.state.upgradeChoices = ['damage']; instance.applyUpgrade('damage');
  assert.ok(instance.state.bricks.some(block => block.type === 'moving'));
  assert.ok(instance.state.bricks.some(block => block.type === 'blast'));
  instance.state.phase = 'upgrade'; instance.state.upgradeChoices = ['width']; instance.applyUpgrade('width');
  const boss = instance.state.bricks.find(block => block.type === 'boss');
  assert.ok(boss && boss.hp >= 20);
  const before = boss.x; instance.update(.05); assert.notEqual(boss.x, before);
  instance.launch(); assert.ok(Math.hypot(instance.state.balls[0].vx, instance.state.balls[0].vy) > 46.5);
});

test('blast chains are iterative, combo scores grow and stage-clear fires once', () => {
  const instance = game();
  instance.state.bricks = [brick(200, 40, 40, 1, 'blast'), brick(201, 51, 40, 1, 'blast'), brick(202, 62, 40, 2, 'armor')];
  instance.state.stageCount = 3; instance.state.stageKills = 0;
  instance.state.balls = [ball(500, 40, 44, 0, -50)];
  instance.update(.05);
  assert.ok(instance.state.bricks.every(block => !block.alive));
  assert.equal(instance.state.stageKills, 3); assert.equal(instance.state.combo, 3);
  const events = instance.drainEvents(), breaks = events.filter(event => event.type === 'brick-break');
  assert.equal(breaks.length, 3); assert.equal(events.filter(event => event.type === 'level-clear').length, 1);
  assert.ok(breaks[1].value > breaks[0].value);
  assert.equal(instance.state.phase, 'upgrade');
});

test('huge or invalid dt cannot jump clock, tunnel or create runaway arrays', () => {
  const instance = game(); instance.launch();
  const before = instance.state.elapsed;
  instance.update(1000);
  almost(instance.state.elapsed - before, .05);
  const frozen = JSON.stringify(instance.state);
  instance.update(NaN); instance.update(-1); instance.update(Infinity);
  assert.equal(JSON.stringify(instance.state), frozen);
  assert.ok(instance.drainEvents().length <= 256);
});

test('long deterministic campaign simulation stays finite and arrays remain bounded', () => {
  const instance = createGame({ random: () => .12 }); instance.start();
  for (let tick = 0; tick < 18000; tick++) {
    if (instance.state.phase === 'upgrade') instance.applyUpgrade(instance.state.upgradeChoices[0]);
    if (instance.state.phase === 'gameover') instance.restart();
    if (instance.state.balls.some(moving => moving.attached)) instance.launch();
    const target = instance.state.balls.find(moving => moving.vy > 0) || instance.state.balls[0];
    instance.update(1 / 60, { paddleX: target?.x ?? 50, fire: true });
    assert.ok(Number.isFinite(instance.state.score + instance.state.elapsed));
    for (const moving of instance.state.balls) assert.ok(Number.isFinite(moving.x + moving.y + moving.vx + moving.vy));
    assert.ok(instance.state.balls.length <= 6); assert.ok(instance.state.drops.length <= 18); assert.ok(instance.state.shots.length <= 24);
    if (tick % 60 === 0) assert.ok(instance.drainEvents().length <= 256);
  }
});

test('permanent item-drop upgrade changes pickup probability at the same random sample', () => {
  const plain = createGame({ random: () => .25 }), lucky = createGame({ random: () => .25 });
  plain.start(); lucky.start(); lucky.state.upgradeRanks.itemdrop = 1;
  for (const instance of [plain, lucky]) {
    instance.state.bricks = [brick(200, 50, 40), brick(201, 5, 15)];
    instance.state.balls = [ball(500, 50, 44, 0, -50)];
    instance.update(.05);
  }
  assert.equal(plain.state.drops.length, 0);
  assert.equal(lucky.state.drops.length, 1);
});

test('boss survives individual hits and retains moving multi-hit health', () => {
  const instance = game();
  for (let next = 0; next < 2; next++) {
    instance.state.phase = 'upgrade'; instance.state.upgradeChoices = ['width']; instance.applyUpgrade('width');
  }
  const boss = instance.state.bricks.find(block => block.type === 'boss'), beforeHp = boss.hp;
  instance.state.balls = [ball(500, 50, 22, 0, -70)];
  instance.update(.05);
  assert.equal(boss.hp, beforeHp - 1);
  assert.equal(boss.alive, true);
  assert.notEqual(boss.x, 50);
  assert.ok(instance.state.balls[0].vy > 0);
});

test('a final laser clear takes priority over simultaneous last-ball loss', () => {
  const instance = game();
  instance.state.bricks = [brick(200, 50, 40)];
  instance.state.shots = [{ id: 600, x: 50, y: 43.5 }];
  instance.state.balls = [ball(500, 2, 142, 0, 45)];
  instance.update(.05);
  assert.equal(instance.state.phase, 'upgrade');
  assert.equal(instance.state.lives, 3);
  assert.equal(instance.drainEvents().filter(event => event.type === 'life-lost').length, 0);
  instance.applyUpgrade(instance.state.upgradeChoices[0]);
  assert.equal(instance.state.balls.length, 1);
  assert.equal(instance.state.balls[0].attached, true);
});
