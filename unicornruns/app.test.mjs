// Actual controller/engine integration; browser/GPU surfaces are adapted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createGame,MAPS,DIFFICULTIES} from './engine.js';
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
    getElementById(id){assert.ok(ids.has(id),`Missing HTML id ${id}`);if(!elements.has(id)){const node=new Element(id.includes('button')?'button':'div',id);node.checked=false;elements.set(id,node);}return elements.get(id);},
    createElement:tag=>new Element(tag),addEventListener(type,fn){const list=documents.get(type)||[];list.push(fn);documents.set(type,list);},dispatch(type,event={}){for(const fn of documents.get(type)||[])fn(event);},querySelectorAll(selector){if(selector==='[data-control]')return controls;return[...elements.values(),...controls].filter(node=>node.classes.has('pressed'));}
  };
  const controls=['left','right','brake','throttle'].map(control=>{const node=new Element('button');node.dataset={control};return node;});
  const window={matchMedia:()=>({matches:false}),addEventListener(type,fn){const list=windows.get(type)||[];list.push(fn);windows.set(type,list);},dispatch(type,event={}){for(const fn of windows.get(type)||[])fn(event);}};
  const factory=container=>{if(fail)throw new Error('WebGL unavailable');const view={disposed:false,resizes:0,state:null,dispose(){this.disposed=true;},resize(){this.resizes++;},render(state){this.state=state;},screenToWorld(x,y){return{x,z:y};}};views.push(view);container.appendChild(new Element('canvas'));return view;};
  const context=vm.createContext({createGame,MAPS,DIFFICULTIES,createRenderer:factory,document,window,performance:{now:()=>now},requestAnimationFrame(){},console});
  vm.runInContext(source+'\nglobalThis.api={engine,dom,frame,returnToMaps,startRace,togglePause,initRenderer,syncUI};',context);
  const stage=document.getElementById('race-surface');stage.requestFullscreen=async()=>{document.fullscreenElement=stage;document.dispatch('fullscreenchange');};document.exitFullscreen=async()=>{document.fullscreenElement=null;document.dispatch('fullscreenchange');};
  return{api:context.api,document,window,elements,controls,views,fail(value){fail=value;},step(ms=50){now+=ms;context.api.frame(now);}};
}
const f=fixture(),state=f.api.engine.state;
assert.equal(state.phase,'select');assert.equal(f.elements.get('map-list').children.length,30);assert.equal(f.elements.get('difficulty-tabs').children.length,3);assert.equal(f.elements.get('map-list').children.filter(button=>!button.hidden).length,10);
for(const [index,difficulty] of DIFFICULTIES.entries()){await f.elements.get('difficulty-tabs').children[index].click();const visible=f.elements.get('map-list').children.filter(button=>!button.hidden);assert.equal(visible.length,10);assert.ok(visible.every(button=>MAPS.find(map=>map.id===button.dataset.map).difficulty===difficulty.id));await visible.at(-1).click();assert.equal(state.mapId,MAPS.filter(map=>map.difficulty===difficulty.id).at(-1).id);}
await f.elements.get('difficulty-tabs').children[1].click();
await f.elements.get('map-list').children.find(button=>button.dataset.map==='cloud').click();assert.equal(state.mapId,'cloud');assert.ok(f.elements.get('play-button').textContent.includes('2바퀴'));
await f.elements.get('play-button').click();assert.equal(state.phase,'countdown');
const start={...state.player};for(let i=0;i<20;i++)f.step();assert.equal(f.elements.get('countdown-value').textContent,'2');assert.deepEqual(state.player,start);assert.equal(state.elapsed,0);
f.window.dispatch('blur');assert.equal(state.phase,'paused');const frozen=state.countdown;for(let i=0;i<30;i++)f.step();assert.equal(state.countdown,frozen);
f.window.dispatch('focus');await f.elements.get('play-button').click();for(let i=0;i<20;i++)f.step();assert.equal(f.elements.get('countdown-value').textContent,'1');for(let i=0;i<20;i++)f.step();assert.equal(state.phase,'racing');assert.equal(state.elapsed,0);
const run=f.controls.find(button=>button.dataset.control==='throttle');await run.emit('pointerdown',{pointerId:1,preventDefault(){}});for(let i=0;i<20;i++)f.step();assert.ok(state.player.progress>0);await run.emit('pointerup',{pointerId:1});
// Keyboard and touch must map right to positive screen-right lateral, left to negative.
f.window.dispatch('keydown',{code:'ArrowRight',target:f.elements.get('canvas-host'),preventDefault(){}});const lateral=state.player.lateral;f.step();assert.ok(state.player.lateral>lateral);f.window.dispatch('keyup',{code:'ArrowRight'});
f.window.dispatch('keydown',{code:'ArrowLeft',target:f.elements.get('canvas-host'),preventDefault(){}});const rightLateral=state.player.lateral;f.step();assert.ok(state.player.lateral<rightLateral);f.window.dispatch('keyup',{code:'ArrowLeft'});
const right=f.controls.find(button=>button.dataset.control==='right'),left=f.controls.find(button=>button.dataset.control==='left');await right.emit('pointerdown',{pointerId:22,preventDefault(){}});const beforeRight=state.player.lateral;f.step();assert.ok(state.player.lateral>beforeRight);await right.emit('pointerup',{pointerId:22});await left.emit('pointerdown',{pointerId:23,preventDefault(){}});const beforeLeft=state.player.lateral;f.step();assert.ok(state.player.lateral<beforeLeft);await left.emit('pointerup',{pointerId:23});
assert.ok(f.elements.get('difficulty-tabs').children.every(button=>button.disabled));
await f.elements.get('pause-button').click();assert.equal(state.phase,'paused');const elapsed=state.elapsed;f.step();assert.equal(state.elapsed,elapsed);await f.elements.get('play-button').click();
f.window.dispatch('keydown',{code:'KeyW',target:f.elements.get('canvas-host'),preventDefault(){}});
for(let i=0;i<12000&&state.phase==='racing';i++)f.step();assert.equal(state.phase,'finished');assert.equal(state.completedLaps,2);assert.ok(f.elements.get('result-detail').textContent.includes('2바퀴'));
f.window.dispatch('blur');for(let i=0;i<80;i++)f.step();assert.equal(state.phase,'finished','finish transition freezes in background');f.window.dispatch('focus');for(let i=0;i<65;i++)f.step();assert.equal(state.phase,'select');assert.equal(state.elapsed,0);assert.equal(state.player.progress,0);assert.equal(state.completedLaps,0);
await f.elements.get('difficulty-tabs').children[2].click();await f.elements.get('map-list').children.find(button=>button.dataset.map==='star').click();assert.equal(state.mapId,'star');await f.elements.get('play-button').click();assert.equal(state.countdown,3);
await f.elements.get('fullscreen-button').click();assert.equal(f.document.fullscreenElement,f.elements.get('race-surface'));await f.elements.get('fullscreen-button').click();assert.equal(f.document.body.style.overflow,'auto');f.document.fullscreenEnabled=false;await f.elements.get('fullscreen-button').click();assert.ok(f.elements.get('race-surface').classes.has('is-fullscreen'));await f.elements.get('fullscreen-button').click();
f.fail(true);await f.elements.get('canvas-host').emit('unicornruns:render-error');assert.equal(state.phase,'paused');const remaining=state.countdown;f.step();assert.equal(state.countdown,remaining);await f.elements.get('play-button').click();assert.equal(state.phase,'paused');f.fail(false);await f.elements.get('play-button').click();assert.equal(state.phase,'countdown');assert.equal(state.countdown,remaining);
await f.elements.get('maps-button').click();assert.equal(state.phase,'select');await f.elements.get('play-button').click();assert.equal(state.countdown,3);assert.equal(state.elapsed,0);for(let i=0;i<65;i++)f.step();assert.equal(state.player.speed,0,'old keyboard/touch input cannot leak into new race');
f.window.dispatch('pagehide');assert.equal(f.views.at(-1).disposed,true);
console.log('PASS Unicorn Runs UI: real HTML IDs, 30 maps/difficulty tabs, keyboard/touch left/right, 3-2-1, pause/background, touch/keyboard earned finish, auto return/reset, fullscreen, WebGL recovery and fresh-race input');
