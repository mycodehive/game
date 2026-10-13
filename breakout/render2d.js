const ARENA = { width: 100, height: 140 };
const MAX_PARTICLES = 220;
const MAX_RINGS = 24;
const MAX_TRAILS = 24;
const COLORS = ['#55e7f1', '#62eac2', '#93a3ff', '#da83ff', '#ff89b9', '#ffc671'];
const ITEMS = {
  multi: { color: '#60eaff', glyph: 'M' },
  pierce: { color: '#bd8aff', glyph: 'P' },
  laser: { color: '#ff668c', glyph: 'L' },
  expand: { color: '#76f4a9', glyph: 'W' },
  shield: { color: '#72bfff', glyph: 'S' },
  slow: { color: '#ffc96a', glyph: 'T' },
  heal: { color: '#ff88c7', glyph: '+' }
};
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
function normalizedColor(color, fallback = '#55e7f1') {
  if (/^#[0-9a-f]{3}$/i.test(color)) return '#' + color.slice(1).split('').map((value) => value + value).join('');
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}
function rgba(color, alpha) {
  color = normalizedColor(color);
  return `rgba(${parseInt(color.slice(1, 3), 16)},${parseInt(color.slice(3, 5), 16)},${parseInt(color.slice(5, 7), 16)},${clamp(alpha, 0, 1)})`;
}
function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(Math.max(radius, 0), width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height); ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
function seededStars() {
  let seed = 72491;
  const next = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  return Array.from({ length: 64 }, () => ({ x: next() * 100, y: next() * 140, r: .04 + next() * .1, brightness: .2 + next() * .5 }));
}

/** Decorative Canvas renderer. It never changes the shared gameplay state. */
export function create2DRenderer(container, { reducedMotion = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'breakout-canvas breakout-canvas-2d';
  canvas.setAttribute('aria-label', '네온 벽돌깨기 2D 플레이 화면');
  canvas.style.width = '100%'; canvas.style.height = '100%';
  canvas.style.display = 'block'; canvas.style.touchAction = 'none';
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D 화면을 사용할 수 없습니다. 지원되는 브라우저에서 다시 시도해 주세요.');
  container.appendChild(canvas);
  const particles = [], rings = [], flashes = [], trails = new Map(), stars = seededStars();
  let viewport = { x: 0, y: 0, scale: 1, width: 100, height: 140 };
  let cssWidth = 100, cssHeight = 140, ratio = 1, time = 0, shake = 0, disposed = false;

  function resize() {
    if (disposed) return;
    const rect = container.getBoundingClientRect();
    cssWidth = Math.max(1, finite(rect.width, container.clientWidth || 100));
    cssHeight = Math.max(1, finite(rect.height, container.clientHeight || 140));
    ratio = clamp(finite(window.devicePixelRatio, 1), 1, 2);
    canvas.width = Math.max(1, Math.round(cssWidth * ratio));
    canvas.height = Math.max(1, Math.round(cssHeight * ratio));
    const scale = Math.min(cssWidth / ARENA.width, cssHeight / ARENA.height);
    viewport = { x: (cssWidth - ARENA.width * scale) / 2, y: (cssHeight - ARENA.height * scale) / 2, scale, width: ARENA.width * scale, height: ARENA.height * scale };
  }
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  if (observer) observer.observe(container);
  else window.addEventListener('resize', resize);
  resize();

  function screenToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    // Convert the actual displayed canvas rectangle, including any CSS scaling.
    const x = (finite(clientX) - finite(rect.left)) * cssWidth / Math.max(1, finite(rect.width, cssWidth));
    const y = (finite(clientY) - finite(rect.top)) * cssHeight / Math.max(1, finite(rect.height, cssHeight));
    return { x: (x - viewport.x) / viewport.scale, y: (y - viewport.y) / viewport.scale };
  }

  function emit(event) {
    const x = finite(event.x, 50), y = finite(event.y, 70);
    const item = ITEMS[event.kind];
    const color = normalizedColor(event.color, item?.color || COLORS[Math.abs(Math.floor(y / 9)) % COLORS.length]);
    const broken = event.type === 'brick-break';
    if (event.type === 'brick-hit' || broken) {
      flashes.push({ x, y, age: 0 });
      if (flashes.length > 24) flashes.shift();
    }
    const impact = broken || ['paddle-hit', 'wall-hit', 'item', 'life-lost', 'level-clear', 'launch', 'shot', 'upgrade', 'gameover'].includes(event.type);
    if (!impact) return;
    rings.push({ x, y, age: 0, life: broken ? .48 : .65, color, large: ['level-clear', 'upgrade'].includes(event.type) });
    if (rings.length > MAX_RINGS) rings.shift();
    if (!reducedMotion) {
      if (broken || event.type === 'life-lost') shake = Math.min(2.2, shake + (broken ? .45 : 1.5));
      const count = broken ? 12 : ['wall-hit', 'shot'].includes(event.type) ? 3 : event.type === 'paddle-hit' ? 5 : 18;
      for (let i = 0; i < count; i++) {
        const angle = i / count * Math.PI * 2 + time;
        const speed = 4 + (i % 5) * 3;
        particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, age: 0, life: .25 + (i % 4) * .14, size: .12 + (i % 3) * .07, color });
      }
      if (particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);
    }
  }

  function background(state) {
    const gradient = ctx.createLinearGradient(0, 0, 100, 140);
    gradient.addColorStop(0, '#091a30'); gradient.addColorStop(.55, '#0b142b'); gradient.addColorStop(1, '#090e21');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 100, 140);
    const nebula = ctx.createRadialGradient(79, 45, 0, 79, 45, 68);
    nebula.addColorStop(0, 'rgba(109,53,178,.15)'); nebula.addColorStop(1, 'rgba(109,53,178,0)');
    ctx.fillStyle = nebula; ctx.fillRect(0, 0, 100, 140);
    ctx.lineWidth = .07; ctx.strokeStyle = 'rgba(110,162,207,.07)';
    ctx.beginPath();
    for (let x = 0; x <= 100; x += 10) { ctx.moveTo(x, 0); ctx.lineTo(x, 140); }
    for (let y = 0; y <= 140; y += 10) { ctx.moveTo(0, y); ctx.lineTo(100, y); }
    ctx.stroke();
    for (const star of stars) {
      ctx.fillStyle = `rgba(175,220,255,${star.brightness})`;
      ctx.fillRect(star.x, star.y, star.r, star.r);
    }
    ctx.strokeStyle = 'rgba(97,199,226,.16)'; ctx.lineWidth = .12;
    for (const [x, y, radius] of [[74, 82, 16], [27, 101, 11]]) {
      ctx.beginPath();
      for (let point = 0; point <= 6; point++) {
        const angle = point / 6 * Math.PI * 2 + (reducedMotion ? 0 : time * .015);
        const px = x + Math.cos(angle) * radius, py = y + Math.sin(angle) * radius;
        if (!point) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.font = '600 1.3px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#607c98';
    ctx.fillText('NEON ARRAY', 4, 6); ctx.textAlign = 'right';
    ctx.fillText(`SECTOR ${String(Math.max(1, finite(state.level, 1))).padStart(2, '0')}`, 96, 6);
    ctx.shadowColor = '#52dff2'; ctx.shadowBlur = 5; ctx.strokeStyle = '#3d879b'; ctx.lineWidth = .2;
    ctx.beginPath(); ctx.moveTo(.8, 139); ctx.lineTo(.8, .8); ctx.lineTo(99.2, .8); ctx.lineTo(99.2, 139); ctx.stroke();
    ctx.shadowBlur = 0;
    if (finite(state.effects?.shield) > 0) {
      ctx.save();
      ctx.shadowColor = '#69e7ff'; ctx.shadowBlur = 12;
      ctx.strokeStyle = '#72e9ff'; ctx.lineWidth = .55;
      ctx.beginPath(); ctx.moveTo(2, 137); ctx.lineTo(98, 137); ctx.stroke();
      ctx.strokeStyle = 'rgba(108,223,255,.2)'; ctx.lineWidth = 2.4;
      ctx.stroke(); ctx.restore();
    }
  }

  function brick(brick, level) {
    if (brick.alive === false || finite(brick.hp, 1) <= 0) return;
    const x = finite(brick.x), y = finite(brick.y), w = Math.max(.1, finite(brick.w, 8)), h = Math.max(.1, finite(brick.h, 4));
    const typeColor = brick.type === 'boss' ? '#ff707c' : brick.type === 'blast' ? '#ffc471' : brick.type === 'armor' ? '#a7b5d7' : brick.type === 'moving' ? '#da86ff' : COLORS[(Math.floor(y / 7) + Math.floor(finite(level, 1))) % COLORS.length];
    const color = normalizedColor(brick.color, typeColor);
    const flash = flashes.some((hit) => Math.abs(hit.x - x) <= w * .6 && Math.abs(hit.y - y) <= h * .8);
    ctx.save();
    if (brick.type === 'moving') {
      ctx.strokeStyle = rgba(color, .15); ctx.lineWidth = .15;
      roundedRect(ctx, x - w / 2 - .65, y - h / 2, w + 1.3, h, .55); ctx.stroke();
    }
    ctx.shadowColor = color; ctx.shadowBlur = flash ? 19 : brick.type === 'boss' ? 12 : 6;
    const gradient = ctx.createLinearGradient(x, y - h / 2, x, y + h / 2);
    gradient.addColorStop(0, rgba(color, flash ? .95 : .5)); gradient.addColorStop(1, rgba(color, .12));
    ctx.fillStyle = gradient; ctx.strokeStyle = rgba(color, .8); ctx.lineWidth = .18;
    roundedRect(ctx, x - w / 2, y - h / 2, w, h, .5); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = rgba(color, .45); ctx.lineWidth = .09;
    ctx.beginPath(); ctx.moveTo(x - w / 2 + .7, y - h / 2 + .65); ctx.lineTo(x + w / 2 - .7, y - h / 2 + .65); ctx.stroke();
    if (brick.type !== 'normal') {
      ctx.font = `${Math.min(h * .53, 2.3)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = rgba(color, .95);
      ctx.fillText(brick.type === 'blast' ? '✦' : brick.type === 'moving' ? '↔' : brick.type === 'boss' ? '◆' : '▰', x, y - .25);
    }
    const maxHp = Math.max(1, finite(brick.maxHp, finite(brick.hp, 1)));
    if (maxHp > 1) {
      const slots = Math.min(8, maxHp), space = .28, length = (w - 1.4 - (slots - 1) * space) / slots;
      for (let index = 0; index < slots; index++) {
        ctx.fillStyle = index / slots < finite(brick.hp) / maxHp ? '#eef7ff' : rgba(color, .2);
        ctx.fillRect(x - w / 2 + .7 + index * (length + space), y + h / 2 - .8, Math.max(.05, length), .23);
      }
    }
    ctx.restore();
  }

  function paddle(state) {
    const p = state.paddle;
    if (!p) return;
    const x = finite(p.x, 50), y = finite(p.y, 130), w = Math.max(1, finite(p.width, 18)), h = Math.max(.4, finite(p.height, 2.7));
    const laser = finite(state.effects?.laser) > 0, expanded = finite(state.effects?.expand) > 0;
    const color = laser ? '#ff83b9' : expanded ? '#77ffba' : '#62eeef';
    ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = 15;
    const gradient = ctx.createLinearGradient(x, y - h / 2, x, y + h / 2);
    gradient.addColorStop(0, '#ecffff'); gradient.addColorStop(.28, color); gradient.addColorStop(1, '#16445c');
    ctx.fillStyle = gradient; ctx.strokeStyle = '#c7ffff'; ctx.lineWidth = .13;
    roundedRect(ctx, x - w / 2, y - h / 2, w, h, .65); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
    ctx.strokeStyle = '#063343'; ctx.lineWidth = .17;
    for (const side of [-1, 1]) {
      const tip = x + side * (w / 2 - 1.15);
      ctx.beginPath(); ctx.moveTo(tip, y - h * .27); ctx.lineTo(tip, y + h * .27); ctx.stroke();
      if (laser) { ctx.fillStyle = '#ffa3d0'; ctx.fillRect(tip - .42, y - h / 2 - .55, .84, .8); }
    }
    ctx.fillStyle = 'rgba(137,235,255,.22)';
    roundedRect(ctx, x - w * .32, y + h / 2 + .8, w * .64, .32, .16); ctx.fill();
    ctx.restore();
  }

  function ball(ball, effects) {
    const x = finite(ball.x), y = finite(ball.y), r = Math.max(.2, finite(ball.radius, 1));
    const color = finite(effects?.pierce) > 0 ? '#ffb86c' : finite(effects?.slow) > 0 ? '#c397ff' : '#99f9ff';
    const path = trails.get(ball.id) || [];
    ctx.save(); ctx.lineCap = 'round';
    for (let i = 1; i < path.length; i++) {
      ctx.strokeStyle = rgba(color, i / path.length * .45); ctx.lineWidth = r * (i / path.length) * 1.45;
      ctx.beginPath(); ctx.moveTo(path[i - 1].x, path[i - 1].y); ctx.lineTo(path[i].x, path[i].y); ctx.stroke();
    }
    ctx.shadowColor = color; ctx.shadowBlur = 18; ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#f4ffff'; ctx.beginPath(); ctx.arc(x - r * .18, y - r * .2, r * .46, 0, Math.PI * 2); ctx.fill();
    if (finite(effects?.pierce) > 0) {
      ctx.strokeStyle = 'rgba(255,199,115,.55)'; ctx.lineWidth = .16; ctx.beginPath(); ctx.arc(x, y, r * 1.65, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  function drop(drop) {
    const item = ITEMS[drop.kind] || { color: '#a4dcff', glyph: '?' };
    const x = finite(drop.x), y = finite(drop.y);
    ctx.save(); ctx.translate(x, y); ctx.shadowColor = item.color; ctx.shadowBlur = 11;
    ctx.fillStyle = rgba(item.color, .2); ctx.strokeStyle = item.color; ctx.lineWidth = .23;
    roundedRect(ctx, -2.15, -2.15, 4.3, 4.3, 1); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
    ctx.font = 'bold 2.25px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#f0ffff';
    ctx.fillText(item.glyph, 0, .1); ctx.restore();
  }

  function render(state, events = [], dt = 0) {
    if (disposed || !state) return;
    const step = clamp(finite(dt), 0, .06);
    const animate = !reducedMotion && state.phase !== 'paused';
    if (animate) time += step;
    for (const event of events || []) emit(event);
    for (let i = flashes.length - 1; i >= 0; i--) { flashes[i].age += step; if (flashes[i].age > .14) flashes.splice(i, 1); }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      if (animate) { p.age += step; p.x += p.vx * step; p.y += p.vy * step; p.vy += 9 * step; }
      if (p.age >= p.life) particles.splice(i, 1);
    }
    for (let i = rings.length - 1; i >= 0; i--) { if (state.phase !== 'paused') rings[i].age += step; if (rings[i].age >= rings[i].life) rings.splice(i, 1); }
    const ballIds = new Set((state.balls || []).map((ball) => ball.id));
    for (const id of trails.keys()) if (!ballIds.has(id)) trails.delete(id);
    if (animate) for (const ball of (state.balls || []).slice(0, MAX_TRAILS)) {
      const path = trails.get(ball.id) || [];
      if (!ball.attached) path.push({ x: finite(ball.x), y: finite(ball.y) }); else path.length = 0;
      if (path.length > 9) path.shift();
      trails.set(ball.id, path);
    }
    while (trails.size > MAX_TRAILS) trails.delete(trails.keys().next().value);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight); ctx.fillStyle = '#060d1a'; ctx.fillRect(0, 0, cssWidth, cssHeight);
    ctx.save(); ctx.translate(viewport.x, viewport.y); ctx.scale(viewport.scale, viewport.scale);
    ctx.beginPath(); ctx.rect(0, 0, 100, 140); ctx.clip();
    if (!reducedMotion && shake > .01) {
      ctx.translate(Math.sin(time * 71) * shake * .36, Math.cos(time * 83) * shake * .26);
      if (animate) shake *= Math.exp(-step * 14);
    }
    background(state);
    for (const b of state.bricks || []) brick(b, state.level);
    for (const s of state.shots || []) {
      ctx.save(); ctx.shadowColor = '#ff75b4'; ctx.shadowBlur = 10; ctx.fillStyle = '#ffd4ed';
      roundedRect(ctx, finite(s.x) - .25, finite(s.y) - 1.8, .5, 3.6, .25); ctx.fill(); ctx.restore();
    }
    for (const item of state.drops || []) drop(item);
    paddle(state);
    for (const b of state.balls || []) ball(b, state.effects);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const r of rings) {
      const age = r.age / r.life;
      ctx.globalAlpha = reducedMotion ? .22 * (1 - age) : (1 - age) * .65;
      ctx.strokeStyle = r.color; ctx.lineWidth = .12 + (1 - age) * .25;
      ctx.beginPath(); ctx.arc(r.x, r.y, reducedMotion ? 2 : 1 + age * (r.large ? 26 : 8), 0, Math.PI * 2); ctx.stroke();
    }
    for (const p of particles) {
      ctx.globalAlpha = (1 - p.age / p.life) * .85; ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
    }
    ctx.restore(); ctx.restore();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (observer) observer.disconnect(); else window.removeEventListener('resize', resize);
    particles.length = 0; rings.length = 0; flashes.length = 0; trails.clear();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.remove(); canvas.width = 1; canvas.height = 1;
  }
  return { canvas, resize, render, screenToWorld, dispose };
}
