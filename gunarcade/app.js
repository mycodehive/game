import { createGame, HEROES, WEAPONS } from './engine.js';
import { createRenderer } from './render3d.js';
const $=id=>document.getElementById(id);
const dom={host:$('canvas-host'),stage:$('arena-wrap'),heroes:$('hero-list'),stats:$('hero-stats'),description:$('hero-description'),weapons:$('weapon-list'),overlay:$('game-overlay'),eyebrow:$('overlay-eyebrow'),title:$('overlay-title'),detail:$('overlay-description'),hint:$('overlay-hint'),play:$('play-button'),pause:$('pause-button'),phaseLabel:$('phase-label'),phaseValue:$('phase-value'),phaseBar:$('phase-bar'),hp:$('hp-value'),hpBar:$('hp-bar'),hero:$('hero-label'),score:$('score-value'),level:$('stage-value'),toast:$('pickup-toast'),reticle:$('aim-reticle'),fire:$('fire-button'),autoAim:$('auto-aim'),autoFire:$('auto-fire'),motion:$('reduce-effects')};
const engine=createGame();
const keys=new Set(),touch=new Map();
let renderer=null,rendererFailed=false,focused=true,lastTime=performance.now(),lastHUD=0,previousPhase=null;
let aim=null,fireHeld=false,fireUntil=0,pendingSlot,toastUntil=0,clearRemaining=3;
let loadoutSignature='';
let fullscreenFallback=false,fullscreenActive=false,savedOverflow='',savedFocus;
const mediaMotion=window.matchMedia('(prefers-reduced-motion: reduce)');dom.motion.checked=mediaMotion.matches;
const hero=()=>HEROES.find(item=>item.id===engine.state.heroId)||HEROES[0];
function number(value){return Number(value).toLocaleString('ko-KR',{maximumFractionDigits:1});}
function clearInput(){keys.clear();touch.clear();fireHeld=false;fireUntil=0;aim=null;pendingSlot=undefined;document.querySelectorAll('.pressed').forEach(button=>button.classList.remove('pressed'));dom.reticle.hidden=true;}
function initRenderer(){
  renderer?.dispose();renderer=null;dom.host.replaceChildren();
  try{renderer=createRenderer(dom.host,{reducedMotion:dom.motion.checked});rendererFailed=false;previousPhase=null;lastTime=performance.now();return true;}
  catch{rendererFailed=true;engine.pause();previousPhase=null;syncUI(true);return false;}
}
function startGame(){if(rendererFailed&&!initRenderer())return;clearInput();engine.restart();clearRemaining=3;previousPhase=null;syncUI(true);dom.host.focus({preventScroll:true});}
function nextStage(){if(rendererFailed)return;engine.nextStage();clearInput();previousPhase=null;syncUI(true);dom.host.focus({preventScroll:true});}
function togglePause(){
  if(rendererFailed)return;
  if(engine.state.phase==='paused'){engine.resume();clearInput();dom.host.focus({preventScroll:true});}
  else if(['prepare','combat'].includes(engine.state.phase)){engine.pause();clearInput();}
  syncUI(true);
}
function renderHeroStats(){
  const selected=hero();dom.description.textContent=selected.description;if(engine.state.phase==='select')dom.play.textContent=`${selected.name}로 출격 →`;
  dom.stats.replaceChildren();
  const fields=[['health','체력',value=>String(value)],['power','공격력',value=>`${number(value)}×`],['speed','이동',value=>number(value)],['tech','기술',value=>`${number(value)}×`]];
  fields.forEach(([id,label,format])=>{
    const row=document.createElement('div');row.className='hero-stat';const name=document.createElement('span');name.textContent=label;
    const track=document.createElement('div');track.className='stat-track';const fill=document.createElement('i');fill.style.width=`${selected.stats[id]/Math.max(...HEROES.map(item=>item.stats[id]))*100}%`;track.appendChild(fill);
    const value=document.createElement('strong');value.textContent=format(selected.stats[id]);row.append(name,track,value);dom.stats.appendChild(row);
  });
}
function buildRoster(){
  HEROES.forEach(character=>{
    const button=document.createElement('button');button.type='button';button.className='hero-button';button.dataset.hero=character.id;
    const name=document.createElement('strong');name.textContent=character.name;const role=document.createElement('span');role.textContent=character.role;button.append(name,role);
    button.addEventListener('click',()=>{engine.selectCharacter(character.id);renderHeroStats();syncUI(true);});dom.heroes.appendChild(button);
  });renderHeroStats();
}
function syncOverlay(){
  const phase=engine.state.phase;
  const key=rendererFailed?'render-error':phase;
  if(previousPhase===key)return;previousPhase=key;
  dom.overlay.hidden=!rendererFailed&&['prepare','combat'].includes(phase);
  dom.pause.disabled=rendererFailed||!['prepare','combat','paused'].includes(phase);dom.pause.textContent=phase==='paused'?'▶ 계속':'Ⅱ 정지';
  if(rendererFailed){dom.eyebrow.textContent='WEBGL REQUIRED';dom.title.textContent='3D 화면을 시작할 수 없습니다.';dom.detail.textContent='WebGL과 하드웨어 가속이 활성화된 브라우저에서 다시 시도해 주세요. 현재 진행은 멈춰 있습니다.';dom.play.textContent='3D 화면 다시 시작';dom.hint.textContent='GunArcade는 실제 WebGL 3D 게임입니다.';}
  else if(phase==='select'){dom.eyebrow.textContent='THIRTY SECONDS TO ARM';dom.title.innerHTML='30초의 준비.<br><span>당신만의 생존.</span>';dom.detail.innerHTML='주인공의 능력치로 무기가 달라집니다.<br>무기를 수집하고, 다가오는 적을 모두 물리치세요.';dom.play.textContent=`${hero().name}로 출격 →`;dom.hint.textContent='주변 보급 상자에 접근하여 무기를 최소 1개 습득하세요.';}
  else if(phase==='paused'){dom.eyebrow.textContent='TIME OUT';dom.title.textContent='잠시 쉬어 가세요.';dom.detail.textContent='준비 시간, 적, 사격과 주인공의 움직임이 멈췄습니다.';dom.play.textContent='계속 플레이 →';dom.hint.textContent='Esc로도 이어갈 수 있습니다.';}
  else if(phase==='cleared'){clearRemaining=3;dom.eyebrow.textContent='STAGE COMPLETE';dom.title.textContent=`스테이지 ${engine.state.stage} 완수!`;dom.detail.textContent='모든 적을 물리쳤습니다. 다음 스테이지에서는 무기와 탄환을 초기화하고 체력을 회복한 뒤 다시30초 동안 무장합니다.';dom.play.textContent='다음 스테이지 준비 →';}
  else if(phase==='gameover'){dom.eyebrow.textContent='TRY ANOTHER LOADOUT';dom.title.textContent=engine.state.failureReason==='no_weapon'?'무기를 습득하지 못했습니다.':'다음 생존을 준비하세요.';dom.detail.textContent=engine.state.failureReason==='no_weapon'?'준비 시간30초 동안 보급 상자에 접근해 무기를 최소1개 습득해야 전투에 진입할 수 있습니다.':'다른 캐릭터나 무기 조합으로 다시 도전하세요. 적과 거리를 유지하며 이동하면 생존에 도움이 됩니다.';dom.play.textContent='새 게임으로 재도전 →';dom.hint.textContent=`스테이지 ${engine.state.stage} · ${engine.state.score.toLocaleString('ko-KR')}점`;
  }
  if(!dom.overlay.hidden)dom.play.focus({preventScroll:true});
}
function syncUI(force=false){
  syncOverlay();const now=performance.now();if(!force&&now-lastHUD<120)return;lastHUD=now;
  const state=engine.state,selected=hero(),mode=state.phase==='paused'?state.pausePhase:state.phase;
  dom.level.textContent=String(state.stage).padStart(2,'0');dom.score.textContent=state.score.toLocaleString('ko-KR');dom.hero.textContent=selected.name;
  dom.hp.textContent=`HP ${Math.ceil(state.player.hp)} / ${state.player.maxHp}`;dom.hpBar.style.width=`${Math.max(0,state.player.hp/state.player.maxHp)*100}%`;
  dom.hpBar.parentElement.parentElement.classList.toggle('danger',state.player.hp<state.player.maxHp*.3);
  dom.stage.classList.toggle('combat',mode==='combat');
  if(mode==='prepare'){dom.phaseLabel.textContent=state.phase==='paused'?'PREPARATION PAUSED':'ARMAMENT COLLECTION';dom.phaseValue.textContent=`${Math.ceil(Math.max(0,state.prepRemaining))}s`;dom.phaseBar.style.width=`${Math.max(0,state.prepRemaining)/30*100}%`;}
  else if(mode==='combat'){const remaining=state.enemies.filter(enemy=>enemy.alive).length;dom.phaseLabel.textContent=state.phase==='paused'?'COMBAT PAUSED':'HOSTILES INBOUND';dom.phaseValue.textContent=`${remaining} / ${state.stageEnemyTotal}`;dom.phaseBar.style.width=`${state.stageEnemyTotal?remaining/state.stageEnemyTotal*100:0}%`;}
  else{dom.phaseLabel.textContent=state.phase==='cleared'?'MISSION COMPLETE':state.phase==='gameover'?'MISSION FAILED':'SELECT YOUR HERO';dom.phaseValue.textContent=state.phase==='cleared'?'CLEAR':state.phase==='gameover'?'RETRY':'READY';dom.phaseBar.style.width='100%';}
  if(state.phase==='cleared')dom.hint.textContent=`${Math.max(1,Math.ceil(clearRemaining))}초 뒤 다음 스테이지로 자동 이동합니다.`;
  [...dom.heroes.children].forEach(button=>{button.disabled=!['select','gameover'].includes(state.phase);button.setAttribute('aria-pressed',String(button.dataset.hero===state.heroId));});
  const signature=JSON.stringify(state.weapons)+state.selectedWeapon;
  if(signature!==loadoutSignature){
  loadoutSignature=signature;dom.weapons.replaceChildren();
  for(let index=0;index<3;index++){
    const weapon=state.weapons[index];const button=document.createElement('button');button.type='button';button.className=`weapon-slot${weapon?'':' empty'}`;button.disabled=!weapon||!['prepare','combat'].includes(state.phase);button.setAttribute('aria-pressed',String(Boolean(weapon)&&state.selectedWeapon===index));
    const slot=document.createElement('b');slot.textContent=String(index+1);const name=document.createElement('strong');name.textContent=weapon?weapon.name:'미수집 슬롯';const detail=document.createElement('small');detail.textContent=weapon?`피해 ${number(weapon.damage)} · ${number(1/weapon.cooldown)}발/초 · ${weapon.pellets}탄${weapon.pierce?' · 관통':''}`:'보급 상자에 접근해서 습득';button.append(slot,name,detail);
    button.addEventListener('click',()=>{pendingSlot=index;dom.host.focus({preventScroll:true});});dom.weapons.appendChild(button);
  }
  }
  [...dom.weapons.children].forEach((button,index)=>{button.disabled=!state.weapons[index]||!['prepare','combat'].includes(state.phase);});
  document.querySelectorAll('[data-slot]').forEach(button=>{const index=Number(button.dataset.slot),weapon=state.weapons[index];button.disabled=!weapon||!['prepare','combat'].includes(state.phase);button.setAttribute('aria-pressed',String(Boolean(weapon)&&state.selectedWeapon===index));button.setAttribute('aria-label',weapon?`변경할 무기 ${index+1}: ${weapon.name}`:`무기 ${index+1} 미수집`);button.querySelector('span').textContent=weapon?({rifle:'RIFLE',shotgun:'SHOT',rail:'RAIL',burst:'BURST'})[weapon.kind]:'—';});
  $('weapon-count').textContent=`${state.weapons.length} / 3 SLOTS`;
  $('weapon-hud').textContent=state.weapons[state.selectedWeapon]?.name||'NO WEAPON';
  dom.fire.disabled=state.phase!=='combat'||rendererFailed;
  let nearest=null,bestDistance=Infinity;
  for(const pickup of state.pickups){if(pickup.collected)continue;const distance=Math.hypot(pickup.x-state.player.x,pickup.z-state.player.z);if(distance<bestDistance){bestDistance=distance;nearest=pickup;}}
  if(mode==='prepare'){$('mission-title').textContent='30초 동안 무기를 찾으세요.';$('mission-description').textContent='보급 상자에 접촉하면 캐릭터 능력치에 비례한 무기를 얻습니다. 준비 단계에서는 적이 등장하지 않습니다.';$('nearest-pickup').textContent=nearest?`${WEAPONS[nearest.kind].name} · ${number(bestDistance)}m`:'모든 보급 상자를 확인했습니다.';$('arena-hint').textContent='보급 상자에 접근하여 무기 습득';}
  else if(mode==='combat'){$('mission-title').textContent='모든 적을 물리치세요.';$('mission-description').textContent='적들은 주인공의 현재 위치를 추적합니다. 무기를 바꾸고 이동하면서 생존하세요.';$('nearest-pickup').textContent=`자동 조준 ${dom.autoAim.checked?'ON':'OFF'} · 자동 사격 ${dom.autoFire.checked?'ON':'OFF'}`;$('arena-hint').textContent=`${state.enemies.filter(enemy=>enemy.alive).length}명의 적 접근 중 · 이동하며 회피`;}
  else{$('mission-title').textContent='캐릭터와 무장의 조합';$('mission-description').textContent='공격력·기술이 무기 피해량과 연사 특성에 반영됩니다. 각 스테이지는 새로운 무기로 시작합니다.';$('nearest-pickup').textContent='무기는 다음 스테이지로 가져가지 않습니다.';$('arena-hint').textContent=state.phase==='cleared'?'적 전원 처치 · 다음 무장 준비':state.phase==='gameover'?'다시 출격할 수 있습니다.':'주인공을 선택하고 출격하세요.';}
}
function aimPointer(event){
  const point=renderer?.screenToWorld(event.clientX,event.clientY);if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.z))return;aim=point;
  if(!dom.autoAim.checked){const rect=dom.host.getBoundingClientRect();dom.reticle.style.left=`${event.clientX-rect.left}px`;dom.reticle.style.top=`${event.clientY-rect.top}px`;dom.reticle.hidden=engine.state.phase!=='combat';}
}
dom.host.addEventListener('pointermove',aimPointer);
dom.host.addEventListener('pointerdown',event=>{event.preventDefault();dom.host.setPointerCapture(event.pointerId);aimPointer(event);fireHeld=true;dom.host.focus({preventScroll:true});});
window.addEventListener('pointerup',()=>{fireHeld=false;dom.fire.classList.remove('pressed');});
dom.host.addEventListener('pointercancel',()=>{fireHeld=false;});
function releaseFire(){fireHeld=false;dom.fire.classList.remove('pressed');}
dom.fire.addEventListener('pointerdown',event=>{event.preventDefault();dom.fire.setPointerCapture(event.pointerId);fireHeld=true;dom.fire.classList.add('pressed');});
['pointerup','pointercancel','lostpointercapture'].forEach(type=>dom.fire.addEventListener(type,releaseFire));
dom.fire.addEventListener('click',()=>{fireUntil=performance.now()+180;});
document.querySelectorAll('[data-move-x]').forEach(button=>{
  button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture(event.pointerId);touch.set(event.pointerId,{x:Number(button.dataset.moveX),z:Number(button.dataset.moveZ),button});button.classList.add('pressed');});
  const release=event=>{touch.delete(event.pointerId);if(![...touch.values()].some(value=>value.button===button))button.classList.remove('pressed');};['pointerup','pointercancel','lostpointercapture'].forEach(type=>button.addEventListener(type,release));
});
dom.play.addEventListener('click',()=>{
  if(rendererFailed){if(initRenderer()){if(engine.state.phase==='paused')engine.resume();syncUI(true);}return;}
  if(engine.state.phase==='paused')togglePause();else if(engine.state.phase==='cleared')nextStage();else startGame();
});
document.querySelectorAll('[data-slot]').forEach(button=>button.addEventListener('click',()=>{pendingSlot=Number(button.dataset.slot);dom.host.focus({preventScroll:true});}));
dom.pause.addEventListener('click',togglePause);$('restart-button').addEventListener('click',startGame);
dom.motion.addEventListener('change',()=>{if(['prepare','combat'].includes(engine.state.phase))engine.pause();clearInput();initRenderer();syncUI(true);});
dom.autoAim.addEventListener('change',()=>{aim=null;dom.reticle.hidden=true;syncUI(true);});dom.autoFire.addEventListener('change',()=>syncUI(true));
dom.host.addEventListener('gunarcade:render-error',()=>{rendererFailed=true;engine.pause();clearInput();previousPhase=null;syncUI(true);});
window.addEventListener('keydown',event=>{
  if(event.code==='Escape'){event.preventDefault();togglePause();return;}
  if(event.ctrlKey||event.metaKey||event.altKey||event.target.closest('button,a,input,select,textarea,[contenteditable="true"]'))return;
  if(['Digit1','Digit2','Digit3'].includes(event.code)){event.preventDefault();pendingSlot=Number(event.code.slice(-1))-1;return;}
  if(!['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','Space'].includes(event.code))return;
  event.preventDefault();keys.add(event.code);
});
window.addEventListener('keyup',event=>keys.delete(event.code));
function backgroundPause(){clearInput();engine.pause();syncUI(true);}
window.addEventListener('blur',()=>{focused=false;backgroundPause();});window.addEventListener('focus',()=>{focused=true;lastTime=performance.now();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)backgroundPause();});
function fullscreenChanged(){
  const active=fullscreenFallback||document.fullscreenElement===dom.stage;
  if(active!==fullscreenActive){fullscreenActive=active;dom.stage.classList.toggle('is-fullscreen',active);$('fullscreen-button').setAttribute('aria-pressed',String(active));$('fullscreen-button').textContent=active?'⛶ 닫기':'⛶ 전체화면';if(active){savedOverflow=document.body.style.overflow;document.body.style.overflow='hidden';}else{document.body.style.overflow=savedOverflow;if(savedFocus?.isConnected)savedFocus.focus({preventScroll:true});}}
  renderer?.resize();
}
$('fullscreen-button').addEventListener('click',async()=>{
  const button=$('fullscreen-button');button.disabled=true;
  try{if(fullscreenActive){if(document.fullscreenElement===dom.stage)await document.exitFullscreen();fullscreenFallback=false;}else{savedFocus=document.activeElement;if(dom.stage.requestFullscreen&&document.fullscreenEnabled!==false){try{await dom.stage.requestFullscreen();}catch{fullscreenFallback=true;}}else fullscreenFallback=true;}fullscreenChanged();}catch{}finally{button.disabled=false;}
});
document.addEventListener('fullscreenchange',fullscreenChanged);window.addEventListener('pagehide',()=>renderer?.dispose());
function frame(now){
  requestAnimationFrame(frame);const dt=Math.min(Math.max((now-lastTime)/1000,0),.05);lastTime=now;if(document.hidden||!focused)return;
  if(!rendererFailed){
    const moveX=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+[...touch.values()].reduce((sum,value)=>sum+value.x,0);
    const moveZ=(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0)+[...touch.values()].reduce((sum,value)=>sum+value.z,0);
    engine.update(dt,{moveX,moveZ,aimX:dom.autoAim.checked?undefined:aim?.x,aimZ:dom.autoAim.checked?undefined:aim?.z,fire:dom.autoFire.checked||fireHeld||keys.has('Space')||now<fireUntil,slot:pendingSlot});pendingSlot=undefined;
    if(engine.state.phase==='cleared'){if(previousPhase!=='cleared')syncUI(true);clearRemaining-=dt;if(clearRemaining<=0)nextStage();}
  }
  const events=engine.drainEvents();events.forEach(event=>{if(event.type==='pickup'){const weapon=engine.state.weapons[engine.state.selectedWeapon];dom.toast.textContent=`${weapon?.name||'무기'} 습득 · 캐릭터 능력치 반영`;dom.toast.hidden=false;toastUntil=now+1800;}});if(now>=toastUntil)dom.toast.hidden=true;
  try{renderer?.render(engine.state,events,dt);}catch{rendererFailed=true;engine.pause();previousPhase=null;}
  syncUI();
}
buildRoster();initRenderer();syncUI(true);requestAnimationFrame(frame);
