import { setupBoardFullscreen } from '../assets/fullscreen.js';
setupBoardFullscreen({
  actions: [['fullscreen-roll-btn', 'rollBtn']],
  turnId: 'turnText', gameEvent: 'ladder-state'
});
