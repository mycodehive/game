// Controller integration uses the real shared engine with DOM/render adapters.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createGame, ITEMS, UPGRADES } from './engine.js';
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const knownIds=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));
const source=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8').replace(/^import .*?;\n/gm,'').replace("await import('./render3d.js')","await Promise.resolve({create3DRenderer})");
function fixture({ blockedStorage=false }={}) {
  const nodes=new Map(),windowEvents=new Map(),documentEvents=new Map(),records=new Map(),frames=[],renderers=[];
  let now=1000,fail3D=false;
  class Element {
    constructor(tag='div',id=''){this.tagName=tag.toUpperCase();this.id=id;this.children=[];this.style={};this.attrs={};this.disabled=false;this.hidden=false;this.listeners=new Map();this.textContent='';this.isConnected=true;this.classes=new Set();this.classList={add:name=>this.classes.add(name),remove:name=>this.classes.delete(name),toggle:(name,value)=>value?this.classes.add(name):this.classes.delete(name)};}
    addEventListener(type,handler){const listeners=this.listeners.get(type)||[];listeners.push(handler);this.listeners.set(type,listeners);}
    emit(type,event={}){return Promise.all((this.listeners.get(type)||[]).map(handler=>handler(event)));}
    click(){if(!this.disabled)return this.emit('click');}
    setAttribute(name,value){this.attrs[name]=value;}
    append(...nodes){this.children.push(...nodes);}
    appendChild(node){this.children.push(node);}
    replaceChildren(...nodes){this.children=[...nodes];}
    focus(){document.activeElement=this;}
    setPointerCapture(){}
    closest(){return ['BUTTON','A','INPUT','SELECT','TEXTAREA'].includes(this.tagName)?this:null;}
    querySelector(selector){return this.children.find(child=>child.tagName===selector.toUpperCase())||null;}
  }
  const document={hidden:false,body:{style:{overflow:'auto'}},fullscreenEnabled:true,fullscreenElement:null,
    getElementById(id){assert.ok(knownIds.has(id),`Controller references missing HTML ID ${id}`);if(!nodes.has(id))nodes.set(id,new Element('div',id));return nodes.get(id);},
    createElement(tag){return new Element(tag);},addEventListener(type,handler){const list=documentEvents.get(type)||[];list.push(handler);documentEvents.set(type,list);},
    dispatch(type,event={}){for(const fn of documentEvents.get(type)||[])fn(event);}
  };
  const window={matchMedia:()=>({matches:false}),addEventListener(type,handler){const list=windowEvents.get(type)||[];list.push(handler);windowEvents.set(type,list);},dispatch(type,event={}){for(const fn of windowEvents.get(type)||[])fn(event);}};
  const factory=mode=>container=>{
    if(mode==='3d'&&fail3D)throw new Error('WebGL unavailable');
    const renderer={canvas:new Element('canvas'),mode,disposed:false,resizes:0,lastState:null,render(state){this.lastState=state;},resize(){this.resizes++;},screenToWorld(x,y){return{x,y};},dispose(){this.disposed=true;}};container.appendChild(renderer.canvas);renderers.push(renderer);return renderer;
  };
  const context=vm.createContext({createGame,ITEMS,UPGRADES,document,window,performance:{now:()=>now},create2DRenderer:factory('2d'),create3DRenderer:factory('3d'),requestAnimationFrame:fn=>frames.push(fn),localStorage:{getItem(key){if(blockedStorage)throw new Error('private');return records.get(key)||null;},setItem(key,value){if(blockedStorage)throw new Error('private');records.set(key,value);}},console});
  vm.runInContext(source+'\nglobalThis.ui={engine,dom,switchView,frame,togglePause,startRound,launch};',context);
  const stage=document.getElementById('arena-wrap');
  stage.requestFullscreen=async()=>{document.fullscreenElement=stage;document.dispatch('fullscreenchange');};
  document.exitFullscreen=async()=>{document.fullscreenElement=null;document.dispatch('fullscreenchange');};
  return {ui:context.ui,nodes,document,window,records,renderers,fail3D(value){fail3D=value;},step(ms=50){now+=ms;context.ui.frame(now);},now:()=>now};
}
const f=fixture();
assert.equal(f.ui.engine.state.phase,'ready');
assert.equal(f.nodes.get('game-overlay').hidden,false);
await f.nodes.get('play-button').click();
assert.equal(f.ui.engine.state.phase,'playing');
assert.ok(f.ui.engine.state.balls.every(ball=>!ball.attached));
f.window.dispatch('keydown',{code:'ArrowRight',target:f.nodes.get('canvas-host'),preventDefault(){}});f.step();
assert.ok(f.ui.engine.state.paddle.x>50);
f.window.dispatch('keyup',{code:'ArrowRight'});
await f.nodes.get('canvas-host').emit('pointermove',{clientX:32,clientY:130});f.step();
assert.equal(f.ui.engine.state.paddle.x,32);
f.ui.engine.state.score=1234;
const state=f.ui.engine.state,score=state.score,level=state.level;
await f.ui.switchView('3d');f.step();
assert.equal(f.renderers.at(-1).mode,'3d');assert.equal(f.renderers.at(-1).lastState,state);assert.equal(state.score,score);assert.equal(state.level,level);
assert.equal(f.renderers[0].disposed,true);
f.window.dispatch('blur');assert.equal(state.phase,'paused');const elapsed=state.elapsed;f.step();assert.equal(state.elapsed,elapsed);
await f.nodes.get('play-button').click();assert.equal(state.phase,'playing');
f.document.hidden=true;f.document.dispatch('visibilitychange');assert.equal(state.phase,'paused');f.document.hidden=false;
f.ui.togglePause();assert.equal(state.phase,'playing');
state.bricks.forEach(brick=>brick.alive=false);f.step();assert.equal(state.phase,'upgrade');
assert.equal(f.nodes.get('upgrade-choices').children.length,state.upgradeChoices.length);
await f.nodes.get('upgrade-choices').children[0].click();assert.equal(state.phase,'playing');assert.equal(state.level,2);assert.ok(state.balls[0].attached);
assert.equal(f.nodes.get('game-overlay').hidden,true);
await f.nodes.get('fire-button').click();assert.equal(state.balls[0].attached,false);
f.ui.engine.state.effects.laser=5;await f.nodes.get('fire-button').emit('pointerdown',{preventDefault(){},pointerId:1});f.step();assert.ok(state.shots.length>0);
await f.nodes.get('fire-button').emit('pointerup');
await f.nodes.get('canvas-host').emit('breakout:render-error');assert.equal(f.renderers.at(-1).mode,'2d');assert.equal(state.level,2);
f.fail3D(true);await f.ui.switchView('3d');assert.equal(f.renderers.at(-1).mode,'2d');assert.equal(state.level,2);assert.equal(f.nodes.get('view-2d').attrs['aria-pressed'],'true');
await f.nodes.get('fullscreen-button').click();assert.equal(f.document.fullscreenElement,f.nodes.get('arena-wrap'));assert.equal(f.document.body.style.overflow,'hidden');
await f.nodes.get('fullscreen-button').click();assert.equal(f.document.fullscreenElement,null);assert.equal(f.document.body.style.overflow,'auto');
f.document.fullscreenEnabled=false;await f.nodes.get('fullscreen-button').click();assert.ok(f.nodes.get('arena-wrap').classes.has('is-fullscreen'));await f.nodes.get('fullscreen-button').click();assert.equal(f.document.body.style.overflow,'auto');
await f.nodes.get('restart-button').click();assert.equal(state.level,1);assert.equal(state.score,0);assert.equal(Object.keys(state.upgradeRanks).length,0);
assert.ok(Number(f.records.get('playroom-neon-breaker-best'))>=1234);
f.window.dispatch('pagehide');assert.equal(f.renderers.at(-1).disposed,true);
const privateMode=fixture({blockedStorage:true});privateMode.ui.startRound();privateMode.step();assert.equal(privateMode.ui.engine.state.phase,'playing');
console.log('PASS breakout controller: actual HTML IDs, start/keyboard/pointer/fire, 2D↔3D state preservation, pause/background, upgrade flow, renderer fallback, fullscreen, restart, best score and private storage');
