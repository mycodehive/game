/** Keep the board, modal choices and real game controls available in fullscreen.
 * Uses native Fullscreen when possible; mobile/embedded restrictions fall back
 * to a viewport overlay. Proxy controls always follow the original game buttons.
 */
export function setupBoardFullscreen({ actions, turnId, gameEvent, startId }) {
  const root = document.getElementById('board-play-surface');
  const trigger = document.getElementById('board-fullscreen-btn');
  const toolbar = document.getElementById('board-fullscreen-actions');
  const exit = document.getElementById('fullscreen-exit-btn');
  const turn = document.getElementById('fullscreen-turn-info');
  const info = document.getElementById(turnId);
  let fallback = false;
  let active = false;
  let pending = false;
  let previousFocus = null;
  let previousOverflow = '';
  const pairs = actions.map(([proxyId, sourceId]) => ({
    proxy: document.getElementById(proxyId), source: document.getElementById(sourceId)
  }));
  function sync() {
    pairs.forEach(({ proxy, source }) => {
      proxy.disabled = source.disabled;
      if (source.id === startId) proxy.hidden = !source.textContent.startsWith('게임 시작');
    });
    turn.textContent = info.textContent;
  }
  function changed() {
    const nextActive = fallback || document.fullscreenElement === root;
    if (nextActive !== active) {
      active = nextActive;
      root.classList.toggle('is-board-fullscreen', active);
      toolbar.hidden = !active;
      trigger.setAttribute('aria-pressed', String(active));
      if (active) {
        previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        exit.focus({ preventScroll: true });
      } else {
        document.body.style.overflow = previousOverflow;
        if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      }
    }
    sync();
    // The 3D renderer observes element size; the 2D ladder also recomputes SVG.
    window.dispatchEvent(new Event('resize'));
  }
  async function enter() {
    if (pending || active) return;
    pending = true;
    previousFocus = document.activeElement;
    trigger.disabled = true;
    try {
      if (root.requestFullscreen && document.fullscreenEnabled !== false) {
        try { await root.requestFullscreen(); }
        catch { fallback = true; }
      } else fallback = true;
      changed();
    } finally { pending = false; trigger.disabled = false; }
  }
  async function leave() {
    if (pending || !active) return;
    pending = true;
    try {
      if (document.fullscreenElement === root && document.exitFullscreen) {
        try { await document.exitFullscreen(); } catch { return; }
      }
      fallback = false;
      changed();
    } finally { pending = false; }
  }
  trigger.addEventListener('click', () => active ? leave() : enter());
  exit.addEventListener('click', leave);
  document.addEventListener('fullscreenchange', changed);
  document.addEventListener('keydown', event => {
    if (event.key === 'Tab' && fallback && active) {
      const focusable = [...root.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter(element => element.getClientRects().length > 0 && !element.hidden);
      const first = focusable[0], last = focusable.at(-1);
      if (first && ((event.shiftKey ? document.activeElement === first : document.activeElement === last) || !root.contains(document.activeElement))) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      }
    }
    if (event.key === 'Escape' && fallback && active) {
      event.preventDefault();
      // Give city-choice Escape handling precedence; a second Escape closes view.
      if (!root.querySelector('.modal-overlay:not([hidden])')) leave();
    }
  }, true);
  pairs.forEach(({ proxy, source }) => {
    proxy.addEventListener('click', () => {
      if (!source.disabled) source.click();
      sync();
    });
    new MutationObserver(sync).observe(source, {
      attributes: true, attributeFilter: ['disabled'], childList: true, subtree: true
    });
  });
  new MutationObserver(sync).observe(info, { childList: true, subtree: true, characterData: true });
  if (gameEvent) window.addEventListener(gameEvent, sync);
  sync();
  return { enter, leave, sync, get active() { return active; } };
}
