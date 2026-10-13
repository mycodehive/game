// Run: node BlueMarble/game.test.cjs. Exercise the rule engine without WebGL.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
function engine({ holdTimers = false } = {}) {
  const elements = new Map(), timers = [];
  const document = {
    addEventListener() {},
    getElementById(id) {
      assert.ok(!['end-turn-btn', 'city-end-btn'].includes(id), 'removed controls must not be accessed');
      if (!elements.has(id)) elements.set(id, { value: id === 'player-count' ? '2' : id.startsWith('player-name-') ? `테스터${Number(id.slice(-1)) + 1}` : '', hidden: true, innerHTML: '' });
      return elements.get(id);
    }
  };
  const context = vm.createContext({ document, window: {}, Math: Object.create(Math), setTimeout: fn => { if (holdTimers) timers.push(fn); else fn(); return 1; }, clearTimeout() {}, console });
  vm.runInContext(source + `
    cacheDom();
    render = () => {};
    showToast = () => {};
    clearToasts = () => {};
    renderCityArrivalModal = () => {};
    globalThis.api = {
      initGame, rollDice, movePlayer, resolveTile, buyCurrentCity, buildCurrentCity,
      passCurrentCity, closeCityArrivalModal, checkWinCondition, getCurrentRent,
      getSceneSnapshot, adjustMoney, getCurrentPlayer, updateActionButtons,
      get players() { return players; }, get tiles() { return tiles; },
      get state() { return gameState; }, set deck(cards) { deck = cards; }
    };
  `, context);
  context.api.initGame();
  return { api: context.api, context, elements, timers };
}

test('setup respects names/count and snapshot cannot change rule state', () => {
  const { api, elements } = engine();
  elements.get('player-count').value = '4';
  elements.get('player-name-0').value = '테스터';
  api.initGame();
  assert.equal(api.players.length, 4);
  assert.equal(api.players[0].name, '테스터');
  assert.equal(api.players[0].money, 1500);
  assert.equal(api.state.phase, 'await_roll');
  assert.equal(api.tiles.length, 32);
  const snapshot = api.getSceneSnapshot();
  snapshot.tiles[1].buildings.house = true;
  snapshot.players[0].money = -1;
  assert.equal(api.tiles[1].buildings.house, false);
  assert.equal(api.players[0].money, 1500);
  api.updateActionButtons();
});

test('dice landing waits for purchase and buying automatically advances once', async () => {
  const { api, context, elements } = engine();
  context.Math.random = () => .2; // Two twos -> city 4.
  const result = await api.rollDice();
  assert.equal(result.sum, 4);
  assert.equal(api.players[0].position, 4);
  assert.equal(api.state.isAnimating, false);
  assert.equal(api.state.phase, 'await_buy_decision');
  const city = api.tiles[4], buyer = api.players[0];
  api.buyCurrentCity(buyer);
  assert.equal(city.ownerId, 'P1');
  assert.equal(buyer.money, 1500 - city.price);
  assert.equal(api.getCurrentPlayer().id, 'P2');
  assert.equal(api.state.phase, 'await_roll');
  assert.equal(elements.get('city-arrival-modal').hidden, true);
  api.closeCityArrivalModal(); // A trailing close callback cannot skip the next player.
  api.buyCurrentCity(buyer); // Stale purchase callback cannot charge again.
  assert.equal(api.getCurrentPlayer().id, 'P2');
  assert.equal(buyer.money, 1500 - city.price);
});

test('pass and dismissing purchase dialog both automatically advance', async () => {
  for (const action of ['passCurrentCity', 'closeCityArrivalModal']) {
    const { api } = engine();
    api.players[0].position = 1;
    await api.resolveTile(api.players[0]);
    api[action]();
    assert.equal(api.tiles[1].ownerId, null);
    assert.equal(api.players[0].money, 1500);
    assert.equal(api.getCurrentPlayer().id, 'P2');
    assert.equal(api.state.phase, 'await_roll');
  }
});

test('own city allows multiple construction choices and dialog dismissal advances', async () => {
  const { api } = engine();
  const player = api.players[0], city = api.tiles[1];
  player.position = 1; city.ownerId = player.id;
  await api.resolveTile(player);
  assert.equal(api.state.phase, 'await_build_decision');
  api.buildCurrentCity('house');
  assert.equal(city.buildings.house, true);
  assert.equal(player.money, 1380);
  assert.equal(api.getCurrentRent(city), Math.round(city.rent * 1.5));
  assert.equal(api.getCurrentPlayer().id, 'P1');
  api.buildCurrentCity('house');
  assert.equal(player.money, 1380, 'cannot charge duplicate construction');
  api.buildCurrentCity('building');
  assert.equal(player.money, 1180);
  api.closeCityArrivalModal();
  assert.equal(api.getCurrentPlayer().id, 'P2');
  api.buildCurrentCity('hotel');
  assert.equal(city.buildings.hotel, false, 'stale building action cannot affect prior player');
});

test('last affordable structure and completed own city advance without a close action', async () => {
  const { api } = engine();
  const player = api.players[0], city = api.tiles[1];
  player.position = 1; city.ownerId = player.id; player.money = 120;
  await api.resolveTile(player);
  api.buildCurrentCity('house');
  assert.equal(player.money, 0);
  assert.equal(api.getCurrentPlayer().id, 'P2');
  api.state.currentPlayerIndex = 0;
  city.buildings.building = city.buildings.hotel = true;
  await api.resolveTile(player);
  assert.equal(api.getCurrentPlayer().id, 'P2');
});

test('opponent rent transfers money and immediately advances', async () => {
  const { api } = engine();
  const owner = api.players[0], visitor = api.players[1], city = api.tiles[1];
  city.ownerId = owner.id; city.buildings.house = true;
  api.state.currentPlayerIndex = 1; visitor.position = 1;
  await api.resolveTile(visitor);
  const rent = api.getCurrentRent(city);
  assert.equal(visitor.money, 1500 - rent);
  assert.equal(owner.money, 1500 + rent);
  assert.equal(api.getCurrentPlayer().id, 'P1');
  assert.equal(api.state.phase, 'await_roll');
});

test('passing start pays salary and reverse movement pays none', async () => {
  const { api } = engine();
  const player = api.players[0]; player.position = 31;
  await api.movePlayer(player, 2);
  assert.equal(player.position, 1); assert.equal(player.money, 1700);
  await api.movePlayer(player, -2);
  assert.equal(player.position, 31); assert.equal(player.money, 1700);
});

test('tax and island advance automatically; next round skips island player once', async () => {
  const { api } = engine();
  const [first, second] = api.players;
  first.position = 5;
  await api.resolveTile(first);
  assert.equal(first.money, 1400);
  assert.equal(api.getCurrentPlayer().id, 'P2');
  second.position = 7;
  await api.resolveTile(second);
  assert.equal(second.skipTurns, 1);
  assert.equal(api.getCurrentPlayer().id, 'P1');
  first.position = 0;
  await api.resolveTile(first);
  assert.equal(second.skipTurns, 0);
  assert.equal(api.getCurrentPlayer().id, 'P1', 'island player skips only their next turn');
});

test('tax bankruptcy releases cities and ends game without rolling winner forward', async () => {
  const { api } = engine();
  const player = api.players[0]; player.money = 50; player.position = 5;
  api.tiles[1].ownerId = player.id; api.tiles[1].buildings.hotel = true;
  await api.resolveTile(player);
  assert.equal(player.isBankrupt, true);
  assert.equal(api.tiles[1].ownerId, null);
  assert.equal(api.tiles[1].buildings.hotel, false);
  assert.equal(api.state.winnerId, 'P2');
  assert.equal(api.state.phase, 'game_over');
  assert.equal(await api.rollDice(), null);
});

test('event movement resolves final tax tile and advances exactly once', async () => {
  const { api } = engine();
  api.players[0].position = 2;
  api.deck = [{ text: '세 칸 이동', effect: { type: 'move', value: 3 } }];
  await api.resolveTile(api.players[0]);
  assert.equal(api.players[0].position, 5);
  assert.equal(api.players[0].money, 1400);
  assert.equal(api.getCurrentPlayer().id, 'P2');
  assert.equal(api.state.phase, 'await_roll');
  assert.equal(api.state.logs.filter(line => line.includes('현재 턴: 테스터2')).length, 1);
});

test('event movement into purchasable city waits; nonmovement event advances', async () => {
  const { api } = engine();
  api.players[0].position = 2;
  api.deck = [{ text: '뒤로 한 칸', effect: { type: 'move', value: -1 } }];
  await api.resolveTile(api.players[0]);
  assert.equal(api.players[0].position, 1);
  assert.equal(api.state.phase, 'await_buy_decision');
  assert.equal(api.getCurrentPlayer().id, 'P1');
  api.passCurrentCity();
  api.players[1].position = 2;
  api.deck = [{ text: '은행 납부', effect: { type: 'pay_half_total_rent' } }];
  await api.resolveTile(api.players[1]);
  assert.equal(api.getCurrentPlayer().id, 'P1');
  assert.equal(api.state.phase, 'await_roll');
});

test('moving blocks repeated rolls and restart until asynchronous movement completes', async () => {
  const { api, context, timers } = engine({ holdTimers: true });
  context.Math.random = () => .2;
  const oldPlayers = api.players, firstRoll = api.rollDice();
  assert.equal(api.state.phase, 'moving');
  assert.equal(await api.rollDice(), null);
  api.initGame();
  assert.equal(api.players, oldPlayers);
  for (let step = 0; step < 4; step++) {
    assert.equal(timers.length, 1);
    timers.shift()();
    await Promise.resolve();
  }
  await firstRoll;
  assert.equal(api.players[0].position, 4);
  assert.equal(api.state.phase, 'await_buy_decision');
  assert.equal(api.state.isAnimating, false);
});


test('unaffordable empty city and unaffordable own-city construction advance', async () => {
  for (const owned of [false, true]) {
    const { api } = engine();
    const player = api.players[0]; player.position = 1; player.money = 10;
    if (owned) api.tiles[1].ownerId = player.id;
    await api.resolveTile(player);
    assert.equal(api.getCurrentPlayer().id, 'P2');
    assert.equal(api.state.phase, 'await_roll');
    assert.equal(player.money, 10);
  }
});

test('bankruptcy in three-player game advances to surviving player and play continues', async () => {
  const { api, elements } = engine();
  elements.get('player-count').value = '3'; api.initGame();
  const player = api.players[0]; player.position = 5; player.money = 20;
  await api.resolveTile(player);
  assert.equal(player.isBankrupt, true);
  assert.equal(api.getCurrentPlayer().id, 'P2');
  assert.equal(api.state.phase, 'await_roll');
  assert.equal(api.state.winnerId, null);
  api.players[1].position = 0; await api.resolveTile(api.players[1]);
  api.players[2].position = 0; await api.resolveTile(api.players[2]);
  assert.equal(api.getCurrentPlayer().id, 'P2', 'bankrupt player is skipped in subsequent rounds');
});
