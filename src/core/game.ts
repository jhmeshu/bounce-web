import { SCREEN_WIDTH, SCREEN_HEIGHT, HUD_HEIGHT, TILE_SIZE, Player, BallState, SizeState, MAX_LEVEL, RING_POINTS, GEM_POINTS, LIFE_POINTS, EXIT_POINTS } from './constants';
import { LevelData, loadLevel, setTileId, updateMovingObjects } from './level';
import { playerInit, playerUpdate, setDir, releaseDir, PhysicsHooks } from './physics';
import { MoveDir } from './constants';
import { Input, BTN } from './input';
import { audio } from './audio';

export type GameState = 'splash' | 'menu' | 'levelselect' | 'game' | 'highscore' | 'instructions' | 'complete' | 'gameover';

export class Game {
  state: GameState = 'splash';
  splashT = 0;
  menuSel = 1; // 0 continue,1 new,2 levels,3 scores,4 help
  selectedLevel = 1;
  level: LevelData | null = null;
  player: Player = {} as Player;
  numRings = 0; score = 0; numLives = 3;
  invincible = false;
  savedInProgress = false;
  newBest = false;
  instructionPage = 0;
  bestLevel = 1; bestScore = 0;
  exitOffset = 0; exitState: 'closed' | 'waiting' | 'opening' | 'open' = 'closed';
  respawn = { x: 0, y: 0 };
  camX = 0; camY = 0; camInit = false;
  levelCache = new Map<number, LevelData>();
  hooks: PhysicsHooks;
  onEffect?: (name: string, x: number, y: number) => void;

  constructor(public input: Input) {
    this.hooks = {
      invincible: () => this.invincible,
      onPop: () => {
        audio.playPop();
        this.onEffect?.('pop', this.player.xPos, this.player.yPos);
      },
      onPickup: () => {
        audio.playPickup();
        this.onEffect?.('pickup', this.player.xPos, this.player.yPos);
      },
      onHoop: () => {
        audio.playHoop();
      },
      addScore: (n) => { this.score += n; },
      setRespawn: (x, y) => this.setRespawn(x, y),
      extraLife: () => this.extraLife(),
      ringCollected: (x, y, id) => this.ringCollected(x, y, id),
      exitIsOpen: () => this.exitState === 'open',
      completeLevel: () => this.completeLevel(),
      decLife: () => { this.numLives--; },
    };
    try {
      this.bestLevel = Number(localStorage.getItem('bounce_best_level') ?? 1) || 1;
      this.bestScore = Number(localStorage.getItem('bounce_best_score') ?? 0) || 0;
    } catch { /* ignore */ }
  }
  saveRecords() {
    let changed = false;
    if (this.selectedLevel > this.bestLevel) { this.bestLevel = this.selectedLevel; changed = true; }
    if (this.score > this.bestScore) { this.bestScore = this.score; this.newBest = true; changed = true; }
    if (changed) try {
      localStorage.setItem('bounce_best_level', String(this.bestLevel));
      localStorage.setItem('bounce_best_score', String(this.bestScore));
    } catch { /* ignore */ }
  }
  async ensureLevel(n: number) {
    if (this.levelCache.has(n)) {
      // deep clone tiles so ring deactivation doesn't pollute cache
      const src = this.levelCache.get(n)!;
      const lvl: LevelData = { ...src, tiles: src.tiles.slice(), movingObjects: src.movingObjects.map(o => ({ ...o, topLeft: [...o.topLeft] as [number, number], botRight: [...o.botRight] as [number, number], direction: [...o.direction] as [number, number], offset: [...o.offset] as [number, number] })) };
      return lvl;
    }
    const lvl = await loadLevel(n);
    if (lvl) this.levelCache.set(n, { ...lvl, tiles: lvl.tiles.slice(), movingObjects: lvl.movingObjects.map(o => ({ ...o })) });
    if (!lvl) return null;
    return { ...lvl, tiles: lvl.tiles.slice(), movingObjects: lvl.movingObjects.map(o => ({ ...o, topLeft: [...o.topLeft] as [number, number], botRight: [...o.botRight] as [number, number], direction: [...o.direction] as [number, number], offset: [...o.offset] as [number, number] })) };
  }
  async startLevel(n: number, fresh: boolean) {
    const lvl = await this.ensureLevel(n);
    if (!lvl) return;
    this.level = lvl; this.selectedLevel = n;
    this.numRings = 0;
    if (fresh) { this.score = 0; this.numLives = 3; this.newBest = false; this.savedInProgress = true; }
    this.exitOffset = 0; this.exitState = 'closed';
    this.respawn = { x: lvl.startTileX, y: lvl.startTileY };
    playerInit(this.player, lvl.startPosX, lvl.startPosY, lvl.ballSize === 0 ? SizeState.Small : SizeState.Large);
    this.camInit = false;
    this.state = 'game';
  }
  setRespawn(x: number, y: number) {
    if (!this.level) return;
    // deactivate old: 7 -> 8
    setTileId(this.level, this.respawn.x, this.respawn.y, 8);
    this.respawn = { x, y };
    setTileId(this.level, x, y, 8);
    this.score += GEM_POINTS;
    audio.playPickup();
    this.onEffect?.('checkpoint', x * TILE_SIZE + 6, y * TILE_SIZE + 6);
  }
  extraLife() {
    this.score += LIFE_POINTS;
    if (this.numLives < 5) this.numLives++;
    audio.playPickup();
    this.onEffect?.('pickup', this.player.xPos, this.player.yPos);
  }
  ringCollected(x: number, y: number, id: number) {
    if (!this.level) return;
    const deactivate = (tx: number, ty: number, nid: number) => setTileId(this.level!, tx, ty, nid);
    if (id === 13) { deactivate(x, y, 17); deactivate(x, y + 1, 18); }
    else if (id === 14) { deactivate(x, y, 18); deactivate(x, y - 1, 17); }
    else if (id === 15) { deactivate(x, y, 19); deactivate(x + 1, y, 20); }
    else if (id === 16) { deactivate(x, y, 20); deactivate(x - 1, y, 19); }
    else if (id === 21) { deactivate(x, y, 25); deactivate(x, y + 1, 26); }
    else if (id === 22) { deactivate(x, y, 26); deactivate(x, y - 1, 25); }
    else if (id === 23) { deactivate(x, y, 27); deactivate(x + 1, y, 28); }
    else if (id === 24) { deactivate(x, y, 28); deactivate(x - 1, y, 27); }
    this.score += RING_POINTS; this.numRings++;
    audio.playHoop();
    this.onEffect?.('hoop', x * TILE_SIZE + 6, y * TILE_SIZE + 6);
  }
  completeLevel() {
    this.score += EXIT_POINTS;
    this.saveRecords();
    this.state = 'complete';
  }
  isLevelSmall() {
    if (!this.level) return true;
    return this.level.height * TILE_SIZE < (SCREEN_HEIGHT - HUD_HEIGHT);
  }
  calcCamera() {
    if (!this.level) return;
    const gameH = SCREEN_HEIGHT - HUD_HEIGHT;
    let cx = this.player.xPos - SCREEN_WIDTH / 2;
    if (!this.camInit) { this.camY = this.player.yPos - gameH / 2; this.camInit = true; }
    if (!this.isLevelSmall()) {
      const top = Math.floor(gameH * 0.30), bottom = gameH - top;
      const sy = this.player.yPos - this.camY;
      if (sy < top) this.camY = this.player.yPos - top;
      else if (sy > bottom) this.camY = this.player.yPos - bottom;
    }
    const maxX = this.level.width * TILE_SIZE - SCREEN_WIDTH;
    const maxY = this.level.height * TILE_SIZE - gameH;
    if (cx < 0) cx = 0; if (maxX > 0 && cx > maxX) cx = maxX; if (maxX <= 0) cx = 0;
    let cy: number;
    if (this.isLevelSmall()) cy = -Math.floor((gameH - this.level.height * TILE_SIZE) / 2);
    else { cy = this.camY; if (cy < 0) cy = 0; if (maxY > 0 && cy > maxY) cy = maxY; }
    this.camX = Math.round(cx); this.camY = Math.round(cy);
  }
  exitVisible(): boolean {
    if (!this.level) return false;
    const ex = this.level.exitPosX * TILE_SIZE, ey = this.level.exitPosY * TILE_SIZE;
    const gameH = SCREEN_HEIGHT - HUD_HEIGHT;
    return ex < this.camX + SCREEN_WIDTH && ex + 24 > this.camX && ey < this.camY + gameH && ey + 24 > this.camY;
  }
  updateFixed() {
    const inp = this.input;
    if (this.state !== 'game' || !this.level) return;
    if (inp.consumePressed(BTN.Left) || inp.held(BTN.Left)) setDir(this.player, MoveDir.Left);
    if (inp.consumeReleased(BTN.Left) || !inp.held(BTN.Left)) releaseDir(this.player, MoveDir.Left);
    if (inp.consumePressed(BTN.Right) || inp.held(BTN.Right)) setDir(this.player, MoveDir.Right);
    if (inp.consumeReleased(BTN.Right) || !inp.held(BTN.Right)) releaseDir(this.player, MoveDir.Right);
    if (inp.consumePressed(BTN.Cross) || inp.consumePressed(BTN.Up)) { setDir(this.player, MoveDir.Up); }
    const jumpHeld = inp.held(BTN.Cross) || inp.held(BTN.Up);
    if (inp.consumeReleased(BTN.Cross) || inp.consumeReleased(BTN.Up) || !jumpHeld) releaseDir(this.player, MoveDir.Up);
    playerUpdate(this.player, this.level, this.hooks);
    if (this.player.ballState === BallState.Dead) {
      if (this.numLives < 0) {
        this.saveRecords(); this.savedInProgress = false; this.state = 'gameover';
      } else {
        const sz = this.player.sizeState;
        const half = sz === SizeState.Small ? 6 : 8;
        playerInit(this.player, this.respawn.x * TILE_SIZE + half, this.respawn.y * TILE_SIZE + half, sz);
        this.camInit = false;
        inp.resetEdges();
      }
    }
    updateMovingObjects(this.level);
    if (this.level && this.numRings >= this.level.totalRings && this.exitState === 'closed') this.exitState = 'waiting';
    this.calcCamera();
    if (this.exitState === 'waiting' && this.exitVisible()) this.exitState = 'opening';
    if (this.exitState === 'opening' && this.exitVisible()) {
      this.exitOffset += 4;
      if (this.exitOffset >= 24) { this.exitOffset = 24; this.exitState = 'open'; }
    }
    // cheat L+R: Q+E or holding R(E) + pressing L(Q)
    if (inp.consumePressed(BTN.L) && inp.held(BTN.R)) { this.invincible = !this.invincible; audio.playHoop(); }
    if (inp.consumePressed(BTN.Start)) { this.savedInProgress = true; this.state = 'menu'; if (this.menuSel === 0 && !this.savedInProgress) this.menuSel = 1; }
  }
  updateVariable() {
    const inp = this.input;
    const menuCount = 5;
    const canContinue = this.savedInProgress;
    switch (this.state) {
      case 'splash':
        this.splashT++;
        if (inp.consumePressed(BTN.Cross) || inp.consumePressed(BTN.Start) || this.splashT > 150) { this.state = 'menu'; this.splashT = 0; }
        break;
      case 'menu': {
        if (this.menuSel === 0 && !canContinue) this.menuSel = 1;
        // up/down
        if (inp.consumePressed(1 satisfies number as number) || (inp as unknown as { pressedNow: (b: number) => boolean }).pressedNow(BTN.Left)) { /* noop */ }
        break;
      }
      default: break;
    }
    void menuCount;
  }
  menuNav(up: boolean, down: boolean, select: boolean) {
    if (this.menuSel === 0 && !this.savedInProgress) this.menuSel = 1;
    if (up && this.menuSel > 0) { this.menuSel--; if (this.menuSel === 0 && !this.savedInProgress) this.menuSel = 1; }
    if (down && this.menuSel < 4) this.menuSel++;
    if (select) {
      audio.unlock();
      if (this.menuSel === 0 && this.savedInProgress) this.state = 'game';
      else if (this.menuSel === 1) void this.startLevel(1, true);
      else if (this.menuSel === 2) this.state = 'levelselect';
      else if (this.menuSel === 3) this.state = 'highscore';
      else if (this.menuSel === 4) { this.instructionPage = 0; this.state = 'instructions'; }
    }
  }
}
export const INSTRUCTIONS = [
  'Bounce the ball with 4/6 or arrows. Press 2 / Space / Up to bounce higher. Collect all rings to open the exit door.',
  'Blue blocks are bouncy. Red bricks are solid. Avoid spikes! L+R (Q+E) toggles invincibility cheat.',
  'Rings: jump through hoops to collect 500 pts. Gems (200 pts) set your checkpoint. Extra life ball gives 1000 pts.',
  'Size matters: big ball bounces lower but survives? Small rings block the big ball. Use red arrows to shrink/grow.',
  'Bonuses: lightning = speed, gravity arrows flip gravity, jump arrows boost jump. All last 300 ticks.',
  'Finish all 11 levels. Exit gives 5000 pts. Good luck!',
];
