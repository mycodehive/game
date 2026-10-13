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
  damagePlayer, updateSelectedCharacter, resolveObstacles, animate, advanceMission,
  worldBounds, isAccessiblePosition, scene,
  get campaignRoot() { return campaignRoot; },
  get batches() { return batches; }
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
// A campaign advances only from a completed mission; retries retain its map.
function completeMission() {
  q.crystals.forEach(crystal => {
    if (crystal.collected) return;
    q.player.group.position.set(crystal.mesh.position.x,0,crystal.mesh.position.z);
    q.updateMission();
  });
  assert.equal(q.game.collected,q.game.crystalTarget);
  q.player.group.position.set(0,0,5);
  q.updateMission();
  assert.equal(q.game.phase,'won');
}
function expectStage(level,side,gems,enemies,seconds) {
  assert.equal(q.game.stage,level);
  assert.equal(q.game.side,side);
  assert.equal(q.game.crystalTarget,gems);
  assert.equal(q.game.sentinelTarget,enemies);
  assert.equal(q.game.duration,seconds);
  assert.equal(q.crystals.length,gems);
  assert.equal(q.entities.filter(e=>e.type==='sentinel').length,enemies);
  assert.equal(q.worldBounds.minX,-side/2);
  assert.equal(q.worldBounds.maxX,side/2);
  assert.equal(q.worldBounds.minZ,-side/2);
  assert.equal(q.worldBounds.maxZ,side/2);
  assert.equal(q.campaignRoot.userData.ground.geometry.parameters.width,side*3);
  assert.equal(q.batches.gems.count,gems);
  assert.equal(q.batches.bodies.count,enemies);
  assert.equal(q.dom.missionGoal.textContent,`빛나는 조각 ${gems}개를 수집`);
  q.crystals.forEach(crystal=> {
    const {x,z}=crystal.mesh.position;
    assert.ok(x>q.worldBounds.minX && x<q.worldBounds.maxX);
    assert.ok(z>q.worldBounds.minZ && z<q.worldBounds.maxZ);
    assert.ok(q.isAccessiblePosition(x,z),'every shard has an accessible position');
  });
}
expectStage(1,40,8,3,120);
q.advanceMission();
assert.equal(q.game.stage,1,'unfinished missions cannot advance');
completeMission();
const oldRoot=q.campaignRoot;
const ownedGeometries=new Set();
const ownedMaterials=new Set();
let disposedGeometries=0;
let disposedMaterials=0;
oldRoot.traverse(node=> {
  if(node.geometry) ownedGeometries.add(node.geometry);
  if(node.material) (Array.isArray(node.material)?node.material:[node.material]).forEach(m=>ownedMaterials.add(m));
});
ownedGeometries.forEach(g=>g.addEventListener('dispose',()=>disposedGeometries++));
ownedMaterials.forEach(m=>m.addEventListener('dispose',()=>disposedMaterials++));
const rootSceneCount=q.scene.children.length;
q.dom.start.listeners.get('click')();
expectStage(2,60,12,5,150);
assert.equal(oldRoot.parent,null,'previous map removed from scene');
assert.equal(q.scene.children.length,rootSceneCount,'stage advance does not leak scene roots');
assert.equal(disposedGeometries,ownedGeometries.size,'all old geometry disposed once');
assert.equal(disposedMaterials,ownedMaterials.size,'all old materials disposed once');
assert.ok(q.entities.filter(e=>e.type==='sentinel').every(e=>e.maxHealth===108));
const stage2Root=q.campaignRoot;
q.player.group.position.set(q.crystals[0].mesh.position.x,0,q.crystals[0].mesh.position.z);
q.updateMission();
assert.ok(q.game.collected>0);
q.startGame();
expectStage(2,60,12,5,150);
assert.equal(q.campaignRoot,stage2Root,'retry restores rather than advances/regenerates current map');
assert.equal(q.game.collected,0);
assert.ok(q.crystals.every(c=>c.mesh.visible&&!c.collected));
q.game.remaining=0;
q.updateMission();
assert.equal(q.game.phase,'lost');
q.advanceMission();
assert.equal(q.game.stage,2,'failed mission cannot unlock a new stage');
q.dom.start.listeners.get('click')();
expectStage(2,60,12,5,150);
assert.equal(q.game.phase,'playing');
completeMission();
q.dom.start.listeners.get('click')();
expectStage(3,90,18,8,188);
assert.equal(q.game.phase,'playing');
assert.equal(q.game.remaining,188);
assert.ok(q.entities.filter(e=>e.type==='sentinel').every(e=>e.maxHealth===116));
q.togglePause();
const stage3Time=q.game.remaining;
q.animate();
assert.equal(q.game.remaining,stage3Time);
q.resumeGame();
completeMission();
assert.ok(q.dom.overlayDescription.textContent.includes('27개'));
assert.ok(q.dom.overlayDescription.textContent.includes('12마리'));
console.log('Voxel Quest: base gameplay plus stage 1→2→3 scaling, rounded counts, expanded bounds/terrain, accessibility, instance counts, win-only advance, same-stage retries, stronger enemies, stage pause and GPU-resource disposal checks passed.');
