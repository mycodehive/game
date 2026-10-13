export const INGREDIENTS = Object.freeze({
  bottom_bun: { name: '아래 빵', color: '#edb564', height: .46, description: '햄버거의 든든한 바닥', emoji: '🍞' },
  patty: { name: '패티', color: '#8d4935', height: .32, description: '맛있는 동그란 패티', emoji: '🥩' },
  cheese: { name: '치즈', color: '#ffd858', height: .13, description: '노란 치즈 한 장', emoji: '🧀' },
  lettuce: { name: '상추', color: '#75ca65', height: .17, description: '싱그러운 초록 상추', emoji: '🥬' },
  tomato: { name: '토마토', color: '#f66a65', height: .2, description: '빨간 토마토 한 조각', emoji: '🍅' },
  pickle: { name: '피클', color: '#8dbd47', height: .14, description: '아삭아삭 초록 피클', emoji: '🥒' },
  onion: { name: '양파', color: '#d9b3ed', height: .17, description: '보라색 양파 링', emoji: '🧅' },
  egg: { name: '달걀', color: '#fff1bb', height: .23, description: '노란 노른자의 달걀', emoji: '🍳' },
  bacon: { name: '베이컨', color: '#d97772', height: .17, description: '분홍 줄무늬 베이컨', emoji: '🥓' },
  top_bun: { name: '위 빵', color: '#edb564', height: .7, description: '맨 위에 올리는 둥근 빵', emoji: '🍞' },
});

const fillings = ['patty', 'cheese', 'lettuce', 'tomato', 'pickle', 'onion', 'egg', 'bacon'];
export function createGame({ random = Math.random } = {}) {
  const state = { phase: 'intro', stage: 1, score: 0, target: [], stack: [], timeLimit: 45, remaining: 45, feedback: '', combo: 0, lastScore: 0, pausePhase: null };
  let events = [];
  const result = (ok, reason = '') => ({ ok, reason });
  const emit = (type, detail = {}) => { events.push({ type, ...detail }); if (events.length > 128) events.shift(); };
  const playing = () => state.phase === 'playing';
  function sample(length) {
    const value = Number(random());
    return Math.min(length - 1, Math.max(0, Math.floor((Number.isFinite(value) ? value : .5) * length)));
  }
  function makeTarget(previous) {
    const count = Math.min(10, state.stage);
    const pool = fillings.slice(0, Math.min(fillings.length, 3 + state.stage - 1));
    const available = [...pool];
    const middle = Array.from({ length: count }, () => {
      // Early recipes avoid repeats; later recipes introduce double layers.
      const choices = state.stage < 7 && available.length ? available : pool;
      const index = sample(choices.length);
      const item = choices[index];
      if (choices === available) available.splice(index, 1);
      return item;
    });
    const target = ['bottom_bun', ...middle, 'top_bun'];
    if (previous && target.join(',') === previous.join(',')) {
      const index = pool.indexOf(target[1]);
      target[1] = pool[(index + 1) % pool.length];
    }
    return target;
  }
  function begin({ preserveTarget = false } = {}) {
    state.timeLimit = Math.max(15, 45 - 2 * (state.stage - 1));
    state.remaining = state.timeLimit;
    if (!preserveTarget) state.target = makeTarget(state.target);
    state.stack = [];
    state.feedback = '아래부터 차곡차곡! 같은 햄버거를 만들어 주세요.';
    state.lastScore = 0;
    state.pausePhase = null;
    state.phase = 'playing';
    emit('stage-start', { stage: state.stage });
  }
  function start() {
    if (!['intro', 'gameover', 'cleared'].includes(state.phase)) return result(false, 'phase');
    state.stage = 1; state.score = 0; state.combo = 0; state.target = []; events = [];
    begin(); return result(true);
  }
  function restart() {
    state.phase = 'intro'; return start();
  }
  function timeout() {
    state.remaining = 0; state.phase = 'gameover'; state.combo = 0;
    state.feedback = '잘했어요! 같은 햄버거로 한 번 더 도전해 볼까요?';
    emit('timeout');
  }
  function addIngredient(id) {
    if (!playing()) return result(false, 'phase');
    if (!Object.hasOwn(INGREDIENTS, id)) return result(false, 'ingredient');
    if (state.stack.length >= 12) { state.feedback = '최대 12개까지 쌓을 수 있어요. 하나 빼기로 고쳐 보세요.'; return result(false, 'full'); }
    state.stack.push(id); state.feedback = `${INGREDIENTS[id].name}을 올렸어요!`;
    emit('ingredient', { id, index: state.stack.length - 1 }); return result(true);
  }
  function undo() {
    if (!playing()) return result(false, 'phase');
    if (!state.stack.length) return result(false, 'empty');
    const id = state.stack.pop(); state.feedback = '하나 뺐어요. 다시 올려 보세요!'; emit('undo', { id }); return result(true);
  }
  function clearStack() {
    if (!playing()) return result(false, 'phase');
    state.stack = []; state.feedback = '처음부터 차곡차곡 다시 만들어 봐요!'; emit('reset-stack'); return result(true);
  }
  function submit() {
    if (!playing()) return result(false, 'phase');
    if (state.stack.length !== state.target.length || state.stack.some((id, i) => id !== state.target[i])) {
      state.combo = 0; state.remaining = Math.max(0, state.remaining - 2);
      state.feedback = '조금 달라요! 아래부터 순서를 보고 고쳐 볼까요?'; emit('wrong');
      if (state.remaining <= 0) timeout();
      return result(false, 'mismatch');
    }
    state.combo += 1;
    state.lastScore = state.target.length * 100 + Math.ceil(state.remaining) * 5;
    state.score += state.lastScore; state.phase = 'cleared';
    state.feedback = '완벽해요! 멋진 햄버거가 완성됐어요!';
    emit('stage-clear', { score: state.lastScore, stage: state.stage }); return result(true);
  }
  function nextStage() {
    if (state.phase !== 'cleared') return result(false, 'phase');
    state.stage += 1; begin(); return result(true);
  }
  function retry() {
    if (state.phase !== 'gameover') return result(false, 'phase');
    begin({ preserveTarget: true }); return result(true);
  }
  function pause() {
    if (!playing()) return result(false, 'phase');
    state.pausePhase = state.phase; state.phase = 'paused'; emit('pause'); return result(true);
  }
  function resume() {
    if (state.phase !== 'paused') return result(false, 'phase');
    state.phase = state.pausePhase || 'playing'; state.pausePhase = null; emit('resume'); return result(true);
  }
  function update(dt) {
    if (!playing() || !Number.isFinite(dt) || dt <= 0) return;
    state.remaining = Math.max(0, state.remaining - Math.min(dt, .25));
    if (state.remaining < 1e-8) timeout();
  }
  function drainEvents() { const out = events; events = []; return out; }
  return { state, start, restart, addIngredient, undo, clearStack, submit, nextStage, retry, pause, resume, update, drainEvents };
}
