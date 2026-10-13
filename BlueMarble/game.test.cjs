// Run: node BlueMarble/game.test.cjs. Test the existing rule engine without WebGL.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
function engine() {
  const elements = new Map();
  const document = {
    addEventListener() {},
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { value: id === 'player-count' ? '2' : id.startsWith('player-name-') ? `테스터${Number(id.slice(-1)) + 1}` : '', hidden: true, innerHTML: '' });
      return elements.get(id);
    }
  };
  const context = vm.createContext({ document, window: {}, Math: Object.create(Math), setTimeout: fn => { fn(); return 1; }, clearTimeout() {}, console });
  vm.runInContext(source + `
    cacheDom();
    render = () => {};
    showToast = () => {};
    clearToasts = () => {};
    renderCityArrivalModal = () => {};
    globalThis.api = {
      initGame, rollDice, movePlayer, resolveTile, buyCurrentCity, buildCurrentCity,
      passCurrentCity, endTurn, checkWinCondition, getCurrentRent, getSceneSnapshot,
      adjustMoney, getCurrentPlayer,
      get players() { return players; }, get tiles() { return tiles; }, get state() { return gameState; }
    };
  `, context);
  context.api.initGame();
  return { api: context.api, context, elements };
}

test('setup respects selected names/count and snapshot copies mutable rule data', () => {
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
});

test('dice movement, buying, building, rent and turn progression preserve rules', async () => {
  const { api, context } = engine();
  context.Math.random = () => .2; // Two twos -> city at index 4.
  const result = await api.rollDice();
  assert.equal(result.sum, 4);
  assert.equal(api.players[0].position, 4);
  assert.equal(api.state.isAnimating, false);
  assert.equal(api.state.phase, 'await_buy_decision');
  const city = api.tiles[4], buyer = api.players[0], before = buyer.money;
  api.buyCurrentCity(buyer);
  assert.equal(city.ownerId, 'P1');
  assert.equal(buyer.money, before - city.price);
  assert.equal(api.state.phase, 'await_end_turn');
  api.buildCurrentCity('house');
  assert.equal(city.buildings.house, true);
  assert.equal(buyer.money, before - city.price - 120);
  assert.equal(api.getCurrentRent(city), Math.round(city.rent * 1.5));
  const afterBuild = buyer.money;
  api.buildCurrentCity('house');
  assert.equal(buyer.money, afterBuild, 'already built structures cannot be charged twice');
  api.endTurn();
  assert.equal(api.state.currentPlayerIndex, 1);
  assert.equal(api.state.phase, 'await_roll');
  const visitor = api.players[1];
  visitor.position = 4;
  await api.resolveTile(visitor);
  assert.equal(visitor.money, 1500 - api.getCurrentRent(city));
  assert.equal(buyer.money, afterBuild + api.getCurrentRent(city));
  assert.equal(api.state.phase, 'await_end_turn');
});

test('passing keeps city in bank, next player begins with a fresh roll', async () => {
  const { api } = engine();
  api.players[0].position = 1;
  await api.resolveTile(api.players[0]);
  api.passCurrentCity();
  assert.equal(api.tiles[1].ownerId, null);
  assert.equal(api.players[0].money, 1500);
  api.endTurn();
  assert.equal(api.getCurrentPlayer().id, 'P2');
  assert.equal(api.state.lastRoll, null);
});

test('passing start pays salary once and reverse movement pays none', async () => {
  const { api } = engine();
  const player = api.players[0];
  player.position = 31;
  await api.movePlayer(player, 2);
  assert.equal(player.position, 1);
  assert.equal(player.money, 1700);
  await api.movePlayer(player, -2);
  assert.equal(player.position, 31);
  assert.equal(player.money, 1700);
});

test('tax, island skip and bankruptcy release ownership and determine winner', async () => {
  const { api } = engine();
  const player = api.players[0];
  player.position = 5;
  await api.resolveTile(player);
  assert.equal(player.money, 1400);
  player.position = 7;
  await api.resolveTile(player);
  assert.equal(player.skipTurns, 1);
  api.endTurn(); // P2
  api.state.phase = 'await_end_turn';
  api.endTurn(); // P1 skips, P2 again.
  assert.equal(api.getCurrentPlayer().id, 'P2');
  assert.equal(player.skipTurns, 0);
  api.tiles[1].ownerId = player.id;
  api.tiles[1].buildings.hotel = true;
  api.adjustMoney(player, -1500, 'test loss');
  assert.equal(player.isBankrupt, true);
  assert.equal(api.tiles[1].ownerId, null);
  assert.equal(api.tiles[1].buildings.hotel, false);
  assert.equal(api.checkWinCondition(), true);
  assert.equal(api.state.winnerId, 'P2');
  assert.equal(api.state.phase, 'game_over');
});

test('restart is blocked while a pawn is moving', () => {
  const { api } = engine();
  api.state.isAnimating = true;
  const oldPlayers = api.players;
  api.initGame();
  assert.equal(api.players, oldPlayers);
  assert.equal(api.state.isAnimating, true);
});
