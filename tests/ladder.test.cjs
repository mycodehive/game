const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
class Element {
  constructor() { this.children = []; this.style = {}; this.dataset = {}; this.classList = { toggle() {} }; this.disabled = false; this.clientWidth = 600; this.clientHeight = 600; }
  set innerHTML(value) { this.children = []; }
  get innerHTML() { return ''; }
  get lastElementChild() { return this.children.at(-1); }
  appendChild(child) { this.children.push(child); }
  prepend(child) { this.children.unshift(child); }
  setAttribute() {}
  addEventListener() {}
  getBoundingClientRect() { return {width:600,height:600}; }
}
const elements = new Map();
const document = {
  getElementById(id) { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); },
  createElement() { return new Element(); }, createElementNS() { return new Element(); }, addEventListener() {}
};
const math = Object.create(Math); math.random = () => 0;
const context = vm.createContext({ document, window: { addEventListener() {}, dispatchEvent() {} }, CustomEvent: class {}, Math: math, setTimeout: callback => callback() });
const html = fs.readFileSync(new URL('../ladder/index.html', `file://${__filename}`), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
vm.runInContext(script, context);
async function run() {
  const evaluate = code => vm.runInContext(code, context);
  evaluate('game.positions = [7, 1]');
  await evaluate('handleTurn()');
  assert.equal(evaluate('game.positions[0]'), 26, 'landing on 8 climbs to 26');
  assert.equal(evaluate('game.currentPlayer'), 1, 'turn alternates');
  evaluate('resetGame(); game.positions = [99, 1]'); math.random = () => .999;
  await evaluate('handleTurn()');
  assert.equal(evaluate('game.positions[0]'), 99, 'overshooting stays in place');
  assert.equal(evaluate('game.ended'), false);
  evaluate('resetGame(); game.positions = [98, 1]'); math.random = () => .2;
  await evaluate('handleTurn()');
  assert.equal(evaluate('game.ended'), true);
  assert.equal(elements.get('turnText').textContent, '플레이어 1 승리!', 'winner survives UI refresh');
  assert.equal(elements.get('rollBtn').disabled, true);
  evaluate('resetGame()');
  assert.equal(evaluate('game.positions[0]'), 1);
  evaluate('game.isAnimating = true; game.positions[0] = 42; resetGame()');
  assert.equal(evaluate('game.positions[0]'), 42, 'reset cannot corrupt in-flight move');
  assert.equal(evaluate('new Set(Array.from({length:100},(_,i)=>{const p=getGridPosition(i+1);return `${p.row},${p.col}`})).size'), 100);
  console.log('PASS ladder: climb, overshoot, turn, win, reset lock, grid mapping');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
