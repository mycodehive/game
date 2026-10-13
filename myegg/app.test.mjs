// Actual engine/controller integration; only browser/GPU surfaces use adapters.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createGame,EGG_TYPES,DEMON_TYPES,TRAILS,LOCATIONS} from './engine.js';
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));
const source=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8').replace(/^import .*?;\n/gm,'');
function fixture(){
  const elements=new Map(),windows=new Map(),documents=new Map(),views=[];let now=1000,fail=false,nextHit=null;
  class Element{
    constructor(tag='div',id=''){this.tagName=tag.toUpperCase();this.id=id;this.children=[];this.style={};this.dataset={};this.attrs={};this.listeners=new Map();this.disabled=false;this.hidden=false;this.isConnected=true;this.textContent='';this.classes=new Set();this.classList={add:name=>this.classes.add(name),remove:name=>this.classes.delete(name),toggle:(name,value)=>value?this.classes.add(name):this.classes.delete(name)};}
    append(...nodes){nodes.forEach(node=>this.appendChild(node));}appendChild(node){node.parentElement=this;this.children.push(node);}replaceChildren(...nodes){this.children=[];this.append(...nodes);}
    addEventListener(type,fn){const list=this.listeners.get(type)||[];list.push(fn);this.listeners.set(type,list);}async emit(type,event={}){await Promise.all((this.listeners.get(type)||[]).map(fn=>fn(event)));}click(){return this.disabled?Promise.resolve():this.emit('click');}
    setAttribute(name,value){this.attrs[name]=value;}focus(){document.activeElement=this;}setPointerCapture(){}getBoundingClientRect(){return{left:0,top:0,width:800,height:700};}closest(){return['BUTTON','INPUT','A','TEXTAREA','SELECT'].includes(this.tagName)?this:null;}querySelector(tag){for(const node of this.children){if(node.tagName===tag.toUpperCase())return node;const nested=node.querySelector(tag);if(nested)return nested;}return null;}
  }
  const document={body:{style:{overflow:'auto'}},hidden:false,fullscreenEnabled:true,fullscreenElement:null,
    getElementById(id){assert.ok(ids.has(id),`Missing HTML id ${id}`);if(!elements.has(id)){const node=new Element(id.includes('button')?'button':'div',id);node.checked=false;elements.set(id,node);}return elements.get(id);},
    createElement:tag=>new Element(tag),addEventListener(type,fn){const list=documents.get(type)||[];list.push(fn);documents.set(type,list);},dispatch(type,event={}){for(const fn of documents.get(type)||[])fn(event);},querySelectorAll(selector){if(selector==='[data-move-x]')return controls;return[...elements.values(),...controls].filter(node=>node.classes.has('pressed'));}
  };
  const controls=[[-1,0],[1,0],[0,-1],[0,1]].map(([x,z])=>{const node=new Element('button');node.dataset={moveX:String(x),moveZ:String(z)};return node;});
  const window={matchMedia:()=>({matches:false}),addEventListener(type,fn){const list=windows.get(type)||[];list.push(fn);windows.set(type,list);},dispatch(type,event={}){for(const fn of windows.get(type)||[])fn(event);}};
  const factory=container=>{if(fail)throw new Error('WebGL unavailable');const view={disposed:false,resizes:0,state:null,dispose(){this.disposed=true;},resize(){this.resizes++;},render(state){this.state=state;},hitTest(){return nextHit;}};views.push(view);container.appendChild(new Element('canvas'));return view;};
  const injectedGame=()=>createGame({random:()=>.6,now:()=>now});
  const context=vm.createContext({createGame:injectedGame,EGG_TYPES,DEMON_TYPES,TRAILS,LOCATIONS,createRenderer:factory,document,window,performance:{now:()=>now},requestAnimationFrame(){},console});
  vm.runInContext(source+'\nglobalThis.api={engine,dom,frame,startGame,togglePause,handleTarget,initRenderer,syncUI};',context);
  const stage=document.getElementById('game-surface');stage.requestFullscreen=async()=>{document.fullscreenElement=stage;document.dispatch('fullscreenchange');};document.exitFullscreen=async()=>{document.fullscreenElement=null;document.dispatch('fullscreenchange');};
  return{api:context.api,document,window,elements,controls,views,fail(value){fail=value;},hit(value){nextHit=value;},clock(){return now;},step(ms=50){now+=ms;context.api.frame(now);}};
}
const f=fixture(),state=f.api.engine.state,host=f.elements.get('canvas-host');
assert.equal(state.phase,'intro');assert.equal(f.elements.get('nest-list').children.length,6);assert.equal(f.elements.get('trail-list').children.length,3);assert.ok(f.elements.get('pet-list').children.length);
await f.elements.get('play-button').click();assert.equal(state.phase,'playing');
function key(code,down){f.window.dispatch(down?'keydown':'keyup',{code,target:host,preventDefault(){}});}
function walkTo(target){for(let i=0;i<1000;i++){const dx=target.x-state.player.x,dz=target.z-state.player.z;if(Math.hypot(dx,dz)<.8){['KeyW','KeyA','KeyS','KeyD'].forEach(code=>key(code,false));return;}key('KeyD',dx>.4);key('KeyA',dx<-.4);key('KeyS',dz>.4);key('KeyW',dz<-.4);f.step();}throw Error('Controller route did not arrive');}
const egg=state.wildEggs.find(egg=>egg.kind==='ember');walkTo(egg);await f.elements.get('interact-button').click();assert.ok(state.carrying);assert.equal(state.carrying.secured,false);
walkTo(state.nests[0]);assert.ok(state.carrying?.secured);f.hit({type:'nest',id:state.nests[0].id});await host.emit('pointerdown',{clientX:20,clientY:20,pointerId:1});await host.emit('pointerup',{clientX:20,clientY:20,pointerId:1});assert.equal(state.carrying,null);assert.equal(state.nests[0].egg.duration,60);
const readyAt=state.nests[0].egg.readyAt;await f.elements.get('pause-button').click();assert.equal(state.phase,'paused');const position={...state.player};f.step(readyAt-f.clock()-1);assert.equal(state.nests[0].egg.ready,false);assert.deepEqual(state.player,position);f.step(1);assert.equal(state.nests[0].egg.ready,true,'real wall clock continues while paused');await f.elements.get('play-button').click();
await f.elements.get('nest-list').children[0].click();assert.equal(state.nests[0].egg,null);assert.equal(state.demons.length,1);assert.equal(state.demons[0].species,'leaf');const demon=state.demons[0];f.step();assert.equal(f.elements.get('pet-list').children.length,1);const petButton=f.elements.get('pet-list').children[0].querySelector('div').querySelector('button');assert.equal(petButton.disabled,true);
walkTo(LOCATIONS.sales);await f.elements.get('interact-button').click();assert.equal(f.elements.get('market-drawer').hidden,false);const sell=f.elements.get('market-items').children[0].querySelector('div').querySelector('button');await sell.click();assert.equal(state.money,DEMON_TYPES[demon.species].sellPrice);assert.equal(state.demons.length,0);await sell.click();assert.equal(state.money,85,'duplicate stale UI action cannot sell twice');await f.elements.get('market-close').click();
walkTo(LOCATIONS.shop);await f.elements.get('fullscreen-button').click();await f.elements.get('interact-button').click();const buy=f.elements.get('market-items').children[0].querySelector('div').querySelector('button');await buy.click();assert.equal(state.trailId,'spark');assert.equal(state.money,5);assert.equal(state.player.speed,10);await f.elements.get('fullscreen-button').click();await f.elements.get('market-close').click();
await f.controls[1].emit('pointerdown',{pointerId:2,preventDefault(){}});const x=state.player.x;f.step();assert.ok(state.player.x>x);await f.controls[1].emit('pointerup',{pointerId:2});f.window.dispatch('blur');assert.equal(state.phase,'paused');f.window.dispatch('focus');await f.elements.get('play-button').click();
f.fail(true);await host.emit('myegg:render-error');assert.equal(state.phase,'paused');const money=state.money;await f.elements.get('play-button').click();assert.equal(state.phase,'paused');f.fail(false);await f.elements.get('play-button').click();assert.equal(state.phase,'playing');assert.equal(state.money,money);
await f.elements.get('restart-button').click();assert.equal(state.money,0);assert.equal(state.trailId,'none');assert.equal(state.demons.length,0);assert.equal(state.carrying,null);assert.ok(state.nests.every(nest=>!nest.egg));f.document.fullscreenEnabled=false;await f.elements.get('fullscreen-button').click();assert.ok(f.elements.get('game-surface').classes.has('is-fullscreen'));await f.elements.get('fullscreen-button').click();assert.equal(f.document.body.style.overflow,'auto');f.window.dispatch('pagehide');assert.equal(f.views.at(-1).disposed,true);
console.log('PASS MyEgg UI: actual HTML IDs and earned steal/protect/deposit, real-clock pause incubation, click hatch, fixed-price sale, trail purchase, fullscreen market, touch, background, reset and WebGL recovery');
