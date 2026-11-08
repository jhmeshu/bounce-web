// Faithful port of physics.c (Ball.java logic)
import {
  TILE_SIZE, Player, BallState, SizeState, MoveDir,
  NORMAL_SIZE, HALF_NORMAL_SIZE, ENLARGED_SIZE, HALF_ENLARGED_SIZE,
  JUMP_STRENGTH, JUMP_BONUS_STRENGTH,
  NORMAL_GRAVITY_ACCELL, LARGE_GRAVITY_ACCELL, NORMAL_MAX_GRAVITY, LARGE_MAX_GRAVITY,
  UWATER_MAX_GRAVITY, UWATER_GRAVITY_ACCELL, UWATER_LARGE_MAX_GRAVITY, LARGE_UWATER_GRAVITY_ACCELL,
  BASE_GRAVITY, MAX_TOTAL_SPEED, HORZ_ACCELL, FRICTION_DECELL, MAX_HORZ_SPEED, MAX_HORZ_BONUS_SPEED,
  MIN_BOUNCE_SPEED, ROOF_COLLISION_SPEED, BONUS_DURATION, POPPED_FRAMES, THIN_TILE_SIZE,
  MOVEMENT_STEP_DIVISOR, MAX_PLACEMENT_OFFSET, TILE_ID_MASK, TILE_FLAG_WATER,
  TILE_CHECKPOINT, TILE_EXIT, TILE_EXTRA_LIFE, TILE_SPEED_BONUS,
  TILE_DEFLATOR_FLOOR, TILE_DEFLATOR_LEFT_WALL, TILE_DEFLATOR_CEILING, TILE_DEFLATOR_RIGHT_WALL,
  TILE_INFLATOR_FLOOR, TILE_INFLATOR_LEFT_WALL, TILE_INFLATOR_CEILING, TILE_INFLATOR_RIGHT_WALL,
  TILE_GRAVITY_FLOOR, TILE_GRAVITY_LEFT_WALL, TILE_GRAVITY_CEILING, TILE_GRAVITY_RIGHT_WALL,
  TILE_JUMP_FLOOR, TILE_JUMP_LEFT_WALL, TILE_JUMP_CEILING, TILE_JUMP_RIGHT_WALL,
} from './constants';
import { TRI_TILE_DATA, SMALL_BALL_DATA, LARGE_BALL_DATA } from './masks';
import { LevelData, tileRawAt, setTileId, findMovingObjectAt } from './level';
import { TILE_DB } from './tiles';

export interface PhysicsHooks {
  invincible: () => boolean;
  onPop: () => void;
  onPickup: () => void;
  onHoop: () => void;
  addScore: (n: number) => void;
  setRespawn: (x: number, y: number) => void;
  extraLife: () => void;
  ringCollected: (x: number, y: number, id: number) => void;
  exitIsOpen: () => boolean;
  completeLevel: () => void;
  decLife: () => void;
}

// A placement probe needs the gadget switch's blocking answer but must not resize the ball, pop it,
// fire a hook, or mutate the level. It runs with this stub so the switch's hook calls stay safe.
const PROBE_HOOKS: PhysicsHooks = {
  invincible: () => false, onPop: () => {}, onPickup: () => {}, onHoop: () => {},
  addScore: () => {}, setRespawn: () => {}, extraLife: () => {}, ringCollected: () => {},
  exitIsOpen: () => false, completeLevel: () => {}, decLife: () => {},
};

export function playerInit(p: Player, x: number, y: number, size: SizeState, lvl: LevelData) {
  p.xPos = x; p.yPos = y; p.globalBallX = 0; p.globalBallY = 0;
  p.xSpeed = 0; p.ySpeed = 0; p.direction = 0; p.jumpOffset = 0;
  p.ballState = BallState.Normal; p.sizeState = size;
  if (size === SizeState.Small) { p.ballSize = NORMAL_SIZE; p.mHalfBallSize = HALF_NORMAL_SIZE; }
  else { p.ballSize = ENLARGED_SIZE; p.mHalfBallSize = HALF_ENLARGED_SIZE; }
  p.mGroundedFlag = false; p.mCDRubberFlag = false; p.mCDRampFlag = false;
  p.speedBonusCntr = 0; p.gravBonusCntr = 0; p.jumpBonusCntr = 0;
  p.popCntr = 0; p.slideCntr = 0; p.isInWater = false;
  p.groundedTimer = 0;
  // A large ball can start or respawn at a spot whose space only fits a small ball. Level 11's
  // checkpoint gem sits in a one-tile deflator ring, and level 9's start tile has a 16px box
  // overlapping brick, so a size-preserving respawn there would freeze forever. The original
  // recovers because its ball constructor calls the grow routine, and so this same walk, whenever
  // the ball starts large. Falling back to small covers the pockets the walk cannot clear, so the
  // ball is never left at a size that does not fit.
  if (size === SizeState.Large && !findFreeSpot(p, lvl)) {
    p.sizeState = SizeState.Small; p.ballSize = NORMAL_SIZE; p.mHalfBallSize = HALF_NORMAL_SIZE;
    findFreeSpot(p, lvl);
  }
}
export function setDir(p: Player, d: MoveDir) { if (d === MoveDir.Left || d === MoveDir.Right || d === MoveDir.Up) p.direction |= d; }
export function releaseDir(p: Player, d: MoveDir) { if (d === MoveDir.Left || d === MoveDir.Right || d === MoveDir.Up) p.direction &= ~d; }

function clampSpeed(p: Player) {
  if (p.ySpeed < -MAX_TOTAL_SPEED) p.ySpeed = -MAX_TOTAL_SPEED;
  else if (p.ySpeed > MAX_TOTAL_SPEED) p.ySpeed = MAX_TOTAL_SPEED;
  if (p.xSpeed < -MAX_TOTAL_SPEED) p.xSpeed = -MAX_TOTAL_SPEED;
  else if (p.xSpeed > MAX_TOTAL_SPEED) p.xSpeed = MAX_TOTAL_SPEED;
}
function rectCollide(x1: number, y1: number, x2: number, y2: number, rx1: number, ry1: number, rx2: number, ry2: number) {
  return x1 <= rx2 && y1 <= ry2 && rx1 <= x2 && ry1 <= y2;
}
function clipBound(rel: number, size: number): [number, number] {
  if (rel >= 0) return [rel, TILE_SIZE];
  return [0, size + rel];
}
function squareCollide(p: Player, row: number, col: number): boolean {
  const i = col * 12, j = row * 12;
  const k = p.globalBallX - i, m = p.globalBallY - j;
  let xs: number, xe: number, ys: number, ye: number;
  if (k >= 0) { xs = k; xe = 12; } else { xs = 0; xe = p.ballSize + k; }
  if (m >= 0) { ys = m; ye = 12; } else { ys = 0; ye = p.ballSize + m; }
  if (xe > 12) xe = 12; if (ye > 12) ye = 12;
  const data = p.ballSize === 16 ? LARGE_BALL_DATA : SMALL_BALL_DATA;
  for (let b3 = xs; b3 < xe; b3++) for (let b = ys; b < ye; b++) {
    const by = b - m, bx = b3 - k;
    if (by >= 0 && by < p.ballSize && bx >= 0 && bx < p.ballSize && data[by][bx] !== 0) return true;
  }
  return false;
}
// Faithful port of f.java b(int). The original keeps whichever of the existing
// xSpeed and the derived value is "larger" toward the slope's downhill side, so
// a fall onto a catching ramp lands instead of being flung sideways: the plain
// swap this port used before turned a vertical fall onto ramps 34/35 into a
// full-speed horizontal launch.
function redirectBall(p: Player, id: number) {
  const old = p.xSpeed;
  switch (id) {
    case 35: p.xSpeed = (p.xSpeed > -p.ySpeed) ? p.xSpeed : p.ySpeed; p.ySpeed = old; break;
    case 37: p.xSpeed = (-p.xSpeed > p.ySpeed) ? p.xSpeed : p.ySpeed; p.ySpeed = old; break;
    case 34: p.xSpeed = (p.xSpeed < p.ySpeed) ? p.xSpeed : -p.ySpeed; p.ySpeed = -old; break;
    case 36: p.xSpeed = (p.xSpeed > p.ySpeed) ? p.xSpeed : -p.ySpeed; p.ySpeed = -old; break;
    case 31: p.xSpeed = (p.xSpeed > -p.ySpeed) ? p.xSpeed : (p.ySpeed >> 1); p.ySpeed = old; break;
    case 33: p.xSpeed = (-p.xSpeed > p.ySpeed) ? p.xSpeed : (p.ySpeed >> 1); p.ySpeed = old; break;
    case 30: p.xSpeed = (p.xSpeed < p.ySpeed) ? p.xSpeed : -(p.ySpeed >> 1); p.ySpeed = -old; break;
    case 32: p.xSpeed = (p.xSpeed > p.ySpeed) ? p.xSpeed : -(p.ySpeed >> 1); p.ySpeed = -old; break;
  }
}
function triangleCollide(p: Player, row: number, col: number, id: number): boolean {
  const i = col * TILE_SIZE, j = row * TILE_SIZE;
  const k = p.globalBallX - i, m = p.globalBallY - j;
  let b1 = 0, b2 = 0;
  switch (id) {
    case 30: case 34: b2 = 11; b1 = 11; break;
    case 31: case 35: b2 = 11; break;
    case 33: case 37: b1 = 11; break;
  }
  let [b3, n] = clipBound(k, p.ballSize);
  let [b4, i1] = clipBound(m, p.ballSize);
  if (n > TILE_SIZE) n = TILE_SIZE; if (i1 > TILE_SIZE) i1 = TILE_SIZE;
  const data = p.ballSize === ENLARGED_SIZE ? LARGE_BALL_DATA : SMALL_BALL_DATA;
  for (let b5 = b3; b5 < n; b5++) for (let b = b4; b < i1; b++) {
    const by = b - m, bx = b5 - k;
    if (by >= 0 && by < p.ballSize && bx >= 0 && bx < p.ballSize &&
      ((TRI_TILE_DATA[Math.abs(b - b2)][Math.abs(b5 - b1)] & data[by][bx]) !== 0)) {
      if (!p.mGroundedFlag) redirectBall(p, id);
      return true;
    }
  }
  return false;
}
function thinCollide(p: Player, row: number, col: number, id: number): boolean {
  let x = col * TILE_SIZE, y = row * TILE_SIZE, r = x + TILE_SIZE, b = y + TILE_SIZE;
  switch (id) {
    case 3: case 5: case 9: case 13: case 14: case 17: case 18: case 21: case 22: case 43: case 45:
      x += THIN_TILE_SIZE; r -= THIN_TILE_SIZE; break;
    case 4: case 6: case 15: case 16: case 19: case 20: case 23: case 24: case 44: case 46:
      y += THIN_TILE_SIZE; b -= THIN_TILE_SIZE; break;
  }
  return rectCollide(p.globalBallX, p.globalBallY, p.globalBallX + p.ballSize, p.globalBallY + p.ballSize, x, y, r, b);
}
function edgeCollide(p: Player, row: number, col: number, id: number): boolean {
  let x = col * TILE_SIZE, y = row * TILE_SIZE, r = x + TILE_SIZE, b = y + TILE_SIZE;
  switch (id) {
    case 13: case 17: x += 6; r -= 6; b -= 11; break;
    case 14: case 18: x += 6; r -= 6; y += 11; break;
    case 22: case 26: x += 6; r -= 6; y += 11; break;
    case 21: case 25: b = y; y--; x += 6; r -= 6; break;
    case 15: case 19: y += 6; b -= 6; r -= 11; break;
    case 16: case 20: y += 6; b -= 6; x += 11; break;
    case 23: case 27: y += 6; b -= 6; r -= 11; break;
    case 24: case 28: y += 6; b -= 6; x += 11; break;
    default: return false;
  }
  return rectCollide(p.globalBallX, p.globalBallY, p.globalBallX + p.ballSize, p.globalBallY + p.ballSize, x, y, r, b);
}

function freeAt(p: Player, lvl: LevelData, x: number, y: number): boolean {
  return collisionDetection(p, lvl, x, y, null, true);
}
// Each probe rewrites the collision globals, can set the ramp/rubber flags, and can redirect the
// ball's velocity off a ramp — none of which a placement walk is entitled to do, and all of which
// would otherwise leak into the caller's own collision scan. Snapshot and restore around the walk,
// so enlarging mid-frame relocates the ball without steering it or corrupting the scan in progress.
function findFreeSpot(p: Player, lvl: LevelData): boolean {
  const gx = p.globalBallX, gy = p.globalBallY, xs = p.xSpeed, ys = p.ySpeed;
  const rubber = p.mCDRubberFlag, ramp = p.mCDRampFlag;
  const found = walkFreeSpot(p, lvl);
  p.globalBallX = gx; p.globalBallY = gy; p.xSpeed = xs; p.ySpeed = ys;
  p.mCDRubberFlag = rubber; p.mCDRampFlag = ramp;
  return found;
}
// Free-space walk in six directions at a growing radius, N/NW/NE/S/SW/SE. The original runs this
// from two places — the inflator tile, and the ball constructor whenever the ball starts large —
// so it covers every spawn and respawn as well as touching an inflator. Its offset is a wrapping
// byte with no cap, meaning a fully enclosed ball loops forever; MAX_PLACEMENT_OFFSET bounds it.
// Each candidate is probed independently and the first free one wins, so the ball ends up adjacent
// to the flower rather than jumping clear of it. Returns false when nothing within the cap fits, in
// which case the caller must not keep the ball at the size it just tried.
function walkFreeSpot(p: Player, lvl: LevelData): boolean {
  // Offset 0 first, unlike the original which starts at 1 and so nudges every large spawn by 1px.
  // A ball that already fits is never worth moving.
  if (freeAt(p, lvl, p.xPos, p.yPos)) return true;
  for (let offset = 1; offset <= MAX_PLACEMENT_OFFSET; offset++) {
    if (freeAt(p, lvl, p.xPos, p.yPos - offset)) { p.yPos -= offset; return true; }
    if (freeAt(p, lvl, p.xPos - offset, p.yPos - offset)) { p.xPos -= offset; p.yPos -= offset; return true; }
    if (freeAt(p, lvl, p.xPos + offset, p.yPos - offset)) { p.xPos += offset; p.yPos -= offset; return true; }
    if (freeAt(p, lvl, p.xPos, p.yPos + offset)) { p.yPos += offset; return true; }
    if (freeAt(p, lvl, p.xPos - offset, p.yPos + offset)) { p.xPos -= offset; p.yPos += offset; return true; }
    if (freeAt(p, lvl, p.xPos + offset, p.yPos + offset)) { p.xPos += offset; p.yPos += offset; return true; }
  }
  return false;
}
function enlargeBall(p: Player, lvl: LevelData) {
  if (p.sizeState === SizeState.Large) return;
  p.sizeState = SizeState.Large; p.ballSize = ENLARGED_SIZE; p.mHalfBallSize = HALF_ENLARGED_SIZE;
  // Nowhere nearby fits 16px — the flower is in a pocket. Growing anyway would embed the ball and
  // block it every frame forever, so stay small and let the next touch retry.
  if (!findFreeSpot(p, lvl)) shrinkBall(p);
}
// Shrinking only ever shrinks the collision box, so anything that fitted as large still fits as
// small. The original's UseRegularBall does not reposition either — the ±2px nudge this port
// invented reads as a visible pop after every deflation.
function shrinkBall(p: Player) {
  if (p.sizeState === SizeState.Small) return;
  p.sizeState = SizeState.Small; p.ballSize = NORMAL_SIZE; p.mHalfBallSize = HALF_NORMAL_SIZE;
}
export function popBall(p: Player, hooks: PhysicsHooks) {
  if (hooks.invincible()) return;
  p.ballState = BallState.Popped; p.popCntr = POPPED_FRAMES;
  hooks.onPop();
  p.speedBonusCntr = 0; p.gravBonusCntr = 0; p.jumpBonusCntr = 0;
  hooks.decLife();
}

function testTile(p: Player, lvl: LevelData, ty: number, tx: number, canMove: boolean, hooks: PhysicsHooks | null, probe: boolean): boolean {
  if (ty >= lvl.height || ty < 0 || tx >= lvl.width || tx < 0) return false;
  if (p.ballState === BallState.Popped) return false;
  const tile = tileRawAt(lvl, tx, ty);
  const id = tile & TILE_ID_MASK;
  if (id >= TILE_DB.length) return canMove;
  if (id === 1) {
    if (squareCollide(p, ty, tx)) canMove = false; else p.mCDRampFlag = true;
  } else if (id === 2) {
    if (squareCollide(p, ty, tx)) { p.mCDRubberFlag = true; canMove = false; } else p.mCDRampFlag = true;
  } else if (id >= 3 && id <= 6) {
    // Only a real movement step pops the ball. Probes never occupy this box,
    // so with real hooks they killed the ball for merely walking beneath
    // spikes — and the ground probe fired popBall through PROBE_HOOKS.
    if (thinCollide(p, ty, tx, id)) { canMove = false; if (hooks && !probe) popBall(p, hooks); }
  } else if (id === 10) {
    const idx = findMovingObjectAt(lvl, tx, ty);
    if (idx !== -1) {
      const obj = lvl.movingObjects[idx];
      const sx = obj.topLeft[0] * TILE_SIZE + obj.offset[0];
      const sy = obj.topLeft[1] * TILE_SIZE + obj.offset[1];
      // Both boxes shrink by 1px (f.java DynThorns check): edge-to-edge grazes survive.
      if (rectCollide(p.globalBallX + 1, p.globalBallY + 1, p.globalBallX + p.ballSize - 1, p.globalBallY + p.ballSize - 1, sx + 1, sy + 1, sx + 24 - 1, sy + 24 - 1)) {
        canMove = false; if (hooks && !probe) popBall(p, hooks);
      }
    }
  } else if (id >= 13 && id <= 24) {
    if (thinCollide(p, ty, tx, id)) {
      const small = id <= 20;
      if (small && p.sizeState === SizeState.Large) canMove = false;
      else {
        if (id === 14 || id === 18 || id === 22) {
          if ((id === 14 || id === 22) && hooks) hooks.ringCollected(tx, ty, id);
        } else {
          const edge = edgeCollide(p, ty, tx, id);
          if (edge) canMove = false;
          if (id === 23) { if (!edge && hooks) hooks.ringCollected(tx, ty, id); }
          else if ((id >= 13 && id <= 16) || (id >= 21 && id <= 24)) { if (hooks) hooks.ringCollected(tx, ty, id); }
        }
      }
    }
  } else if (id === 25 || id === 27 || id === 28) {
    if (edgeCollide(p, ty, tx, id)) canMove = false;
  } else if (id >= 30 && id <= 37) {
    if (triangleCollide(p, ty, tx, id)) {
      canMove = false; p.mCDRampFlag = true;
      if (id >= 34) p.mCDRubberFlag = true;
    }
  }
  // Gadgets either block, resize, or fire a hook. A placement probe needs the blocking answer but
  // must not resize the ball, pop it, or mutate the level, so the switch also runs when probing —
  // against PROBE_HOOKS, with every side effect skipped. Without this the probe is blind to the very
  // tiles the walk exists to clear: a ball placed overlapping a deflator, or one grown while
  // overlapping an inflator's thin band, is blocked on every later frame and never moves again.
  if (!hooks) {
    if (!probe) return canMove;
    hooks = PROBE_HOOKS;
  }
  switch (id) {
    case TILE_SPEED_BONUS:
      canMove = false;
      if (!probe) { p.speedBonusCntr = BONUS_DURATION; hooks.onPickup(); }
      break;
    case TILE_DEFLATOR_FLOOR: case TILE_DEFLATOR_LEFT_WALL: case TILE_DEFLATOR_CEILING: case TILE_DEFLATOR_RIGHT_WALL:
      canMove = false;
      if (!probe && p.ballSize === ENLARGED_SIZE) shrinkBall(p);
      break;
    case TILE_INFLATOR_FLOOR: case TILE_INFLATOR_LEFT_WALL: case TILE_INFLATOR_CEILING: case TILE_INFLATOR_RIGHT_WALL:
      if (thinCollide(p, ty, tx, id)) {
        canMove = false;
        if (!probe && p.ballSize === NORMAL_SIZE) enlargeBall(p, lvl);
      }
      break;
    case TILE_CHECKPOINT:
      // The score lives in Game.setRespawn (GEM_POINTS, matching f.java's single
      // AddScore(200)); adding here too charged 400 per gem.
      if (!probe) hooks.setRespawn(tx, ty);
      break;
    case TILE_EXIT:
      if (thinCollide(p, ty, tx, id)) {
        if (!probe && hooks.exitIsOpen()) hooks.completeLevel(); else canMove = false;
      }
      break;
    case TILE_EXTRA_LIFE:
      if (!probe) { hooks.extraLife(); setTileId(lvl, tx, ty, 0); }
      break;
    case TILE_GRAVITY_FLOOR: case TILE_GRAVITY_LEFT_WALL: case TILE_GRAVITY_CEILING: case TILE_GRAVITY_RIGHT_WALL:
      canMove = false;
      if (!probe) { p.gravBonusCntr = BONUS_DURATION; hooks.onPickup(); }
      break;
    case TILE_JUMP_FLOOR: case TILE_JUMP_LEFT_WALL: case TILE_JUMP_CEILING: case TILE_JUMP_RIGHT_WALL:
      canMove = false;
      if (!probe) { p.jumpBonusCntr = BONUS_DURATION; hooks.onPickup(); }
      break;
  }
  return canMove;
}

function collisionDetection(p: Player, lvl: LevelData, testX: number, testY: number, hooks: PhysicsHooks | null, probe: boolean): boolean {
  let b = 0; if (testY < 0) b = 12;
  const i = Math.floor((testX - p.mHalfBallSize) / TILE_SIZE);
  const j = Math.floor((testY - b - p.mHalfBallSize) / TILE_SIZE);
  p.globalBallX = testX - p.mHalfBallSize;
  p.globalBallY = testY - p.mHalfBallSize;
  const k = Math.floor((testX - 1 + p.mHalfBallSize) / TILE_SIZE) + 1;
  const m = Math.floor((testY - b - 1 + p.mHalfBallSize) / TILE_SIZE) + 1;
  let canMove = true;
  for (let n = i; n < k; n++) for (let i1 = j; i1 < m; i1++) canMove = testTile(p, lvl, i1, n, canMove, hooks, probe);
  return canMove;
}

function isAtGround(p: Player, lvl: LevelData, reverse: boolean): boolean {
  if (p.mGroundedFlag) return true;
  // If moving rapidly away from ground from a previous high jump, disallow mid-air jump
  if (reverse ? p.ySpeed > 15 : p.ySpeed < -15) {
    if ((p.groundedTimer ?? 0) > 0 && (reverse ? p.ySpeed <= 25 : p.ySpeed >= -25)) {
      return true;
    }
    return false;
  }
  if ((p.groundedTimer ?? 0) > 0) return true;
  // Probe 2px in gravity direction. This is only a ground check, so it
  // must not steer the ball: triangleCollide redirects velocity on a
  // slope, and without restoring it here every frame's probe maps
  // (x,y) -> (-(y>>1), -(x>>1)) onto the -1,-1 fixed point — the ball
  // sits on the slope with |v|<10 forever (never moves, never falls).
  const dy = reverse ? -2 : 2;
  const gx = p.globalBallX, prevGy = p.globalBallY;
  const xs = p.xSpeed, ys = p.ySpeed;
  const rubber = p.mCDRubberFlag, ramp = p.mCDRampFlag;
  const blocked = !collisionDetection(p, lvl, p.xPos, p.yPos + dy, PROBE_HOOKS, true);
  p.globalBallX = gx; p.globalBallY = prevGy;
  p.xSpeed = xs; p.ySpeed = ys;
  p.mCDRubberFlag = rubber; p.mCDRampFlag = ramp;
  return blocked;
}

export function playerUpdate(p: Player, lvl: LevelData, hooks: PhysicsHooks) {
  if (p.ballState === BallState.Popped) {
    p.popCntr--;
    if (p.popCntr <= 0) p.ballState = BallState.Dead;
    return;
  }
  if (p.globalBallX === 0 && p.globalBallY === 0) {
    p.globalBallX = p.xPos - p.mHalfBallSize; p.globalBallY = p.yPos - p.mHalfBallSize;
  }
  if (p.groundedTimer && p.groundedTimer > 0) p.groundedTimer--;
  const ctx = Math.floor(p.xPos / TILE_SIZE), cty = Math.floor(p.yPos / TILE_SIZE);
  if (ctx >= 0 && ctx < lvl.width && cty >= 0 && cty < lvl.height) {
    p.isInWater = (tileRawAt(lvl, ctx, cty) & TILE_FLAG_WATER) !== 0;
  } else p.isInWater = false;

  let gravity: number, step: number;
  if (p.isInWater) {
    if (p.ballSize === ENLARGED_SIZE) {
      gravity = UWATER_LARGE_MAX_GRAVITY; step = LARGE_UWATER_GRAVITY_ACCELL;
      if (p.mGroundedFlag) p.ySpeed = -BASE_GRAVITY;
    } else { gravity = UWATER_MAX_GRAVITY; step = UWATER_GRAVITY_ACCELL; }
  } else {
    if (p.ballSize === ENLARGED_SIZE) { gravity = LARGE_MAX_GRAVITY; step = LARGE_GRAVITY_ACCELL; }
    else { gravity = NORMAL_MAX_GRAVITY; step = NORMAL_GRAVITY_ACCELL; }
  }
  let reverse = false;
  if (p.gravBonusCntr > 0) {
    reverse = true; gravity *= -1; step *= -1; p.gravBonusCntr--;
    if (p.gravBonusCntr === 0) { reverse = false; p.mGroundedFlag = false; gravity *= -1; step *= -1; }
  }
  if (p.jumpBonusCntr > 0) {
    if (-1 * Math.abs(p.jumpOffset) > JUMP_BONUS_STRENGTH) p.jumpOffset = reverse ? -JUMP_BONUS_STRENGTH : JUMP_BONUS_STRENGTH;
    p.jumpBonusCntr--;
  }
  p.slideCntr++; if (p.slideCntr === 3) p.slideCntr = 0;
  clampSpeed(p);
  // f.java: outside water and reverse gravity, a downward speed in (0,10) is
  // bumped to 10 at frame top, so falls leave the apex promptly.
  if (!p.isInWater && !reverse && p.ySpeed > 0 && p.ySpeed < MIN_BOUNCE_SPEED) p.ySpeed = MIN_BOUNCE_SPEED;

  const yIters = Math.floor(Math.abs(p.ySpeed) / MOVEMENT_STEP_DIVISOR);
  let slidOffSlope = false;
  for (let i = 0; i < yIters; i++) {
    const yStep = p.ySpeed === 0 ? 0 : (p.ySpeed < 0 ? -1 : 1);
    // Snapshot velocity: collision probes on a slope redirect it
    // ((x,y)->(-(y>>1),-(x>>1))), so the Y probe plus two slide
    // probes would compound back to ~0 and the ball never reaches
    // |ySpeed|>=10 again — stuck like glue. Slide probes below are
    // feasibility checks only; restore the fall speed after them.
    const probeXs = p.xSpeed, probeYs = p.ySpeed;
    if (collisionDetection(p, lvl, p.xPos, p.yPos + yStep, hooks, false)) {
      p.yPos += yStep; p.mGroundedFlag = false;
      if (gravity === -30) {
        const curTy = Math.floor(p.yPos / TILE_SIZE);
        if (curTy >= 0 && curTy < lvl.height && ctx >= 0 && ctx < lvl.width) {
          if ((tileRawAt(lvl, ctx, curTy) & TILE_FLAG_WATER) === 0) {
            p.ySpeed >>= 1;
            if (p.ySpeed <= MIN_BOUNCE_SPEED && p.ySpeed >= -MIN_BOUNCE_SPEED) p.ySpeed = 0;
          }
        }
      }
    } else {
      // Falling onto a slope: slide diagonally down-slope instead of
      // bouncing in place. Previously this only ran every 3rd frame
      // (slideCntr === 0) and only at low xSpeed, then bounced anyway,
      // so the ball sat grounded on the slope and got stuck.
      // Now try every frame; a successful slide falls off the slope
      // (gravity below is ~1/3) instead of bouncing.
      const fallingToGround = yStep > 0 || (reverse && yStep < 0);
      if (p.mCDRampFlag && fallingToGround) {
        // Try down-slope diagonals; larger steps clear a riser / tip
        // or large ball that a 1px diagonal still overlaps. These are
        // feasibility probes, not movement: PROBE_HOOKS + probe so they
        // cannot pop the ball on spikes, consume pickups, or complete
        // the level through the exit box they merely overlap.
        for (const d of [1, 2, 3, 6]) {
          p.xSpeed = probeXs; p.ySpeed = probeYs;
          if (collisionDetection(p, lvl, p.xPos + d, p.yPos + yStep * d, PROBE_HOOKS, true)) { p.xPos += d; p.yPos += yStep * d; slidOffSlope = true; break; }
          p.xSpeed = probeXs; p.ySpeed = probeYs;
          if (collisionDetection(p, lvl, p.xPos - d, p.yPos + yStep * d, PROBE_HOOKS, true)) { p.xPos -= d; p.yPos += yStep * d; slidOffSlope = true; break; }
        }
        // Keep the fall speed that brought us here (>=10) so the next
        // frame slides again instead of rebuilding from ~0.
        p.xSpeed = probeXs; p.ySpeed = probeYs;
        if (slidOffSlope) {
          p.mCDRampFlag = false;
          p.mGroundedFlag = false;
          p.groundedTimer = 0;
          break;
        }
      }
      if (yStep > 0 || (reverse && yStep < 0)) {
        p.ySpeed = Math.trunc(p.ySpeed * -1 / 2);
        p.mGroundedFlag = true;
        p.groundedTimer = 5;
        if (p.mCDRubberFlag && (p.direction & MoveDir.Up)) {
          p.mCDRubberFlag = false;
          p.jumpOffset += reverse ? MIN_BOUNCE_SPEED : -MIN_BOUNCE_SPEED;
        } else if (p.jumpBonusCntr === 0) p.jumpOffset = 0;
        if (p.ySpeed < MIN_BOUNCE_SPEED && p.ySpeed > -MIN_BOUNCE_SPEED) p.ySpeed = reverse ? -MIN_BOUNCE_SPEED : MIN_BOUNCE_SPEED;
        break;
      }
      if (yStep < 0 || (reverse && yStep > 0)) p.ySpeed = reverse ? -ROOF_COLLISION_SPEED : -(p.ySpeed >> 1);
    }
  }
  // Falling off a slope: about 1/3 gravity, so the ball accelerates
  // gently down-slope and falls off instead of bouncing/sticking.
  if (slidOffSlope) {
    const slopeStep = Math.max(1, Math.trunc(Math.abs(step) / 3)) * (step < 0 ? -1 : 1);
    if (reverse) {
      if (p.ySpeed > gravity) { p.ySpeed += slopeStep; if (p.ySpeed < gravity) p.ySpeed = gravity; }
    } else {
      if (p.ySpeed < gravity) { p.ySpeed += slopeStep; if (p.ySpeed > gravity) p.ySpeed = gravity; }
    }
  } else if (reverse) {
    if (step === -2 && p.ySpeed < gravity) { p.ySpeed += step; if (p.ySpeed > gravity) p.ySpeed = gravity; }
    else if (!p.mGroundedFlag && p.ySpeed > gravity) { p.ySpeed += step; if (p.ySpeed < gravity) p.ySpeed = gravity; }
  } else {
    if (step === -2 && p.ySpeed > gravity) { p.ySpeed += step; if (p.ySpeed < gravity) p.ySpeed = gravity; }
    else if (!p.mGroundedFlag && p.ySpeed < gravity) { p.ySpeed += step; if (p.ySpeed > gravity) p.ySpeed = gravity; }
  }
  const maxSpeed = p.speedBonusCntr > 0 ? MAX_HORZ_BONUS_SPEED : MAX_HORZ_SPEED;
  if (p.speedBonusCntr > 0) p.speedBonusCntr--;
  if (p.ballSize === ENLARGED_SIZE && p.jumpBonusCntr === 0) p.jumpOffset += reverse ? 5 : -5;
  if ((p.direction & MoveDir.Right) && p.xSpeed < maxSpeed) p.xSpeed += HORZ_ACCELL;
  else if ((p.direction & MoveDir.Left) && p.xSpeed > -maxSpeed) p.xSpeed -= HORZ_ACCELL;
  else if (p.xSpeed > 0) p.xSpeed -= FRICTION_DECELL;
  else if (p.xSpeed < 0) p.xSpeed += FRICTION_DECELL;

  if (isAtGround(p, lvl, reverse) && (p.direction & MoveDir.Up)) {
    p.ySpeed = reverse ? -JUMP_STRENGTH + p.jumpOffset : JUMP_STRENGTH + p.jumpOffset;
    p.mGroundedFlag = false;
    p.groundedTimer = 0;
    p.direction &= ~MoveDir.Up;
  }
  const xIters = Math.floor(Math.abs(p.xSpeed) / MOVEMENT_STEP_DIVISOR);
  for (let i = 0; i < xIters; i++) {
    const xStep = p.xSpeed === 0 ? 0 : (p.xSpeed < 0 ? -1 : 1);
    // Snapshot: main + diagonal probes on a slope each redirect
    // velocity, compounding to ~0 when pushing into a slope (glue).
    // Keep the pushing speed; only a clean wall hit reverses it.
    const probeXs = p.xSpeed, probeYs = p.ySpeed;
    if (collisionDetection(p, lvl, p.xPos + xStep, p.yPos, hooks, false)) { p.xPos += xStep; }
    else if (p.mCDRampFlag) {
      p.mCDRampFlag = false;
      p.xSpeed = probeXs; p.ySpeed = probeYs;
      // Prefer down-slope (gravity direction) first so a ball rolling
      // down a slope keeps rolling down; up-slope is the fallback for
      // climbing. Trying up first lifts it off the surface each step.
      const downDir = reverse ? -1 : 1;
      let diagMoved = false;
      // Probes again: PROBE_HOOKS + probe keeps spikes/pickups/exit in these
      // feasibility checks from firing their real side effects.
      for (const d of [1, 2, 3, 6]) {
        p.xSpeed = probeXs; p.ySpeed = probeYs;
        if (collisionDetection(p, lvl, p.xPos + xStep, p.yPos + downDir * d, PROBE_HOOKS, true)) { p.xPos += xStep; p.yPos += downDir * d; diagMoved = true; break; }
        p.xSpeed = probeXs; p.ySpeed = probeYs;
        if (collisionDetection(p, lvl, p.xPos + xStep, p.yPos - downDir * d, PROBE_HOOKS, true)) { p.xPos += xStep; p.yPos -= downDir * d; diagMoved = true; break; }
      }
      if (diagMoved) { p.xSpeed = probeXs; p.ySpeed = probeYs; }
      else p.xSpeed = -(probeXs >> 1);
    }
  }
}
