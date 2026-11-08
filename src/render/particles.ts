import * as PIXI from 'pixi.js';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  life: number;
  maxLife: number;
  scale: number;
  color: number;
  type: 'sparkle' | 'bubble' | 'splash' | 'dust' | 'pop' | 'trail';
  rotation?: number;
  vRot?: number;
}

export class ParticleSystem {
  particles: Particle[] = [];
  container = new PIXI.Container();
  gfx = new PIXI.Graphics();

  constructor() {
    this.container.addChild(this.gfx);
  }

  emitSparkles(x: number, y: number, color = 0xffd700, count = 12) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 1.0 + Math.random() * 2.5;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.5,
        alpha: 1,
        life: 0,
        maxLife: 20 + Math.random() * 15,
        scale: 1.5 + Math.random() * 1.5,
        color,
        type: 'sparkle',
        rotation: Math.random() * Math.PI,
        vRot: (Math.random() - 0.5) * 0.3,
      });
    }
  }

  emitPop(x: number, y: number, count = 20) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 3.5;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        alpha: 1,
        life: 0,
        maxLife: 25 + Math.random() * 15,
        scale: 2 + Math.random() * 2.5,
        color: Math.random() > 0.3 ? 0xe33a3f : 0xffa07a,
        type: 'pop',
        rotation: Math.random() * Math.PI,
        vRot: (Math.random() - 0.5) * 0.4,
      });
    }
  }

  emitSplash(x: number, y: number, count = 8) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 8,
        y,
        vx: (Math.random() - 0.5) * 2.2,
        vy: -1.2 - Math.random() * 2.5,
        alpha: 0.9,
        life: 0,
        maxLife: 18 + Math.random() * 12,
        scale: 1 + Math.random() * 1.5,
        color: 0x90e0ef,
        type: 'splash',
      });
    }
  }

  emitBounceDust(x: number, y: number, count = 6) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 6,
        y,
        vx: (Math.random() - 0.5) * 1.8,
        vy: -0.3 - Math.random() * 0.8,
        alpha: 0.6,
        life: 0,
        maxLife: 15 + Math.random() * 10,
        scale: 1.5 + Math.random() * 1.5,
        color: 0xeadbb6,
        type: 'dust',
      });
    }
  }

  emitBubble(x: number, y: number) {
    this.particles.push({
      x: x + (Math.random() - 0.5) * 6,
      y,
      vx: (Math.random() - 0.5) * 0.4,
      vy: -0.6 - Math.random() * 0.6,
      alpha: 0.7,
      life: 0,
      maxLife: 40 + Math.random() * 30,
      scale: 1.2 + Math.random() * 1.8,
      color: 0xcaf0f8,
      type: 'bubble',
    });
  }

  emitTrail(x: number, y: number, radius: number, color = 0x00f5d4) {
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      alpha: 0.55,
      life: 0,
      maxLife: 14,
      scale: radius,
      color,
      type: 'trail',
    });
  }

  /** dtScale: 1.0 at the tuned 30Hz frame rate; scales lifetimes and motion. */
  update(dtScale = 1) {
    const alive: Particle[] = [];
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.life += dtScale;
      if (p.life >= p.maxLife) continue;

      p.x += p.vx * dtScale;
      p.y += p.vy * dtScale;

      if (p.type === 'splash' || p.type === 'pop') {
        p.vy += 0.12 * dtScale; // gravity
      } else if (p.type === 'bubble') {
        p.vx += Math.sin(p.life * 0.2) * 0.08 * dtScale;
      } else if (p.type === 'dust') {
        const damp = Math.pow(0.92, dtScale);
        p.vx *= damp;
        p.vy *= damp;
      }

      if (p.vRot !== undefined && p.rotation !== undefined) {
        p.rotation += p.vRot * dtScale;
      }

      p.alpha = Math.max(0, 1 - p.life / p.maxLife);
      alive.push(p);
    }
    this.particles = alive;
  }

  draw() {
    const g = this.gfx;
    g.clear();

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.alpha <= 0.01) continue;

      if (p.type === 'sparkle') {
        const s = p.scale * (1 - p.life / p.maxLife * 0.5);
        g.rect(p.x - s * 0.5, p.y - s * 0.5, s, s).fill({ color: p.color, alpha: p.alpha });
        g.rect(p.x - s, p.y - s * 0.2, s * 2, s * 0.4).fill({ color: 0xffffff, alpha: p.alpha * 0.9 });
        g.rect(p.x - s * 0.2, p.y - s, s * 0.4, s * 2).fill({ color: 0xffffff, alpha: p.alpha * 0.9 });
      } else if (p.type === 'pop') {
        const s = p.scale * (1 - p.life / p.maxLife * 0.3);
        g.circle(p.x, p.y, s).fill({ color: p.color, alpha: p.alpha });
      } else if (p.type === 'bubble') {
        g.circle(p.x, p.y, p.scale)
          .stroke({ width: 0.8, color: p.color, alpha: p.alpha })
          .fill({ color: 0xffffff, alpha: p.alpha * 0.2 });
        g.circle(p.x - p.scale * 0.3, p.y - p.scale * 0.3, p.scale * 0.25)
          .fill({ color: 0xffffff, alpha: p.alpha * 0.8 });
      } else if (p.type === 'splash' || p.type === 'dust') {
        g.circle(p.x, p.y, p.scale).fill({ color: p.color, alpha: p.alpha });
      } else if (p.type === 'trail') {
        const s = p.scale * (1 - (p.life / p.maxLife) * 0.3);
        g.circle(p.x, p.y, s).stroke({ width: 1.5, color: p.color, alpha: p.alpha });
      }
    }
  }

  clear() {
    this.particles = [];
    this.gfx.clear();
  }
}
