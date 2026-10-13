// Fullscreen API/fallback, synchronized controls, resize and focus restoration.
// Adapters model browser events; real browser rendering is validated separately.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../assets/fullscreen.js'), 'utf8');
function fixture({ native = false, reject = false, blue = false } = {}) {
  const elements = new Map(), handlers = new Map(), observers = [], classes = new Set();
  let resizeCount = 0, requestCount = 0;
  const document = {
    fullscreenEnabled: native, fullscreenElement: null,
    body: { style: { overflow: 'auto' } },
    getElementById(id) { if (!elements.has(id)) elements.set(id, new Element(id)); return elements.get(id); },
    addEventListener(type, handler, capture) { const entries = handlers.get(type) || []; entries.push({ handler, capture: Boolean(capture) }); handlers.set(type, entries); },
    dispatch(type, event = {}) { for (const {handler} of [...(handlers.get(type) || [])].sort((a,b) => Number(b.capture)-Number(a.capture))) handler(event); }
  };
  class Element {
    constructor(id) { this.id = id; this.hidden = false; this.disabled = false; this.textContent = ''; this.attrs = {}; this.listeners = {}; this.isConnected = true; this.clicks = 0; this.classList = { toggle(name, flag) { flag ? classes.add(name) : classes.delete(name); } }; }
    setAttribute(key, value) { this.attrs[key] = value; }
    addEventListener(type, handler) { this.listeners[type] = handler; }
    click() { if (this.disabled) return; this.clicks++; return this.listeners.click?.(); }
    focus() { document.activeElement = this; }
    getClientRects() { return this.hidden ? [] : [{}]; }
  }
  const root = document.getElementById('board-play-surface');
  root.querySelector = () => root.modalOpen ? {} : null;
  root.querySelectorAll = () => [...elements.values()].filter(element => element.id.startsWith('fullscreen-') && !element.disabled);
  root.contains = element => element?.id.startsWith('fullscreen-');
  if (native) root.requestFullscreen = async () => {
    requestCount++;
    if (reject) throw new Error('Browser policy refuses native fullscreen');
    document.fullscreenElement = root; document.dispatch('fullscreenchange');
  };
  document.exitFullscreen = async () => { document.fullscreenElement = null; document.dispatch('fullscreenchange'); };
  const trigger = document.getElementById('board-fullscreen-btn');
  trigger.focus();
  const pairs = [['fullscreen-roll-btn', blue ? 'roll-btn' : 'rollBtn']];
  if (blue) pairs.push(['fullscreen-buy-btn', 'buy-btn'], ['fullscreen-pass-btn','pass-btn'], ['fullscreen-start-btn','start-btn']);
  const infoId = blue ? 'turn-info' : 'turnText';
  document.getElementById(infoId).textContent = '플레이어 1 차례';
  if (blue) document.getElementById('start-btn').textContent = '게임 시작 →';
  const context = vm.createContext({ document, window: { dispatchEvent() {resizeCount++;}, addEventListener(type,fn) {handlers.set(type,[{handler:fn,capture:false}]);} }, Event: class {}, MutationObserver: class {constructor(callback) {observers.push(callback);} observe() {} } });
  vm.runInContext(source.replace('export function','function') + '\nglobalThis.mount=setupBoardFullscreen;',context);
  const api = context.mount({ actions:pairs, turnId:infoId, gameEvent:blue?'bluemarble:state':'ladder-state', startId:blue?'start-btn':undefined });
  return { api, document, elements, trigger, root, pairs, classes, sync() {observers.forEach(callback=>callback());}, resize:()=>resizeCount, requests:()=>requestCount };
}
async function run() {
  for (const blue of [false,true]) {
    const f = fixture({native:true,blue});
    await f.trigger.click();
    assert.equal(f.api.active,true);
    assert.equal(f.document.fullscreenElement,f.root);
    assert.equal(f.elements.get('board-fullscreen-actions').hidden,false);
    assert.equal(f.trigger.attrs['aria-pressed'],'true');
    assert.equal(f.document.body.style.overflow,'hidden');
    assert.ok(f.resize()>0);
    for (const [proxyId,sourceId] of f.pairs) {
      const proxy=f.elements.get(proxyId), original=f.elements.get(sourceId);
      original.disabled=true; f.sync(); assert.equal(proxy.disabled,true); proxy.click(); assert.equal(original.clicks,0);
      original.disabled=false; f.sync(); proxy.click(); assert.equal(original.clicks,1);
    }
    if (blue) {f.elements.get('start-btn').textContent='새 게임 시작';f.sync();assert.equal(f.elements.get('fullscreen-start-btn').hidden,true);}
    await f.elements.get('fullscreen-exit-btn').click();
    assert.equal(f.api.active,false);
    assert.equal(f.document.body.style.overflow,'auto');
    assert.equal(f.document.activeElement,f.trigger);
    await f.api.enter(); f.document.fullscreenElement=null; f.document.dispatch('fullscreenchange');
    assert.equal(f.api.active,false,'browser Esc restores normal view');
  }
  for (const reject of [false,true]) {
    const f=fixture({native:reject,reject,blue:true});
    await f.api.enter();assert.equal(f.api.active,true);assert.equal(f.document.fullscreenElement,null);
    f.root.modalOpen=true;
    f.document.dispatch('keydown',{key:'Escape',preventDefault(){}});
    assert.equal(f.api.active,true,'closing a city choice does not also exit fallback');
    f.root.modalOpen=false;
    const buttons=f.root.querySelectorAll();buttons.at(-1).focus();let prevented=false;
    f.document.dispatch('keydown',{key:'Tab',shiftKey:false,preventDefault(){prevented=true;}});
    assert.equal(prevented,true);assert.equal(f.document.activeElement,buttons[0]);
    f.document.dispatch('keydown',{key:'Escape',preventDefault(){}});
    assert.equal(f.api.active,false);assert.equal(f.document.body.style.overflow,'auto');
    if(reject) assert.equal(f.requests(),1);
  }
  console.log('PASS both board fullscreen: native, browser exit, fallback/rejection, proxy actions, disabled states, start visibility, resize, Escape and focus');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
