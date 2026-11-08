import { Input, BTN } from './input';

interface PointerState {
  startX: number;
  startY: number;
  x: number;
  y: number;
  startT: number;
  moved: boolean;
}

function isCoarse() {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
}

function tryFullscreen() {
  if (!isCoarse() || document.fullscreenElement) return;
  const el = document.documentElement as HTMLElement & { requestFullscreen?: (o?: unknown) => Promise<void> };
  if (typeof el.requestFullscreen === 'function') {
    el.requestFullscreen({ navigationUI: 'hide' } as unknown as { navigationUI: string }).catch(() => undefined);
  }
}

/**
 * Temple-Run style invisible gesture layer.
 *  Drag left/right -> move (hold) · Tap -> bounce/select
 *  Swipe up/down -> menu nav · Two-finger tap -> pause
 */
export class GestureController {
  private pointers = new Map<number, PointerState>();
  private heldDir = 0;
  private twoFinger = false;
  private triedFullscreen = false;

  constructor(
    private layer: HTMLElement,
    private input: Input,
    private pauseBadge?: HTMLElement,
  ) {
    layer.addEventListener('pointerdown', this.onDown);
    layer.addEventListener('pointermove', this.onMove);
    layer.addEventListener('pointerup', this.onUp);
    layer.addEventListener('pointercancel', this.onUp);
    layer.addEventListener('lostpointercapture', this.onUp);
    layer.addEventListener('contextmenu', (e) => e.preventDefault());
    if (pauseBadge) {
      pauseBadge.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.input.tap(BTN.Start);
      });
    }
  }

  private onDown = (e: PointerEvent) => {
    e.preventDefault();
    this.input.lastSource = 'touch';
    if (!this.triedFullscreen) {
      this.triedFullscreen = true;
      tryFullscreen();
    }
    if (!this.pointers.has(e.pointerId)) {
      this.pointers.set(e.pointerId, {
        startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY,
        startT: performance.now(), moved: false,
      });
    }
    if (this.pointers.size >= 2) {
      this.twoFinger = true;
      this.clearHeldDir();
      this.input.tap(BTN.Start);
    }
  };

  private onMove = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.twoFinger) return;
    const dx = p.x - p.startX;
    const dy = p.y - p.startY;
    if (Math.abs(dx) > 12 || Math.abs(dy) > 12) p.moved = true;
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      const dir = dx < 0 ? BTN.Left : BTN.Right;
      if (dir !== this.heldDir) {
        this.clearHeldDir();
        this.heldDir = dir;
        this.input.press(dir);
      }
    } else if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
      this.clearHeldDir();
    }
  };

  private onUp = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    this.pointers.delete(e.pointerId);
    if (this.twoFinger) {
      if (this.pointers.size === 0) this.twoFinger = false;
      return;
    }
    this.clearHeldDir();
    const dx = p.x - p.startX;
    const dy = p.y - p.startY;
    const dt = performance.now() - p.startT;
    const dist = Math.hypot(dx, dy);
    if (dt < 280 && dist < 14) {
      this.input.tap(BTN.Cross);
    } else if (Math.abs(dy) > 55 && Math.abs(dy) > Math.abs(dx)) {
      this.input.tap(dy < 0 ? BTN.Up : BTN.Down);
    }
  };

  private clearHeldDir() {
    if (this.heldDir) {
      this.input.release(this.heldDir);
      this.heldDir = 0;
    }
  }
}
