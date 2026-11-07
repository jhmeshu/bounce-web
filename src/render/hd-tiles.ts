import * as PIXI from 'pixi.js';
import { TILE_SIZE } from '../core/constants';
import { TF } from '../core/tiles';

export class HDTileLibrary {
  contexts = new Map<string, PIXI.GraphicsContext>();

  constructor() {
    this.buildAll();
  }

  getContext(key: string): PIXI.GraphicsContext | undefined {
    return this.contexts.get(key);
  }

  private buildAll() {
    const s = TILE_SIZE; // 12 logical units

    // 1. Red Brick (Tile 1)
    {
      const ctx = new PIXI.GraphicsContext();
      // Base brick body
      ctx.rect(0, 0, s, s).fill(0xbf360c);
      // Top/Left highlight bevel
      ctx.moveTo(0, s).lineTo(0, 0).lineTo(s, 0).lineTo(s - 1, 1).lineTo(1, 1).lineTo(1, s - 1).closePath()
        .fill(0xff7043);
      // Bottom/Right shadow bevel
      ctx.moveTo(s, 0).lineTo(s, s).lineTo(0, s).lineTo(1, s - 1).lineTo(s - 1, s - 1).lineTo(s - 1, 1).closePath()
        .fill(0x5d1000);
      // Mortar split line (creates stylized dual-course brick look)
      ctx.rect(1, 5, s - 2, 1).fill(0x400c00);
      ctx.rect(1, 6, s - 2, 0.5).fill(0xff8a65);
      // Vertical mortar seams
      ctx.rect(5, 1, 1, 4).fill(0x400c00);
      ctx.rect(7, 6.5, 1, 4.5).fill(0x400c00);
      this.contexts.set('tile_1', ctx);
    }

    // 2. Blue Rubber Bouncy Block (Tile 2)
    {
      const ctx = new PIXI.GraphicsContext();
      // Outer rubber body with bevel
      ctx.rect(0, 0, s, s).fill(0x005bbb);
      // Inner cushion
      ctx.roundRect(1, 1, s - 2, s - 2, 2).fill(0x0088ff);
      // Glossy highlight arc
      ctx.roundRect(2, 2, s - 4, 3, 1.5).fill({ color: 0xcceeff, alpha: 0.8 });
      // Vibrant neon core
      ctx.circle(s / 2, s / 2 + 1, 2).fill({ color: 0x00e5ff, alpha: 0.6 });
      // Border outline
      ctx.rect(0, 0, s, s).stroke({ width: 0.75, color: 0x003388 });
      this.contexts.set('tile_2', ctx);
    }

    // 3. Spikes (Up, Left, Down, Right)
    {
      // Spike Up (Tile 3)
      const ctxUp = new PIXI.GraphicsContext();
      // Danger base line
      ctxUp.rect(0, s - 2, s, 2).fill(0x4a1013);
      // 2 sharp conical spikes
      for (let i = 0; i < 2; i++) {
        const bx = i * 6 + 1;
        // Left shaded side
        ctxUp.poly([bx, s - 2, bx + 2.5, 1, bx + 2.5, s - 2], true).fill(0xe0e0e0);
        // Right shadow side
        ctxUp.poly([bx + 2.5, 1, bx + 5, s - 2, bx + 2.5, s - 2], true).fill(0x757575);
        // Danger crimson tip
        ctxUp.poly([bx + 1.5, 4, bx + 2.5, 1, bx + 3.5, 4], true).fill(0xe53935);
        // Specular glint
        ctxUp.moveTo(bx + 2.5, 1).lineTo(bx + 2, s - 2).stroke({ width: 0.5, color: 0xffffff });
      }
      this.contexts.set('spike_up', ctxUp);

      // Spike Left Wall (Tile 4 — mounted on a wall to its LEFT, tips point RIGHT)
      const ctxLeft = new PIXI.GraphicsContext();
      ctxLeft.rect(0, 0, 2, s).fill(0x4a1013);
      for (let i = 0; i < 2; i++) {
        const by = i * 6 + 1;
        ctxLeft.poly([2, by, s - 1, by + 2.5, 2, by + 2.5], true).fill(0xe0e0e0);
        ctxLeft.poly([s - 1, by + 2.5, 2, by + 5, 2, by + 2.5], true).fill(0x757575);
        ctxLeft.poly([s - 4, by + 1.5, s - 1, by + 2.5, s - 4, by + 3.5], true).fill(0xe53935);
        ctxLeft.moveTo(s - 1, by + 2.5).lineTo(2, by + 2).stroke({ width: 0.5, color: 0xffffff });
      }
      this.contexts.set('spike_left', ctxLeft);

      // Spike Down (Tile 5)
      const ctxDown = new PIXI.GraphicsContext();
      ctxDown.rect(0, 0, s, 2).fill(0x4a1013);
      for (let i = 0; i < 2; i++) {
        const bx = i * 6 + 1;
        ctxDown.poly([bx, 2, bx + 2.5, s - 1, bx + 2.5, 2], true).fill(0xe0e0e0);
        ctxDown.poly([bx + 2.5, s - 1, bx + 5, 2, bx + 2.5, 2], true).fill(0x757575);
        ctxDown.poly([bx + 1.5, s - 4, bx + 2.5, s - 1, bx + 3.5, s - 4], true).fill(0xe53935);
        ctxDown.moveTo(bx + 2.5, s - 1).lineTo(bx + 2, 2).stroke({ width: 0.5, color: 0xffffff });
      }
      this.contexts.set('spike_down', ctxDown);

      // Spike Right Wall (Tile 6 — mounted on a wall to its RIGHT, tips point LEFT)
      const ctxRight = new PIXI.GraphicsContext();
      ctxRight.rect(s - 2, 0, 2, s).fill(0x4a1013);
      for (let i = 0; i < 2; i++) {
        const by = i * 6 + 1;
        ctxRight.poly([s - 2, by, 1, by + 2.5, s - 2, by + 2.5], true).fill(0xe0e0e0);
        ctxRight.poly([1, by + 2.5, s - 2, by + 5, s - 2, by + 2.5], true).fill(0x757575);
        ctxRight.poly([4, by + 1.5, 1, by + 2.5, 4, by + 3.5], true).fill(0xe53935);
        ctxRight.moveTo(1, by + 2.5).lineTo(s - 2, by + 2).stroke({ width: 0.5, color: 0xffffff });
      }
      this.contexts.set('spike_right', ctxRight);
    }

    // 4. Checkpoint Gem (Tile 7 = off, Tile 8 = on)
    {
      // Gem Inactive (Tile 7)
      const ctxOff = new PIXI.GraphicsContext();
      // Metallic pedestal
      ctxOff.rect(3, s - 2, 6, 2).fill(0x555555);
      // Faceted Diamond body (Amber/Orange gemstone)
      ctxOff.poly([6, 1, 10, 5, 6, 10, 2, 5], true).fill(0xf57c00);
      // Top facets
      ctxOff.poly([6, 1, 10, 5, 6, 5], true).fill(0xffb74d);
      ctxOff.poly([6, 1, 2, 5, 6, 5], true).fill(0xffe082);
      // Bottom facet
      ctxOff.poly([6, 5, 6, 10, 10, 5], true).fill(0xe65100);
      // Specular glint
      ctxOff.circle(5, 4, 1).fill({ color: 0xffffff, alpha: 0.9 });
      this.contexts.set('tile_7', ctxOff);

      // Gem Active (Tile 8)
      const ctxOn = new PIXI.GraphicsContext();
      // Glowing green pedestal
      ctxOn.rect(3, s - 2, 6, 2).fill(0x1b5e20);
      // Halo glow
      ctxOn.circle(6, 5, 5.5).fill({ color: 0x00e676, alpha: 0.35 });
      // Emerald Diamond
      ctxOn.poly([6, 1, 10, 5, 6, 10, 2, 5], true).fill(0x00c853);
      ctxOn.poly([6, 1, 10, 5, 6, 5], true).fill(0x69f0ae);
      ctxOn.poly([6, 1, 2, 5, 6, 5], true).fill(0xb9f6ca);
      ctxOn.poly([6, 5, 6, 10, 10, 5], true).fill(0x007e33);
      // Bright glint
      ctxOn.circle(5, 4, 1.5).fill(0xffffff);
      this.contexts.set('tile_8', ctxOn);
    }

    // 5. Golden Hoops / Rings (Tile 13-28)
    // Hoops span 2 cells (either vert: top/bottom, or horiz: left/right)
    // Tiles 13-20: Small Hoops (sized for Normal Ball d=12, blocks Enlarged Ball d=16)
    // Tiles 21-28: Large Hoops (sized for Enlarged Ball d=16, allows both sizes)
    {
      const drawEllipticalArc = (
        ctx: PIXI.GraphicsContext,
        cx: number, cy: number,
        rx: number, ry: number,
        startAngle: number, endAngle: number,
        steps = 20
      ) => {
        for (let i = 0; i <= steps; i++) {
          const a = startAngle + (i / steps) * (endAngle - startAngle);
          const px = cx + rx * Math.cos(a);
          const py = cy + ry * Math.sin(a);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
      };

      const buildHoopPart = (vert: boolean, isTopOrLeft: boolean, active: boolean, isLarge: boolean) => {
        const ctx = new PIXI.GraphicsContext();
        const mainCol = active ? (isLarge ? 0xffb300 : 0xffc107) : 0xb0bec5;
        const lightCol = active ? (isLarge ? 0xfff59d : 0xfff9c4) : 0xeceff1;
        const darkCol = active ? (isLarge ? 0xff6f00 : 0xff8f00) : 0x78909c;
        const coreCol = active ? 0xffd54f : 0xcfd8dc;
        const mountCol = 0x37474f;
        const mountHighlight = 0x546e7a;

        // Radii:
        // Small Hoop: Sized for normal ball (diameter 12).
        // Opening = 12.8px (fits 12px ball with 0.8px clearance; blocks 16px big ball!).
        // Outer major diameter = 17.2px, outer minor diameter = 8.4px.
        //
        // Large Hoop: Sized for enlarged ball (diameter 16).
        // Opening = 17.8px (fits 16px ball with 1.8px clearance; small ball fits with 5.8px clearance!).
        // Outer major diameter = 23.0px, outer minor diameter = 10.8px.
        const rMajor = isLarge ? 10.2 : 7.5;
        const rMinor = isLarge ? 4.6 : 3.4;
        const strokeW = isLarge ? 2.0 : 1.6;
        const highlightW = isLarge ? 0.8 : 0.6;

        if (vert) {
          // Vertical hoop (center is x = 6; seam at y = s for top, y = 0 for bottom)
          const rx = rMinor;
          const ry = rMajor;
          const a0 = isTopOrLeft ? Math.PI : 0;
          const a1 = isTopOrLeft ? 2 * Math.PI : Math.PI;
          const cy = isTopOrLeft ? s : 0;

          // 1. Dark depth stroke (rim shadow)
          drawEllipticalArc(ctx, 6, cy, rx, ry, a0, a1);
          ctx.stroke({ width: strokeW + 0.6, color: darkCol, cap: 'butt' });

          // 2. Main metallic body
          drawEllipticalArc(ctx, 6, cy, rx, ry, a0, a1);
          ctx.stroke({ width: strokeW, color: mainCol, cap: 'butt' });

          // 3. Highlight reflection along upper/inner rim
          const hOff = isTopOrLeft ? 0.3 : -0.3;
          drawEllipticalArc(ctx, 6, cy, rx - 0.2, ry + hOff, a0, a1);
          ctx.stroke({ width: highlightW, color: lightCol, cap: 'butt' });

          // 4. Large hoop extra detail: center core glow / bevel ridge
          if (isLarge) {
            drawEllipticalArc(ctx, 6, cy, rx, ry, a0, a1);
            ctx.stroke({ width: 0.5, color: coreCol, alpha: 0.8, cap: 'butt' });
          }

          // 5. Mount brackets
          if (isTopOrLeft) {
            // Apex mount (top)
            const apexY = s - ry;
            if (isLarge) {
              // Heavy-duty reinforced top bracket
              ctx.rect(4.5, 0, 3, apexY + 0.5).fill(mountCol);
              ctx.rect(4.2, apexY - 0.5, 3.6, 1.2).fill(mountHighlight);
              ctx.circle(6, apexY * 0.5, 0.7).fill(0x263238);
            } else {
              // Compact neat top pin mount
              ctx.rect(5.2, 0, 1.6, apexY + 0.5).fill(mountCol);
              ctx.circle(6, apexY, 1.1).fill(mountHighlight);
            }
          } else {
            // Base mount (ground / bottom)
            const baseY = ry;
            if (isLarge) {
              // Heavy pedestal mount bracket
              ctx.rect(4.0, baseY - 0.5, 4.0, s - baseY + 0.5).fill(mountCol);
              ctx.rect(3.5, s - 2, 5.0, 2).fill(mountHighlight);
              ctx.circle(5, s - 1, 0.6).fill(0x212121);
              ctx.circle(7, s - 1, 0.6).fill(0x212121);
            } else {
              // Standard floor mount
              ctx.rect(4.8, baseY - 0.5, 2.4, s - baseY + 0.5).fill(mountCol);
              ctx.rect(4.2, s - 1.5, 3.6, 1.5).fill(mountHighlight);
            }
          }

          // 6. Radiant glints & sparkles (when active)
          if (active) {
            if (isTopOrLeft) {
              const gx = 6 - rx * 0.7;
              const gy = s - ry * 0.7;
              ctx.circle(gx, gy, isLarge ? 1.4 : 1.0).fill({ color: 0xffffff, alpha: 0.95 });
              if (isLarge) {
                ctx.circle(6 + rx * 0.65, s - ry * 0.75, 0.9).fill({ color: 0xfff9c4, alpha: 0.85 });
              }
            } else {
              const gx = 6 + rx * 0.65;
              const gy = ry * 0.65;
              ctx.circle(gx, gy, isLarge ? 1.1 : 0.8).fill({ color: 0xffffff, alpha: 0.9 });
            }
          }
        } else {
          // Horizontal hoop (center is y = 6; seam at x = s for left, x = 0 for right)
          const rx = rMajor;
          const ry = rMinor;
          const a0 = isTopOrLeft ? 0.5 * Math.PI : 1.5 * Math.PI;
          const a1 = isTopOrLeft ? 1.5 * Math.PI : 2.5 * Math.PI;
          const cx = isTopOrLeft ? s : 0;

          // 1. Dark depth stroke
          drawEllipticalArc(ctx, cx, 6, rx, ry, a0, a1);
          ctx.stroke({ width: strokeW + 0.6, color: darkCol, cap: 'butt' });

          // 2. Main metallic body
          drawEllipticalArc(ctx, cx, 6, rx, ry, a0, a1);
          ctx.stroke({ width: strokeW, color: mainCol, cap: 'butt' });

          // 3. Highlight reflection along top edge
          const hOff = isTopOrLeft ? 0.3 : -0.3;
          drawEllipticalArc(ctx, cx, 6, rx + hOff, ry - 0.2, a0, a1);
          ctx.stroke({ width: highlightW, color: lightCol, cap: 'butt' });

          // 4. Large hoop extra detail: center core glow / bevel ridge
          if (isLarge) {
            drawEllipticalArc(ctx, cx, 6, rx, ry, a0, a1);
            ctx.stroke({ width: 0.5, color: coreCol, alpha: 0.8, cap: 'butt' });
          }

          // 5. Mount brackets
          if (isTopOrLeft) {
            // Left wall mount
            const edgeX = s - rx;
            if (isLarge) {
              ctx.rect(0, 4.5, edgeX + 0.5, 3.0).fill(mountCol);
              ctx.rect(0, 4.0, 2.0, 4.0).fill(mountHighlight);
              ctx.circle(1.0, 6, 0.7).fill(0x212121);
            } else {
              ctx.rect(0, 5.0, edgeX + 0.5, 2.0).fill(mountCol);
              ctx.rect(0, 4.5, 1.6, 3.0).fill(mountHighlight);
            }
          } else {
            // Right wall mount
            const edgeX = rx;
            if (isLarge) {
              ctx.rect(edgeX - 0.5, 4.5, s - edgeX + 0.5, 3.0).fill(mountCol);
              ctx.rect(s - 2.0, 4.0, 2.0, 4.0).fill(mountHighlight);
              ctx.circle(s - 1.0, 6, 0.7).fill(0x212121);
            } else {
              ctx.rect(edgeX - 0.5, 5.0, s - edgeX + 0.5, 2.0).fill(mountCol);
              ctx.rect(s - 1.6, 4.5, 1.6, 3.0).fill(mountHighlight);
            }
          }

          // 6. Radiant glints & sparkles (when active)
          if (active) {
            if (isTopOrLeft) {
              const gx = s - rx * 0.7;
              const gy = 6 - ry * 0.7;
              ctx.circle(gx, gy, isLarge ? 1.4 : 1.0).fill({ color: 0xffffff, alpha: 0.95 });
              if (isLarge) {
                ctx.circle(s - rx * 0.75, 6 + ry * 0.65, 0.9).fill({ color: 0xfff9c4, alpha: 0.85 });
              }
            } else {
              const gx = rx * 0.65;
              const gy = 6 + ry * 0.65;
              ctx.circle(gx, gy, isLarge ? 1.1 : 0.8).fill({ color: 0xffffff, alpha: 0.9 });
            }
          }
        }
        return ctx;
      };

      // Hoops 13-16 (small active) and 17-20 (small inactive)
      // 13: vertTop, 14: vertBottom, 15: horizLeft, 16: horizRight
      this.contexts.set('hoop_13', buildHoopPart(true, true, true, false));
      this.contexts.set('hoop_14', buildHoopPart(true, false, true, false));
      this.contexts.set('hoop_15', buildHoopPart(false, true, true, false));
      this.contexts.set('hoop_16', buildHoopPart(false, false, true, false));

      this.contexts.set('hoop_17', buildHoopPart(true, true, false, false));
      this.contexts.set('hoop_18', buildHoopPart(true, false, false, false));
      this.contexts.set('hoop_19', buildHoopPart(false, true, false, false));
      this.contexts.set('hoop_20', buildHoopPart(false, false, false, false));

      // Hoops 21-24 (large active) and 25-28 (large inactive)
      this.contexts.set('hoop_21', buildHoopPart(true, true, true, true));
      this.contexts.set('hoop_22', buildHoopPart(true, false, true, true));
      this.contexts.set('hoop_23', buildHoopPart(false, true, true, true));
      this.contexts.set('hoop_24', buildHoopPart(false, false, true, true));

      this.contexts.set('hoop_25', buildHoopPart(true, true, false, true));
      this.contexts.set('hoop_26', buildHoopPart(true, false, false, true));
      this.contexts.set('hoop_27', buildHoopPart(false, true, false, true));
      this.contexts.set('hoop_28', buildHoopPart(false, false, false, true));
    }

    // 6. Extra Life (Tile 29)
    {
      const ctx = new PIXI.GraphicsContext();
      // Glowing aura
      ctx.circle(6, 6, 5.5).fill({ color: 0xffd54f, alpha: 0.3 });
      // Mini 3D Golden Ball
      ctx.circle(6, 6, 4.2).fill(0xffa000);
      ctx.circle(5, 5, 3.2).fill(0xffd54f);
      ctx.circle(4.5, 4.5, 1.5).fill(0xffffff);
      // Golden mini heart / star center
      ctx.poly([6, 3, 7, 5, 9, 5, 7.5, 6.5, 8, 8.5, 6, 7.2, 4, 8.5, 4.5, 6.5, 3, 5, 5, 5], true)
        .fill(0xff6f00);
      this.contexts.set('tile_29', ctx);
    }

    // 7. Brick Ramps (Tile 30-33)
    // Solid corners must match physics collision (masks.ts):
    // 30 = solid TL, 31 = solid TR, 32 = solid BR, 33 = solid BL
    {
      // 30: solid at TL, slope descends TR -> BL
      const ctx30 = new PIXI.GraphicsContext();
      ctx30.poly([0, 0, s, 0, 0, s], true).fill(0xbf360c);
      ctx30.moveTo(0, 0).lineTo(s, 0).stroke({ width: 1, color: 0x5d1000 });
      ctx30.moveTo(0, 0).lineTo(0, s).stroke({ width: 1, color: 0x5d1000 });
      ctx30.moveTo(s, 0).lineTo(0, s).stroke({ width: 1.2, color: 0xff8a65 });
      this.contexts.set('ramp_30', ctx30);

      // 31: solid at TR, slope descends TL -> BR
      const ctx31 = new PIXI.GraphicsContext();
      ctx31.poly([0, 0, s, 0, s, s], true).fill(0xbf360c);
      ctx31.moveTo(0, 0).lineTo(s, 0).stroke({ width: 1, color: 0x5d1000 });
      ctx31.moveTo(s, 0).lineTo(s, s).stroke({ width: 1, color: 0x5d1000 });
      ctx31.moveTo(0, 0).lineTo(s, s).stroke({ width: 1.2, color: 0xff8a65 });
      this.contexts.set('ramp_31', ctx31);

      // 32: solid at BR, slope descends TR -> BL
      const ctx32 = new PIXI.GraphicsContext();
      ctx32.poly([s, 0, s, s, 0, s], true).fill(0xbf360c);
      ctx32.moveTo(s, 0).lineTo(s, s).stroke({ width: 1, color: 0x5d1000 });
      ctx32.moveTo(s, s).lineTo(0, s).stroke({ width: 1, color: 0x5d1000 });
      ctx32.moveTo(s, 0).lineTo(0, s).stroke({ width: 1.2, color: 0xff8a65 });
      this.contexts.set('ramp_32', ctx32);

      // 33: solid at BL, slope descends TL -> BR
      const ctx33 = new PIXI.GraphicsContext();
      ctx33.poly([0, 0, s, s, 0, s], true).fill(0xbf360c);
      ctx33.moveTo(0, 0).lineTo(0, s).stroke({ width: 1, color: 0x5d1000 });
      ctx33.moveTo(0, s).lineTo(s, s).stroke({ width: 1, color: 0x5d1000 });
      ctx33.moveTo(0, 0).lineTo(s, s).stroke({ width: 1.2, color: 0xff8a65 });
      this.contexts.set('ramp_33', ctx33);
    }

    // 8. Rubber Ramps (Tile 34-37) — same solid corners as 30-33
    {
      const makeRubberRamp = (pts: number[], hyp: [number, number, number, number]) => {
        const ctx = new PIXI.GraphicsContext();
        ctx.poly(pts, true).fill(0x005bbb);
        ctx.moveTo(hyp[0], hyp[1]).lineTo(hyp[2], hyp[3]).stroke({ width: 1.5, color: 0x00e5ff });
        return ctx;
      };
      // 34: solid TL
      this.contexts.set('ramp_34', makeRubberRamp([0, 0, s, 0, 0, s], [s, 0, 0, s]));
      // 35: solid TR
      this.contexts.set('ramp_35', makeRubberRamp([0, 0, s, 0, s, s], [0, 0, s, s]));
      // 36: solid BR
      this.contexts.set('ramp_36', makeRubberRamp([s, 0, s, s, 0, s], [s, 0, 0, s]));
      // 37: solid BL
      this.contexts.set('ramp_37', makeRubberRamp([0, 0, s, s, 0, s], [0, 0, s, s]));
    }

    // 9. Speed Bonus (Tile 38)
    {
      const ctx = new PIXI.GraphicsContext();
      ctx.roundRect(1, 1, s - 2, s - 2, 2).fill(0x212121);
      ctx.roundRect(1, 1, s - 2, s - 2, 2).stroke({ width: 0.8, color: 0xffd54f });
      // Golden fast chevrons >>
      ctx.poly([3, 3, 6, 6, 3, 9, 4.5, 9, 7.5, 6, 4.5, 3], true).fill(0xffd54f);
      ctx.poly([6, 3, 9, 6, 6, 9, 7.5, 9, 10.5, 6, 7.5, 3], true).fill(0xffea00);
      this.contexts.set('tile_38', ctx);
    }

    // 10. Deflators (Tile 39-42) — single purple flower (shrinks the ball)
    // 11. Inflators (Tile 43-46) — single green flower (enlarges the ball)
    {
      const makeFlower = (petal: number, petalLight: number, center: number) => {
        const ctx = new PIXI.GraphicsContext();
        // Soft halo backdrop so the flower reads on any background
        ctx.circle(6, 6, 5.7).fill({ color: 0xffffff, alpha: 0.16 });
        // Six petals around the center
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i - Math.PI / 2;
          const px = 6 + Math.cos(a) * 3.3;
          const py = 6 + Math.sin(a) * 3.3;
          ctx.circle(px, py, 2.05).fill(petal);
          ctx.circle(px - 0.55, py - 0.55, 0.95).fill({ color: petalLight, alpha: 0.9 });
        }
        // Flower center
        ctx.circle(6, 6, 1.6).fill(center);
        ctx.circle(5.5, 5.5, 0.55).fill({ color: 0xffffff, alpha: 0.95 });
        return ctx;
      };

      this.contexts.set('deflator_39', makeFlower(0x7b1fa2, 0xce93d8, 0x4a148c));
      this.contexts.set('deflator_40', makeFlower(0x7b1fa2, 0xce93d8, 0x4a148c));
      this.contexts.set('deflator_41', makeFlower(0x7b1fa2, 0xce93d8, 0x4a148c));
      this.contexts.set('deflator_42', makeFlower(0x7b1fa2, 0xce93d8, 0x4a148c));

      this.contexts.set('inflator_43', makeFlower(0x1b5e20, 0x81c784, 0x00e676));
      this.contexts.set('inflator_44', makeFlower(0x1b5e20, 0x81c784, 0x00e676));
      this.contexts.set('inflator_45', makeFlower(0x1b5e20, 0x81c784, 0x00e676));
      this.contexts.set('inflator_46', makeFlower(0x1b5e20, 0x81c784, 0x00e676));
    }

    // 12. Gravity Pads (Tile 47-50)
    {
      const makeGravity = (rot: number) => {
        const ctx = new PIXI.GraphicsContext();
        ctx.rect(0, 0, s, s).fill(0x0d47a1);
        ctx.roundRect(1, 1, s - 2, s - 2, 2).stroke({ width: 0.75, color: 0x82b1ff });
        // Gravity vortex concentric rings
        ctx.circle(6, 6, 4.2).stroke({ width: 0.8, color: 0x448aff });
        ctx.circle(6, 6, 2.2).stroke({ width: 0.8, color: 0x2979ff });
        ctx.circle(6, 6, 1).fill(0xffffff);
        return ctx;
      };
      this.contexts.set('gravity_47', makeGravity(0));
      this.contexts.set('gravity_48', makeGravity(1));
      this.contexts.set('gravity_49', makeGravity(2));
      this.contexts.set('gravity_50', makeGravity(3));
    }

    // 13. Jump Pads (Tile 51-54)
    {
      const makeJump = (rot: number) => {
        const ctx = new PIXI.GraphicsContext();
        ctx.rect(0, 0, s, s).fill(0xe65100);
        ctx.roundRect(1, 1, s - 2, s - 2, 2).stroke({ width: 0.75, color: 0xffd180 });
        // Hydraulic coiled spring arrows pointing up
        ctx.poly([6, 2, 3, 5, 5, 5, 5, 9, 7, 9, 7, 5, 9, 5], true).fill(0xffab00);
        ctx.rect(3, 9.5, 6, 1.5).fill(0xff6d00);
        return ctx;
      };
      this.contexts.set('jump_51', makeJump(0));
      this.contexts.set('jump_52', makeJump(1));
      this.contexts.set('jump_53', makeJump(2));
      this.contexts.set('jump_54', makeJump(3));
    }
  }
}
