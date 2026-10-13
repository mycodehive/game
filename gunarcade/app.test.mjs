// Actual engine/controller integration; only browser/GPU surfaces use adapters.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createGame,HEROES,WEAPONS} from './engine.js';
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));
const source=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8').replace(/^import .*?;\n/gm,'');
function fixture(){
  const elements=new Map(),windows=new Map(),documents=new Map(),views=[];let now=1000,fail=false;
  class Element{
    constructor(tag='div',id=''){this.tagName=tag.toUpperCase();this.id=id;this.children=[];this.style={};this.dataset={};this.attrs={};this.listeners=new Map();this.disabled=false;this.hidden=false;this.isConnected=true;this.textContent='';this.classes=new Set();this.classList={add:name=>this.classes.add(name),remove:name=>this.classes.delete(name),toggle:(name,value)=>value?this.classes.add(name):this.classes.delete(name)};}
    append(...nodes){nodes.forEach(node=>this.appendChild(node));}appendChild(node){node.parentElement=this;this.children.push(node);}replaceChildren(...nodes){this.children=[];this.append(...nodes);}
    addEventListener(type,fn){const list=this.listeners.get(type)||[];list.push(fn);this.listeners.set(type,list);}async emit(type,event={}){await Promise.all((this.listeners.get(type)||[]).map(fn=>fn(event)));}click(){return this.disabled?Promise.resolve():this.emit('click');}
    setAttribute(name,value){this.attrs[name]=value;}focus(){document.activeElement=this;}setPointerCapture(){}getBoundingClientRect(){return{left:0,top:0,width:800,height:700};}closest(){return['BUTTON','INPUT','A','TEXTAREA','SELECT'].includes(this.tagName)?this:null;}querySelector(tag){return this.children.find(node=>node.tagName===tag.toUpperCase())||null;}
  }
  const document={body:{style:{overflow:'auto'}},hidden:false,fullscreenEnabled:true,fullscreenElement:null,
    getElementById(id){assert.ok(ids.has(id),`Missing HTML id ${id}`);if(!elements.has(id)){const node=new Element(id.includes('button')||id.startsWith('quick-weapon')?'button':'div',id);node.checked=['auto-aim','auto-fire'].includes(id);elements.set(id,node);}return elements.get(id);},
    createElement:tag=>new Element(tag),addEventListener(type,fn){const list=documents.get(type)||[];list.push(fn);documents.set(type,list);},dispatch(type,event={}){for(const fn of documents.get(type)||[])fn(event);},querySelectorAll(selector){if(selector==='[data-move-x]')return pads;if(selector==='[data-slot]')return slots;return[...elements.values(),...pads].filter(node=>node.classes.has('pressed'));}
  };
  const pads=[[-1,0],[1,0],[0,-1],[0,1]].map(([x,z])=>{const node=new Element('button');node.dataset={moveX:String(x),moveZ:String(z)};return node;});
  const slots=[0,1,2].map(index=>{const node=document.getElementById(`quick-weapon-${index+1}`);node.dataset.slot=String(index);node.append(new Element('b'),new Element('span'));return node;});
  const hp=document.getElementById('hp-bar'),hpTrack=new Element(),hpHud=new Element();hpHud.append(hpTrack);hpTrack.append(hp);
  const window={matchMedia:()=>({matches:false}),addEventListener(type,fn){const list=windows.get(type)||[];list.push(fn);windows.set(type,list);},dispatch(type,event={}){for(const fn of windows.get(type)||[])fn(event);}};
  const factory=container=>{if(fail)throw new Error('WebGL unavailable');const view={disposed:false,resizes:0,state:null,dispose(){this.disposed=true;},resize(){this.resizes++;},render(state){this.state=state;},screenToWorld(x,y){return{x,z:y};}};views.push(view);container.appendChild(new Element('canvas'));return view;};
  let seed=42;const seededGame=()=>createGame({random:()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}});
  const context=vm.createContext({createGame:seededGame,HEROES,WEAPONS,createRenderer:factory,document,window,performance:{now:()=>now},requestAnimationFrame(){},console});
  vm.runInContext(source+'\nglobalThis.api={engine,dom,frame,nextStage,startGame,togglePause,initRenderer,syncUI};',context);
  const stage=document.getElementById('arena-wrap');stage.requestFullscreen=async()=>{document.fullscreenElement=stage;document.dispatch('fullscreenchange');};document.exitFullscreen=async()=>{document.fullscreenElement=null;document.dispatch('fullscreenchange');};
  return{api:context.api,document,window,elements,slots,pads,views,fail(value){fail=value;},step(ms=50){now+=ms;context.api.frame(now);}};
}
const f=fixture(),state=f.api.engine.state;
assert.equal(state.phase,'select');assert.equal(f.elements.get('hero-list').children.length,4);
await f.elements.get('hero-list').children.find(button=>button.dataset.hero==='scout').click();assert.equal(state.heroId,'scout');assert.ok(f.elements.get('play-button').textContent.includes(HEROES[0].name));
await f.elements.get('play-button').click();assert.equal(state.phase,'prepare');assert.equal(state.prepRemaining,30);
f.window.dispatch('keydown',{code:'KeyW',target:f.elements.get('canvas-host'),preventDefault(){}});for(let i=0;i<7;i++)f.step();f.window.dispatch('keyup',{code:'KeyW'});assert.ok(state.weapons.length>0);assert.equal(state.enemies.length,0);assert.equal(state.bullets.length,0);
f.window.dispatch('blur');assert.equal(state.phase,'paused');const time=state.prepRemaining;f.step();assert.equal(state.prepRemaining,time);
f.window.dispatch('focus');await f.elements.get('play-button').click();assert.equal(state.phase,'prepare');
await f.pads[1].emit('pointerdown',{pointerId:8,preventDefault(){}});const x=state.player.x;f.step();assert.ok(state.player.x>x);await f.pads[1].emit('pointerup',{pointerId:8});
for(let i=0;i<600&&state.phase==='prepare';i++)f.step();assert.equal(state.phase,'combat');assert.ok(state.enemies.length>0);for(let i=0;i<12;i++)f.step();assert.ok(state.bullets.length>0||state.kills>0);
assert.equal(f.slots[0].disabled,false);const originalButton=f.elements.get('weapon-list').children[0];f.step();assert.equal(f.elements.get('weapon-list').children[0],originalButton,'interactive loadout buttons remain stable across HUD refresh');
await f.slots[0].click();f.step();assert.equal(state.selectedWeapon,0);
f.elements.get('auto-aim').checked=false;await f.elements.get('canvas-host').emit('pointermove',{clientX:15,clientY:-9});f.step();assert.equal(f.elements.get('aim-reticle').hidden,false);
await f.elements.get('pause-button').click();assert.equal(state.phase,'paused');const combatPlayer={...state.player};f.step();assert.deepEqual(state.player,combatPlayer);await f.elements.get('play-button').click();assert.equal(state.phase,'combat');
// Earn the clear through the controller's actual targeting and firing inputs.
f.elements.get('auto-aim').checked=true;
for(let i=0;i<400&&state.phase==='combat';i++)f.step();
assert.equal(state.phase,'cleared');const score=state.score;
f.window.dispatch('blur');for(let i=0;i<80;i++)f.step();assert.equal(state.stage,1,'automatic transition freezes when the window is unfocused');f.window.dispatch('focus');
for(let i=0;i<65;i++)f.step();assert.equal(state.stage,2);assert.equal(state.phase,'prepare');assert.equal(state.weapons.length,0);assert.equal(state.bullets.length,0);assert.equal(state.enemies.length,0);assert.ok(state.prepRemaining>29);assert.equal(state.score,score);
await f.elements.get('fullscreen-button').click();assert.equal(f.document.fullscreenElement,f.elements.get('arena-wrap'));assert.equal(f.document.body.style.overflow,'hidden');await f.elements.get('fullscreen-button').click();assert.equal(f.document.body.style.overflow,'auto');
f.document.fullscreenEnabled=false;await f.elements.get('fullscreen-button').click();assert.ok(f.elements.get('arena-wrap').classes.has('is-fullscreen'));await f.elements.get('fullscreen-button').click();
f.fail(true);await f.elements.get('canvas-host').emit('gunarcade:render-error');assert.equal(state.phase,'paused');const frozen=state.prepRemaining;f.step();assert.equal(state.prepRemaining,frozen);await f.elements.get('play-button').click();assert.equal(state.phase,'paused');
f.fail(false);await f.elements.get('play-button').click();assert.equal(state.phase,'prepare');assert.equal(state.stage,2);assert.equal(state.prepRemaining,frozen);
await f.elements.get('restart-button').click();assert.equal(state.stage,1);assert.equal(state.score,0);assert.equal(state.weapons.length,0);assert.equal(state.heroId,'scout');
f.window.dispatch('pagehide');assert.equal(f.views.at(-1).disposed,true);
console.log('PASS GunArcade UI: actual HTML IDs, roster/stats, contact collection,30s phases, pause/background, touch, firing, stable/quick slots, aim, automatic next-stage reset, fullscreen and WebGL recovery');
