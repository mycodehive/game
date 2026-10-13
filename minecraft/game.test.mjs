// Exercise the actual scene and game logic with real bundled Three.js math and
// geometry. DOM/renderer adapters avoid requiring a GPU in a headless Node job.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const threeSource = await readFile(new URL('./libs/three.module.js', import.meta.url), 'utf8');
const three = await import(`data:text/javascript;base64,${Buffer.from(threeSource).toString('base64')}`);
const source = await readFile(new URL('./app.js', import.meta.url), 'utf8');
class Element {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.clientWidth = 1000;
    this.clientHeight = 700;
    this.listeners = new Map();
    this.classList = { toggle() {}, add() {}, remove() {} };
  }
  set innerHTML(value) { this.markup = value; this.children = []; }
  get innerHTML() { return this.markup; }
  appendChild(child) { this.children.push(child); }
  addEventListener(name, handler) { this.listeners.set(name, handler); }
  setAttribute() {}
  focus() {}
  querySelector() { return hint; }
}
const hint = new Element();
const elements = new Map();
const touchButtons = ['arrowup','arrowleft','arrowdown','arrowright'].map(key => {
  const button = new Element();
  button.dataset.key = key;
  return button;
});
const document = {
  getElementById(id) { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); },
  createElement() { return new Element(); },
  querySelectorAll(selector) { return selector === '[data-key]' ? touchButtons : []; },
  addEventListener() {}
};
class Renderer {
  constructor() { this.shadowMap = {}; this.domElement = new Element(); }
  setSize() {}
  setPixelRatio() {}
  render() {}
}
const context = vm.createContext({
  THREE: { ...three, WebGLRenderer: Renderer }, document,
  window: { addEventListener() {}, devicePixelRatio: 1, location: { reload() {} } },
  requestAnimationFrame() {}, setTimeout, performance, console
});
vm.runInContext(source.replace(/^import .*?;\n/, '') + `\nglobalThis.quest = {
  game, player, crystals, entities, dom, attackState, keys,
  startGame, togglePause, resumeGame, updateMission, performAttack,
  damagePlayer, updateSelectedCharacter, resolveObstacles, animate
};`, context);
const q = context.quest;
assert.equal(q.game.phase, 'ready');
assert.equal(q.crystals.length, 8);
assert.equal(q.entities.filter(e => e.type === 'sentinel').length, 3);
assert.equal(q.entities.filter(e => e.canRoam).length, 6);
q.updateSelectedCharacter('farmer');
assert.equal(q.player.maxHealth, 240);
q.startGame();
assert.equal(q.game.phase, 'playing');
assert.equal(q.dom.overlay.hidden, true);
assert.equal(q.player.health, 240);
q.keys.add('w');
q.togglePause();
assert.equal(q.game.phase, 'paused');
assert.equal(q.keys.size, 0);
const pausedTime = q.game.remaining;
q.animate();
assert.equal(q.game.remaining, pausedTime);
q.resumeGame();
assert.equal(q.game.phase, 'playing');
q.player.health = 100;
q.player.group.position.set(q.crystals[0].mesh.position.x, 0, q.crystals[0].mesh.position.z);
q.updateMission();
assert.equal(q.game.collected, 1);
assert.equal(q.player.health, 112);
assert.equal(q.crystals[0].mesh.visible, false);
q.startGame();
assert.equal(q.game.collected, 0);
assert.ok(q.crystals.every(c => c.mesh.visible && !c.collected));
q.crystals.forEach(c => {
  q.player.group.position.set(c.mesh.position.x, 0, c.mesh.position.z);
  q.updateMission();
});
assert.equal(q.game.collected, 8);
assert.equal(q.game.phase, 'playing', 'all gems alone do not complete mission');
q.player.group.position.set(0,0,5);
q.updateMission();
assert.equal(q.game.phase, 'won');
assert.equal(q.dom.overlay.hidden, false);
q.startGame();
q.game.remaining = 0;
q.updateMission();
assert.equal(q.game.phase, 'lost');
q.startGame();
const enemy = q.entities.find(e => e.type === 'sentinel');
q.player.health = 1;
q.damagePlayer(24, enemy);
assert.equal(q.game.phase, 'lost');
assert.equal(q.player.health, 0);
q.startGame();
q.player.group.position.set(10,0,10);
q.player.yaw = 0;
enemy.mesh.position.set(10,0,11);
const animal = q.entities.find(e => e.canRoam);
animal.mesh.position.set(10,0,11);
const animalHealth = animal.health;
for (let i=0;i<3;i++) { q.attackState.cooldown = 0; enemy.mesh.position.set(10,0,11); q.performAttack(); }
assert.equal(enemy.alive, false, 'pulse can defeat shadow enemy');
assert.equal(animal.health, animalHealth, 'village animals are never attacked');
q.startGame();
assert.equal(enemy.alive, true);
assert.equal(enemy.health, enemy.maxHealth);
assert.equal(enemy.mesh.visible, true);
assert.equal(q.player.health, q.player.maxHealth);
const position = new three.Vector3(0,0,3);
q.resolveObstacles(position, new three.Vector3(0,0,4));
assert.equal(position.z, 3.3, 'house remains solid');
console.log('Voxel Quest: initialization, classes, pause, collection, portal win, timeout, health loss, combat, animal safety, reset and collision checks passed.');
