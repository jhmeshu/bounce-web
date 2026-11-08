import './style.css';
import * as PIXI from 'pixi.js';
import { Game } from './core/game';
import { Input, BTN } from './core/input';
import { Renderer } from './render/renderer';
import { audio } from './core/audio';
import { MAX_LEVEL } from './core/constants';
import { GestureController } from './core/gestures';

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

  // Invisible gesture layer; pause badge + D-Pad visibility mirror state.
  const gestureLayer = document.getElementById('gesture-layer')!;
  const pauseBadge = document.getElementById('pause-badge')!;
  new GestureController(gestureLayer, input, pauseBadge, (x, y) => renderer.hitTest(x, y));
  const dpadControls = document.getElementById('dpad-controls')!;
  const dpJump = document.getElementById('dp-jump')!;
  function syncControlUI() {
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    document.body.dataset.control = game.controlMode;
    pauseBadge.classList.toggle('visible', game.state === 'game' && (coarse || game.controlMode === 'dpad'));
    dpadControls.hidden = game.controlMode !== 'dpad';
    const inGame = game.state === 'game';
    dpadControls.classList.toggle('is-menu', !inGame);
    const label = inGame ? '⬆' : 'ENTER';
    if (dpJump.textContent !== label) dpJump.textContent = label;
    dpJump.setAttribute('aria-label', inGame ? 'Bounce' : 'Enter');
  }
  syncControlUI();

  // First-run gesture tutorial (coarse pointers, gesture mode only).
  const tutEl = document.getElementById('tutorial')!;
  const tutArt = document.getElementById('tut-art')!;
  const tutText = document.getElementById('tut-text')!;
  const tutDots = document.getElementById('tut-dots')!;
  const tutSkip = document.getElementById('tut-skip')!;
  const isCoarse = () => window.matchMedia?.('(pointer: coarse)').matches ?? false;
  let tutStep = -1;
  let tutDone = false;
  try { tutDone = localStorage.getItem('bounce_tut_seen') === '1'; } catch { /* ignore */ }
  function tutFinish() {
    tutStep = -1;
    tutEl.hidden = true;
    tutDone = true;
    try { localStorage.setItem('bounce_tut_seen', '1'); } catch { /* ignore */ }
  }
  function tutShow(step: number) {
    tutStep = step;
    const steps = [
      { art: '↔️', text: 'Drag ← → to move' },
      { art: '👆', text: 'Tap anywhere to bounce' },
      { art: '🙌', text: 'Swipe ↕ for menus · Tap ❚❚ to pause' },
    ];
    tutArt.textContent = steps[step].art;
    tutText.textContent = steps[step].text;
    tutDots.innerHTML = steps.map((_, i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('');
    tutEl.hidden = false;
  }
  tutSkip.addEventListener('click', tutFinish);
  function tutorialTick() {
    if (tutDone || !isCoarse() || game.controlMode !== 'gesture') return;
    if (tutStep === -1) {
      if (game.state === 'game') tutShow(0);
      return;
    }
    if (tutStep === 0) {
      if (input.held(BTN.Left) || input.held(BTN.Right)) tutShow(1);
    } else if (tutStep === 1) {
      if (input.pressedNow(BTN.Cross)) tutShow(2);
    } else if (tutStep === 2) {
      if (input.pressedNow(BTN.Cross)) tutFinish();
    }
  }

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
    } else if (st === 'settings') {
      if (upHit) { input.consumePressed(BTN.Up); game.settingsSel = Math.max(0, game.settingsSel - 1); }
      if (downHit) { input.consumePressed(BTN.Down); game.settingsSel = Math.min(2, game.settingsSel + 1); }
      if (okHit) {
        input.consumePressed(BTN.Cross);
        if (game.settingsSel === 2) game.state = 'menu';
        else game.setControl(game.settingsSel === 1 ? 'dpad' : 'gesture');
      }
      if (backHit || startHit) { input.consumePressed(BTN.Circle); input.consumePressed(BTN.Start); game.state = 'menu'; }
    } else if (st === 'controlchoose') {
      if (upHit) { input.consumePressed(BTN.Up); game.chooseSel = Math.max(0, game.chooseSel - 1); }
      if (downHit) { input.consumePressed(BTN.Down); game.chooseSel = Math.min(2, game.chooseSel + 1); }
      if (okHit) { input.consumePressed(BTN.Cross); game.chooseControl(game.chooseSel); }
      if (backHit || startHit) { input.consumePressed(BTN.Circle); input.consumePressed(BTN.Start); game.state = 'menu'; }
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
      if (backHit || downHit) { input.consumePressed(BTN.Circle); input.consumePressed(BTN.Down); game.state = 'menu'; }
    } else if (st === 'gameover') {
      if (okHit || startHit) { input.consumePressed(BTN.Cross); input.consumePressed(BTN.Start); game.state = 'menu'; }
    }
  }

  function frame(now: number) {
    const dt = Math.min(100, now - last);
    last = now;
    syncControlUI();
    tutorialTick();
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
