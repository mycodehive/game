import { setupBoardFullscreen } from '../assets/fullscreen.js';
setupBoardFullscreen({
  actions: [['fullscreen-roll-btn', 'roll-btn'], ['fullscreen-buy-btn', 'buy-btn'], ['fullscreen-pass-btn', 'pass-btn'], ['fullscreen-start-btn', 'start-btn']],
  startId: 'start-btn', turnId: 'turn-info', gameEvent: 'bluemarble:state'
});
