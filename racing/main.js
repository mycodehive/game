
import * as THREE from "./libs/three.module.js";
import {
  World,
  SAPBroadphase,
  Body,
  Plane,
  Box,
  Vec3,
  Quaternion,
  RaycastVehicle,
  Trimesh
} from "./libs/cannon-es.js";

const CAR = {
  mass: 1500,
  maxEngineForce: 3000,
  maxBrakeForce: 150,
  maxSteerAngle: 0.5,
  wheelRadius: 0.3,
  suspensionStiffness: 40,
  suspensionDamping: 3,
  suspensionRestLength: 0.3,
  frictionSlip: 2,
  rollInfluence: 0.05,
  cameraFollow: { distance: 8, height: 4, lookAhead: 4 }
};

const TRACKS = [
  { id: "oval-circuit", name: "Oval Circuit", difficulty: "beginner", width: 14, laps: 3, spline: [[0,0,100],[80,0,80],[100,0,0],[80,0,-80],[0,0,-100],[-80,0,-80],[-100,0,0],[-80,0,80]] },
  { id: "sunny-loop", name: "Sunny Loop", difficulty: "beginner", width: 14, laps: 3, spline: [[0,0,90],[70,0,70],[95,0,20],[90,0,-40],[40,0,-90],[-30,0,-95],[-90,0,-40],[-95,0,40],[-50,0,95]] },
  { id: "riverside-ring", name: "Riverside Ring", difficulty: "beginner", width: 14, laps: 3, spline: [[0,0,110],[60,0,95],[105,0,35],[95,0,-35],[45,0,-105],[-40,0,-110],[-95,0,-50],[-105,0,30],[-60,0,95]] },
  { id: "canyon-bends", name: "Canyon Bends", difficulty: "intermediate", width: 12, laps: 3, spline: [[0,0,120],[55,0,110],[110,0,70],[125,0,5],[95,0,-55],[40,0,-95],[-10,0,-120],[-70,0,-100],[-120,0,-40],[-105,0,40],[-55,0,95]] },
  { id: "harbor-dash", name: "Harbor Dash", difficulty: "intermediate", width: 12, laps: 3, spline: [[10,0,110],[85,0,100],[120,0,50],[105,0,-10],[125,0,-75],[50,0,-105],[-30,0,-110],[-105,0,-75],[-120,0,5],[-90,0,85],[-25,0,110]] },
  { id: "twin-curves", name: "Twin Curves", difficulty: "intermediate", width: 12, laps: 3, spline: [[0,0,125],[70,0,120],[120,0,80],[95,0,25],[40,0,0],[95,0,-30],[120,0,-90],[50,0,-125],[-20,0,-110],[-80,0,-70],[-110,0,-10],[-85,0,65],[-35,0,105]] },
  { id: "windmill-route", name: "Windmill Route", difficulty: "intermediate", width: 12, laps: 3, spline: [[0,0,115],[55,0,105],[100,0,70],[120,0,20],[100,0,-40],[65,0,-85],[15,0,-110],[-40,0,-115],[-90,0,-90],[-120,0,-30],[-110,0,40],[-75,0,85],[-20,0,110]] },
  { id: "dragon-spine", name: "Dragon Spine", difficulty: "pro", width: 10, laps: 4, spline: [[0,0,140],[45,0,130],[100,0,100],[140,0,45],[130,0,-10],[90,0,-40],[130,0,-90],[95,0,-135],[30,0,-145],[-25,0,-120],[-70,0,-80],[-130,0,-90],[-145,0,-25],[-120,0,35],[-85,0,95],[-35,0,130]] },
  { id: "apex-inferno", name: "Apex Inferno", difficulty: "pro", width: 10, laps: 4, spline: [[0,0,150],[60,0,145],[120,0,110],[155,0,45],[140,0,-20],[90,0,-45],[130,0,-100],[105,0,-150],[25,0,-160],[-45,0,-140],[-90,0,-95],[-150,0,-110],[-165,0,-20],[-130,0,50],[-85,0,120],[-25,0,150]] },
  { id: "night-needle", name: "Night Needle", difficulty: "pro", width: 10, laps: 4, spline: [[0,0,130],[40,0,120],[90,0,95],[120,0,55],[105,0,15],[65,0,-5],[95,0,-35],[125,0,-80],[85,0,-120],[20,0,-135],[-25,0,-115],[-65,0,-85],[-110,0,-95],[-130,0,-45],[-115,0,5],[-75,0,30],[-95,0,80],[-50,0,120]] }
];

const CONTROL_PRESETS = {
  single: {
    label: "PLAYER 1",
    accelerate: ["KeyW", "ArrowUp"],
    brake: ["KeyS", "ArrowDown"],
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    handbrake: ["Space"],
    boost: ["KeyQ"],
    reset: ["KeyR"]
  },
  p1: {
    label: "PLAYER 1",
    accelerate: ["KeyW"],
    brake: ["KeyS"],
    left: ["KeyA"],
    right: ["KeyD"],
    handbrake: ["Space"],
    boost: ["KeyQ"],
    reset: ["KeyR"]
  },
  p2: {
    label: "PLAYER 2",
    accelerate: ["ArrowUp"],
    brake: ["ArrowDown"],
    left: ["ArrowLeft"],
    right: ["ArrowRight"],
    handbrake: ["Numpad0", "Slash"],
    boost: ["ShiftRight"],
    reset: ["Enter"]
  }
};

const KEYSET = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyR",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space",
  "Numpad0", "Slash", "ShiftRight", "Enter"
]);
const keys = new Set();

function isTyping(target) {
  return target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}
window.addEventListener("keydown", (e) => {
  if (isTyping(e.target)) return;
  if (KEYSET.has(e.code) && document.getElementById("menu").childElementCount === 0 && !document.querySelector(".result-overlay")) e.preventDefault();
  if (KEYSET.has(e.code)) keys.add(e.code);
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => keys.clear());

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function readLocalRecords(trackId) {
  try {
    const data = JSON.parse(localStorage.getItem(`arcade-racing:${trackId}`) || "[]");
    return Array.isArray(data) ? data.filter((r) => Number.isFinite(r.totalTimeMs) && r.totalTimeMs > 0 && typeof r.player === "string").slice(0, 5) : [];
  } catch { return []; }
}

function pressed(codes) {
  return codes.some((c) => keys.has(c));
}

function getInput(controls) {
  const left = pressed(controls.left);
  const right = pressed(controls.right);
  return {
    accelerate: pressed(controls.accelerate),
    brake: pressed(controls.brake),
    steer: left && !right ? -1 : right && !left ? 1 : 0,
    handbrake: pressed(controls.handbrake),
    boost: pressed(controls.boost),
    resetCar: pressed(controls.reset)
  };
}

function formatMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "00:00.000";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const mm = Math.floor(ms % 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(mm).padStart(3, "0")}`;
}

function getBounds(points) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p[0]);
    maxX = Math.max(maxX, p[0]);
    minZ = Math.min(minZ, p[2]);
    maxZ = Math.max(maxZ, p[2]);
  }
  return { minX, maxX, minZ, maxZ };
}

function drawTrackThumbnail(track, canvas) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const pad = 14;
  const b = getBounds(track.spline);
  const sx = (w - pad * 2) / Math.max(1, b.maxX - b.minX);
  const sy = (h - pad * 2) / Math.max(1, b.maxZ - b.minZ);
  const scale = Math.min(sx, sy);

  ctx.fillStyle = "#0f1826";
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "rgba(0,170,255,0.20)");
  g.addColorStop(1, "rgba(255,68,68,0.12)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const map = (p) => ({
    x: ((p[0] - b.minX) * scale) + pad + ((w - pad * 2) - (b.maxX - b.minX) * scale) * 0.5,
    y: ((p[2] - b.minZ) * scale) + pad + ((h - pad * 2) - (b.maxZ - b.minZ) * scale) * 0.5
  });

  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  const samples = new THREE.CatmullRomCurve3(track.spline.map((p) => new THREE.Vector3(...p)), true, "catmullrom", 0.5).getSpacedPoints(120);
  const first = map(samples[0].toArray());
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < samples.length; i++) {
    const p = map(samples[i].toArray());
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.stroke();

  ctx.fillStyle = "#00ff88";
  ctx.beginPath();
  ctx.arc(first.x, first.y, 4, 0, Math.PI * 2);
  ctx.fill();
}

function createRoadArrowTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.moveTo(64, 18);
  ctx.lineTo(100, 60);
  ctx.lineTo(78, 60);
  ctx.lineTo(78, 108);
  ctx.lineTo(50, 108);
  ctx.lineTo(50, 60);
  ctx.lineTo(28, 60);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function createNameTagSprite(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 30px Courier New";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.8, 0.7, 1);
  sprite.position.set(0, 1.1, 0);
  return sprite;
}

class EngineAudio {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.lowpass = null;
    this.gain = null;
    this.osc1 = null;
    this.osc2 = null;
    this.noise = null;
    this.skidFilter = null;
    this.skidGain = null;
    this.skidSource = null;
    this.skidOn = false;
  }

  initGraph() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.lowpass = this.ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 800;
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0;
    this.osc1 = this.ctx.createOscillator();
    this.osc2 = this.ctx.createOscillator();
    this.osc1.type = "sawtooth";
    this.osc2.type = "sawtooth";
    this.osc1.frequency.value = 30;
    this.osc2.frequency.value = 60;
    const blend = this.ctx.createGain();
    blend.gain.value = 0.4;
    this.osc1.connect(this.lowpass);
    this.osc2.connect(blend);
    blend.connect(this.lowpass);
    this.lowpass.connect(this.gain);
    this.gain.connect(this.ctx.destination);

    const rate = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, rate, rate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < rate; i++) d[i] = Math.random() * 2 - 1;
    this.skidFilter = this.ctx.createBiquadFilter();
    this.skidFilter.type = "bandpass";
    this.skidFilter.frequency.value = 2000;
    this.skidGain = this.ctx.createGain();
    this.skidGain.gain.value = 0;
    this.skidFilter.connect(this.skidGain);
    this.skidGain.connect(this.ctx.destination);
  }
  async start() {
    if (this.started) return;
    this.initGraph();
    if (!this.ctx) return;
    this.started = true;
    await this.ctx.resume();
    this.osc1.start();
    this.osc2.start();
    this.gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
  }

  update(speed, accel, handbrake) {
    if (!this.started || !this.ctx) return;
    const t = this.ctx.currentTime;
    const target = 30 + Math.min(Math.abs(speed), 200) * 0.4;
    this.osc1.frequency.setTargetAtTime(target, t, 0.1);
    this.osc2.frequency.setTargetAtTime(target * 2, t, 0.1);
    const maxVol = accel ? 0.12 : 0.06;
    const level = 0.04 + (maxVol - 0.04) * Math.min(Math.abs(speed) / 100, 1);
    this.gain.gain.setTargetAtTime(level, t, 0.1);
    this.lowpass.frequency.setTargetAtTime(600 + Math.min(Math.abs(speed), 200) * 3, t, 0.1);
    this.updateSkid(handbrake && Math.abs(speed) > 5, t);
  }

  updateSkid(active, t) {
    if (active && !this.skidOn) {
      this.skidOn = true;
      this.skidSource = this.ctx.createBufferSource();
      this.skidSource.buffer = this.noise;
      this.skidSource.loop = true;
      this.skidSource.connect(this.skidFilter);
      this.skidSource.start();
      this.skidGain.gain.setTargetAtTime(0.05, t, 0.05);
    } else if (!active && this.skidOn) {
      this.skidOn = false;
      this.skidGain.gain.setTargetAtTime(0, t, 0.05);
      const s = this.skidSource;
      setTimeout(() => s && s.stop(), 120);
      this.skidSource = null;
    }
  }
}

class Game {
  constructor() {
    this.app = document.getElementById("app");
    this.hudRoot = document.getElementById("hud");
    this.menuRoot = document.getElementById("menu");
    this.splitDivider = document.getElementById("split-divider");
    this.loading = document.getElementById("loading-screen");
    this.loadingBar = document.getElementById("loading-bar");
    this.loadingText = document.getElementById("loading-text");

    this.clock = new THREE.Clock();
    this.fixedDt = 1 / 60;
    this.accum = 0;
    this.loopStarted = false;

    this.scene = null;
    this.physics = null;
    this.track = null;
    this.playerCount = 1;
    this.players = [];
    this.pendingNames = ["", ""];
    this.winner = null;
    this.trackTop5 = [];
    this.recordsSaved = false;
    this.started = false;
    this.finished = false;
    this.selectedMode = null;
    this.resultOverlay = null;
    this.paused = false;
    this.raceToken = 0;
    this.countdownRemaining = 0;
    this.recordSource = "이 기기의 기록";
    this.touchKeys = new Map();

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.app.insertBefore(this.renderer.domElement, this.loading);

    this.audio = new EngineAudio();
    this.bindResize();

    this.renderer.domElement.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.setPaused(true);
      showFatalError("3D 화면 연결이 끊어졌습니다. 페이지를 새로고침해 주세요.");
    });
    window.addEventListener("keydown", (e) => {
      if (isTyping(e.target) || e.repeat || e.code !== "Escape") return;
      if (this.players.length && !this.finished && !this.menuRoot.childElementCount) {
        e.preventDefault();
        this.setPaused(!this.paused);
      }
    });
    window.addEventListener("blur", () => this.setPaused(true));
    document.addEventListener("visibilitychange", () => { if (document.hidden) this.setPaused(true); });
    this.buildRaceControls();
  }

  clearInput() {
    keys.clear();
    this.touchKeys.clear();
    this.raceControls.querySelectorAll(".pressed").forEach((b) => b.classList.remove("pressed"));
  }

  stopRace() {
    this.raceToken++;
    this.started = false;
    this.paused = false;
    this.players = [];
    this.clearInput();
    this.countdownOverlay?.remove();
    this.pauseOverlay?.remove();
    this.raceControls.hidden = true;
    if (this.audio.ctx) this.audio.ctx.suspend().catch(() => {});
  }

  buildRaceControls() {
    this.raceControls = document.createElement("div");
    this.raceControls.id = "race-controls";
    this.raceControls.hidden = true;
    this.raceControls.innerHTML = `
      <div class="race-toolbar"><a class="tool-btn" href="../index.html">← PLAYROOM</a><button class="tool-btn" id="pause-race" aria-label="일시정지">Ⅱ 정지</button><button class="tool-btn" id="recover-car">↻ 차량 복구</button></div>
      <div class="touch-controls" aria-label="터치 운전 조작">
        <div class="touch-steer"><button data-key="KeyA" aria-label="왼쪽 조향">◀</button><button data-key="KeyD" aria-label="오른쪽 조향">▶</button></div>
        <div class="touch-drive"><button data-key="Space" class="touch-small" aria-label="핸드브레이크">드리프트</button><button data-key="KeyQ" class="touch-small" aria-label="부스트">부스트</button><button data-key="KeyS" aria-label="브레이크 및 후진">브레이크</button><button data-key="KeyW" class="touch-accelerate" aria-label="가속">가속 ↑</button></div>
      </div>`;
    this.app.appendChild(this.raceControls);
    this.raceControls.querySelector("#pause-race").addEventListener("click", () => this.setPaused(true));
    this.raceControls.querySelector("#recover-car").addEventListener("click", () => {
      if (this.started && !this.paused) this.recoverPlayer(this.players[0]);
    });
    this.raceControls.querySelectorAll("[data-key]").forEach((button) => {
      button.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        if (this.paused || this.finished) return;
        button.setPointerCapture(e.pointerId);
        this.touchKeys.set(e.pointerId, button.dataset.key);
        keys.add(button.dataset.key);
        button.classList.add("pressed");
      });
      const release = (e) => {
        const key = this.touchKeys.get(e.pointerId);
        this.touchKeys.delete(e.pointerId);
        if (![...this.touchKeys.values()].includes(key)) keys.delete(key);
        button.classList.remove("pressed");
      };
      button.addEventListener("pointerup", release);
      button.addEventListener("pointercancel", release);
      button.addEventListener("lostpointercapture", release);
    });
  }

  setPaused(value) {
    if (!this.players.length || this.finished || this.menuRoot.childElementCount || this.paused === value) return;
    this.paused = value;
    this.clearInput();
    this.accum = 0;
    this.clock.getDelta();
    this.pauseOverlay?.remove();
    if (!value) {
      if (this.audio.ctx) this.audio.ctx.resume().catch(() => {});
      return;
    }
    if (this.audio.ctx) this.audio.ctx.suspend().catch(() => {});
    const panel = document.createElement("div");
    panel.className = "result-overlay pause-overlay";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "pause-title");
    panel.innerHTML = `<div class="result-panel"><div class="eyebrow">PIT STOP</div><h2 id="pause-title" class="result-title">잠시 쉬어가세요</h2><p class="menu-sub">주행과 기록 측정이 멈췄습니다.</p><div class="pause-actions"><button class="menu-btn primary" id="resume-race">계속 달리기</button><button class="menu-btn" id="restart-race">처음부터 다시</button><button class="menu-btn" id="leave-race">트랙 선택</button></div><p class="pause-hint">ESC로 다시 달리기 · R로 차량 복구</p></div>`;
    this.pauseOverlay = panel;
    this.app.appendChild(panel);
    panel.querySelector("#resume-race").addEventListener("click", () => this.setPaused(false));
    panel.querySelector("#restart-race").addEventListener("click", () => this.startRace(this.track, this.playerCount).catch(showFatalError));
    panel.querySelector("#leave-race").addEventListener("click", () => this.buildTrackMenu());
    panel.querySelector("#resume-race").focus();
  }

  buildModeMenu() {
    this.stopRace();
    this.started = false;
    this.finished = false;
    this.selectedMode = null;
    this.players = [];
    this.hudRoot.classList.add("hud-hidden");
    this.hudRoot.innerHTML = "";
    this.splitDivider.style.display = "none";

    const container = document.createElement("div");
    container.className = "menu-overlay";
    container.innerHTML = `
      <nav class="menu-nav"><a href="../index.html">← PLAYROOM</a><span class="status-pill">LIVE · 실시간 3D</span></nav>
      <div class="mode-layout">
        <section class="mode-hero"><div class="eyebrow">APEX / RACING CLUB</div><h1 class="menu-title">코너를 넘어,<br><span>한계를 넘어.</span></h1><p class="menu-sub">엔진을 깨우고 나만의 레이싱 라인을 찾으세요.<br>10개의 서킷과 실제 차량 물리가 기다립니다.</p><div class="hero-car" aria-hidden="true"><div class="car-glow"></div><div class="car-body"><div class="car-window"></div><div class="car-stripe"></div></div><div class="car-wheel wheel-left"></div><div class="car-wheel wheel-right"></div><div class="speed-line line-one"></div><div class="speed-line line-two"></div></div><div class="hero-stats"><span><b>10</b>서킷</span><span><b>1–2</b>플레이어</span><span><b>3D</b>물리 주행</span></div></section>
        <section class="mode-panel"><div class="eyebrow">01 / 플레이 모드</div><h2>어떻게 달릴까요?</h2><p>이름을 입력하고 원하는 모드를 선택하세요.</p><label for="name-p1">플레이어 1 이름 <span>선택</span></label><input id="name-p1" class="menu-name-input" maxlength="14" placeholder="드라이버 1" autocomplete="nickname" /><label for="name-p2">플레이어 2 이름 <span>2인 모드 · 선택</span></label><input id="name-p2" class="menu-name-input" maxlength="14" placeholder="드라이버 2" />
          <div class="mode-buttons"><button class="menu-btn primary" id="one-player"><b>혼자 달리기 →</b><small>타임어택 · 터치 조작 지원</small></button><button class="menu-btn" id="two-player"><b>둘이 경쟁하기 →</b><small>한 화면, 두 드라이버 · 키보드 필요</small></button></div>
          <details class="control-guide"><summary>운전 조작 알아보기</summary><p><kbd>W</kbd> / <kbd>↑</kbd> 가속 · <kbd>S</kbd> / <kbd>↓</kbd> 브레이크·후진<br><kbd>A D</kbd> / <kbd>← →</kbd> 조향 · <kbd>Space</kbd> 드리프트<br><kbd>Q</kbd> 부스트 · <kbd>R</kbd> 차량 복구 · <kbd>Esc</kbd> 일시정지</p><p>2인: P1은 WASD / Space / Q / R,<br>P2는 방향키 / Numpad0 또는 / / 오른쪽 Shift / Enter.</p></details>
        </section>
      </div>`;
    this.menuRoot.innerHTML = "";
    this.menuRoot.appendChild(container);
    container.querySelector("#name-p1").value = this.pendingNames[0] || "";
    container.querySelector("#name-p2").value = this.pendingNames[1] || "";

    container.querySelector("#one-player").addEventListener("click", () => {
      this.pendingNames[0] = container.querySelector("#name-p1").value.trim();
      this.pendingNames[1] = container.querySelector("#name-p2").value.trim();
      this.selectedMode = 1;
      this.buildTrackMenu();
    });

    container.querySelector("#two-player").addEventListener("click", () => {
      this.pendingNames[0] = container.querySelector("#name-p1").value.trim();
      this.pendingNames[1] = container.querySelector("#name-p2").value.trim();
      this.selectedMode = 2;
      this.buildTrackMenu();
    });
  }

  buildTrackMenu() {
    this.stopRace();
    this.hudRoot.classList.add("hud-hidden");
    this.hudRoot.innerHTML = "";
    this.splitDivider.style.display = "none";

    const sections = [
      { id: "beginner", title: "01 / 입문 서킷 · 넓고 부드러운 코너" },
      { id: "intermediate", title: "02 / 챌린저 · 정교한 레이싱 라인" },
      { id: "pro", title: "03 / 프로 서킷 · 한계에 도전하기" }
    ];

    const container = document.createElement("div");
    container.className = "menu-overlay";
    container.innerHTML = `
      <nav class="menu-nav"><button class="tool-btn" id="back-mode">← 플레이 모드</button><span class="status-pill">${this.selectedMode}인 · ${this.selectedMode === 1 ? "타임어택" : "화면 분할 경쟁"}</span></nav>
      <div class="track-heading"><div class="eyebrow">02 / PICK YOUR CIRCUIT</div><h1 class="menu-title">오늘의 서킷을 선택하세요.</h1><p class="menu-sub">트랙을 선택하면 3초 뒤 출발합니다. 첫 주행은 입문 서킷을 추천해요.</p></div>
    `;

    for (const sec of sections) {
      const wrap = document.createElement("section");
      wrap.className = "menu-section";
      const h = document.createElement("h2");
      h.textContent = sec.title;
      const grid = document.createElement("div");
      grid.className = "menu-grid";

      const tracks = TRACKS.filter((t) => t.difficulty === sec.id);
      for (const track of tracks) {
        const btn = document.createElement("button");
        btn.className = "track-card";

        const canvas = document.createElement("canvas");
        canvas.className = "track-thumb";
        canvas.width = 320;
        canvas.height = 180;
        drawTrackThumbnail(track, canvas);
        btn.appendChild(canvas);

        const name = document.createElement("div");
        name.className = "track-name";
        name.textContent = track.name;
        btn.appendChild(name);

        const meta = document.createElement("div");
        meta.className = "track-meta";
        meta.textContent = `${track.laps}바퀴 · 폭 ${track.width}m · ${Math.round(new THREE.CatmullRomCurve3(track.spline.map((p) => new THREE.Vector3(...p)), true).getLength())}m / 바퀴`;
        btn.appendChild(meta);

        btn.addEventListener("click", () => {
          this.startRace(track, this.selectedMode).catch(showFatalError);
        });
        grid.appendChild(btn);
      }

      wrap.appendChild(h);
      wrap.appendChild(grid);
      container.appendChild(wrap);
    }

    this.menuRoot.innerHTML = "";
    this.menuRoot.appendChild(container);
    container.querySelector("#back-mode").addEventListener("click", () => this.buildModeMenu());
  }

  initHud() {
    this.hudRoot.classList.remove("hud-hidden");
    this.hudRoot.innerHTML = "";

    this.players.forEach((player, index) => {
      const panel = document.createElement("div");
      panel.className = `hud-player ${index === 0 ? "p1" : "p2"}`;
      panel.innerHTML = `
        <div class="hud-player-title">${escapeHtml(player.name)}</div>
        <div class="hud-player-speed">0 km/h</div>
        <div class="hud-player-lap">랩 1 / ${this.track.laps}</div>
        <div class="hud-player-time">00:00.000</div>
        <div class="boost-label">BOOST / Q</div><div class="boost-track"><div class="boost-fill"></div></div>
        <div class="hud-player-warning"></div>
      `;
      this.hudRoot.appendChild(panel);
      player.hud = {
        panel,
        speed: panel.querySelector(".hud-player-speed"),
        lap: panel.querySelector(".hud-player-lap"),
        time: panel.querySelector(".hud-player-time"),
        boost: panel.querySelector(".boost-fill"),
        warning: panel.querySelector(".hud-player-warning")
      };
    });

    this.rankingBox = document.createElement("div");
    this.rankingBox.className = "hud-ranking";
    this.rankingBox.innerHTML = `
      <div class="hud-ranking-title">${this.recordSource} · ${this.track.name}</div>
      <ul class="hud-ranking-list"></ul>
    `;
    this.hudRoot.appendChild(this.rankingBox);
    this.rankingListEl = this.rankingBox.querySelector(".hud-ranking-list");
    this.renderTrackRanking();

    if (this.playerCount === 1) {
      const hint = document.createElement("div");
      hint.className = "hud-controls-hint";
      hint.textContent = "W/↑ 가속 · S/↓ 브레이크 · A/D 조향 · Q 부스트 · R 복구 · ESC 정지";
      this.hudRoot.appendChild(hint);
      setTimeout(() => {
        hint.classList.add("fade-out");
        setTimeout(() => hint.remove(), 1000);
      }, 5000);
    }
  }

  renderTrackRanking() {
    if (!this.rankingListEl) return;
    this.rankingListEl.innerHTML = "";
    if (!Array.isArray(this.trackTop5) || this.trackTop5.length === 0) {
      const li = document.createElement("li");
      li.innerHTML = "<span>첫 기록에 도전하세요</span><span>—</span>";
      this.rankingListEl.appendChild(li);
      return;
    }

    this.trackTop5.slice(0, 5).forEach((r, idx) => {
      const li = document.createElement("li");
      const name = r.player || "Unknown";
      const t = formatMs(Number(r.totalTimeMs || 0));
      li.innerHTML = `<span>${idx + 1}. ${escapeHtml(name)}</span><span>${t}</span>`;
      this.rankingListEl.appendChild(li);
    });
  }

  setupRace(track, playerCount) {
    this.clearInput();
    this.pauseOverlay?.remove();
    this.countdownOverlay?.remove();
    this.paused = false;
    this.accum = 0;
    this.clock.getDelta();
    this.disposeScene();
    this.raceControls.hidden = false;
    this.raceControls.classList.toggle("single-player", playerCount === 1);
    this.hudRoot.classList.toggle("split-mode", playerCount === 2);
    this.track = track;
    this.playerCount = playerCount;
    this.started = false;
    this.finished = false;
    this.winner = null;
    this.recordsSaved = false;

    this.menuRoot.innerHTML = "";
    if (this.resultOverlay) {
      this.resultOverlay.remove();
      this.resultOverlay = null;
    }

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9baaba);
    this.scene.fog = new THREE.Fog(0x8196ae, 320, 800);

    this.physics = new World();
    this.physics.gravity.set(0, -9.82, 0);
    this.physics.broadphase = new SAPBroadphase(this.physics);
    this.physics.solver.iterations = 10;

    const points = this.track.spline.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    this.spline = new THREE.CatmullRomCurve3(points, true, "catmullrom", 0.5);
    this.bounds = getBounds(this.track.spline);
    this.checkpoints = [0, 0.25, 0.5, 0.75].map((t) => {
      const p = this.spline.getPointAt(t);
      const tan = this.spline.getTangentAt(t).normalize();
      return { position: [p.x, p.y, p.z], forward: [tan.x, tan.y, tan.z], width: this.track.width };
    });

    this.startPoint = this.spline.getPointAt(0);
    this.startTangent = this.spline.getTangentAt(0).normalize();
    this.startSide = new THREE.Vector3().crossVectors(this.startTangent, new THREE.Vector3(0, 1, 0)).normalize();
    this.startYaw = Math.atan2(this.startTangent.x, this.startTangent.z);

    this.initWorld();

    this.players = [];
    const controlList = this.playerCount === 1
      ? [CONTROL_PRESETS.single]
      : [CONTROL_PRESETS.p1, CONTROL_PRESETS.p2];

    for (let i = 0; i < this.playerCount; i++) {
      const customName = (this.pendingNames[i] || "").trim();
      const name = customName || controlList[i].label;
      this.players.push(this.createPlayer(i, controlList[i], name));
    }

    this.initHud();
    this.initMinimapForSingle();
    this.initParticles();

    this.splitDivider.style.display = this.playerCount === 2 ? "block" : "none";
  }
  initWorld() {
    const sun = new THREE.DirectionalLight(0xffe6c2, 2.5);
    sun.position.set(60, 65, 50);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -220;
    sun.shadow.camera.right = 220;
    sun.shadow.camera.top = 220;
    sun.shadow.camera.bottom = -220;
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0x829ac9, 0.9));
    this.scene.add(new THREE.HemisphereLight(0xb4c6f0, 0x17282c, 1.1));

    const skyGeo = new THREE.SphereGeometry(700, 32, 15);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        topColor: { value: new THREE.Color(0x253b67) },
        bottomColor: { value: new THREE.Color(0xd5c3ae) },
        offset: { value: 33 },
        exponent: { value: 0.6 }
      },
      vertexShader: `varying vec3 vWorldPosition; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vWorldPosition = w.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 topColor; uniform vec3 bottomColor; uniform float offset; uniform float exponent; varying vec3 vWorldPosition; void main(){ float h=normalize(vWorldPosition + offset).y; gl_FragColor=vec4(mix(bottomColor, topColor, max(pow(max(h,0.0), exponent), 0.0)),1.0); }`
    });
    this.scene.add(new THREE.Mesh(skyGeo, skyMat));

    const groundSize = Math.max(this.bounds.maxX - this.bounds.minX, this.bounds.maxZ - this.bounds.minZ) + 600;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(groundSize, groundSize),
      new THREE.MeshStandardMaterial({ color: 0x294740, roughness: 0.9 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const groundBody = new Body({ mass: 0, shape: new Plane() });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    groundBody.aabbNeedsUpdate = true;
    this.physics.addBody(groundBody);

    this.buildTrack();
    this.buildTrees(70);
  }

  buildTrack() {
    const half = this.track.width * 0.5;
    const pos = [];
    const uv = [];
    const idx = [];

    for (let i = 0; i <= 320; i++) {
      const t = i / 320;
      const p = this.spline.getPointAt(t);
      const tan = this.spline.getTangentAt(t).normalize();
      const side = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();
      const l = p.clone().addScaledVector(side, -half);
      const r = p.clone().addScaledVector(side, half);
      l.y += 0.01;
      r.y += 0.01;
      pos.push(l.x, l.y, l.z, r.x, r.y, r.z);
      uv.push(0, t, 1, t);
      if (i < 320) {
        const b = i * 2;
        idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();

    const road = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x25323f, roughness: 0.82 }));
    road.receiveShadow = true;
    this.scene.add(road);

    try {
      const roadBody = new Body({ mass: 0 });
      roadBody.addShape(new Trimesh(pos, idx));
      this.physics.addBody(roadBody);
    } catch (e) {
      console.warn("Road physics mesh failed; fallback to plane only.", e);
    }

    this.buildGuardrails();
    this.buildLaneMarks();
    this.buildStartLine();
    this.buildCheckpointGates();
  }

  buildGuardrails() {
    const sideOffset = this.track.width * 0.5 + 0.3;
    const len = 320;
    const unit = 6;
    const count = Math.floor(len / unit);
    const mat = new THREE.MeshStandardMaterial({ color: 0x577583, metalness: 0.6, roughness: 0.35 });

    for (let i = 0; i < count; i++) {
      const t1 = (i * unit) / len;
      const t2 = ((i + 1) * unit) / len;
      const tm = (t1 + t2) * 0.5;
      const p1 = this.spline.getPointAt(t1);
      const p2 = this.spline.getPointAt(t2);
      const pm = this.spline.getPointAt(tm);
      const tan = this.spline.getTangentAt(tm).normalize();
      const side = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();
      const segLen = p1.distanceTo(p2);
      const yaw = Math.atan2(tan.x, tan.z);

      for (const sign of [-1, 1]) {
        const c = pm.clone().addScaledVector(side, sign * sideOffset);
        c.y = 0.5;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1, segLen), mat);
        mesh.position.copy(c);
        mesh.rotation.y = yaw;
        mesh.castShadow = true;
        this.scene.add(mesh);

        const body = new Body({ mass: 0 });
        body.addShape(new Box(new Vec3(0.15, 0.5, segLen / 2)));
        body.position.set(c.x, c.y, c.z);
        body.quaternion.setFromEuler(0, yaw, 0);
        body.aabbNeedsUpdate = true;
        this.physics.addBody(body);
      }
    }
  }

  buildLaneMarks() {
    const count = Math.floor(this.spline.getLength() / 10);
    const centerGeo = new THREE.PlaneGeometry(0.3, 2.3).rotateX(-Math.PI / 2);
    const edgeGeo = new THREE.PlaneGeometry(0.2, 1.6).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    const sideDist = this.track.width * 0.5 - 0.3;

    for (let i = 0; i < count; i++) {
      const t = i / count;
      const p = this.spline.getPointAt(t);
      const tan = this.spline.getTangentAt(t).normalize();
      const yaw = Math.atan2(tan.x, tan.z);
      const side = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();

      const center = new THREE.Mesh(centerGeo, mat);
      center.position.set(p.x, p.y + 0.02, p.z);
      center.rotation.y = yaw;
      this.scene.add(center);

      const left = new THREE.Mesh(edgeGeo, mat);
      left.position.copy(p.clone().addScaledVector(side, -sideDist));
      left.position.y += 0.02;
      left.rotation.y = yaw;
      this.scene.add(left);

      const right = new THREE.Mesh(edgeGeo, mat);
      right.position.copy(p.clone().addScaledVector(side, sideDist));
      right.position.y += 0.02;
      right.rotation.y = yaw;
      this.scene.add(right);
    }

    const arrowTex = createRoadArrowTexture();
    const arrowMat = new THREE.MeshBasicMaterial({
      map: arrowTex,
      transparent: true,
      opacity: 0.82,
      depthWrite: false
    });
    const arrowGeo = new THREE.PlaneGeometry(1.8, 2.7).rotateX(-Math.PI / 2);
    const arrowCount = Math.max(20, Math.floor(this.spline.getLength() / 26));
    for (let i = 0; i < arrowCount; i++) {
      const t = i / arrowCount;
      const p = this.spline.getPointAt(t);
      const tan = this.spline.getTangentAt(t).normalize();
      const a = new THREE.Mesh(arrowGeo, arrowMat);
      a.position.set(p.x, p.y + 0.03, p.z);
      a.rotation.y = Math.atan2(tan.x, tan.z) + Math.PI;
      this.scene.add(a);
    }
  }

  buildStartLine() {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 32;
    const ctx = c.getContext("2d");
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 8; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? "#fff" : "#111";
        ctx.fillRect((x * c.width) / 8, (y * c.height) / 2, c.width / 8, c.height / 2);
      }
    }

    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(this.track.width, 2).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), roughness: 0.6 })
    );
    line.position.set(this.startPoint.x, this.startPoint.y + 0.02, this.startPoint.z);
    line.rotation.y = this.startYaw;
    this.scene.add(line);
  }

  buildCheckpointGates() {
    const geo = new THREE.PlaneGeometry(1, 3);
    for (const cp of this.checkpoints) {
      const gate = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color: 0x55f1d9, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false })
      );
      gate.scale.x = cp.width;
      gate.position.set(cp.position[0], 1.5, cp.position[2]);
      const f = new THREE.Vector3(cp.forward[0], cp.forward[1], cp.forward[2]);
      gate.lookAt(gate.position.clone().add(f));
      this.scene.add(gate);
      const arch = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x346274, emissive: 0x135c6e, emissiveIntensity: 0.75, roughness: 0.45 });
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 5.5, 0.45), mat);
        post.position.set(side * (cp.width / 2 + 0.5), 2.75, 0);
        arch.add(post);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(cp.width + 1.35, 0.3, 0.5), mat);
      beam.position.y = 5.5;
      arch.add(beam);
      arch.position.set(cp.position[0], 0, cp.position[2]);
      arch.rotation.y = Math.atan2(cp.forward[0], cp.forward[2]);
      this.scene.add(arch);
    }
  }

  buildTrees(count) {
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 3, 6);
    const crownGeo = new THREE.ConeGeometry(1.8, 8, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b });
    const crownMat = new THREE.MeshStandardMaterial({ color: 0x245e53 });
    const rx = (this.bounds.maxX - this.bounds.minX) * 0.6 + 110;
    const rz = (this.bounds.maxZ - this.bounds.minZ) * 0.6 + 110;
    const cx = (this.bounds.minX + this.bounds.maxX) * 0.5;
    const cz = (this.bounds.minZ + this.bounds.maxZ) * 0.5;

    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1 + Math.random() * 1.2;
      const x = cx + Math.cos(a) * rx * r;
      const z = cz + Math.sin(a) * rz * r;
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(x, 1.5, z);
      trunk.castShadow = true;
      this.scene.add(trunk);
      const crown = new THREE.Mesh(crownGeo, crownMat);
      crown.position.set(x, 4, z);
      crown.castShadow = true;
      this.scene.add(crown);
    }
  }

  createPlayer(index, controls, name) {
    const group = new THREE.Group();
    const chassisGroup = new THREE.Group();
    const color = index === 0 ? 0x3bdbcd : 0xfd9957;

    const base = new THREE.Mesh(new THREE.BoxGeometry(2, 0.4, 4), new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.55 }));
    base.castShadow = true;
    chassisGroup.add(base);

    const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 2), new THREE.MeshStandardMaterial({ color: 0x142e42, roughness: 0.15, metalness: 0.65 }));
    top.position.set(0, 0.37, -0.3);
    top.castShadow = true;
    chassisGroup.add(top);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.01, 3.95), new THREE.MeshStandardMaterial({ color: 0xf5ffff }));
    stripe.position.set(-0.42, 0.21, 0);
    chassisGroup.add(stripe);
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.12, 0.45), new THREE.MeshStandardMaterial({ color: 0x142535, metalness: 0.4, roughness: 0.35 }));
    spoiler.position.set(0, 0.55, -1.65);
    chassisGroup.add(spoiler);
    for (const side of [-1, 1]) {
      const headlight = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.13, 0.03), new THREE.MeshStandardMaterial({ color: 0xf1ffff, emissive: 0x9fe9ff, emissiveIntensity: 2 }));
      headlight.position.set(side * 0.64, 0.08, 2.01);
      chassisGroup.add(headlight);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.1, 0.03), new THREE.MeshStandardMaterial({ color: 0xf14a55, emissive: 0xf12233, emissiveIntensity: 1.5 }));
      tail.position.set(side * 0.62, 0.06, -2.01);
      chassisGroup.add(tail);
    }
    const nameTag = createNameTagSprite(name);
    chassisGroup.add(nameTag);
    group.add(chassisGroup);

    const wheelGeo = new THREE.CylinderGeometry(CAR.wheelRadius, CAR.wheelRadius, 0.3, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const wheelMeshes = [];
    for (let i = 0; i < 4; i++) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.castShadow = true;
      group.add(w);
      wheelMeshes.push(w);
    }

    this.scene.add(group);

    const chassisBody = new Body({ mass: CAR.mass, shape: new Box(new Vec3(1, 0.25, 2)) });
    this.physics.addBody(chassisBody);

    const vehicle = new RaycastVehicle({ chassisBody, indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2 });
    const wheelPos = [[-0.8,0,1.2],[0.8,0,1.2],[-0.8,0,-1.2],[0.8,0,-1.2]];
    for (const p of wheelPos) {
      vehicle.addWheel({
        radius: CAR.wheelRadius,
        suspensionStiffness: CAR.suspensionStiffness,
        dampingCompression: CAR.suspensionDamping,
        dampingRelaxation: CAR.suspensionDamping,
        suspensionRestLength: CAR.suspensionRestLength,
        frictionSlip: CAR.frictionSlip,
        rollInfluence: CAR.rollInfluence,
        directionLocal: new Vec3(0, -1, 0),
        axleLocal: new Vec3(1, 0, 0),
        chassisConnectionPointLocal: new Vec3(p[0], p[1], p[2]),
        maxSuspensionForce: 100000,
        maxSuspensionTravel: 0.3,
        customSlidingRotationalSpeed: -30,
        useCustomSlidingRotationalSpeed: true
      });
    }
    vehicle.addToWorld(this.physics);

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1300);
    const player = {
      index,
      name,
      controls,
      group,
      chassisGroup,
      wheelMeshes,
      chassisBody,
      vehicle,
      camera,
      cameraPos: new THREE.Vector3(0, 10, 20),
      cameraLook: new THREE.Vector3(),
      raceTime: 0,
      lapStartTime: 0,
      lapTimes: [],
      bestLap: Infinity,
      currentLap: 1,
      currentCheckpoint: 1,
      resetHeld: false,
      boostEnergy: 1,
      checkpointPreviousSide: null,
      finished: false,
      finishTime: null,
      hud: null,
      nameTag,
      wrongWay: false
    };

    this.resetPlayer(player, index === 0 ? -1 : 1);
    this.syncPlayerVisual(player);
    this.updateCamera(player, 1, 0);
    return player;
  }

  resetPlayer(player, sideSign = 0) {
    const p = this.startPoint.clone().add(this.startTangent.clone().multiplyScalar(-6)).add(this.startSide.clone().multiplyScalar(sideSign * 2.2));
    const q = new Quaternion();
    q.setFromEuler(0, this.startYaw, 0);
    player.chassisBody.position.set(p.x, 0.7, p.z);
    player.chassisBody.quaternion.copy(q);
    player.chassisBody.velocity.setZero();
    player.chassisBody.angularVelocity.setZero();
    player.chassisBody.aabbNeedsUpdate = true;

    for (let i = 0; i < 4; i++) {
      player.vehicle.applyEngineForce(0, i);
      player.vehicle.setBrake(0, i);
      player.vehicle.setSteeringValue(0, i);
    }
  }

  initMinimapForSingle() {
    this.minimapWrap = null;
    if (this.playerCount !== 1) return;

    this.minimapWrap = document.createElement("div");
    this.minimapWrap.className = "minimap";
    this.minimap = document.createElement("canvas");
    this.minimap.width = 150;
    this.minimap.height = 150;
    this.minimapWrap.appendChild(this.minimap);
    this.hudRoot.appendChild(this.minimapWrap);
    this.mctx = this.minimap.getContext("2d");

    const pad = 10;
    const span = 130;
    const b = this.bounds;
    const s = Math.min(span / Math.max(1, b.maxX - b.minX), span / Math.max(1, b.maxZ - b.minZ));
    const ox = ((span - (b.maxX - b.minX) * s) * 0.5) + pad;
    const oy = ((span - (b.maxZ - b.minZ) * s) * 0.5) + pad;
    this.mmScale = { b, s, ox, oy };
    this.mmSpline = this.spline.getSpacedPoints(120).map((p) => ({ x: (p.x - b.minX) * s + ox, y: (p.z - b.minZ) * s + oy }));
    this.mmCp = this.checkpoints.map((cp) => ({ x: (cp.position[0] - b.minX) * s + ox, y: (cp.position[2] - b.minZ) * s + oy }));
  }
  initParticles() {
    this.dustMax = 100;
    this.dustPos = new Float32Array(this.dustMax * 3);
    this.dustAlive = Array.from({ length: this.dustMax }, () => ({ alive: false, age: 0, life: 1 }));
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.dustPos, 3));
    const m = new THREE.PointsMaterial({ color: 0xcccccc, size: 0.3, transparent: true, opacity: 1, depthWrite: false });
    this.dust = new THREE.Points(g, m);
    this.scene.add(this.dust);
    for (let i = 0; i < this.dustMax; i++) this.dustPos[i * 3 + 1] = -1000;
  }

  applyInput(player, dt) {
    const i = getInput(player.controls);
    const steer = -i.steer * CAR.maxSteerAngle / (1 + Math.abs(this.getSpeed(player)) / 150);
    player.vehicle.setSteeringValue(steer, 0);
    player.vehicle.setSteeringValue(steer, 1);

    const boosting = i.boost && i.accelerate && player.boostEnergy > 0;
    player.boostEnergy = Math.max(0, Math.min(1, player.boostEnergy + (boosting ? -0.28 : 0.13) * dt));
    const power = boosting ? 2.4 : 1;
    const engine = ((i.brake ? 1 : 0) - (i.accelerate ? 1 : 0)) * CAR.maxEngineForce * power;
    player.vehicle.applyEngineForce(engine, 2);
    player.vehicle.applyEngineForce(engine, 3);

    for (let w = 0; w < 4; w++) player.vehicle.setBrake(0, w);
    if (i.handbrake) {
      player.vehicle.setBrake(CAR.maxBrakeForce * 2, 2);
      player.vehicle.setBrake(CAR.maxBrakeForce * 2, 3);
    }
    if (i.resetCar && !player.resetHeld) this.recoverPlayer(player);
    player.resetHeld = i.resetCar;
    return i;
  }

  applyNeutral(player) {
    player.vehicle.setSteeringValue(0, 0);
    player.vehicle.setSteeringValue(0, 1);
    player.vehicle.applyEngineForce(0, 2);
    player.vehicle.applyEngineForce(0, 3);
    for (let i = 0; i < 4; i++) player.vehicle.setBrake(0, i);
  }

  getSpeed(player) {
    const v = player.chassisBody.velocity;
    const forward = new Vec3(0, 0, 1);
    player.chassisBody.quaternion.vmult(forward, forward);
    return -v.dot(forward) * 3.6;
  }

  syncPlayerVisual(player) {
    const p = player.chassisBody.position;
    const q = player.chassisBody.quaternion;
    player.chassisGroup.position.set(p.x, p.y, p.z);
    player.chassisGroup.quaternion.set(q.x, q.y, q.z, q.w);

    for (let i = 0; i < 4; i++) {
      player.vehicle.updateWheelTransform(i);
      const wt = player.vehicle.wheelInfos[i].worldTransform;
      player.wheelMeshes[i].position.set(wt.position.x, wt.position.y, wt.position.z);
      player.wheelMeshes[i].quaternion.set(wt.quaternion.x, wt.quaternion.y, wt.quaternion.z, wt.quaternion.w);
    }
  }

  updateCamera(player, dt, speed) {
    const target = player.chassisGroup.position.clone();
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(player.chassisGroup.quaternion);
    const back = forward.clone().negate();

    const desiredPos = target.clone().addScaledVector(back, CAR.cameraFollow.distance);
    desiredPos.y = target.y + CAR.cameraFollow.height;
    const desiredLook = target.clone().addScaledVector(forward, CAR.cameraFollow.lookAhead);

    const a = 1 - Math.exp(-5 * dt);
    player.cameraPos.lerp(desiredPos, a);
    player.cameraLook.lerp(desiredLook, a);

    const vfov = 60 + (75 - 60) * Math.min(Math.abs(speed) / 220, 1);
    player.camera.fov += (vfov - player.camera.fov) * a;
    player.camera.position.copy(player.cameraPos);
    player.camera.lookAt(player.cameraLook);
  }

  updateRace(player, dt) {
    if (!this.started || player.finished) return;
    player.raceTime += dt;

    const cp = this.checkpoints[player.currentCheckpoint];
    const p = player.chassisGroup.position;
    const dx = p.x - cp.position[0];
    const dz = p.z - cp.position[2];
    const side = dx * cp.forward[0] + dz * cp.forward[2];
    const across = Math.abs(dx * cp.forward[2] - dz * cp.forward[0]);
    // Count only forward crossings, in quarter-circuit order, then across the start line.
    const crossed = player.checkpointPreviousSide !== null && player.checkpointPreviousSide < 0 && side >= 0;
    player.checkpointPreviousSide = side;
    if (!crossed || across > this.track.width * 0.5 + 1 || p.y > 4) return;
    if (player.currentCheckpoint !== 0) {
      player.currentCheckpoint = (player.currentCheckpoint + 1) % this.checkpoints.length;
      player.checkpointPreviousSide = null;
      return;
    }
    const lap = player.raceTime - player.lapStartTime;
    player.lapTimes.push(lap);
    player.bestLap = Math.min(player.bestLap, lap);
    player.lapStartTime = player.raceTime;
    player.currentCheckpoint = 1;
    player.checkpointPreviousSide = null;
    if (player.currentLap >= this.track.laps) {
      player.finished = true;
      player.finishTime = player.raceTime;
      this.onPlayerFinished(player);
    } else {
      player.currentLap++;
    }
  }

  disposeScene() {
    if (!this.scene) return;
    const geometries = new Set(), materials = new Set(), textures = new Set();
    this.scene.traverse((node) => {
      if (node.geometry) geometries.add(node.geometry);
      if (node.material) for (const mat of (Array.isArray(node.material) ? node.material : [node.material])) materials.add(mat);
    });
    for (const mat of materials) {
      for (const value of Object.values(mat)) if (value?.isTexture) textures.add(value);
      mat.dispose();
    }
    for (const geo of geometries) geo.dispose();
    for (const tex of textures) tex.dispose();
  }

  recoverPlayer(player) {
    // Recover on the current circuit section without skipping the next checkpoint.
    const lastGate = (player.currentCheckpoint + 3) % 4;
    const t = (lastGate / 4 + 0.015) % 1;
    const point = this.spline.getPointAt(t), tangent = this.spline.getTangentAt(t).normalize();
    const side = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();
    point.addScaledVector(side, this.playerCount === 2 ? (player.index === 0 ? -2 : 2) : 0);
    player.chassisBody.position.set(point.x, 0.8, point.z);
    player.chassisBody.quaternion.setFromEuler(0, Math.atan2(tangent.x, tangent.z), 0);
    player.chassisBody.velocity.setZero();
    player.chassisBody.angularVelocity.setZero();
    player.chassisBody.aabbNeedsUpdate = true;
    player.checkpointPreviousSide = null;
    this.applyNeutral(player);
    this.syncPlayerVisual(player);
    this.updateCamera(player, 1, 0);
  }

  async fetchTrackTop5(trackId) {
    const local = readLocalRecords(trackId);
    this.recordSource = "이 기기의 기록";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    try {
      const res = await fetch(`/api/records?trackId=${encodeURIComponent(trackId)}`, { signal: controller.signal });
      if (!res.ok) return local;
      const data = await res.json();
      if (!Array.isArray(data.top5)) return local;
      this.recordSource = "온라인 TOP 5";
      return data.top5;
    } catch { return local; }
    finally { clearTimeout(timer); }
  }

  async saveRecord(trackId, player) {
    if (!player || !player.finishTime) return;
    const payload = {
      trackId, player: player.name,
      totalTimeMs: Math.round(player.finishTime * 1000),
      bestLapMs: Number.isFinite(player.bestLap) ? Math.round(player.bestLap * 1000) : 0
    };
    try {
      const records = [...readLocalRecords(trackId), payload].sort((a, b) => a.totalTimeMs - b.totalTimeMs).slice(0, 5);
      localStorage.setItem(`arcade-racing:${trackId}`, JSON.stringify(records));
    } catch { /* Private mode still permits racing without persisted records. */ }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    try {
      await fetch("/api/records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: controller.signal });
    } catch { /* Local records remain available when no record server is installed. */ }
    finally { clearTimeout(timer); }
  }

  async persistRaceRecords(playersToSave) {
    if (this.recordsSaved || !this.track) return;
    this.recordsSaved = true;
    const trackId = this.track.id;
    const token = this.raceToken;
    const list = (playersToSave || []).filter((p) => p && p.finishTime);
    for (const p of list) {
      await this.saveRecord(trackId, p);
    }
    const top5 = await this.fetchTrackTop5(trackId);
    if (token !== this.raceToken) return;
    this.trackTop5 = top5;
    this.renderTrackRanking();
  }

  onPlayerFinished(player) {
    if (this.playerCount === 1) {
      this.started = false;
      this.finished = true;
      this.winner = player;
      this.persistRaceRecords([player]);
      this.showSingleResult(player);
      return;
    }

    if (this.winner) return;
    this.winner = player;
    this.started = false;
    this.finished = true;
    const loser = this.players.find((p) => p !== player);
    this.persistRaceRecords([player]);
    this.showMultiResult(player, loser);
  }

  getNearestTrackT(position) {
    let bestT = 0;
    let bestDist = Infinity;
    const samples = 140;
    for (let i = 0; i < samples; i++) {
      const t = i / samples;
      const p = this.spline.getPointAt(t);
      const d = p.distanceToSquared(position);
      if (d < bestDist) {
        bestDist = d;
        bestT = t;
      }
    }
    return bestT;
  }

  updateWrongWay(player, speed) {
    if (!this.started || player.finished || Math.abs(speed) < 25) {
      player.wrongWay = false;
      return;
    }

    const t = this.getNearestTrackT(player.chassisGroup.position);
    const tangent = this.spline.getTangentAt(t).normalize();
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(player.chassisGroup.quaternion).normalize();
    player.wrongWay = forward.dot(tangent) < -0.22;
  }

  updatePlayerHud(player, speed) {
    if (!player.hud) return;
    player.hud.speed.textContent = `${Math.round(Math.abs(speed))} km/h`;
    player.hud.lap.textContent = `랩 ${Math.min(player.currentLap, this.track.laps)} / ${this.track.laps} · 체크 ${player.currentCheckpoint === 0 ? 3 : player.currentCheckpoint - 1}/3`;
    player.hud.time.textContent = formatMs(player.raceTime * 1000);
    player.hud.boost.style.width = `${Math.round(player.boostEnergy * 100)}%`;
    player.hud.warning.textContent = player.wrongWay ? "역주행입니다! 반대로 가세요!" : "";
  }

  updateMinimap() {
    if (this.playerCount !== 1 || !this.mctx) return;

    const car = this.players[0];
    const c = this.mctx;
    c.clearRect(0, 0, 150, 150);
    c.strokeStyle = "rgba(255,255,255,.4)";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(this.mmSpline[0].x, this.mmSpline[0].y);
    for (let i = 1; i < this.mmSpline.length; i++) c.lineTo(this.mmSpline[i].x, this.mmSpline[i].y);
    c.closePath();
    c.stroke();

    c.fillStyle = "#00ff88";
    for (const p of this.mmCp) {
      c.beginPath();
      c.arc(p.x, p.y, 3, 0, Math.PI * 2);
      c.fill();
    }

    const { b, s, ox, oy } = this.mmScale;
    const x = (car.chassisGroup.position.x - b.minX) * s + ox;
    const y = (car.chassisGroup.position.z - b.minZ) * s + oy;
    c.fillStyle = "#ff4444";
    c.beginPath();
    c.arc(x, y, 4, 0, Math.PI * 2);
    c.fill();
  }

  updateDust(dt) {
    const car = this.players[0];
    if (!car) return;
    const p = car.chassisGroup.position;
    const speed = this.getSpeed(car);

    for (let i = 0; i < this.dustMax; i++) {
      const d = this.dustAlive[i];
      if (!d.alive) continue;
      d.age += dt;
      if (d.age > d.life) {
        d.alive = false;
        this.dustPos[i * 3 + 1] = -1000;
        continue;
      }
      this.dustPos[i * 3 + 1] += 0.5 * dt;
    }

    if (Math.abs(speed) > 30) {
      let add = Math.min(3, Math.floor(Math.abs(speed) / 30));
      for (let i = 0; i < this.dustMax && add > 0; i++) {
        const d = this.dustAlive[i];
        if (d.alive) continue;
        d.alive = true;
        d.age = 0;
        d.life = 0.8 + Math.random() * 0.4;
        this.dustPos[i * 3] = p.x + (Math.random() - 0.5) * 1.5;
        this.dustPos[i * 3 + 1] = p.y + 0.1;
        this.dustPos[i * 3 + 2] = p.z + (Math.random() - 0.5) * 1.5;
        add--;
      }
    }

    this.dust.geometry.attributes.position.needsUpdate = true;
  }

  maybeFinishRace() {
    if (!this.started || this.finished) return;
    if (!this.players.every((p) => p.finished)) return;

    this.started = false;
    this.finished = true;

    if (this.playerCount === 1) {
      const p = this.players[0];
      this.winner = p;
      this.persistRaceRecords([p]);
      this.showSingleResult(p);
    } else {
      const sorted = [...this.players].sort((a, b) => a.finishTime - b.finishTime);
      this.winner = sorted[0];
      this.persistRaceRecords(sorted.filter((p) => p.finishTime));
      this.showMultiResult(sorted[0], sorted[1]);
    }
  }

  showSingleResult(p) {
    const wrap = document.createElement("div");
    wrap.className = "result-overlay";
    wrap.innerHTML = `
      <div class="result-panel">
        <div class="result-title">${escapeHtml(p.name)} 완주!</div>
        <div class="result-total-time">${formatMs(p.raceTime * 1000)}</div>
        <div class="result-best-lap">베스트 랩: ${formatMs(p.bestLap * 1000)}</div>
        <ul class="result-lap-list">
          ${p.lapTimes.map((t, i) => `<li class="${t === p.bestLap ? "best" : ""}"><span>랩 ${i + 1}</span><span>${formatMs(t * 1000)}</span></li>`).join("")}
        </ul>
        <button class="result-restart-btn" id="retry-btn">다시 달리기</button>
        <button class="result-restart-btn" id="menu-btn" style="margin-left:8px;border-color:#ffffff88;">트랙 선택</button>
      </div>
    `;
    this.mountResult(wrap);
  }

  showMultiResult(winner, loser) {
    const wrap = document.createElement("div");
    wrap.className = "result-overlay";
    wrap.innerHTML = `
      <div class="result-panel">
        <div class="result-title">${escapeHtml(winner.name)} 우승!</div>
        <div class="result-total-time">${escapeHtml(winner.name)}: ${formatMs(winner.finishTime * 1000)}</div>
        <div class="result-best-lap">${escapeHtml(loser.name)}: ${loser.finished ? formatMs(loser.finishTime * 1000) : `미완주 · ${loser.currentLap}바퀴 주행 중`}</div>
        <ul class="result-lap-list">
          <li><span>${escapeHtml(winner.name)} 베스트 랩</span><span>${formatMs(winner.bestLap * 1000)}</span></li>
          <li><span>${escapeHtml(loser.name)} 베스트 랩</span><span>${Number.isFinite(loser.bestLap) ? formatMs(loser.bestLap * 1000) : "—"}</span></li>
        </ul>
        <button class="result-restart-btn" id="retry-btn">다시 달리기</button>
        <button class="result-restart-btn" id="menu-btn" style="margin-left:8px;border-color:#ffffff88;">트랙 선택</button>
      </div>
    `;
    this.mountResult(wrap);
  }

  mountResult(wrap) {
    this.clearInput();
    this.raceControls.hidden = true;
    if (this.audio.ctx) this.audio.ctx.suspend().catch(() => {});
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    if (this.resultOverlay) this.resultOverlay.remove();
    this.resultOverlay = wrap;
    this.app.appendChild(wrap);

    wrap.querySelector("#retry-btn").focus();
    wrap.querySelector("#retry-btn").addEventListener("click", () => {
      wrap.remove();
      this.resultOverlay = null;
      this.startRace(this.track, this.playerCount).catch(showFatalError);
    });

    wrap.querySelector("#menu-btn").addEventListener("click", () => {
      wrap.remove();
      this.resultOverlay = null;
      this.buildTrackMenu();
    });
  }

  async startRace(track, playerCount) {
    const token = ++this.raceToken;
    this.started = false;
    this.paused = true;
    this.raceControls.hidden = true;
    this.clearInput();
    this.pauseOverlay?.remove();
    this.menuRoot.querySelectorAll("button").forEach((b) => b.disabled = true);
    this.audio.start().catch(() => {});
    if (this.audio.ctx) this.audio.ctx.resume().catch(() => {});
    const records = await this.fetchTrackTop5(track.id);
    if (token !== this.raceToken) return;
    this.trackTop5 = records;
    this.setupRace(track, playerCount);
    this.countdownRemaining = 3;
    this.countdownOverlay = document.createElement("div");
    this.countdownOverlay.className = "countdown-overlay";
    this.countdownOverlay.innerHTML = '<span class="countdown-number">3</span><span class="countdown-caption">출발 준비</span>';
    this.app.appendChild(this.countdownOverlay);
    this.clock.getDelta();
  }

  renderScene() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    if (this.playerCount === 1) {
      const p = this.players[0];
      p.camera.aspect = width / height;
      p.camera.updateProjectionMatrix();
      this.renderer.setViewport(0, 0, width, height);
      this.renderer.setScissorTest(false);
      this.renderer.render(this.scene, p.camera);
      return;
    }

    this.renderer.setScissorTest(true);
    const halfW = Math.floor(width / 2);

    const p1 = this.players[0];
    const p2 = this.players[1];

    p1.camera.aspect = halfW / height;
    p1.camera.updateProjectionMatrix();
    this.renderer.setViewport(0, 0, halfW, height);
    this.renderer.setScissor(0, 0, halfW, height);
    this.renderer.render(this.scene, p1.camera);

    p2.camera.aspect = halfW / height;
    p2.camera.updateProjectionMatrix();
    this.renderer.setViewport(halfW, 0, width - halfW, height);
    this.renderer.setScissor(halfW, 0, width - halfW, height);
    this.renderer.render(this.scene, p2.camera);

    this.renderer.setScissorTest(false);
  }

  bindResize() {
    window.addEventListener("resize", () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  async start() {
    this.loadingText.textContent = "플레이 메뉴를 준비하고 있습니다…";
    this.loadingBar.style.width = "50%";
    await new Promise((r) => setTimeout(r, 120));
    this.loadingText.textContent = "3D 엔진 준비 완료";
    this.loadingBar.style.width = "100%";
    await new Promise((r) => setTimeout(r, 120));
    this.loading.style.opacity = "0";
    setTimeout(() => (this.loading.style.display = "none"), 500);

    this.buildModeMenu();

    if (!this.loopStarted) {
      this.loopStarted = true;
      this.loop();
    }
  }

  loop = () => {
    requestAnimationFrame(this.loop);
    if (!this.scene || this.players.length === 0) return;

    const dt = Math.min(this.clock.getDelta(), 0.1);

    if (this.paused || this.finished) { this.renderScene(); return; }
    if (!this.started && this.countdownRemaining > 0) {
      this.countdownRemaining -= dt;
      const number = Math.max(1, Math.ceil(this.countdownRemaining));
      this.countdownOverlay.querySelector(".countdown-number").textContent = number;
      if (this.countdownRemaining <= 0) {
        this.countdownOverlay.remove();
        this.started = true;
      }
    }
    // Apply vehicle forces before the next physics step, then read the updated pose.
    for (const player of this.players) {
      if (this.started && !player.finished) this.applyInput(player, dt);
      else this.applyNeutral(player);
    }
    this.accum += dt;
    while (this.accum >= this.fixedDt) {
      this.physics.step(this.fixedDt);
      this.accum -= this.fixedDt;
    }
    for (const player of this.players) {
      this.syncPlayerVisual(player);
      const speed = this.getSpeed(player);
      this.updateRace(player, this.started ? dt : 0);
      this.updateWrongWay(player, speed);
      this.updatePlayerHud(player, speed);
      this.updateCamera(player, dt, speed);
    }
    if (this.started) {
      const p0 = this.players[0], input0 = getInput(p0.controls);
      this.audio.update(this.getSpeed(p0), input0.accelerate, input0.handbrake);
    }

    this.updateMinimap();
    this.updateDust(dt);
    this.maybeFinishRace();
    this.renderScene();
  };
}

const loadingTextEl = document.getElementById("loading-text");
const loadingBarEl = document.getElementById("loading-bar");

function showFatalError(error) {
  console.error(error);
  const loading = document.getElementById("loading-screen");
  loading.style.display = "block";
  loading.style.opacity = "1";
  loadingTextEl.textContent = typeof error === "string" ? error : "3D 게임을 시작할 수 없습니다. WebGL과 하드웨어 가속이 활성화된 브라우저에서 다시 시도해 주세요.";
  loadingBarEl.style.width = "100%";
  if (!loading.querySelector(".error-actions")) {
    const actions = document.createElement("div");
    actions.className = "error-actions";
    actions.innerHTML = '<button class="menu-btn primary" id="reload-game">다시 시도</button><a class="menu-btn" href="../index.html">PLAYROOM</a>';
    actions.querySelector("button").addEventListener("click", () => location.reload());
    loading.querySelector(".loading-inner").appendChild(actions);
  }
}
try {
  const game = new Game();
  game.start().catch(showFatalError);
} catch (error) { showFatalError(error); }
