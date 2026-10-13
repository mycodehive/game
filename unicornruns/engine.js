// Closed courses use arc-distance lookup, so steering cannot skip checkpoints or laps.
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const SAMPLE_COUNT = 1024;
const representativeCourses = [
  { id: 'forest', name: '숲속 오솔길', laps: 1, color: '#77e9a5', description: '초록 숲을 가로지르는 넓고 부드러운 1랩 코스.', width: 10, points: [[0, -44], [32, -32], [45, 0], [30, 35], [0, 42], [-38, 30], [-49, 0], [-31, -33]] },
  { id: 'cloud', name: '구름 위 드라이브', laps: 2, color: '#83d8ff', description: '구름 위를 크게 돌아 나오는 긴 2랩 코스.', width: 9, points: [[0, -52], [38, -48], [61, -16], [55, 20], [28, 45], [-10, 50], [-52, 28], [-61, -12], [-38, -43]] },
  { id: 'star', name: '별빛 은하수', laps: 3, color: '#d5a0ff', description: '둥근 별 모양 커브를 따라 달리는 3랩 코스.', width: 8, points: Array.from({ length: 12 }, (_, index) => { const angle = -Math.PI / 2 + index * Math.PI / 6, radius = index % 2 ? 46 : 65; return [Math.cos(angle) * radius * 1.05, Math.sin(angle) * radius * .88]; }) }
];
// Ten playable layouts in each tier; geometry varies in size, aspect and bends.
export const DIFFICULTIES = Object.freeze([
  Object.freeze({ id: 'easy', name: '초급', description: '넓은 숲길에서 즐기는 1랩 달리기.', laps: 1, color: '#77e9a5' }),
  Object.freeze({ id: 'medium', name: '중급', description: '긴 구름 코스에서 즐기는 2랩 달리기.', laps: 2, color: '#83d8ff' }),
  Object.freeze({ id: 'hard', name: '고급', description: '다양한 별빛 커브에 도전하는 3랩 달리기.', laps: 3, color: '#d5a0ff' })
]);
const COURSE_NAMES = [
  ['숲속 오솔길', '이슬 호수길', '버섯 마을 산책로', '꽃잎 바람길', '새싹 언덕', '반딧불 연못', '고요한 솔숲', '나비 정원', '황금잎 둘레길', '초록 무지개길'],
  ['구름 위 드라이브', '솜사탕 회랑', '푸른 하늘 고리', '햇살 구름 곡선', '바람의 산책길', '새벽 안개 도로', '비행선 둘레길', '저녁 노을 링', '오로라 구름길', '천상의 물결길'],
  ['별빛 은하수', '혜성 꼬리 회랑', '유성 폭포 곡선', '달그림자 고리', '토성의 리본', '성운 소용돌이', '북극성 궤도', '수정별 회랑', '은빛 우주 물결', '초신성 서킷']
];
function generatedCoursePoints(tier, courseIndex) {
  const count = (tier === 2 ? 10 : 8) + ((courseIndex + tier) % 3) * 2;
  const radius = [44, 55, 62][tier] + (courseIndex - 1) * 1.15;
  const phase = courseIndex * .73 + tier * .41;
  const amplitude = [.055, .09, .14][tier] + (courseIndex % 3) * .008;
  const secondary = [.035, .05, .07][tier];
  const aspectX = [1.05, 1.12, 1.02][tier] + Math.sin(courseIndex * 1.2) * .055;
  const aspectZ = [.87, .89, .94][tier] + Math.cos(courseIndex * .9) * .055;
  return Array.from({ length: count }, (_, index) => {
    const baseAngle = -Math.PI / 2 + index * Math.PI * 2 / count;
    const angle = baseAngle + Math.sin(baseAngle * 2 + phase) * .035;
    const variation = 1 + Math.sin(baseAngle * (2 + courseIndex % 3) + phase) * amplitude + Math.cos(baseAngle * (5 + courseIndex % 2) - phase) * secondary;
    return [Math.cos(angle) * radius * variation * aspectX, Math.sin(angle) * radius * variation * aspectZ];
  });
}
const definitions = DIFFICULTIES.flatMap((difficulty, tier) => {
  const representative = representativeCourses[tier];
  return Array.from({ length: 10 }, (_, index) => {
    const courseIndex = index + 1;
    return {
      ...representative,
      id: index === 0 ? representative.id : `${representative.id}-${String(courseIndex).padStart(2, '0')}`,
      name: COURSE_NAMES[tier][index], difficulty: difficulty.id,
      theme: representative.id, courseIndex,
      description: index === 0 ? representative.description : `${difficulty.name} ${courseIndex}번 코스 · ${difficulty.laps}랩. 코스마다 서로 다른 크기와 곡선을 달립니다.`,
      points: index === 0 ? representative.points : generatedCoursePoints(tier, courseIndex)
    };
  });
});
function splinePoint(points, progress) {
  const location = progress * points.length, index = Math.floor(location) % points.length, t = location - Math.floor(location);
  const at = offset => points[(index + offset + points.length) % points.length];
  const p0 = at(-1), p1 = at(0), p2 = at(1), p3 = at(2), t2 = t * t, t3 = t2 * t;
  return { x: .5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3), z: .5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3) };
}
const tracks = new Map();
export const MAPS = Object.freeze(definitions.map(definition => {
  const points = Object.freeze(definition.points.map(([x, z]) => Object.freeze({ x, z })));
  const samples = [], distances = [0];
  for (let index = 0; index <= SAMPLE_COUNT; index++) {
    const point = splinePoint(points, index / SAMPLE_COUNT);
    samples.push(point);
    if (index) distances.push(distances[index - 1] + Math.hypot(point.x - samples[index - 1].x, point.z - samples[index - 1].z));
  }
  const length = distances[SAMPLE_COUNT];
  tracks.set(definition.id, { samples, distances, length });
  return Object.freeze({ ...definition, points, length });
}));
function mapFor(id) { return MAPS.find(map => map.id === id) || MAPS[0]; }
export function sampleTrack(mapId, progress) {
  const map = mapFor(mapId), track = tracks.get(map.id);
  const wrapped = ((finite(progress) % 1) + 1) % 1, distance = wrapped * track.length;
  let low = 0, high = SAMPLE_COUNT;
  while (low + 1 < high) { const middle = (low + high) >> 1; if (track.distances[middle] <= distance) low = middle; else high = middle; }
  const first = track.samples[low], next = track.samples[low + 1];
  const fraction = (distance - track.distances[low]) / (track.distances[low + 1] - track.distances[low]);
  return { x: first.x + (next.x - first.x) * fraction, z: first.z + (next.z - first.z) * fraction, yaw: Math.atan2(next.x - first.x, next.z - first.z) };
}

export function createGame() {
  const state = { phase: 'select', pausePhase: null, mapId: 'forest', lap: 1, completedLaps: 0, countdown: 0, elapsed: 0, player: { progress: 0, lateral: 0, speed: 0, x: 0, z: 0, yaw: 0, offTrack: false } };
  let events = [], lastCountdown = 3;
  const emit = (type, extra = {}) => {
    if (events.length >= 64) events.shift();
    events.push({ type, mapId: state.mapId, x: state.player.x, z: state.player.z, elapsed: state.elapsed, ...extra });
  };
  function syncWorldPosition() {
    const sample = sampleTrack(state.mapId, state.player.progress);
    state.player.x = sample.x - Math.cos(sample.yaw) * state.player.lateral;
    state.player.z = sample.z + Math.sin(sample.yaw) * state.player.lateral;
    state.player.yaw = sample.yaw;
  }
  function resetRace(phase) {
    state.phase = phase; state.pausePhase = null; state.lap = 1; state.completedLaps = 0;
    state.countdown = phase === 'countdown' ? 3 : 0; state.elapsed = 0;
    Object.assign(state.player, { progress: 0, lateral: 0, speed: 0, offTrack: false });
    lastCountdown = 3;
    events = [];
    syncWorldPosition();
  }
  function selectMap(id) {
    if (state.phase !== 'select' || !MAPS.some(map => map.id === id)) return false;
    state.mapId = id; resetRace('select'); return true;
  }
  function start() {
    if (state.phase !== 'select') return false;
    resetRace('countdown'); emit('countdown', { value: 3 }); return true;
  }
  function pause() {
    if (!['countdown', 'racing'].includes(state.phase)) return false;
    state.pausePhase = state.phase; state.phase = 'paused'; return true;
  }
  function resume() {
    if (state.phase !== 'paused') return false;
    state.phase = state.pausePhase; state.pausePhase = null; return true;
  }
  function returnToSelect() { resetRace('select'); }
  function drainEvents() { const drained = events; events = []; return drained; }
  function racingStep(step, input) {
    const map = mapFor(state.mapId), player = state.player;
    const throttle = typeof input.throttle === 'boolean' ? Number(input.throttle) : Number.isFinite(input.throttle) ? clamp(input.throttle, 0, 1) : input.forward === true ? 1 : clamp(finite(input.forward), 0, 1);
    const brake = typeof input.brake === 'boolean' ? Number(input.brake) : clamp(finite(input.brake), 0, 1);
    const steer = clamp(finite(input.steer), -1, 1);
    if (Math.abs(steer) > .01 && player.speed > .1) player.lateral += steer * (3.5 + player.speed * .075) * step;
    else if (Math.abs(steer) <= .01) player.lateral *= Math.exp(-step * .2);
    player.lateral = clamp(player.lateral, -map.width * .9, map.width * .9);
    player.offTrack = Math.abs(player.lateral) > map.width / 2;
    const limit = player.offTrack ? 7 : 26;
    if (brake > 0) player.speed = Math.max(0, player.speed - (12 + 20 * brake) * step);
    else if (throttle > 0) {
      if (player.speed > limit) player.speed = Math.max(limit, player.speed - 20 * step);
      else player.speed = Math.min(limit, player.speed + 12 * throttle * step);
    } else player.speed *= Math.exp(-step * 1.7);
    if (player.speed < .02) player.speed = 0;
    const remaining = (map.laps - player.progress) * map.length;
    const travel = Math.min(remaining, player.speed * step), usedTime = player.speed > 0 && travel < player.speed * step ? travel / player.speed : step;
    state.elapsed += usedTime;
    player.progress = Math.min(map.laps, player.progress + travel / map.length);
    syncWorldPosition();
    const completed = Math.min(map.laps, Math.floor(player.progress + 1e-10));
    while (state.completedLaps < completed) {
      state.completedLaps += 1;
      state.lap = Math.min(map.laps, state.completedLaps + 1);
      emit('lap', { value: state.completedLaps });
    }
    if (player.progress >= map.laps - 1e-10) {
      player.progress = map.laps; state.completedLaps = map.laps; state.lap = map.laps;
      state.phase = 'finished'; player.speed = 0; syncWorldPosition();
      emit('finish', { value: state.elapsed, laps: map.laps });
    }
  }
  function update(dt, input = {}) {
    if (!['countdown', 'racing'].includes(state.phase)) return;
    let delta = clamp(finite(dt), 0, .05);
    if (!delta) return;
    if (state.phase === 'countdown') {
      const before = state.countdown;
      state.countdown = Math.max(0, before - delta);
      const wholeSecond = Math.round(state.countdown);
      if (Math.abs(state.countdown - wholeSecond) < 1e-8) state.countdown = wholeSecond;
      const count = Math.ceil(state.countdown);
      if (count > 0 && count < lastCountdown) { lastCountdown = count; emit('countdown', { value: count }); }
      if (state.countdown > 0) return;
      state.phase = 'racing'; emit('race-start');
      delta = Math.max(0, delta - before);
      if (delta < 1e-6) delta = 0; // Ignore countdown rounding residue at an exact boundary.
    }
    const substeps = Math.ceil(delta / (1 / 120));
    if (!substeps) return;
    for (let iteration = 0; iteration < substeps; iteration++) {
      if (state.phase !== 'racing') break;
      racingStep(delta / substeps, input);
    }
  }
  resetRace('select');
  return { state, selectMap, start, update, pause, resume, returnToSelect, drainEvents };
}
