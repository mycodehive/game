// Actual engine/controller integration; browser/GPU surfaces are adapted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createGame,INGREDIENTS} from './engine.js';
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
    createElement:tag=>new Element(tag),addEventListener(type,fn){const list=documents.get(type)||[];list.push(fn);documents.set(type,list);},dispatch(type,event={}){for(const fn of documents.get(type)||[])fn(event);},querySelectorAll(selector){return[...elements.values(),...controls].filter(node=>node.classes.has('pressed'));}
  };
  const controls=[];const timer=new Element();timer.append(document.getElementById('time-value'));
  const window={matchMedia:()=>({matches:false}),addEventListener(type,fn){const list=windows.get(type)||[];list.push(fn);windows.set(type,list);},dispatch(type,event={}){for(const fn of windows.get(type)||[])fn(event);}};
  const factory=container=>{if(fail)throw new Error('WebGL unavailable');const view={disposed:false,resizes:0,state:null,dispose(){this.disposed=true;},resize(){this.resizes++;},render(state){this.state=state;},screenToWorld(x,y){return{x,z:y};}};views.push(view);container.appendChild(new Element('canvas'));return view;};
  const context=vm.createContext({createGame:()=>createGame({random:()=>.2}),INGREDIENTS,createRenderer:factory,document,window,performance:{now:()=>now},requestAnimationFrame(){},console});
  vm.runInContext(source+'\nglobalThis.api={engine,dom,frame,startGame,togglePause,act,initRenderer,syncUI};',context);
  const stage=document.getElementById('play-surface');stage.requestFullscreen=async()=>{document.fullscreenElement=stage;document.dispatch('fullscreenchange');};document.exitFullscreen=async()=>{document.fullscreenElement=null;document.dispatch('fullscreenchange');};
  return{api:context.api,document,window,elements,controls,views,fail(value){fail=value;},step(ms=50){now+=ms;context.api.frame(now);}};
}
const f=fixture(),state=f.api.engine.state,host=f.elements.get('canvas-host');
const buttons=f.elements.get('ingredient-list').children,quick=f.elements.get('fullscreen-ingredients').children;
assert.equal(state.phase,'intro');assert.equal(buttons.length,10);assert.equal(quick.length,10);assert.ok(buttons.every(button=>button.disabled));
await f.elements.get('play-button').click();assert.equal(state.phase,'playing');assert.equal(state.target.length,3);assert.equal(f.elements.get('target-list').children.length,3);
const choose=async id=>buttons.find(button=>button.dataset.ingredient===id).click();
await choose('bottom_bun');await choose('cheese');await choose('top_bun');assert.deepEqual(state.stack,['bottom_bun','cheese','top_bun']);await f.elements.get('submit-button').click();assert.equal(state.phase,'playing');assert.equal(state.score,0);assert.equal(state.remaining,43);assert.ok(f.elements.get('feedback').textContent.includes('조금 달라요'));
await f.elements.get('undo-button').click();await f.elements.get('undo-button').click();await choose('patty');await choose('top_bun');await f.elements.get('submit-button').click();assert.equal(state.phase,'cleared');assert.equal(state.score,515);assert.equal(f.elements.get('game-overlay').hidden,false);
const previous=[...state.target];await f.elements.get('play-button').click();assert.equal(state.stage,2);assert.equal(state.remaining,43);assert.notDeepEqual(state.target,previous);assert.equal(state.stack.length,0);
await f.elements.get('fullscreen-button').click();assert.equal(f.document.fullscreenElement,f.elements.get('play-surface'));for(const id of state.target)await quick.find(button=>button.dataset.ingredient===id).click();assert.equal(f.elements.get('fullscreen-time').textContent,'43초');await f.elements.get('submit-button').click();assert.equal(state.phase,'cleared');await f.elements.get('play-button').click();assert.equal(state.stage,3);assert.equal(state.target.length,5);await f.elements.get('fullscreen-button').click();assert.equal(f.document.body.style.overflow,'auto');
f.window.dispatch('keydown',{code:'Digit1',target:host,preventDefault(){}});assert.equal(state.stack[0],'bottom_bun');f.window.dispatch('keydown',{code:'KeyZ',target:host,preventDefault(){}});assert.equal(state.stack.length,0);
await choose('cheese');await f.elements.get('clear-button').click();assert.equal(state.stack.length,0);
f.window.dispatch('blur');assert.equal(state.phase,'paused');const remaining=state.remaining;for(let i=0;i<20;i++)f.step();assert.equal(state.remaining,remaining);f.window.dispatch('focus');await f.elements.get('play-button').click();assert.equal(state.phase,'playing');
const score=state.score,recipe=[...state.target];for(let i=0;i<1000&&state.phase==='playing';i++)f.step();assert.equal(state.phase,'gameover');assert.equal(state.score,score);await f.elements.get('play-button').click();assert.equal(state.phase,'playing');assert.deepEqual(state.target,recipe);assert.equal(state.remaining,state.timeLimit);
await choose('bottom_bun');f.fail(true);await host.emit('burgerbuddies:render-error');assert.equal(state.phase,'paused');const pausedStack=[...state.stack];await f.elements.get('play-button').click();assert.equal(state.phase,'paused');f.fail(false);await f.elements.get('play-button').click();assert.equal(state.phase,'playing');assert.deepEqual(state.stack,pausedStack);assert.equal(state.score,score);
await f.elements.get('restart-button').click();assert.equal(state.stage,1);assert.equal(state.score,0);assert.equal(state.stack.length,0);f.document.fullscreenEnabled=false;await f.elements.get('fullscreen-button').click();assert.ok(f.elements.get('play-surface').classes.has('is-fullscreen'));await f.elements.get('fullscreen-button').click();f.window.dispatch('pagehide');assert.equal(f.views.at(-1).disposed,true);
console.log('PASS Burger Buddies UI: actual HTML IDs, ordered build/wrong feedback/undo/score, random next-stage escalation, fullscreen ingredients/time, keyboard, pause/background, same-order retry, WebGL recovery and restart');
