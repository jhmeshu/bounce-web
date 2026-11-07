import * as PIXI from 'pixi.js';
import {
  SCREEN_WIDTH, SCREEN_HEIGHT, HUD_HEIGHT, TILE_SIZE, COL,
  BallState, SizeState, MAX_LEVEL, getMobileZoom
} from '../core/constants';
import { TILE_DB, TF } from '../core/tiles';
import { LevelData, tileRawAt } from '../core/level';
import { Game, INSTRUCTIONS } from '../core/game';
import { Input, BTN } from '../core/input';
import { ParticleSystem } from './particles';
import { HDTileLibrary } from './hd-tiles';

const HD_SCALE = 2;
const RENDER_WIDTH = SCREEN_WIDTH * HD_SCALE;   // 960
const RENDER_HEIGHT = SCREEN_HEIGHT * HD_SCALE; // 544

function abgr(hex: number) { return hex & 0xffffff; }

function isCompactLayout() {
  return getMobileZoom() > 1;
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

  async init(holder: HTMLElement) {
    this.app = new PIXI.Application();
    await this.app.init({
      width: RENDER_WIDTH,
      height: RENDER_HEIGHT,
      background: 0x16152b,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      preference: 'webgl',
    });

    const canvas = this.app.canvas as HTMLElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    holder.appendChild(canvas);

    // Initialize PixiJS Assets system
    await PIXI.Assets.init({ basePath: './assets/' });
    try {
      await PIXI.Assets.load('objects_nm.png');
    } catch {
      // Fallback if asset is missing; HD vector mode does not require raster atlas
    }

    // Set up layer hierarchy — water sits behind bricks so its
    // extended edges seal under them instead of tinting them.
    this.gameLayer.scale.set(HD_SCALE, HD_SCALE);
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

    this.app.stage.addChild(this.gameLayer, this.hudRoot, this.uiRoot);
    this.gameLayer.visible = false;
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

      // Zoom: mobile ≈2x (visible 240×136 game units), desktop 1x (480×272).
      // gameLayer is scaled by HD_SCALE × zoom so the world fills the
      // 960×544 canvas. HUD/UI are also enlarged ~2x on mobile (see
      // panel/drawUi/drawToast) so menus match the in-game zoom.
      const effScale = HD_SCALE * getMobileZoom();
      this.gameLayer.scale.set(effScale, effScale);
      // Snap to whole render pixels so tile edges stay pixel-aligned
      // (fractional camera positions otherwise antialias a hairline gap
      // between every tile / between water and brick).
      this.gameLayer.position.set(
        Math.round((-this.smoothCamX + shakeX) * effScale),
        Math.round((-this.smoothCamY + shakeY) * effScale)
      );

      this.bakeStatic(lvl);
      this.drawDynamic(lvl);
      this.drawExit(lvl);
      this.drawMovingSpikes(lvl);
      this.drawWater(lvl);
      this.drawBall();
      this.drawHud();

      if (g.exitState === 'open') {
        this.drawToast('PORTAL OPEN — REACH THE EXIT!');
      } else if (g.invincible) {
        this.drawToast('CHEAT ACTIVE: INVINCIBLE');
      }

      this.particles.update();
      this.particles.draw();
    } else {
      this.camInitialized = false;
      this.hudRoot.removeChildren();
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

    for (const o of lvl.movingObjects) {
      const sx = o.topLeft[0] * 12 + o.offset[0];
      const sy = o.topLeft[1] * 12 + o.offset[1];
      const cx = sx + 12, cy = sy + 12;

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

    const t = this.animTime * 4;
    // Overlap: extend every water fill past its tile bounds so neighbouring
    // tiles (water↔water, water↔brick) share an opaque overlap instead of
    // leaving an antialiased hairline / wave-dip gap showing the background.
    // Water is now drawn behind bricks, so the overlap under a brick is
    // hidden and an opaque fill avoids double-blending darker seams.
    const OVER = 1;
    const TOP_LIFT = 2; // > wave amplitude (1.6) so the surface always
    // reaches a brick directly above it (hidden behind that brick).

    for (let y = 0; y < lvl.height; y++) {
      for (let x = 0; x < lvl.width; x++) {
        const raw = tileRawAt(lvl, x, y);
        if ((raw & 0x40) === 0) continue;
        // Draw water for EVERY water-flag cell, not just empty ones.
        // Water sits behind the static/dynamic layers, so a submerged
        // brick/ramp/spike/hoop covers the water under its solid part
        // while its transparent parts (ramp triangle, spike gaps, hoop
        // opening) show water instead of a beige background gap.

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

          // Foam crest line on the (lifted) surface, cell-span only so
          // neighbouring tiles don't double-draw it.
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
    const h = this.hudRoot;
    h.removeChildren();

    const isMobile = isCompactLayout();
    const HUD_H = HUD_HEIGHT * HD_SCALE; // 34px
    const y0 = RENDER_HEIGHT - HUD_H;
    const W = RENDER_WIDTH;

    // Glassmorphism HUD Bar
    const bg = new PIXI.Graphics();
    // Dark frosted bar
    bg.rect(0, y0, W, HUD_H).fill({ color: 0x0a0f1d, alpha: 0.9 });
    // Glowing top border separator line
    bg.rect(0, y0, W, 1.5).fill({ color: 0x00e5ff, alpha: 0.5 });
    h.addChild(bg);

    const lvl = this.game.level!;
    const remainRings = Math.max(0, lvl.totalRings - this.game.numRings);

    if (isMobile) {
      // MOBILE COMPACT HUD: Concentrated in the visible center span (±130px from W/2)
      const cx = W / 2;

      // 1. Ring Counter (Left of center)
      const ringGfx = new PIXI.Graphics();
      ringGfx.circle(cx - 108, y0 + 17, 7).stroke({ width: 2.2, color: 0xffc107 });
      ringGfx.circle(cx - 108, y0 + 17, 5).stroke({ width: 0.8, color: 0xfff9c4 });
      ringGfx.circle(cx - 110, y0 + 15, 1.2).fill(0xffffff);
      h.addChild(ringGfx);

      const ringText = new PIXI.Text({
        text: `${remainRings}`,
        style: {
          fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
          fontSize: 14,
          fontWeight: 'bold',
          fill: remainRings === 0 ? 0x00e676 : 0xffd54f,
        }
      });
      ringText.x = cx - 96;
      ringText.y = y0 + 8;
      h.addChild(ringText);

      // 2. Score (Dead center)
      const scoreText = new PIXI.Text({
        text: String(this.game.score).padStart(6, '0'),
        style: {
          fontFamily: "monospace",
          fontSize: 16,
          fontWeight: 'bold',
          fill: 0xffffff,
          letterSpacing: 2,
        }
      });
      scoreText.x = cx - scoreText.width / 2;
      scoreText.y = y0 + 7;
      h.addChild(scoreText);

      // 3. Lives Counter (Right of center)
      const livesGfx = new PIXI.Graphics();
      const numLives = Math.max(0, this.game.numLives);
      for (let i = 0; i < numLives; i++) {
        const lx = cx + 75 + i * 15;
        const ly = y0 + 17;
        livesGfx.circle(lx, ly, 5.5).fill(0xd32f2f);
        livesGfx.circle(lx - 2, ly - 2, 2).fill(0xff8a80);
        livesGfx.circle(lx - 2, ly - 2, 0.8).fill(0xffffff);
        livesGfx.circle(lx, ly, 5.5).stroke({ width: 0.8, color: 0x5d0000 });
      }
      h.addChild(livesGfx);

      // 4. Power-Up Status Bar (Compact above HUD in center)
      const maxBonus = Math.max(
        this.game.player.speedBonusCntr,
        this.game.player.gravBonusCntr,
        this.game.player.jumpBonusCntr
      );
      if (maxBonus > 0) {
        const bw = 90, bh = 10;
        const bx = cx - bw / 2, by = y0 - 14;
        const barGfx = new PIXI.Graphics();
        barGfx.roundRect(bx, by, bw, bh, 3).fill(0x1a233a);
        barGfx.roundRect(bx, by, bw, bh, 3).stroke({ width: 1, color: 0x4fc3f7 });

        const fillW = Math.max(0, (bw - 2) * (maxBonus / 300));
        barGfx.roundRect(bx + 1, by + 1, fillW, bh - 2, 2).fill(0xff7043);
        h.addChild(barGfx);

        const label = this.game.player.speedBonusCntr > 0 ? 'SPEED' :
                      this.game.player.gravBonusCntr > 0 ? 'GRAV' : 'JUMP';
        const bonusLabel = new PIXI.Text({
          text: label,
          style: { fontFamily: 'sans-serif', fontSize: 8, fontWeight: 'bold', fill: 0xffffff }
        });
        bonusLabel.x = bx + bw / 2 - bonusLabel.width / 2;
        bonusLabel.y = by - 1;
        h.addChild(bonusLabel);
      }
    } else {
      // DESKTOP WIDE HUD
      // 1. Ring Counter (Left)
      const ringGfx = new PIXI.Graphics();
      ringGfx.circle(20, y0 + 17, 7).stroke({ width: 2.2, color: 0xffc107 });
      ringGfx.circle(20, y0 + 17, 5).stroke({ width: 0.8, color: 0xfff9c4 });
      ringGfx.circle(18, y0 + 15, 1.2).fill(0xffffff);
      h.addChild(ringGfx);

      const ringText = new PIXI.Text({
        text: `RINGS: ${remainRings}`,
        style: {
          fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
          fontSize: 13,
          fontWeight: 'bold',
          fill: remainRings === 0 ? 0x00e676 : 0xffd54f,
        }
      });
      ringText.x = 34;
      ringText.y = y0 + 9;
      h.addChild(ringText);

      // 2. Arcade Digital Score (Center)
      const scoreText = new PIXI.Text({
        text: String(this.game.score).padStart(8, '0'),
        style: {
          fontFamily: "monospace",
          fontSize: 17,
          fontWeight: 'bold',
          fill: 0xffffff,
          letterSpacing: 2,
        }
      });
      scoreText.x = W / 2 - scoreText.width / 2;
      scoreText.y = y0 + 7;
      h.addChild(scoreText);

      // 3. Power-Up Status Bar (Center-Right)
      const maxBonus = Math.max(
        this.game.player.speedBonusCntr,
        this.game.player.gravBonusCntr,
        this.game.player.jumpBonusCntr
      );
      if (maxBonus > 0) {
        const bx = W / 2 + 130, by = y0 + 11;
        const bw = 100, bh = 12;
        const barGfx = new PIXI.Graphics();
        barGfx.roundRect(bx, by, bw, bh, 4).fill(0x1a233a);
        barGfx.roundRect(bx, by, bw, bh, 4).stroke({ width: 1, color: 0x4fc3f7 });

        const fillW = Math.max(0, (bw - 2) * (maxBonus / 300));
        barGfx.roundRect(bx + 1, by + 1, fillW, bh - 2, 3).fill(0xff7043);
        h.addChild(barGfx);

        const label = this.game.player.speedBonusCntr > 0 ? 'SPEED' :
                      this.game.player.gravBonusCntr > 0 ? 'GRAVITY' : 'JUMP';
        const bonusLabel = new PIXI.Text({
          text: label,
          style: { fontFamily: 'sans-serif', fontSize: 9, fontWeight: 'bold', fill: 0xffffff }
        });
        bonusLabel.x = bx + bw / 2 - bonusLabel.width / 2;
        bonusLabel.y = by - 1;
        h.addChild(bonusLabel);
      }

      // 4. Lives Counter (Right)
      const livesX = W - 30;
      const livesGfx = new PIXI.Graphics();
      for (let i = 0; i < Math.max(0, this.game.numLives); i++) {
        const lx = livesX - i * 18;
        const ly = y0 + 17;
        livesGfx.circle(lx, ly, 6).fill(0xd32f2f);
        livesGfx.circle(lx - 2, ly - 2, 2.5).fill(0xff8a80);
        livesGfx.circle(lx - 2.5, ly - 2.5, 1).fill(0xffffff);
        livesGfx.circle(lx, ly, 6).stroke({ width: 0.8, color: 0x5d0000 });
      }
      h.addChild(livesGfx);

      const livesLabel = new PIXI.Text({
        text: 'LIVES:',
        style: {
          fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
          fontSize: 12,
          fontWeight: 'bold',
          fill: 0xb0bec5
        }
      });
      livesLabel.x = livesX - (Math.max(0, this.game.numLives) * 18) - livesLabel.width - 6;
      livesLabel.y = y0 + 9;
      h.addChild(livesLabel);
    }
  }

  drawToast(msg: string) {
    const isMobile = isCompactLayout();
    const banner = new PIXI.Graphics();
    const bw = isMobile ? 460 : 380, bh = isMobile ? 48 : 32;
    const bx = RENDER_WIDTH / 2 - bw / 2;
    const by = 20;

    banner.roundRect(bx, by, bw, bh, 16)
      .fill({ color: 0x0d1b2a, alpha: 0.88 })
      .stroke({ width: 1.5, color: 0x00e5ff });
    this.hudRoot.addChild(banner);

    const t = new PIXI.Text({
      text: msg,
      style: {
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        fontSize: isMobile ? 20 : 13,
        fontWeight: 'bold',
        fill: 0xffeb3b,
        letterSpacing: 1,
      }
    });
    t.x = RENDER_WIDTH / 2 - t.width / 2;
    t.y = isMobile ? by + 10 : by + 7;
    this.hudRoot.addChild(t);
  }

  panel(title: string, lines: string[], footer: string): void {
    const isMobile = isCompactLayout();
    const ui = this.uiRoot;
    ui.removeChildren();

    // Backdrop
    const bg = new PIXI.Graphics();
    bg.rect(0, 0, RENDER_WIDTH, RENDER_HEIGHT).fill(0x0f1123);
    ui.addChild(bg);

    // Modern Frosted Card — mobile ~2x (was 260×320 / 20 / 12 / 11)
    const pw = isMobile ? 480 : 560, ph = isMobile ? 380 : 320;
    const px = (RENDER_WIDTH - pw) / 2, py = (RENDER_HEIGHT - ph) / 2;
    const card = new PIXI.Graphics();
    card.roundRect(px, py, pw, ph, 16)
      .fill({ color: 0x1a1e36, alpha: 0.95 })
      .stroke({ width: 2, color: 0x3f51b5 });
    ui.addChild(card);

    // Title
    const t = new PIXI.Text({
      text: title,
      style: {
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        fontSize: isMobile ? 36 : 28,
        fontWeight: 'bold',
        fill: 0xffffff,
      }
    });
    t.x = RENDER_WIDTH / 2 - t.width / 2;
    t.y = py + (isMobile ? 28 : 22);
    ui.addChild(t);

    // Decorative underline
    const line = new PIXI.Graphics();
    line.rect(RENDER_WIDTH / 2 - 40, py + (isMobile ? 72 : 62), 80, 2).fill(0x00e5ff);
    ui.addChild(line);

    // Body Lines
    lines.forEach((ln, i) => {
      const s = new PIXI.Text({
        text: ln,
        style: {
          fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
          fontSize: isMobile ? 20 : 16,
          fill: (i === 0 && title.includes('OVER')) ? 0xff5252 : 0xce93d8,
          wordWrap: isMobile,
          wordWrapWidth: isMobile ? 430 : 500,
          align: 'center',
        }
      });
      s.x = RENDER_WIDTH / 2 - s.width / 2;
      s.y = py + (isMobile ? 92 : 85) + i * (isMobile ? 38 : 32);
      ui.addChild(s);
    });

    // Footer Hint
    const f = new PIXI.Text({
      text: footer,
      style: {
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        fontSize: isMobile ? 18 : 14,
        fill: 0x90a4ae
      }
    });
    f.x = RENDER_WIDTH / 2 - f.width / 2;
    f.y = py + ph - (isMobile ? 48 : 42);
    ui.addChild(f);
  }

  drawUi() {
    const isMobile = isCompactLayout();
    const g = this.game;
    const ui = this.uiRoot;
    ui.removeChildren();

    if (g.state === 'splash') {
      const bg = new PIXI.Graphics();
      bg.rect(0, 0, RENDER_WIDTH, RENDER_HEIGHT).fill(0x0c102b);
      ui.addChild(bg);

      // Animated floating 3D ball — mobile ~2x (radius 32→52)
      const ballBounceY = isMobile ? 170 + Math.sin(this.animTime * 3) * 22 : 150 + Math.sin(this.animTime * 3) * 20;
      const ballR = isMobile ? 52 : 32;
      const ball = new PIXI.Graphics();
      ball.circle(RENDER_WIDTH / 2, ballBounceY, ballR).fill(0x8a0b12);
      ball.circle(RENDER_WIDTH / 2 - 6, ballBounceY - 6, ballR * 0.88).fill(0xd32f2f);
      ball.circle(RENDER_WIDTH / 2 - 12, ballBounceY - 12, ballR * 0.56).fill(0xf44336);
      ball.circle(RENDER_WIDTH / 2 - 16, ballBounceY - 16, ballR * 0.25).fill(0xffffff);
      ball.circle(RENDER_WIDTH / 2, ballBounceY, ballR).stroke({ width: 2, color: 0x4a0508 });
      ui.addChild(ball);

      const t = new PIXI.Text({
        text: 'BOUNCE ZERO HD',
        style: {
          fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
          fontSize: isMobile ? 52 : 48,
          fontWeight: '900',
          fill: 0xffffff,
          letterSpacing: isMobile ? 2 : 3,
        }
      });
      t.x = RENDER_WIDTH / 2 - t.width / 2;
      t.y = isMobile ? 268 : 230;
      ui.addChild(t);

      const sub = new PIXI.Text({
        text: isMobile ? 'Press Jump or Enter' : 'Press Enter to Play',
        style: {
          fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
          fontSize: isMobile ? 22 : 16,
          fill: 0x4fc3f7,
        }
      });
      sub.x = RENDER_WIDTH / 2 - sub.width / 2;
      sub.y = isMobile ? 352 : 300;
      ui.addChild(sub);
    } else if (g.state === 'menu') {
      const bg = new PIXI.Graphics();
      bg.rect(0, 0, RENDER_WIDTH, RENDER_HEIGHT).fill(0x0d1124);
      ui.addChild(bg);

      // Header — mobile ~2x (32→52)
      const title = new PIXI.Text({
        text: 'BOUNCE HD',
        style: {
          fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
          fontSize: isMobile ? 52 : 44,
          fontWeight: 'bold',
          fill: 0xff5252,
          letterSpacing: 2,
        }
      });
      title.x = RENDER_WIDTH / 2 - title.width / 2;
      title.y = isMobile ? 36 : 50;
      ui.addChild(title);

      const items = ['Continue', 'New game', 'Select level', 'High score', 'Instructions'];
      items.forEach((label, i) => {
        const sel = g.menuSel === i;
        const disabled = i === 0 && !g.savedInProgress;
        const btnY = isMobile ? 130 + i * 68 : 150 + i * 54;
        const btnW = isMobile ? 400 : 340, btnH = isMobile ? 58 : 42;
        const btnX = RENDER_WIDTH / 2 - btnW / 2;

        const btnGfx = new PIXI.Graphics();
        if (sel) {
          btnGfx.roundRect(btnX, btnY, btnW, btnH, 8)
            .fill(0xd32f2f)
            .stroke({ width: 2, color: 0xffcdd2 });
        } else {
          btnGfx.roundRect(btnX, btnY, btnW, btnH, 8)
            .fill(0x1a2138)
            .stroke({ width: 1, color: 0x2e3856 });
        }
        ui.addChild(btnGfx);

        const t = new PIXI.Text({
          text: label,
          style: {
            fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
            fontSize: isMobile ? 24 : 18,
            fontWeight: sel ? 'bold' : 'normal',
            fill: disabled ? 0x616161 : sel ? 0xffffff : 0xcfd8dc,
          }
        });
        t.x = RENDER_WIDTH / 2 - t.width / 2;
        t.y = btnY + (isMobile ? 14 : 9);
        ui.addChild(t);
      });
    } else if (g.state === 'levelselect') {
      this.panel('SELECT LEVEL', [`Level ${g.selectedLevel} / ${MAX_LEVEL}`, '← → ↑ ↓ to choose · Enter to start · Esc for menu'], 'Enter = Start');
    } else if (g.state === 'highscore') {
      this.panel('HIGH SCORES', [`Best Level: ${g.bestLevel}`, `Top Score: ${g.bestScore} PTS`], 'Enter or Esc = Back');
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
      this.panel(`INSTRUCTIONS (${g.instructionPage + 1}/6)`, lines.slice(0, 4), '← → Pages · Esc = Back');
    } else if (g.state === 'complete') {
      this.panel('LEVEL COMPLETE!', [`Level ${g.selectedLevel} Cleared!`, `Total Score: ${g.score} PTS`], 'Enter = Next Level · Esc = Menu');
    } else if (g.state === 'gameover') {
      this.panel('GAME OVER', [...(g.newBest ? ['★ NEW HIGH SCORE! ★'] : []), `Final Score: ${g.score} PTS`], 'Enter = Main Menu');
    }
  }
}

export { BTN };
export type { Input };
