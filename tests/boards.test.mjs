// Real Three.js scene construction and state updates; renderer/DOM are adapters.
// This checks scene integration and geometry, not GPU output or visual layout.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const raw = await readFile(new URL('../minecraft/libs/three.module.js', import.meta.url), 'utf8');
const three = await import(`data:text/javascript;base64,${Buffer.from(raw).toString('base64')}`);
function environment() {
  const elements = new Map(), listeners = new Map(), frames = [], renders = [], observers = [];
  class Element {
    constructor() { this.children = []; this.listeners = new Map(); this.hidden = false; this.style = {}; this.clientWidth = 900; this.clientHeight = 650; }
    appendChild(child) { this.children.push(child); }
    replaceChildren() { this.children = []; }
    setAttribute() {}
    addEventListener(type, callback) { this.listeners.set(type, callback); }
    getContext() { return new Proxy({}, { get: (target, key) => target[key] || (() => {}), set: (target,key,value) => { target[key] = value; return true; } }); }
    getBoundingClientRect() { return {left:0,top:0,width:900,height:650}; }
    setPointerCapture() {}
  }
  const document = { hidden:false, getElementById(id) { if(!elements.has(id)) elements.set(id,new Element()); return elements.get(id); }, createElement() { return new Element(); }, addEventListener() {} };
  class Renderer {
    constructor() { this.domElement = new Element(); }
    setPixelRatio() {} setClearColor() {} setSize() {} dispose() {}
    getContext() { return { isContextLost: () => false }; }
    render(scene,camera) { scene.updateMatrixWorld(); camera.updateMatrixWorld(); renders.push({scene,camera}); }
  }
  const window = { devicePixelRatio:1, matchMedia:() => ({ matches:false }), addEventListener(type,callback) { listeners.set(type,callback); }, dispatchEvent(event) { listeners.get(event.type)?.(event); } };
  const context = vm.createContext({ THREE:{...three,WebGLRenderer:Renderer}, document,window,console,performance,Event:class {constructor(type){this.type=type;}}, ResizeObserver:class {constructor(callback){this.callback=callback;observers.push(callback);} observe(){this.callback();}}, requestAnimationFrame:callback=>frames.push(callback) });
  return { context,window,document,elements,listeners,frames,renders,observers,frame() { const callback = frames.shift(); assert.ok(callback); callback(performance.now()); } };
}
const ladder = environment();
ladder.window.getLadderSnapshot = () => ({positions:[1,1],jumps:{8:26,98:78},currentPlayer:0,ended:false});
const ladderCode = await readFile(new URL('../ladder/scene.js',import.meta.url),'utf8');
vm.runInContext(ladderCode.replace(/^import .*?;\n/,''),ladder.context);
ladder.frame();
assert.equal(ladder.renders.length,1);
assert.equal(ladder.elements.get('stage3d').hidden,false);
assert.equal(ladder.elements.get('boardWrapper').hidden,true);
const initialLadderDistance=ladder.renders[0].camera.position.length();
ladder.elements.get('stage3d').clientWidth=360;ladder.elements.get('stage3d').clientHeight=780;
ladder.observers.forEach(resize=>resize());ladder.frame();
assert.ok(ladder.renders.at(-1).camera.position.length()>initialLadderDistance,'portrait fullscreen fits the whole ladder');
const pawns = ladder.renders[0].scene.children.filter(object=>object.isGroup);
assert.equal(pawns.length,2);
const previous = pawns[0].position.clone();
ladder.window.dispatchEvent({type:'ladder-state',detail:{positions:[26,1],currentPlayer:1,ended:false}});
ladder.frame();
assert.ok(previous.distanceTo(pawns[0].position)>0);
ladder.elements.get('viewToggle').listeners.get('click')();
assert.equal(ladder.elements.get('boardWrapper').hidden,false);
const marble = environment();
const data = {tiles:Array.from({length:32},(_,id)=>({id,name:`도시${id}`,type:'CITY',price:100,buildings:{house:false,building:false,hotel:false},ownerId:null,color:'#37dbea'})),players:[{id:'P1',position:0,color:'#ff7777',isBankrupt:false},{id:'P2',position:0,color:'#7799ff',isBankrupt:false}],currentPlayerId:'P1',phase:'await_roll',isAnimating:false,lastRoll:null};
marble.window.BlueMarbleGame = {getSnapshot:()=>data,inspectTile() {}};
const marbleCode = await readFile(new URL('../BlueMarble/scene.js',import.meta.url),'utf8');
await vm.runInContext(`(async()=>{${marbleCode.replace("const THREE = await import('../minecraft/libs/three.module.js');",'')}})()`,marble.context);
marble.frame();
assert.equal(marble.renders.length,1);
assert.equal(marble.elements.get('scene-wrap').hidden,false);
const initialMarbleDistance=marble.renders[0].camera.position.length();
marble.elements.get('scene-3d').clientWidth=360;marble.elements.get('scene-3d').clientHeight=780;
marble.window.dispatchEvent({type:'resize'});marble.frame();
assert.ok(marble.renders.at(-1).camera.position.length()>initialMarbleDistance,'portrait fullscreen fits the whole marble board');
const scene = marble.renders[0].scene;
const tiles = scene.children.filter(object=>object.userData.developments);
assert.equal(tiles.length,32);
data.tiles[4].ownerId='P1'; data.tiles[4].buildings.house=true; data.players[0].position=4;
marble.window.dispatchEvent({type:'bluemarble:state',detail:data});
marble.frame();
assert.ok(tiles[4].userData.developments.children.length>=3,'ownership and house produce 3D geometry');
marble.elements.get('view-2d').listeners.get('click')();
assert.equal(marble.elements.get('board').hidden,false);
console.log('PASS 3D board scene initialization, pawn movement, ownership/buildings and 2D switches');
