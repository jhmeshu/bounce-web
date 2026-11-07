import './style.css';
import * as PIXI from 'pixi.js';
import { Game } from './core/game';
import { Input, BTN } from './core/input';
import { Renderer } from './render/renderer';
import { audio } from './core/audio';
import { MAX_LEVEL } from './core/constants';

async function boot() {
  const holder = document.getElementById('canvas-holder')!;
  const input = new Input();
  const game = new Game(input);
  const renderer = new Renderer(game, input);
  await renderer.init(holder);
  await audio.init();
  window.addEventListener('pointerdown', () => audio.unlock(), { once: false });

  // preload level 1 into cache
  await game.ensureLevel(1);

  // Touch controls mirror the game state: Up/Down + ENTER in menus,
  // ⬆ jump in game, pause always in the middle.
  const touchControls = document.getElementById('touch-controls');
  const jumpBtn = document.getElementById('btn-jump');
  function syncTouchControls() {
    if (!touchControls || !jumpBtn) return;
    const inGame = game.state === 'game';
    touchControls.classList.toggle('is-game', inGame);
    touchControls.classList.toggle('is-menu', !inGame);
    const label = inGame ? '⬆' : 'ENTER';
    if (jumpBtn.textContent !== label) jumpBtn.textContent = label;
    jumpBtn.setAttribute('aria-label', inGame ? 'Bounce' : 'Enter');
  }
  syncTouchControls();

  const FIXED = 30;
  let acc = 0, last = performance.now();

  function pollMenus() {
    const st = game.state;
    if (st === 'splash') {
      game.splashT++;
      if (input.consumePressed(BTN.Cross) || input.consumePressed(BTN.Start) || input.consumePressed(BTN.Up) || game.splashT > 200) {
        game.state = 'menu'; game.splashT = 0;
      }
      return;
    }
    if (st === 'menu') {
      const up = input.consumePressed(BTN.Up) || input.consumePressed(BTN.Down) && false;
      void up;
      // poll raw pressed set via consume
      const upP = (input as unknown as { pressedNow: (b: number) => boolean }).pressedNow(BTN.Up) || (input as unknown as { pressedNow: (b: number) => boolean }).pressedNow(BTN.Down);
      void upP;
      return;
    }
  }

  // Direct key handling for menus (uses Input edge sets before they are cleared)
  function handleMenuKeys() {
    const st = game.state;
    const upHit = input.pressedNow(BTN.Up);
    const downHit = input.pressedNow(BTN.Down);
    const leftHit = input.pressedNow(BTN.Left);
    const rightHit = input.pressedNow(BTN.Right);
    const okHit = input.pressedNow(BTN.Cross);
    const backHit = input.pressedNow(BTN.Circle);
    const startHit = input.pressedNow(BTN.Start);

    if (st === 'menu') {
      if (upHit) { input.consumePressed(BTN.Up); game.menuNav(true, false, false); }
      if (downHit) { input.consumePressed(BTN.Down); game.menuNav(false, true, false); }
      if (okHit || startHit) {
        input.consumePressed(BTN.Cross); input.consumePressed(BTN.Start);
        game.menuNav(false, false, true);
      }
    } else if (st === 'levelselect') {
      let sel = game.selectedLevel;
      const cols = 5;
      if (leftHit && sel > 1) { sel--; input.consumePressed(BTN.Left); }
      if (rightHit && sel < MAX_LEVEL) { sel++; input.consumePressed(BTN.Right); }
      if (upHit && sel - cols >= 1) { sel -= cols; input.consumePressed(BTN.Up); }
      if (downHit && sel + cols <= MAX_LEVEL) { sel += cols; input.consumePressed(BTN.Down); }
      game.selectedLevel = sel;
      if (okHit) { input.consumePressed(BTN.Cross); void game.startLevel(sel, sel === 1); if (sel !== 1) { game.score = 0; game.numLives = 3; } }
      if (backHit || startHit) { input.consumePressed(BTN.Circle); input.consumePressed(BTN.Start); game.state = 'menu'; }
    } else if (st === 'highscore') {
      if (okHit || backHit || startHit) { input.consumePressed(BTN.Cross); input.consumePressed(BTN.Circle); input.consumePressed(BTN.Start); game.state = 'menu'; }
    } else if (st === 'instructions') {
      if (leftHit) { input.consumePressed(BTN.Left); game.instructionPage = Math.max(0, game.instructionPage - 1); }
      if (rightHit) { input.consumePressed(BTN.Right); game.instructionPage = Math.min(5, game.instructionPage + 1); }
      if (okHit || backHit || startHit) { input.consumePressed(BTN.Cross); input.consumePressed(BTN.Circle); input.consumePressed(BTN.Start); game.state = 'menu'; }
    } else if (st === 'complete') {
      if (okHit || startHit) {
        input.consumePressed(BTN.Cross); input.consumePressed(BTN.Start);
        if (game.selectedLevel < MAX_LEVEL) void game.startLevel(game.selectedLevel + 1, false);
        else { game.state = 'gameover'; }
      }
      if (backHit) { input.consumePressed(BTN.Circle); game.state = 'menu'; }
    } else if (st === 'gameover') {
      if (okHit || startHit) { input.consumePressed(BTN.Cross); input.consumePressed(BTN.Start); game.state = 'menu'; }
    }
  }

  function frame(now: number) {
    const dt = Math.min(100, now - last);
    last = now;
    syncTouchControls();
    handleMenuKeys();
    if (game.state === 'game') {
      acc += dt;
      let steps = 0;
      while (acc >= FIXED && steps < 4) { game.updateFixed(); acc -= FIXED; steps++; }
      if (steps === 4) acc = 0;
      if (steps > 0) input.endFrame();
    } else {
      pollMenus();
      acc = 0;
      input.endFrame();
    }
    renderer.renderFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

void boot();
