// Keyboard + touch input, PSP_CTRL_* compatible edge detection
export const BTN = { Left: 1, Right: 2, Up: 4, Jump: 4, Cross: 8, Start: 16, Circle: 32, L: 64, R: 128, Down: 256 };
export class Input {
  heldMask = 0;
  private pressed = new Set<number>();
  private released = new Set<number>();
  private keyMap = new Map<string, number>();
  private btnPointers = new Map<number, Set<number>>();
  cheatArmedR = false;
  lastSource: 'keyboard' | 'touch' | null = null;
  constructor() {
    this.keyMap.set('arrowleft', BTN.Left); this.keyMap.set('a', BTN.Left);
    this.keyMap.set('arrowright', BTN.Right); this.keyMap.set('d', BTN.Right);
    this.keyMap.set('arrowup', BTN.Up); this.keyMap.set('w', BTN.Up);
    this.keyMap.set('arrowdown', BTN.Down); this.keyMap.set('s', BTN.Down);
    this.keyMap.set(' ', BTN.Cross);
    this.keyMap.set('space', BTN.Cross);
    this.keyMap.set('spacebar', BTN.Cross);
    this.keyMap.set('enter', BTN.Cross); this.keyMap.set('z', BTN.Cross);
    this.keyMap.set('escape', BTN.Circle); this.keyMap.set('x', BTN.Circle);
    this.keyMap.set('p', BTN.Start);
    this.keyMap.set('q', BTN.L); this.keyMap.set('e', BTN.R);
    const clearOnBlur = () => { this.heldMask = 0; this.btnPointers.clear(); this.resetEdges(); };
    window.addEventListener('blur', clearOnBlur);
    document.addEventListener('visibilitychange', () => { if (document.hidden) clearOnBlur(); });
    window.addEventListener('keydown', (e) => {
      this.lastSource = 'keyboard';
      const k = e.key.toLowerCase();
      let b = this.keyMap.get(k);
      if (b === undefined) {
        if (e.code === 'Space') b = BTN.Cross;
        else if (e.code === 'ArrowUp' || e.code === 'KeyW') b = BTN.Up;
        else if (e.code === 'ArrowLeft' || e.code === 'KeyA') b = BTN.Left;
        else if (e.code === 'ArrowRight' || e.code === 'KeyD') b = BTN.Right;
        else if (e.code === 'ArrowDown' || e.code === 'KeyS') b = BTN.Down;
        else if (e.code === 'Enter' || e.code === 'KeyZ') b = BTN.Cross;
      }
      if (b === undefined) return;
      if (k === ' ' || e.code === 'Space' || k.startsWith('arrow')) e.preventDefault();
      if (!(this.heldMask & b)) this.pressed.add(b);
      this.heldMask |= b;
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      let b = this.keyMap.get(k);
      if (b === undefined) {
        if (e.code === 'Space') b = BTN.Cross;
        else if (e.code === 'ArrowUp' || e.code === 'KeyW') b = BTN.Up;
        else if (e.code === 'ArrowLeft' || e.code === 'KeyA') b = BTN.Left;
        else if (e.code === 'ArrowRight' || e.code === 'KeyD') b = BTN.Right;
        else if (e.code === 'ArrowDown' || e.code === 'KeyS') b = BTN.Down;
        else if (e.code === 'Enter' || e.code === 'KeyZ') b = BTN.Cross;
      }
      if (b === undefined) return;
      this.heldMask &= ~b;
      this.released.add(b);
    });
    this.bindTouch('dp-left', BTN.Left);
    this.bindTouch('dp-right', BTN.Right);
    this.bindTouch('dp-up', BTN.Up);
    this.bindTouch('dp-down', BTN.Down);
    this.bindTouch('dp-jump', BTN.Cross);
  }
  press(btn: number) {
    this.lastSource = 'touch';
    if (!(this.heldMask & btn)) this.pressed.add(btn);
    this.heldMask |= btn;
  }
  tap(btn: number) {
    this.press(btn);
    this.release(btn);
  }
  release(btn: number) {
    if (this.heldMask & btn) {
      this.heldMask &= ~btn;
      this.released.add(btn);
    }
  }
  private bindTouch(id: string, btn: number) {
    const el = document.getElementById(id);
    if (!el) return;
    const down = (e: PointerEvent) => {
      e.preventDefault();
      try {
        if ('setPointerCapture' in el && e.pointerId !== undefined) {
          el.setPointerCapture(e.pointerId);
        }
      } catch {}
      if (!(this.heldMask & btn)) this.pressed.add(btn);
      this.heldMask |= btn;
      let ids = this.btnPointers.get(btn);
      if (!ids) { ids = new Set(); this.btnPointers.set(btn, ids); }
      ids.add(e.pointerId);
    };
    const up = (e: PointerEvent) => {
      e.preventDefault();
      try {
        if ('releasePointerCapture' in el && el.hasPointerCapture?.(e.pointerId)) {
          el.releasePointerCapture(e.pointerId);
        }
      } catch {}
      const ids = this.btnPointers.get(btn);
      if (ids) ids.delete(e.pointerId);
      if (ids && ids.size > 0) return;
      if (this.heldMask & btn) {
        this.heldMask &= ~btn;
        this.released.add(btn);
      }
    };
    el.addEventListener('pointerdown', down as EventListener);
    el.addEventListener('pointerup', up as EventListener);
    el.addEventListener('pointercancel', up as EventListener);
  }
  held(b: number) { return (this.heldMask & b) !== 0; }
  consumePressed(b: number) { if (this.pressed.has(b)) { this.pressed.delete(b); return true; } return false; }
  consumeReleased(b: number) { if (this.released.has(b)) { this.released.delete(b); return true; } return false; }
  pressedNow(b: number) { return this.pressed.has(b); }
  endFrame() { this.pressed.clear(); this.released.clear(); }
  resetEdges() { this.pressed.clear(); this.released.clear(); }
}
