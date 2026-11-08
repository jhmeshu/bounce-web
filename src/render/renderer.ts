import * as PIXI from 'pixi.js';
import { CullerPlugin, extensions } from 'pixi.js';
import {
  SCREEN_HEIGHT, HUD_HEIGHT, TILE_SIZE, COL,
  BallState, SizeState, MAX_LEVEL, getViewSize
} from '../core/constants';
import { TILE_DB, TF } from '../core/tiles';
import { LevelData, tileRawAt } from '../core/level';
import { Game, INSTRUCTIONS } from '../core/game';
import { Input, BTN } from '../core/input';
import { ParticleSystem } from './particles';
import { HDTileLibrary } from './hd-tiles';

// Enable automatic viewport culling for marked nodes
extensions.add(CullerPlugin);

const BASE_RENDER_W = 960;
const BASE_RENDER_H = 544;

function abgr(hex: number) { return hex & 0xffffff; }

function isCompactLayout() {
  return getViewSize().viewW < 480;
}

export class Renderer {
  app!: PIXI.Application;
  game: Game;
  input: Input;

  // HD Tile Library
  tiles = new HDTileLibrary();
  particles = new ParticleSystem();

  // Root Scene Containers
  gameLayer = new PIXI.Container();
  bgLayer = new PIXI.Graphics();
  staticLayer = new PIXI.Container();
  exitLayer = new PIXI.Graphics();
  dynLayer = new PIXI.Container();
  hazardLayer = new PIXI.Graphics();
  waterLayer = new PIXI.Graphics();
  shadowGfx = new PIXI.Graphics();
  ballGfx = new PIXI.Graphics();
  ballAuraGfx = new PIXI.Graphics();

  hudRoot = new PIXI.Container();
  uiRoot = new PIXI.Container();

  // Persistent HUD display elements (zero-allocation per frame)
  hudBg = new PIXI.Graphics();
  hudRingGfx = new PIXI.Graphics();
  hudRingText = new PIXI.Text({
    text: '',
    style: {
      fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      fontSize: 14,
      fontWeight: 'bold',
      fill: 0xffd54f,
    }
  });
  hudScoreText = new PIXI.Text({
    text: '',
    style: {
      fontFamily: "monospace",
      fontSize: 17,
      fontWeight: 'bold',
      fill: 0xffffff,
      letterSpacing: 2,
    }
  });
  hudLivesGfx = new PIXI.Graphics();
  hudLivesLabel = new PIXI.Text({
    text: 'LIVES:',
    style: {
      fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      fontSize: 12,
      fontWeight: 'bold',
      fill: 0xb0bec5
    }
  });
  hudBonusBar = new PIXI.Graphics();
  hudBonusLabel = new PIXI.Text({
    text: '',
    style: {
      fontFamily: 'sans-serif',
      fontSize: 9,
      fontWeight: 'bold',
      fill: 0xffffff
    }
  });

  // Persistent Toast elements
  toastBanner = new PIXI.Graphics();
  toastText = new PIXI.Text({
    text: '',
    style: {
      fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      fontSize: 13,
      fontWeight: 'bold',
      fill: 0xffeb3b,
      letterSpacing: 1,
    }
  });

  // Dirty tracking for zero-allocation rendering
  lastHudKey = '';
  lastScore = -999;
  lastRings = -999;
  lastLives = -999;
  lastBonusVal = -999;
  lastBonusType = '';
  lastToastMsg = '';
  toastActive = false;
  lastUiKey = '';
  splashBallGfx: PIXI.Graphics | null = null;

  rw = 960;
  rh = 544;
  effScale = 2;
  viewW = 480;
  viewH = 272;
  offsetX = 0;
  offsetY = 0;
  private holderEl: HTMLElement | null = null;

  // Camera & Animation State
  smoothCamX = 0;
  smoothCamY = 0;
  camInitialized = false;
  screenShake = 0;
  animTime = 0;

  // Ball Visual Physics
  lastPlayerX = 0;
  ballRollAngle = 0;
  wasInWater = false;
  lastGrounded = false;

  // Static level caching
  bakedKey = '';
  lastDynKey = '';

  constructor(game: Game, input: Input) {
    this.game = game;
    this.input = input;

    // Connect Game effect hooks to the renderer
    this.game.onEffect = (name, x, y) => this.handleEffect(name, x, y);
  }

  resizeToHolder() {
    if (!this.app || !this.holderEl) return;
    const cssW = Math.max(1, this.holderEl.clientWidth);
    const cssH = Math.max(1, this.holderEl.clientHeight);
    const vs = getViewSize();
    this.app.renderer.resize(cssW, cssH);
    this.rw = this.app.renderer.width;
    this.rh = this.app.renderer.height;
    this.viewW = vs.viewW;
    this.viewH = vs.viewH;
    this.effScale = Math.min(this.rw / vs.viewW, this.rh / vs.viewH);
    this.offsetX = (this.rw - vs.viewW * this.effScale) / 2;
    this.offsetY = (this.rh - vs.viewH * this.effScale) / 2;
    this.lastHudKey = '';
    this.lastUiKey = '';
    this.lastToastMsg = '';
    this.toastText.visible = false;
    this.toastBanner.visible = false;
  }

  async init(holder: HTMLElement) {
    this.holderEl = holder;
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    const effectiveResolution = Math.min(Math.max(dpr, 2), 3);

    this.app = new PIXI.Application();
    await this.app.init({
      width: BASE_RENDER_W,
      height: BASE_RENDER_H,
      background: 0x16152b,
      antialias: true,
      autoDensity: true,
      resolution: effectiveResolution,
      powerPreference: 'high-performance',
      preference: 'webgl',
    });

    const canvas = this.app.canvas as HTMLElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    holder.appendChild(canvas);
    this.resizeToHolder();
    if ('ResizeObserver' in window) {
      new ResizeObserver(() => this.resizeToHolder()).observe(holder);
    }
    window.addEventListener('resize', () => this.resizeToHolder());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resizeToHolder(), 60));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', () => this.resizeToHolder());
    document.addEventListener('fullscreenchange', () => setTimeout(() => this.resizeToHolder(), 60));

    // Initialize PixiJS Assets system
    await PIXI.Assets.init({ basePath: './assets/' });
    try {
      await PIXI.Assets.load('objects_nm.png');
    } catch {
      // Fallback if asset is missing; HD vector mode does not require raster atlas
    }

    // Set up layer hierarchy — water sits behind bricks so its
    // extended edges seal under them instead of tinting them.
    this.gameLayer.scale.set(this.effScale, this.effScale);
    this.gameLayer.addChild(
      this.bgLayer,
      this.waterLayer,
      this.staticLayer,
      this.exitLayer,
      this.dynLayer,
      this.hazardLayer,
      this.shadowGfx,
      this.ballGfx,
      this.ballAuraGfx,
      this.particles.container
    );

    this.initHud();
    this.app.stage.addChild(this.gameLayer, this.hudRoot, this.uiRoot);
    this.gameLayer.visible = false;
  }

  initHud() {
    this.hudBonusBar.visible = false;
    this.hudBonusLabel.visible = false;
    this.toastBanner.visible = false;
    this.toastText.visible = false;

    this.hudRoot.addChild(
      this.hudBg,
      this.hudRingGfx,
      this.hudRingText,
      this.hudScoreText,
      this.hudLivesGfx,
      this.hudLivesLabel,
      this.hudBonusBar,
      this.hudBonusLabel,
      this.toastBanner,
      this.toastText
    );
  }

  handleEffect(name: string, x: number, y: number) {
    if (name === 'pop') {
      this.particles.emitPop(x, y, 24);
      this.screenShake = 12;
    } else if (name === 'hoop') {
      this.particles.emitSparkles(x, y, 0xffd700, 16);
    } else if (name === 'checkpoint') {
      this.particles.emitSparkles(x, y, 0x00e676, 20);
    } else if (name === 'pickup') {
      this.particles.emitSparkles(x, y, 0xffd54f, 14);
    } else if (name === 'bounce') {
      this.particles.emitBounceDust(x, y, 6);
    }
  }

  bakeStatic(lvl: LevelData) {
    const key = `${lvl.width}x${lvl.height}@${this.game.selectedLevel}`;
    if (this.bakedKey === key) return;
    this.bakedKey = key;

    this.staticLayer.removeChildren();

    // High definition background
    const W = lvl.width * TILE_SIZE, H = lvl.height * TILE_SIZE;
    this.bgLayer.clear();
    // Warm retro textured stone background extending past level edges for cropped view
    this.bgLayer.rect(-600, -600, W + 1200, H + 1200).fill(abgr(COL.background));

    // Subtle grid/stone seams
    for (let y = 0; y < lvl.height; y++) {
      for (let x = 0; x < lvl.width; x++) {
        const raw = tileRawAt(lvl, x, y);
        const id = raw & 0x3f;

        // Skip dynamic IDs from static bake
        if (
          id === 0 ||
          id === 7 || id === 8 || id === 9 || id === 10 ||
          (id >= 13 && id <= 28) ||
          id === 29
        ) {
          continue;
        }

        let ctxKey = '';
        if (id === 1) ctxKey = 'tile_1';
        else if (id === 2) ctxKey = 'tile_2';
        else if (id === 3) ctxKey = 'spike_up';
        else if (id === 4) ctxKey = 'spike_left';
        else if (id === 5) ctxKey = 'spike_down';
        else if (id === 6) ctxKey = 'spike_right';
        else if (id >= 30 && id <= 33) ctxKey = `ramp_${id}`;
        else if (id >= 34 && id <= 37) ctxKey = `ramp_${id}`;
        else if (id === 38) ctxKey = 'tile_38';
        else if (id >= 39 && id <= 42) ctxKey = `deflator_${id}`;
        else if (id >= 43 && id <= 46) ctxKey = `inflator_${id}`;
        else if (id >= 47 && id <= 50) ctxKey = `gravity_${id}`;
        else if (id >= 51 && id <= 54) ctxKey = `jump_${id}`;

        const ctx = this.tiles.getContext(ctxKey);
        if (ctx) {
          const g = new PIXI.Graphics(ctx);
          g.x = x * TILE_SIZE;
          g.y = y * TILE_SIZE;
          g.cullable = true;
          this.staticLayer.addChild(g);
        }
      }
    }
  }

  renderFrame() {
    this.animTime += 0.03;
    const g = this.game;
    const inGame = g.state === 'game' && !!g.level;

    this.gameLayer.visible = inGame;
    this.uiRoot.visible = !inGame;

    if (inGame && g.level) {
      const lvl = g.level;
      g.calcCamera();

      // Smooth camera lerp tracking
      if (!this.camInitialized) {
        this.smoothCamX = g.camX;
        this.smoothCamY = g.camY;
        this.camInitialized = true;
      } else {
        this.smoothCamX += (g.camX - this.smoothCamX) * 0.22;
        this.smoothCamY += (g.camY - this.smoothCamY) * 0.22;
      }

      // Screen shake decay
      let shakeX = 0, shakeY = 0;
      if (this.screenShake > 0.1) {
        shakeX = (Math.random() - 0.5) * this.screenShake;
        shakeY = (Math.random() - 0.5) * this.screenShake;
        this.screenShake *= 0.86;
      }

      const vs = getViewSize();
      if (vs.viewW !== this.viewW || vs.viewH !== this.viewH) this.resizeToHolder();
      const effScale = this.effScale;
      this.gameLayer.scale.set(effScale, effScale);
      this.gameLayer.position.set(
        Math.round(this.offsetX + (-this.smoothCamX + shakeX) * effScale),
        Math.round(this.offsetY + (-this.smoothCamY + shakeY) * effScale)
      );

      this.bakeStatic(lvl);
      this.drawDynamic(lvl);
      this.drawExit(lvl);
      this.drawMovingSpikes(lvl);
      this.drawWater(lvl);
      this.drawBall();
      this.drawHud();

      this.toastActive = false;
      if (g.exitState === 'open') {
        this.drawToast('PORTAL OPEN — REACH THE EXIT!');
      } else if (g.invincible) {
        this.drawToast('CHEAT ACTIVE: INVINCIBLE');
      } else {
        this.hideToast();
      }

      this.particles.update();
      this.particles.draw();
    } else {
      this.camInitialized = false;
      this.hudRoot.visible = false;
      this.hideToast();
      this.particles.clear();
      this.drawUi();
    }
  }

  drawDynamic(lvl: LevelData) {
    let h = 0;
    for (let i = 0; i < lvl.tiles.length; i += 7) h = (h * 31 + lvl.tiles[i]) | 0;
    h = (h * 31 + this.game.exitOffset) | 0;
    const key = `${h}`;
    if (key === this.lastDynKey) return;
    this.lastDynKey = key;

    this.dynLayer.removeChildren();

    for (let y = 0; y < lvl.height; y++) {
      for (let x = 0; x < lvl.width; x++) {
        const raw = tileRawAt(lvl, x, y);
        const id = raw & 0x3f;

        let ctxKey = '';
        if (id === 7) ctxKey = 'tile_7';
        else if (id === 8) ctxKey = 'tile_8';
        else if (id >= 13 && id <= 28) ctxKey = `hoop_${id}`;
        else if (id === 29) ctxKey = 'tile_29';

        if (ctxKey) {
          const ctx = this.tiles.getContext(ctxKey);
          if (ctx) {
            const g = new PIXI.Graphics(ctx);
            g.x = x * TILE_SIZE;
            g.y = y * TILE_SIZE;
            g.cullable = true;
            this.dynLayer.addChild(g);
          }
        }
      }
    }
  }

  drawExit(lvl: LevelData) {
    const ex = lvl.exitPosX * TILE_SIZE;
    const ey = lvl.exitPosY * TILE_SIZE;
    const g = this.exitLayer;
    g.clear();

    const isOpen = this.game.exitState === 'open' || this.game.exitOffset > 0;
    const off = this.game.exitOffset; // 0..24

    // Portal background chamber
    g.rect(ex, ey, 24, 24).fill(0x1a1a2e);

    // Cosmic energy vortex when active
    if (isOpen) {
      const pulse = (Math.sin(this.animTime * 4) + 1) * 0.5;
      g.circle(ex + 12, ey + 12, 9).fill({ color: 0x00e5ff, alpha: 0.3 + pulse * 0.3 });
      g.circle(ex + 12, ey + 12, 6).fill({ color: 0x7c4dff, alpha: 0.5 });
      g.circle(ex + 12, ey + 12, 3).fill(0xffffff);

      // Rotating portal rays
      for (let i = 0; i < 4; i++) {
        const a = this.animTime * 2 + (Math.PI / 2) * i;
        g.moveTo(ex + 12, ey + 12)
          .lineTo(ex + 12 + Math.cos(a) * 9, ey + 12 + Math.sin(a) * 9)
          .stroke({ width: 1.2, color: 0x00e5ff, alpha: 0.7 });
      }
    } else {
      // Inactive door red energy grid
      g.rect(ex + 4, ey + 4, 16, 16).fill(0x2d1217);
      g.circle(ex + 12, ey + 12, 4).fill(0xe53935);
    }

    // Sliding blast door barrier (sliding up by exitOffset)
    const doorHeight = Math.max(0, 24 - off);
    if (doorHeight > 0) {
      g.rect(ex + 2, ey + off, 20, doorHeight).fill(0x37474f);
      // Hazard diagonal warning stripes
      g.rect(ex + 4, ey + off + 2, 16, Math.max(0, doorHeight - 4)).fill(0xfbc02d);
      g.rect(ex + 6, ey + off + 4, 12, Math.max(0, doorHeight - 8)).fill(0x212121);
      g.rect(ex + 8, ey + off + 6, 8, Math.max(0, doorHeight - 12)).fill(0xe53935);
    }

    // Portal pylons (left & right cybernetic frame)
    g.rect(ex, ey, 3, 24).fill(0x263238);
    g.rect(ex + 21, ey, 3, 24).fill(0x263238);
    g.rect(ex, ey, 24, 3).fill(0x37474f);
    g.rect(ex, ey + 21, 24, 3).fill(0x37474f);

    // Glowing corner LED nodes
    const ledColor = isOpen ? 0x00e676 : 0xff1744;
    g.circle(ex + 2, ey + 2, 1.2).fill(ledColor);
    g.circle(ex + 22, ey + 2, 1.2).fill(ledColor);
    g.circle(ex + 2, ey + 22, 1.2).fill(ledColor);
    g.circle(ex + 22, ey + 22, 1.2).fill(ledColor);
  }

  drawMovingSpikes(lvl: LevelData) {
    const g = this.hazardLayer;
    g.clear();

    const viewW = this.viewW;
    const viewH = this.viewH;

    for (const o of lvl.movingObjects) {
      const sx = o.topLeft[0] * 12 + o.offset[0];
      const sy = o.topLeft[1] * 12 + o.offset[1];
      const cx = sx + 12, cy = sy + 12;

      // Skip offscreen spikes for performance
      if (
        cx < this.smoothCamX - 36 || cx > this.smoothCamX + viewW + 36 ||
        cy < this.smoothCamY - 36 || cy > this.smoothCamY + viewH + 36
      ) {
        continue;
      }

      // Square steel body
      const half = 8;
      g.rect(cx - half, cy - half, half * 2, half * 2).fill(0x212121);
      g.rect(cx - half + 1.5, cy - half + 1.5, (half - 1.5) * 2, (half - 1.5) * 2)
        .stroke({ width: 1.2, color: 0xd32f2f });

      // Core pulsating warning eye
      const pulse = (Math.sin(this.animTime * 8) + 1) * 0.5;
      g.circle(cx, cy, 4).fill({ color: 0xff1744, alpha: 0.7 + pulse * 0.3 });
      g.circle(cx, cy, 1.5).fill(0xffffff);

      // 8 Steel perimeter spikes (edge midpoints + corners)
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI / 4) * i;
        const ca = Math.cos(a), sa = Math.sin(a);
        const rb = half / Math.max(Math.abs(ca), Math.abs(sa));
        const rt = Math.min(rb + (i % 2 === 0 ? 3.5 : 0.8), 12);
        const bx = cx + ca * rb, by = cy + sa * rb;
        const tipX = cx + ca * rt, tipY = cy + sa * rt;
        const p1x = bx - sa * 2, p1y = by + ca * 2;
        const p2x = bx + sa * 2, p2y = by - ca * 2;
        g.poly([p1x, p1y, tipX, tipY, p2x, p2y], true).fill(0xeeeeee);
        g.poly([p1x, p1y, tipX, tipY, bx, by], true).fill(0xbdbdbd);
      }
    }
  }

  drawWater(lvl: LevelData) {
    const g = this.waterLayer;
    g.clear();

    const viewW = this.viewW;
    const viewH = this.viewH;

    // Viewport-based culling with 2-tile margin
    const minTX = Math.max(0, Math.floor((this.smoothCamX - 24) / TILE_SIZE));
    const maxTX = Math.min(lvl.width, Math.ceil((this.smoothCamX + viewW + 24) / TILE_SIZE));
    const minTY = Math.max(0, Math.floor((this.smoothCamY - 24) / TILE_SIZE));
    const maxTY = Math.min(lvl.height, Math.ceil((this.smoothCamY + viewH + 24) / TILE_SIZE));

    const t = this.animTime * 4;
    // Overlap: extend every water fill past its tile bounds so neighbouring
    // tiles (water↔water, water↔brick) share an opaque overlap instead of
    // leaving an antialiased hairline / wave-dip gap showing the background.
    const OVER = 1;
    const TOP_LIFT = 2;

    for (let y = minTY; y < maxTY; y++) {
      for (let x = minTX; x < maxTX; x++) {
        const raw = tileRawAt(lvl, x, y);
        if ((raw & 0x40) === 0) continue;

        const wx = x * TILE_SIZE, wy = y * TILE_SIZE;
        const aboveRaw = y === 0 ? 0 : tileRawAt(lvl, x, y - 1);
        const isSurface = (aboveRaw & 0x40) === 0;

        if (isSurface) {
          const x0 = wx - OVER, x1 = wx + TILE_SIZE + OVER;
          const waveY0 = Math.sin((x0 + t * 4) * 0.35) * 1.6;
          const waveY1 = Math.sin((x1 + t * 4) * 0.35) * 1.6;

          g.poly([
            x0, wy + waveY0 - TOP_LIFT,
            x1, wy + waveY1 - TOP_LIFT,
            x1, wy + TILE_SIZE + OVER,
            x0, wy + TILE_SIZE + OVER
          ], true).fill(0x0277bd);

          const crestY0 = Math.sin((wx + t * 4) * 0.35) * 1.6;
          const crestY1 = Math.sin((wx + TILE_SIZE + t * 4) * 0.35) * 1.6;
          g.moveTo(wx, wy + crestY0 - TOP_LIFT)
            .lineTo(wx + TILE_SIZE, wy + crestY1 - TOP_LIFT)
            .stroke({ width: 1.2, color: 0xb3e5fc, alpha: 0.85 });
        } else {
          // Deep water body — extended on all sides to seal seams.
          g.rect(wx - OVER, wy - OVER, TILE_SIZE + OVER * 2, TILE_SIZE + OVER * 2).fill(0x01579b);
        }

        // Ambient bubbles — only from open water, not from inside
        // a submerged solid tile (its cell body is covered by the tile).
        if (isSurface && (raw & 0x3f) === 0 && Math.random() < 0.02) {
          this.particles.emitBubble(wx + Math.random() * 12, wy + 8);
        }
      }
    }
  }

  drawBall() {
    const p = this.game.player;
    const bg = this.ballGfx;
    const aura = this.ballAuraGfx;
    const sh = this.shadowGfx;

    bg.clear();
    aura.clear();
    sh.clear();

    const r = p.sizeState === SizeState.Large ? 8 : 6;
    const x = p.xPos;
    const y = p.yPos;

    // Detect water splash transitions
    if (p.isInWater !== this.wasInWater) {
      this.particles.emitSplash(x, y, 10);
      this.wasInWater = p.isInWater;
    }

    // Detect bounce impacts (dust only — no deformation, no shake)
    if (p.mGroundedFlag && !this.lastGrounded && Math.abs(p.ySpeed) > 10) {
      this.handleEffect('bounce', x, y + r);
    }
    this.lastGrounded = p.mGroundedFlag;

    // Angular rolling rotation
    const dx = p.xPos - this.lastPlayerX;
    if (Math.abs(dx) > 0.01 && Math.abs(dx) < 15) {
      this.ballRollAngle += dx / r;
    }
    this.lastPlayerX = p.xPos;

    // Popped state
    if (p.ballState === BallState.Popped) {
      bg.position.set(x, y);
      bg.circle(0, 0, r * 0.9).fill(0x616161);
      bg.circle(-2, -2, r * 0.35).fill(0x9e9e9e);
      return;
    }

    // Ground Drop Shadow
    sh.ellipse(x, y + r + 1.5, r * 0.85, r * 0.3)
      .fill({ color: 0x000000, alpha: p.mGroundedFlag ? 0.35 : 0.18 });

    // Position Ball Container
    bg.position.set(x, y);
    bg.rotation = this.ballRollAngle;

    // HD 3D Spherical Shading
    // 1. Deep scarlet shadow base
    bg.circle(0, 0, r).fill(0x8a0b12);
    // 2. Main spherical body
    bg.circle(-r * 0.15, -r * 0.15, r * 0.9).fill(0xd32f2f);
    // 3. Bright illuminated dome
    bg.circle(-r * 0.3, -r * 0.3, r * 0.65).fill(0xf44336);
    // 4. Specular hotspot highlight
    bg.circle(-r * 0.42, -r * 0.42, r * 0.28).fill({ color: 0xffffff, alpha: 0.92 });
    // 5. Secondary bottom rim bounce reflection
    bg.arc(0, 0, r * 0.82, Math.PI * 0.2, Math.PI * 0.8)
      .stroke({ width: 0.6, color: 0xff8a80, alpha: 0.5 });
    // 6. Realistic 3D rotating seam / equator band
    bg.ellipse(0, 0, r * 0.95, r * 0.28)
      .stroke({ width: 0.9, color: 0xffffff, alpha: 0.35 });
    // 7. Crisp dark contour stroke
    bg.circle(0, 0, r).stroke({ width: 0.75, color: 0x4a0508 });

    // Active Power-up Visuals & Auras
    if (p.speedBonusCntr > 0) {
      aura.circle(x, y, r + 2.5).stroke({ width: 1.4, color: 0xffeb3b, alpha: 0.8 });
      if (Math.random() < 0.35) {
        this.particles.emitTrail(x, y, r * 0.85, 0xffd54f);
      }
    }
    if (p.gravBonusCntr > 0) {
      const pulse = (Math.sin(this.animTime * 6) + 1) * 1.5;
      aura.circle(x, y, r + 2 + pulse).stroke({ width: 1.2, color: 0x00e5ff, alpha: 0.75 });
    }
    if (p.jumpBonusCntr > 0) {
      aura.circle(x, y, r + 2).stroke({ width: 1.4, color: 0xff6d00, alpha: 0.85 });
      aura.poly([x - 2, y - r - 2, x, y - r - 5, x + 2, y - r - 2], true).fill(0xffd54f);
    }
    if (this.game.invincible) {
      const hue = Math.floor((this.animTime * 120) % 360);
      aura.circle(x, y, r + 3).stroke({ width: 1.8, color: PIXI.Color.shared.setValue(`hsl(${hue}, 100%, 60%)`).toNumber() });
    }
  }

  drawHud() {
    this.hudRoot.visible = true;
    const isMobile = isCompactLayout();
    const layoutKey = isMobile ? 'compact' : 'wide';
    void HUD_HEIGHT;
    const HUD_H = Math.max(34, Math.round(this.rh * 0.0625));
    const y0 = this.rh - HUD_H;
    const W = this.rw;
    const cx = W / 2;

    if (this.lastHudKey !== layoutKey) {
      this.lastHudKey = layoutKey;
      this.lastRings = -999;
      this.lastScore = -999;
      this.lastLives = -999;
      this.lastBonusVal = -999;
      this.lastBonusType = '';

      this.hudBg.clear();
      this.hudBg.rect(0, y0, W, HUD_H).fill({ color: 0x0a0f1d, alpha: 0.9 });
      this.hudBg.rect(0, y0, W, 1.5).fill({ color: 0x00e5ff, alpha: 0.5 });

      this.hudRingGfx.clear();
      if (isMobile) {
        this.hudRingGfx.circle(cx - 108, y0 + 17, 7).stroke({ width: 2.2, color: 0xffc107 });
        this.hudRingGfx.circle(cx - 108, y0 + 17, 5).stroke({ width: 0.8, color: 0xfff9c4 });
        this.hudRingGfx.circle(cx - 110, y0 + 15, 1.2).fill(0xffffff);

        this.hudRingText.style.fontSize = 14;
        this.hudRingText.x = cx - 96;
        this.hudRingText.y = y0 + 8;

        this.hudScoreText.style.fontSize = 16;
        this.hudScoreText.y = y0 + 7;

        this.hudLivesLabel.visible = false;
        this.hudBonusLabel.style.fontSize = 8;
      } else {
        this.hudRingGfx.circle(20, y0 + 17, 7).stroke({ width: 2.2, color: 0xffc107 });
        this.hudRingGfx.circle(20, y0 + 17, 5).stroke({ width: 0.8, color: 0xfff9c4 });
        this.hudRingGfx.circle(18, y0 + 15, 1.2).fill(0xffffff);

        this.hudRingText.style.fontSize = 13;
        this.hudRingText.x = 34;
        this.hudRingText.y = y0 + 9;

        this.hudScoreText.style.fontSize = 17;
        this.hudScoreText.y = y0 + 7;

        this.hudLivesLabel.visible = true;
        this.hudBonusLabel.style.fontSize = 9;
      }
    }

    const lvl = this.game.level!;
    const remainRings = Math.max(0, lvl.totalRings - this.game.numRings);

    // Update rings only when changed
    if (this.lastRings !== remainRings) {
      this.lastRings = remainRings;
      this.hudRingText.text = isMobile ? `${remainRings}` : `RINGS: ${remainRings}`;
      this.hudRingText.style.fill = remainRings === 0 ? 0x00e676 : 0xffd54f;
    }

    // Update score only when changed
    if (this.lastScore !== this.game.score) {
      this.lastScore = this.game.score;
      this.hudScoreText.text = String(this.game.score).padStart(isMobile ? 6 : 8, '0');
      this.hudScoreText.x = cx - this.hudScoreText.width / 2;
    }

    // Update lives only when changed
    if (this.lastLives !== this.game.numLives) {
      this.lastLives = this.game.numLives;
      const numLives = Math.max(0, this.game.numLives);
      this.hudLivesGfx.clear();
      if (isMobile) {
        for (let i = 0; i < numLives; i++) {
          const lx = cx + 75 + i * 15;
          const ly = y0 + 17;
          this.hudLivesGfx.circle(lx, ly, 5.5).fill(0xd32f2f);
          this.hudLivesGfx.circle(lx - 2, ly - 2, 2).fill(0xff8a80);
          this.hudLivesGfx.circle(lx - 2, ly - 2, 0.8).fill(0xffffff);
          this.hudLivesGfx.circle(lx, ly, 5.5).stroke({ width: 0.8, color: 0x5d0000 });
        }
      } else {
        const livesX = W - 30;
        for (let i = 0; i < numLives; i++) {
          const lx = livesX - i * 18;
          const ly = y0 + 17;
          this.hudLivesGfx.circle(lx, ly, 6).fill(0xd32f2f);
          this.hudLivesGfx.circle(lx - 2, ly - 2, 2.5).fill(0xff8a80);
          this.hudLivesGfx.circle(lx - 2.5, ly - 2.5, 1).fill(0xffffff);
          this.hudLivesGfx.circle(lx, ly, 6).stroke({ width: 0.8, color: 0x5d0000 });
        }
        this.hudLivesLabel.x = livesX - (numLives * 18) - this.hudLivesLabel.width - 6;
        this.hudLivesLabel.y = y0 + 9;
      }
    }

    // Update powerup status bar
    const maxBonus = Math.max(
      this.game.player.speedBonusCntr,
      this.game.player.gravBonusCntr,
      this.game.player.jumpBonusCntr
    );
    if (maxBonus > 0) {
      this.hudBonusBar.visible = true;
      this.hudBonusLabel.visible = true;
      const label = this.game.player.speedBonusCntr > 0 ? 'SPEED' :
                    this.game.player.gravBonusCntr > 0 ? (isMobile ? 'GRAV' : 'GRAVITY') : 'JUMP';

      if (this.lastBonusType !== label) {
        this.lastBonusType = label;
        this.hudBonusLabel.text = label;
      }

      const bw = isMobile ? 90 : 100, bh = isMobile ? 10 : 12;
      const bx = isMobile ? (cx - bw / 2) : (W / 2 + 130);
      const by = isMobile ? (y0 - 14) : (y0 + 11);

      this.hudBonusBar.clear();
      this.hudBonusBar.roundRect(bx, by, bw, bh, isMobile ? 3 : 4).fill(0x1a233a);
      this.hudBonusBar.roundRect(bx, by, bw, bh, isMobile ? 3 : 4).stroke({ width: 1, color: 0x4fc3f7 });

      const fillW = Math.max(0, (bw - 2) * (maxBonus / 300));
      this.hudBonusBar.roundRect(bx + 1, by + 1, fillW, bh - 2, isMobile ? 2 : 3).fill(0xff7043);

      this.hudBonusLabel.x = bx + bw / 2 - this.hudBonusLabel.width / 2;
      this.hudBonusLabel.y = by - 1;
    } else {
      if (this.hudBonusBar.visible) {
        this.hudBonusBar.visible = false;
        this.hudBonusLabel.visible = false;
        this.lastBonusType = '';
      }
    }
  }

  drawToast(msg: string) {
    this.toastActive = true;
    const isMobile = isCompactLayout();
    const S = this.us();
    let bw = (isMobile ? 460 : 380) * S, bh = (isMobile ? 48 : 32) * S;
    bw = Math.min(bw, this.rw * 0.92);
    bh = Math.min(bh, this.rh * 0.12);
    const bx = this.rw / 2 - bw / 2;
    const by = 16 * S;

    if (this.lastToastMsg !== msg || !this.toastBanner.visible) {
      this.lastToastMsg = msg;
      this.toastBanner.clear();
      this.toastBanner.roundRect(bx, by, bw, bh, 16 * S)
        .fill({ color: 0x0d1b2a, alpha: 0.88 })
        .stroke({ width: 1.5 * S, color: 0x00e5ff });

      this.toastText.text = msg;
      this.toastText.style.fontSize = Math.max(11, (isMobile ? 20 : 13) * S);
      this.toastText.x = this.rw / 2 - this.toastText.width / 2;
      this.toastText.y = by + (isMobile ? 10 : 7) * S;

      this.toastBanner.visible = true;
      this.toastText.visible = true;
    }
  }

  hideToast() {
    if (this.toastBanner.visible) {
      this.toastBanner.visible = false;
      this.toastText.visible = false;
      this.lastToastMsg = '';
    }
  }

  /** UI scale: ~0.5× on portrait phones (no overflow), up to ~2× on big desktops. */
  us(): number {
    if (this.rh >= this.rw) return Math.min(0.75, Math.max(0.45, this.rw / 640));
    return Math.min(2.2, Math.max(0.65, Math.min(this.rw / 960, this.rh / 544)));
  }

  /** Option list card for Settings / Choose-Control. */
  optionList(title: string, labels: string[], descs: string[], sel: number, footer: string) {
    const isMobile = isCompactLayout();
    const S = this.us();
    const ui = this.uiRoot;
    const bg = new PIXI.Graphics();
    bg.rect(0, 0, this.rw, this.rh).fill(0x0d1124);
    ui.addChild(bg);
    const t = new PIXI.Text({
      text: title,
      style: { fontFamily: "'Segoe UI', system-ui, sans-serif", fontSize: (isMobile ? 40 : 34) * S, fontWeight: 'bold', fill: 0xff5252, letterSpacing: 2 * S },
    });
    t.x = this.rw / 2 - t.width / 2;
    t.y = this.rh * 0.1;
    ui.addChild(t);
    const btnW = (isMobile ? 400 : 360) * S, btnH = (isMobile ? 62 : 48) * S;
    const gap = 14 * S;
    const totalH = labels.length * btnH + (labels.length - 1) * gap;
    const startY = (this.rh - totalH) / 2 - 20 * S;
    labels.forEach((label, i) => {
      const selected = sel === i;
      const btnY = startY + i * (btnH + gap);
      const btnX = this.rw / 2 - btnW / 2;
      const g = new PIXI.Graphics();
      if (selected) g.roundRect(btnX, btnY, btnW, btnH, 10 * S).fill(0xd32f2f).stroke({ width: 2 * S, color: 0xffcdd2 });
      else g.roundRect(btnX, btnY, btnW, btnH, 10 * S).fill(0x1a2138).stroke({ width: 1 * S, color: 0x2e3856 });
      ui.addChild(g);
      const lt = new PIXI.Text({
        text: label,
        style: { fontFamily: "'Segoe UI', system-ui, sans-serif", fontSize: (isMobile ? 22 : 18) * S, fontWeight: selected ? 'bold' : 'normal', fill: selected ? 0xffffff : 0xcfd8dc },
      });
      lt.x = this.rw / 2 - lt.width / 2;
      lt.y = btnY + 8 * S;
      ui.addChild(lt);
      const dt = new PIXI.Text({
        text: descs[i],
        style: { fontFamily: "'Segoe UI', system-ui, sans-serif", fontSize: (isMobile ? 14 : 12) * S, fill: 0x90a4ae },
      });
      dt.x = this.rw / 2 - dt.width / 2;
      dt.y = btnY + (isMobile ? 34 : 27) * S;
      ui.addChild(dt);
    });
    const f = new PIXI.Text({
      text: footer,
      style: { fontFamily: "'Segoe UI', system-ui, sans-serif", fontSize: (isMobile ? 15 : 13) * S, fill: 0x90a4ae },
    });
    f.x = this.rw / 2 - f.width / 2;
    f.y = this.rh - 38 * S;
    ui.addChild(f);
  }

  panel(title: string, lines: string[], footer: string): void {
    const isMobile = isCompactLayout();
    const S = this.us();
    const ui = this.uiRoot;
    ui.removeChildren();
    const bg = new PIXI.Graphics();
    bg.rect(0, 0, this.rw, this.rh).fill(0x0f1123);
    ui.addChild(bg);
    let pw = (isMobile ? 480 : 560) * S, ph = (isMobile ? 380 : 320) * S;
    pw = Math.min(pw, this.rw * 0.92);
    ph = Math.min(ph, this.rh * 0.8);
    const px = (this.rw - pw) / 2, py = (this.rh - ph) / 2;
    const card = new PIXI.Graphics();
    card.roundRect(px, py, pw, ph, 16 * S).fill({ color: 0x1a1e36, alpha: 0.95 }).stroke({ width: 2 * S, color: 0x3f51b5 });
    ui.addChild(card);
    const t = new PIXI.Text({
      text: title,
      style: { fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", fontSize: (isMobile ? 36 : 28) * S, fontWeight: 'bold', fill: 0xffffff }
    });
    t.x = this.rw / 2 - t.width / 2;
    t.y = py + (isMobile ? 28 : 22) * S;
    ui.addChild(t);
    const line = new PIXI.Graphics();
    line.rect(this.rw / 2 - 40 * S, py + (isMobile ? 72 : 62) * S, 80 * S, 2 * S).fill(0x00e5ff);
    ui.addChild(line);
    lines.forEach((ln, i) => {
      const s = new PIXI.Text({
        text: ln,
        style: { fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", fontSize: (isMobile ? 20 : 16) * S, fill: (i === 0 && title.includes('OVER')) ? 0xff5252 : 0xce93d8, wordWrap: true, wordWrapWidth: pw - 60 * S, align: 'center' }
      });
      s.x = this.rw / 2 - s.width / 2;
      s.y = py + (isMobile ? 92 : 85) * S + i * (isMobile ? 38 : 32) * S;
      ui.addChild(s);
    });
    const f = new PIXI.Text({
      text: footer,
      style: { fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", fontSize: (isMobile ? 18 : 14) * S, fill: 0x90a4ae }
    });
    f.x = this.rw / 2 - f.width / 2;
    f.y = py + ph - (isMobile ? 48 : 42) * S;
    ui.addChild(f);
  }

  drawUi() {
    const isMobile = isCompactLayout();
    const g = this.game;
    const ui = this.uiRoot;

    if (g.state === 'splash') {
      const S = this.us();
      const ballBounceY = this.rh / 2 - (isMobile ? 90 : 80) * S + Math.sin(this.animTime * 3) * 20 * S;
      if (this.lastUiKey === 'splash' && this.splashBallGfx) {
        this.splashBallGfx.y = ballBounceY;
        return;
      }
      this.lastUiKey = `splash:${Math.round(this.rw)}x${Math.round(this.rh)}:${Math.round(S * 100)}`;
      ui.removeChildren();
      const bg = new PIXI.Graphics();
      bg.rect(0, 0, this.rw, this.rh).fill(0x0c102b);
      ui.addChild(bg);
      const ballR = (isMobile ? 52 : 32) * S;
      const ball = new PIXI.Graphics();
      ball.circle(0, 0, ballR).fill(0x8a0b12);
      ball.circle(-ballR * 0.12, -ballR * 0.12, ballR * 0.88).fill(0xd32f2f);
      ball.circle(-ballR * 0.23, -ballR * 0.23, ballR * 0.56).fill(0xf44336);
      ball.circle(-ballR * 0.31, -ballR * 0.31, ballR * 0.25).fill(0xffffff);
      ball.circle(0, 0, ballR).stroke({ width: 2 * S, color: 0x4a0508 });
      ball.x = this.rw / 2;
      ball.y = ballBounceY;
      this.splashBallGfx = ball;
      ui.addChild(ball);
      const t = new PIXI.Text({
        text: 'BOUNCE RELOADED',
        style: { fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", fontSize: (isMobile ? 48 : 46) * S, fontWeight: '900', fill: 0xffffff, letterSpacing: 2 * S }
      });
      t.x = this.rw / 2 - t.width / 2;
      t.y = ballBounceY + ballR + 12 * S;
      ui.addChild(t);
      const sub = new PIXI.Text({
        text: isMobile ? 'Tap anywhere to play' : 'Press Enter to Play',
        style: { fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", fontSize: (isMobile ? 22 : 16) * S, fill: 0x4fc3f7 }
      });
      sub.x = this.rw / 2 - sub.width / 2;
      sub.y = t.y + (isMobile ? 56 : 44) * S;
      ui.addChild(sub);
      return;
    }

    this.splashBallGfx = null;
    const S = this.us();
    const uiKey = `${g.state}:${g.menuSel}:${g.selectedLevel}:${g.instructionPage}:${g.settingsSel}:${g.chooseSel}:${g.controlMode}:${Math.round(S * 100)}`;
    if (this.lastUiKey === uiKey) return;
    this.lastUiKey = uiKey;

    ui.removeChildren();

    if (g.state === 'menu') {
      const bg = new PIXI.Graphics();
      bg.rect(0, 0, this.rw, this.rh).fill(0x0d1124);
      ui.addChild(bg);
      const title = new PIXI.Text({
        text: 'BOUNCE RELOADED',
        style: { fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", fontSize: (isMobile ? 48 : 44) * S, fontWeight: 'bold', fill: 0xff5252, letterSpacing: 2 * S }
      });
      title.x = this.rw / 2 - title.width / 2;
      title.y = this.rh * 0.08;
      ui.addChild(title);
      const items = ['Continue', 'New game', 'Select level', 'High score', 'Instructions', 'Settings'];
      const btnW = (isMobile ? 400 : 340) * S, btnH = (isMobile ? 58 : 42) * S;
      const gap = (isMobile ? 10 : 12) * S;
      const totalH = items.length * btnH + (items.length - 1) * gap;
      const startY = Math.max(this.rh * 0.18, (this.rh - totalH) / 2);
      items.forEach((label, i) => {
        const sel = g.menuSel === i;
        const disabled = i === 0 && !g.savedInProgress;
        const btnY = startY + i * (btnH + gap);
        const btnX = this.rw / 2 - btnW / 2;
        const btnGfx = new PIXI.Graphics();
        if (sel) btnGfx.roundRect(btnX, btnY, btnW, btnH, 8 * S).fill(0xd32f2f).stroke({ width: 2 * S, color: 0xffcdd2 });
        else btnGfx.roundRect(btnX, btnY, btnW, btnH, 8 * S).fill(0x1a2138).stroke({ width: 1 * S, color: 0x2e3856 });
        ui.addChild(btnGfx);
        const t = new PIXI.Text({
          text: label,
          style: { fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", fontSize: (isMobile ? 24 : 18) * S, fontWeight: sel ? 'bold' : 'normal', fill: disabled ? 0x616161 : sel ? 0xffffff : 0xcfd8dc }
        });
        t.x = this.rw / 2 - t.width / 2;
        t.y = btnY + (isMobile ? 14 : 9) * S;
        ui.addChild(t);
      });
      const mf = new PIXI.Text({
        text: isMobile ? 'Swipe ↕ to choose · Tap to select' : '↑ ↓ choose · Enter select',
        style: { fontFamily: "'Segoe UI', system-ui, sans-serif", fontSize: (isMobile ? 16 : 13) * S, fill: 0x90a4ae },
      });
      mf.x = this.rw / 2 - mf.width / 2;
      mf.y = this.rh - 40 * S;
      ui.addChild(mf);
    } else if (g.state === 'settings') {
      this.optionList('SETTINGS', ['Touch & Gesture', 'Classic D-Pad'], ['Drag to move · Tap to bounce (recommended)', 'Visible buttons overlay (left / right / jump)'], g.settingsSel, isMobile ? 'Swipe ↕ choose · Tap to apply · 2-finger tap back' : '↑ ↓ choose · Enter apply · Esc back');
    } else if (g.state === 'controlchoose') {
      this.optionList('CHOOSE CONTROL', ['Touch & Gesture', 'Classic D-Pad', 'Back'], ['Drag to move · Tap to bounce', 'Visible button overlay', 'Return to menu'], g.chooseSel, isMobile ? 'Swipe ↕ choose · Tap to start' : '↑ ↓ choose · Enter to start');
    } else if (g.state === 'levelselect') {
      this.panel('SELECT LEVEL', [`Level ${g.selectedLevel} / ${MAX_LEVEL}`, isMobile ? 'Swipe to choose · Tap to start' : '← → ↑ ↓ to choose · Enter to start · Esc for menu'], isMobile ? 'Tap = Start' : 'Enter = Start');
    } else if (g.state === 'highscore') {
      this.panel('HIGH SCORES', [`Best Level: ${g.bestLevel}`, `Top Score: ${g.bestScore} PTS`], isMobile ? 'Tap = Back' : 'Enter or Esc = Back');
    } else if (g.state === 'instructions') {
      const page = INSTRUCTIONS[g.instructionPage] ?? '';
      const words = page.split(' ');
      const lines: string[] = [];
      let cur = '';
      const maxChars = isMobile ? 38 : 55;
      for (const w of words) {
        if ((cur + ' ' + w).length > maxChars) { lines.push(cur); cur = w; }
        else cur = cur ? cur + ' ' + w : w;
      }
      if (cur) lines.push(cur);
      this.panel(`INSTRUCTIONS (${g.instructionPage + 1}/6)`, lines.slice(0, 4), isMobile ? 'Swipe ← → Pages · Tap = Back' : '← → Pages · Esc = Back');
    } else if (g.state === 'complete') {
      this.panel('LEVEL COMPLETE!', [`Level ${g.selectedLevel} Cleared!`, `Total Score: ${g.score} PTS`], isMobile ? 'Tap = Next · Swipe down = Menu' : 'Enter = Next Level · Esc = Menu');
    } else if (g.state === 'gameover') {
      this.panel('GAME OVER', [...(g.newBest ? ['★ NEW HIGH SCORE! ★'] : []), `Final Score: ${g.score} PTS`], isMobile ? 'Tap = Main Menu' : 'Enter = Main Menu');
    }
  }
}

export { BTN };
export type { Input };
