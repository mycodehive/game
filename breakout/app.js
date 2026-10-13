import { createGame, ITEMS, UPGRADES } from './engine.js';
import { create2DRenderer } from './render2d.js';

const $ = id => document.getElementById(id);
const dom = {
  host:$('canvas-host'), stage:$('arena-wrap'), overlay:$('game-overlay'), title:$('overlay-title'),
  description:$('overlay-description'), eyebrow:$('overlay-eyebrow'), hint:$('overlay-hint'),
  play:$('play-button'), choices:$('upgrade-choices'), pause:$('pause-button'), fire:$('fire-button'),
  view2d:$('view-2d'), view3d:$('view-3d'), sound:$('sound-button'), motion:$('reduce-effects'),
  mode:$('mode-status'), score:$('score-value'), lives:$('lives-value'), level:$('stage-value'), best:$('best-score'),
  combo:$('combo-banner'), comboValue:$('combo-value'), toast:$('pickup-toast'), launch:$('launch-prompt'),
  progress:$('board-progress'), active:$('active-effects'), activeCount:$('active-count'), build:$('build-list')
};
const engine = createGame();
const keys = new Set();
const itemGlyphs = {multi:'M',pierce:'P',laser:'L',expand:'W',shield:'S',slow:'T',heal:'+'};
const mediaMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
dom.motion.checked = mediaMotion.matches;
let renderer = null, mode = '2d', switching = false, renderer3DFactory;
let pointerX = null, fireHeld = false, fireUntil = 0, toastUntil = 0;
let lastTime = performance.now(), lastHud = 0, previousPhase = null;
let fallbackFullscreen = false, fullscreenActive = false, savedOverflow = '', savedFocus;
let storedBest = 0, sessionBest = 0;
const buffPeaks = {};
try {
  const stored = Number(localStorage.getItem('playroom-neon-breaker-best'));
  if (Number.isFinite(stored) && stored > 0) storedBest = stored;
} catch { /* The game remains playable without persistent storage. */ }
sessionBest = storedBest;

const audio = {
  enabled:true, context:null, lastNote:0,
  unlock() {
    if (!this.enabled) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    try { this.context ||= new AudioContext(); this.context.resume().catch(() => {}); } catch { /* Sound is optional. */ }
  },
  play(event) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    if (now-this.lastNote<0.035 && event.type!=='level-clear' && event.type!=='life-lost') return;
    const tones = { 'brick-hit':[340,.05], 'brick-break':[570+Math.min(event.combo||0,20)*25,.08], 'paddle-hit':[210,.07], item:[920,.2], 'life-lost':[100,.25], shot:[1300,.04], 'level-clear':[1100,.4], upgrade:[700,.22], launch:[380,.1] };
    const tone = tones[event.type];
    if (!tone) return;
    this.lastNote=now;
    const oscillator=this.context.createOscillator(), gain=this.context.createGain();
    oscillator.type=event.type==='shot'?'triangle':'sine';
    oscillator.frequency.setValueAtTime(tone[0],now);
    oscillator.frequency.exponentialRampToValueAtTime(event.type==='life-lost'?45:tone[0]*1.3,now+tone[1]);
    gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.075,now+.008);gain.gain.exponentialRampToValueAtTime(.0001,now+tone[1]);
    oscillator.connect(gain);gain.connect(this.context.destination);oscillator.start(now);oscillator.stop(now+tone[1]+.01);
    oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
  }
};

function clearInput() {
  keys.clear(); fireHeld=false; fireUntil=0; pointerX=null;
  dom.fire.classList.remove('pressed');
}
function startRound() {
  clearInput(); Object.keys(buffPeaks).forEach(key=>delete buffPeaks[key]);
  engine.restart(); engine.launch(); audio.unlock(); syncUI(true); dom.host.focus({preventScroll:true});
}
function launch() {
  if (engine.state.phase==='ready' || engine.state.phase==='gameover') return startRound();
  if (engine.state.phase==='playing') { engine.launch(); audio.unlock(); }
}
function togglePause() {
  if (engine.state.phase==='playing') { engine.pause(); clearInput(); }
  else if (engine.state.phase==='paused') { engine.resume(); clearInput(); audio.unlock(); dom.host.focus({preventScroll:true}); }
  syncUI(true);
}
async function switchView(nextMode) {
  if (switching) return;
  switching=true; dom.view2d.disabled=true;dom.view3d.disabled=true;
  clearInput();
  try {
    if (nextMode==='3d') renderer3DFactory ||= (await import('./render3d.js')).create3DRenderer;
    renderer?.dispose(); renderer=null; dom.host.replaceChildren();
    renderer=nextMode==='3d'?renderer3DFactory(dom.host,{reducedMotion:dom.motion.checked}):create2DRenderer(dom.host,{reducedMotion:dom.motion.checked});
    mode=nextMode;
    dom.mode.textContent=nextMode==='3d'?'3D · VOLUMETRIC PLAY':'2D · NEON ENGINE';
  } catch (error) {
    renderer?.dispose();renderer=null;dom.host.replaceChildren();
    try { renderer=create2DRenderer(dom.host,{reducedMotion:dom.motion.checked});mode='2d';dom.mode.textContent='3D를 사용할 수 없어 2D로 플레이합니다.'; }
    catch { dom.host.textContent='게임 화면을 시작할 수 없습니다. 다른 브라우저에서 다시 시도해 주세요.';dom.mode.textContent='화면 초기화 실패';engine.pause(); }
  } finally {
    switching=false;dom.view2d.disabled=false;dom.view3d.disabled=false;
    dom.view2d.setAttribute('aria-pressed',String(mode==='2d'));dom.view3d.setAttribute('aria-pressed',String(mode==='3d'));
    renderer?.resize();lastTime=performance.now();syncUI(true);
  }
}

function saveBest() {
  if (sessionBest<=storedBest) return;
  storedBest=sessionBest;
  try { localStorage.setItem('playroom-neon-breaker-best',String(storedBest)); } catch { /* Optional best-score storage. */ }
}
function syncOverlay() {
  const state=engine.state, phase=state.phase;
  if (phase===previousPhase) return;
  previousPhase=phase; saveBest();
  dom.overlay.hidden=phase==='playing';dom.choices.hidden=phase!=='upgrade';dom.play.hidden=phase==='upgrade';
  dom.pause.disabled=!['playing','paused'].includes(phase);dom.pause.textContent=phase==='paused'?'▶ 계속':'Ⅱ 정지';
  if (phase==='ready') {
    dom.eyebrow.textContent='READY TO EVOLVE?';dom.title.innerHTML='벽돌을 넘어,<br><span>플레이를 진화시키세요.</span>';
    dom.description.innerHTML='빛나는 아이템을 잡고 강해지세요.<br>스테이지를 클리어할 때마다 나만의 빌드를 선택합니다.';
    dom.play.textContent='플레이 시작 →';dom.hint.textContent='마우스·터치로 패들 이동 / Space 발사 / Esc 정지';
  } else if (phase==='paused') {
    dom.eyebrow.textContent='TAKE A BREATH';dom.title.textContent='잠깐 쉬어 가세요.';dom.description.textContent='공과 아이템, 점수의 시간이 멈췄습니다.';dom.play.textContent='계속 플레이 →';dom.hint.textContent='Esc로도 계속할 수 있습니다.';
  } else if (phase==='upgrade') {
    dom.eyebrow.textContent='EVOLUTION READY';dom.title.textContent=`스테이지 ${state.level} 클리어!`;
    dom.description.textContent='다음 스테이지를 위한 강화를 선택하세요. 공격·패들·드롭 강화는 이번 게임 내내 유지되며, 생명 보충은 즉시 회복합니다.';
    dom.hint.textContent='업그레이드 선택 후 클릭 / Space로 다음 공을 발사하세요.';
    dom.choices.replaceChildren();
    state.upgradeChoices.forEach((id,index)=>{
      const upgrade=UPGRADES[id];if(!upgrade)return;
      const button=document.createElement('button');button.type='button';button.className='upgrade-card';
      const tag=document.createElement('span');tag.textContent=`EVOLVE 0${index+1}`;
      const title=document.createElement('strong');title.textContent=upgrade.label;
      const detail=document.createElement('small');detail.textContent=upgrade.description;
      button.append(tag,title,detail);
      button.addEventListener('click',()=>{if(engine.state.phase!=='upgrade')return;engine.applyUpgrade(id);clearInput();audio.unlock();syncUI(true);dom.host.focus({preventScroll:true});});
      dom.choices.appendChild(button);
    });
  } else if (phase==='gameover') {
    dom.eyebrow.textContent='ONE MORE RUN';dom.title.textContent='다시, 더 강하게.';
    dom.description.textContent=`스테이지 ${state.level} · ${state.score.toLocaleString('ko-KR')}점. 다른 강화 조합으로 더 먼 곳까지 도전해 보세요.`;
    dom.play.textContent='새 게임 시작 →';dom.hint.textContent=`내 최고 기록 ${sessionBest.toLocaleString('ko-KR')}점`;
  }
  if (phase!=='playing') (phase==='upgrade'?dom.choices.querySelector('button'):dom.play)?.focus({preventScroll:true});
}
function syncUI(force=false) {
  const state=engine.state;
  sessionBest=Math.max(sessionBest,state.score);
  syncOverlay();
  const now=performance.now();if(!force && now-lastHud<100)return;lastHud=now;
  dom.score.textContent=state.score.toLocaleString('ko-KR');dom.best.textContent=sessionBest.toLocaleString('ko-KR');
  dom.level.textContent=String(state.level).padStart(2,'0');
  dom.lives.textContent='♥ '.repeat(Math.min(state.lives,8)).trim()+(state.lives>8?` +${state.lives-8}`:'');
  dom.progress.textContent=state.phase==='ready'?'SYSTEM READY':`${state.bricks.filter(brick=>brick.alive).length} BRICKS LEFT · ${state.balls.length} BALL${state.balls.length===1?'':'S'}`;
  dom.combo.hidden=state.combo<2 || state.phase!=='playing';dom.comboValue.textContent=String(state.combo);
  dom.launch.hidden=state.phase!=='playing' || !state.balls.some(ball=>ball.attached);
  dom.fire.disabled=state.phase!=='playing';
  $('mission-title').textContent=state.level%3===0?`보스 게이트 · STAGE ${state.level}`:`네온 균열 · STAGE ${state.level}`;
  $('mission-description').textContent=state.level%3===0?'움직이는 코어를 집중 공격하세요. 콤보와 아이템을 함께 사용하면 보스를 빠르게 무너뜨릴 수 있습니다.':'아이템을 패들로 잡고 콤보를 유지하세요. 남은 벽돌을 모두 깨면 다음 영구 강화가 열립니다.';
  dom.active.replaceChildren();
  let active=0;
  for(const kind of ['multi','expand','pierce','laser','slow','shield']) {
    const remaining=kind==='multi'?(state.balls.length>1?state.balls.length:0):state.effects[kind];
    if(!remaining || remaining<=0){delete buffPeaks[kind];continue;}
    active++;buffPeaks[kind]=Math.max(buffPeaks[kind]||remaining,remaining);
    const row=document.createElement('div');row.className='buff-row';
    const label=document.createElement('strong');label.textContent=ITEMS[kind]?.label||kind;
    const value=document.createElement('span');value.textContent=kind==='multi'?`${remaining}개 공`:kind==='shield'?`${remaining}회 보호`:`${Math.ceil(remaining)}초`;
    row.append(label,value);
    if(!['shield','multi'].includes(kind)){const bar=document.createElement('div');bar.className='buff-bar';const fill=document.createElement('i');fill.style.width=`${Math.max(0,Math.min(100,remaining/buffPeaks[kind]*100))}%`;bar.appendChild(fill);row.appendChild(bar);}
    dom.active.appendChild(row);
  }
  if(!active){const p=document.createElement('p');p.className='muted';p.textContent='떨어지는 아이템을 패들로 받으세요.';dom.active.appendChild(p);}
  dom.activeCount.textContent=`${active} ACTIVE`;
  dom.build.replaceChildren();
  const ranks=Object.entries(state.upgradeRanks).filter(([,rank])=>rank>0);
  ranks.forEach(([id,rank])=>{const row=document.createElement('div');row.className='build-row';const label=document.createElement('span');label.textContent=UPGRADES[id]?.label||id;const value=document.createElement('strong');value.textContent=`Lv.${rank}`;row.append(label,value);dom.build.appendChild(row);});
  if(!ranks.length){const p=document.createElement('p');p.className='muted';p.textContent='클리어 후 강화 능력이 쌓입니다.';dom.build.appendChild(p);}
}
function initGuide() {
  Object.entries(ITEMS).forEach(([kind,item])=>{
    const row=document.createElement('div');row.className='item-guide-row';
    const icon=document.createElement('span');icon.className='item-icon';icon.style.color=item.color;icon.textContent=itemGlyphs[kind]||'?';
    const copy=document.createElement('div');const title=document.createElement('strong');title.textContent=item.label;const detail=document.createElement('small');detail.textContent=item.description;copy.append(title,detail);row.append(icon,copy);$('item-guide-list').appendChild(row);
  });
}
function pointer(event) {
  const point=renderer?.screenToWorld(event.clientX,event.clientY);
  if(point && Number.isFinite(point.x)) pointerX=point.x;
}
dom.host.addEventListener('pointermove',pointer);
dom.host.addEventListener('pointerdown',event=>{
  event.preventDefault();dom.host.setPointerCapture(event.pointerId);pointer(event);launch();dom.host.focus({preventScroll:true});
});
dom.fire.addEventListener('pointerdown',event=>{event.preventDefault();fireHeld=true;dom.fire.setPointerCapture(event.pointerId);dom.fire.classList.add('pressed');launch();});
const releaseFire=()=>{fireHeld=false;dom.fire.classList.remove('pressed');};
['pointerup','pointercancel','lostpointercapture'].forEach(type=>dom.fire.addEventListener(type,releaseFire));
window.addEventListener('pointerup',releaseFire);
dom.fire.addEventListener('click',()=>{fireUntil=performance.now()+160;launch();});
dom.play.addEventListener('click',()=>engine.state.phase==='paused'?togglePause():startRound());
dom.pause.addEventListener('click',togglePause);
$('restart-button').addEventListener('click',startRound);
dom.view2d.addEventListener('click',()=>switchView('2d'));dom.view3d.addEventListener('click',()=>switchView('3d'));
dom.motion.addEventListener('change',()=>switchView(mode));
dom.sound.addEventListener('click',()=>{audio.enabled=!audio.enabled;dom.sound.setAttribute('aria-pressed',String(audio.enabled));dom.sound.textContent=audio.enabled?'♫ 소리':'♫ 음소거';if(audio.enabled)audio.unlock();else audio.context?.suspend().catch(()=>{});});
dom.host.addEventListener('breakout:render-error',()=>{if(mode==='3d'&&!switching)switchView('2d').then(()=>{dom.mode.textContent='3D 화면 연결이 끊겨 2D로 전환했습니다.';});});
window.addEventListener('keydown',event=>{
  if(event.code==='Escape'){event.preventDefault();togglePause();return;}
  if(event.ctrlKey||event.metaKey||event.altKey||event.target.closest('button,a,input,select,textarea,[contenteditable="true"]'))return;
  if(!['ArrowLeft','ArrowRight','KeyA','KeyD','Space'].includes(event.code))return;
  event.preventDefault();keys.add(event.code);
  if(event.code==='Space'&&!event.repeat)launch();
  else if(event.code!=='Space')pointerX=null;
});
window.addEventListener('keyup',event=>keys.delete(event.code));
function backgroundPause(){clearInput();if(engine.state.phase==='playing'){engine.pause();syncUI(true);}}
window.addEventListener('blur',backgroundPause);
document.addEventListener('visibilitychange',()=>{if(document.hidden)backgroundPause();});

function fullscreenChanged() {
  const active=fallbackFullscreen||document.fullscreenElement===dom.stage;
  if(active!==fullscreenActive){fullscreenActive=active;dom.stage.classList.toggle('is-fullscreen',active);$('fullscreen-button').setAttribute('aria-pressed',String(active));$('fullscreen-button').textContent=active?'⛶ 닫기':'⛶ 전체화면';
    if(active){savedOverflow=document.body.style.overflow;document.body.style.overflow='hidden';}
    else{document.body.style.overflow=savedOverflow;if(savedFocus?.isConnected)savedFocus.focus({preventScroll:true});}}
  renderer?.resize();
}
$('fullscreen-button').addEventListener('click',async()=>{
  const button=$('fullscreen-button');button.disabled=true;
  try {
    if(fullscreenActive){if(document.fullscreenElement===dom.stage)await document.exitFullscreen();fallbackFullscreen=false;}
    else{savedFocus=document.activeElement;if(dom.stage.requestFullscreen&&document.fullscreenEnabled!==false){try{await dom.stage.requestFullscreen();}catch{fallbackFullscreen=true;}}else fallbackFullscreen=true;}
    fullscreenChanged();
  }catch{dom.mode.textContent='전체화면을 닫으려면 브라우저의 Esc를 눌러 주세요.';}
  finally{button.disabled=false;}
});
document.addEventListener('fullscreenchange',fullscreenChanged);
window.addEventListener('pagehide',()=>{saveBest();renderer?.dispose();audio.context?.close().catch(()=>{});});
function frame(now) {
  requestAnimationFrame(frame);
  const dt=Math.min(Math.max(0,(now-lastTime)/1000),.05);lastTime=now;
  if(document.hidden)return;
  const axis=(keys.has('ArrowRight')||keys.has('KeyD')?1:0)-(keys.has('ArrowLeft')||keys.has('KeyA')?1:0);
  if(!switching)engine.update(dt,{axis,paddleX:pointerX===null?undefined:pointerX,fire:fireHeld||keys.has('Space')||now<fireUntil});
  const events=engine.drainEvents();
  events.forEach(event=>{audio.play(event);if(event.type==='item'){dom.toast.textContent=ITEMS[event.kind]?.label||'아이템 획득';dom.toast.hidden=false;toastUntil=now+1700;}});
  if(now>=toastUntil)dom.toast.hidden=true;
  try {renderer?.render(engine.state,events,dt);}catch{if(mode==='3d'&&!switching)switchView('2d');else engine.pause();}
  syncUI();
}
initGuide();switchView('2d');syncUI(true);requestAnimationFrame(frame);
