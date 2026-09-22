// Faithful port of physics.c (Ball.java logic)
import {
  TILE_SIZE, Player, BallState, SizeState, MoveDir,
  NORMAL_SIZE, HALF_NORMAL_SIZE, ENLARGED_SIZE, HALF_ENLARGED_SIZE,
  JUMP_STRENGTH, JUMP_BONUS_STRENGTH,
  NORMAL_GRAVITY_ACCELL, LARGE_GRAVITY_ACCELL, NORMAL_MAX_GRAVITY, LARGE_MAX_GRAVITY,
  UWATER_MAX_GRAVITY, UWATER_GRAVITY_ACCELL, UWATER_LARGE_MAX_GRAVITY, LARGE_UWATER_GRAVITY_ACCELL,
  BASE_GRAVITY, MAX_TOTAL_SPEED, HORZ_ACCELL, FRICTION_DECELL, MAX_HORZ_SPEED, MAX_HORZ_BONUS_SPEED,
  MIN_BOUNCE_SPEED, ROOF_COLLISION_SPEED, BONUS_DURATION, POPPED_FRAMES, THIN_TILE_SIZE,
  MOVEMENT_STEP_DIVISOR, STUCK_BALL_OFFSET, TILE_ID_MASK, TILE_FLAG_WATER,
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

export function playerInit(p: Player, x: number, y: number, size: SizeState) {
  p.xPos = x; p.yPos = y; p.globalBallX = 0; p.globalBallY = 0;
  p.xSpeed = 0; p.ySpeed = 0; p.direction = 0; p.jumpOffset = 0;
  p.ballState = BallState.Normal; p.sizeState = size;
  if (size === SizeState.Small) { p.ballSize = NORMAL_SIZE; p.mHalfBallSize = HALF_NORMAL_SIZE; }
  else { p.ballSize = ENLARGED_SIZE; p.mHalfBallSize = HALF_ENLARGED_SIZE; }
  p.mGroundedFlag = false; p.mCDRubberFlag = false; p.mCDRampFlag = false;
  p.speedBonusCntr = 0; p.gravBonusCntr = 0; p.jumpBonusCntr = 0;
  p.popCntr = 0; p.slideCntr = 0; p.isInWater = false;
  // nudge large ball if stuck — needs level; handled by caller via collision probe
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
function redirectBall(p: Player, id: number) {
  const old = p.xSpeed;
  switch (id) {
    case 35: case 37: p.xSpeed = p.ySpeed; p.ySpeed = old; break;
    case 31: case 33: p.xSpeed = (p.ySpeed >> 1); p.ySpeed = (old >> 1); break;
    case 34: case 36: p.xSpeed = -p.ySpeed; p.ySpeed = -old; break;
    case 30: case 32: p.xSpeed = -(p.ySpeed >> 1); p.ySpeed = -(old >> 1); break;
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

function enlargeBall(p: Player, lvl: LevelData) {
  if (p.sizeState === SizeState.Large) return;
  p.sizeState = SizeState.Large; p.ballSize = ENLARGED_SIZE; p.mHalfBallSize = HALF_ENLARGED_SIZE;
  let offset = 2, found = false;
  while (!found) {
    found = true;
    if (collisionDetection(p, lvl, p.xPos, p.yPos - offset, null as unknown as PhysicsHooks)) p.yPos -= offset;
    else if (collisionDetection(p, lvl, p.xPos - offset, p.yPos - offset, null as unknown as PhysicsHooks)) { p.xPos -= offset; p.yPos -= offset; }
    else if (collisionDetection(p, lvl, p.xPos + offset, p.yPos - offset, null as unknown as PhysicsHooks)) { p.xPos += offset; p.yPos -= offset; }
    else if (collisionDetection(p, lvl, p.xPos, p.yPos + offset, null as unknown as PhysicsHooks)) p.yPos += offset;
    else if (collisionDetection(p, lvl, p.xPos - offset, p.yPos + offset, null as unknown as PhysicsHooks)) { p.xPos -= offset; p.yPos += offset; }
    else if (collisionDetection(p, lvl, p.xPos + offset, p.yPos + offset, null as unknown as PhysicsHooks)) { p.xPos += offset; p.yPos += offset; }
    else { found = false; offset++; if (offset > 40) break; }
  }
}
function shrinkBall(p: Player, lvl: LevelData) {
  if (p.sizeState === SizeState.Small) return;
  p.sizeState = SizeState.Small; p.ballSize = NORMAL_SIZE; p.mHalfBallSize = HALF_NORMAL_SIZE;
  const offset = 2;
  if (collisionDetection(p, lvl, p.xPos, p.yPos + offset, null as unknown as PhysicsHooks)) p.yPos += offset;
  else if (collisionDetection(p, lvl, p.xPos, p.yPos - offset, null as unknown as PhysicsHooks)) p.yPos -= offset;
}
export function popBall(p: Player, hooks: PhysicsHooks) {
  if (hooks.invincible()) return;
  p.ballState = BallState.Popped; p.popCntr = POPPED_FRAMES;
  hooks.onPop();
  p.speedBonusCntr = 0; p.gravBonusCntr = 0; p.jumpBonusCntr = 0;
  hooks.decLife();
}

function testTile(p: Player, lvl: LevelData, ty: number, tx: number, canMove: boolean, hooks: PhysicsHooks | null): boolean {
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
    if (thinCollide(p, ty, tx, id)) { canMove = false; if (hooks) popBall(p, hooks); }
  } else if (id === 10) {
    const idx = findMovingObjectAt(lvl, tx, ty);
    if (idx !== -1) {
      const obj = lvl.movingObjects[idx];
      const sx = obj.topLeft[0] * TILE_SIZE + obj.offset[0];
      const sy = obj.topLeft[1] * TILE_SIZE + obj.offset[1];
      if (rectCollide(p.globalBallX, p.globalBallY, p.globalBallX + p.ballSize, p.globalBallY + p.ballSize, sx, sy, sx + 24, sy + 24)) {
        canMove = false; if (hooks) popBall(p, hooks);
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
  if (!hooks) return canMove;
  switch (id) {
    case TILE_SPEED_BONUS: canMove = false; p.speedBonusCntr = BONUS_DURATION; hooks.onPickup(); break;
    case TILE_DEFLATOR_FLOOR: case TILE_DEFLATOR_LEFT_WALL: case TILE_DEFLATOR_CEILING: case TILE_DEFLATOR_RIGHT_WALL:
      canMove = false; if (p.ballSize === ENLARGED_SIZE) shrinkBall(p, lvl); break;
    case TILE_INFLATOR_FLOOR: case TILE_INFLATOR_LEFT_WALL: case TILE_INFLATOR_CEILING: case TILE_INFLATOR_RIGHT_WALL:
      if (thinCollide(p, ty, tx, id)) { canMove = false; if (p.ballSize === NORMAL_SIZE) enlargeBall(p, lvl); } break;
    case TILE_CHECKPOINT: hooks.addScore(200); hooks.setRespawn(tx, ty); break;
    case TILE_EXIT:
      if (thinCollide(p, ty, tx, id)) {
        if (hooks.exitIsOpen()) hooks.completeLevel(); else canMove = false;
      }
      break;
    case TILE_EXTRA_LIFE: hooks.extraLife(); setTileId(lvl, tx, ty, 0); break;
    case TILE_GRAVITY_FLOOR: case TILE_GRAVITY_LEFT_WALL: case TILE_GRAVITY_CEILING: case TILE_GRAVITY_RIGHT_WALL:
      canMove = false; p.gravBonusCntr = BONUS_DURATION; hooks.onPickup(); break;
    case TILE_JUMP_FLOOR: case TILE_JUMP_LEFT_WALL: case TILE_JUMP_CEILING: case TILE_JUMP_RIGHT_WALL:
      canMove = false; p.jumpBonusCntr = BONUS_DURATION; hooks.onPickup(); break;
  }
  return canMove;
}

function collisionDetection(p: Player, lvl: LevelData, testX: number, testY: number, hooks: PhysicsHooks | null): boolean {
  let b = 0; if (testY < 0) b = 12;
  const i = Math.floor((testX - p.mHalfBallSize) / TILE_SIZE);
  const j = Math.floor((testY - b - p.mHalfBallSize) / TILE_SIZE);
  p.globalBallX = testX - p.mHalfBallSize;
  p.globalBallY = testY - p.mHalfBallSize;
  const k = Math.floor((testX - 1 + p.mHalfBallSize) / TILE_SIZE) + 1;
  const m = Math.floor((testY - b - 1 + p.mHalfBallSize) / TILE_SIZE) + 1;
  let canMove = true;
  for (let n = i; n < k; n++) for (let i1 = j; i1 < m; i1++) canMove = testTile(p, lvl, i1, n, canMove, hooks);
  return canMove;
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

  const yIters = Math.floor(Math.abs(p.ySpeed) / MOVEMENT_STEP_DIVISOR);
  for (let i = 0; i < yIters; i++) {
    const yStep = p.ySpeed === 0 ? 0 : (p.ySpeed < 0 ? -1 : 1);
    if (collisionDetection(p, lvl, p.xPos, p.yPos + yStep, hooks)) {
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
      if (p.mCDRampFlag && p.xSpeed < 10 && p.slideCntr === 0) {
        if (collisionDetection(p, lvl, p.xPos + 1, p.yPos + yStep, hooks)) { p.xPos += 1; p.yPos += yStep; p.mCDRampFlag = false; }
        else if (collisionDetection(p, lvl, p.xPos - 1, p.yPos + yStep, hooks)) { p.xPos -= 1; p.yPos += yStep; p.mCDRampFlag = false; }
      }
      if (yStep > 0 || (reverse && yStep < 0)) {
        p.ySpeed = Math.trunc(p.ySpeed * -1 / 2);
        p.mGroundedFlag = true;
        if (p.mCDRubberFlag && (p.direction & MoveDir.Up)) {
          p.mCDRubberFlag = false;
          p.jumpOffset += reverse ? MIN_BOUNCE_SPEED : -MIN_BOUNCE_SPEED;
        } else if (p.jumpBonusCntr === 0) p.jumpOffset = 0;
        if (p.ySpeed < MIN_BOUNCE_SPEED && p.ySpeed > -MIN_BOUNCE_SPEED) p.ySpeed = reverse ? -MIN_BOUNCE_SPEED : MIN_BOUNCE_SPEED;
        break;
      }
      if (yStep < 0 || (reverse && yStep > 0)) p.ySpeed = reverse ? -ROOF_COLLISION_SPEED : ROOF_COLLISION_SPEED;
    }
  }
  if (reverse) {
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

  if (p.mGroundedFlag && (p.direction & MoveDir.Up)) {
    p.ySpeed = reverse ? -JUMP_STRENGTH + p.jumpOffset : JUMP_STRENGTH + p.jumpOffset;
    p.mGroundedFlag = false;
  }
  const xIters = Math.floor(Math.abs(p.xSpeed) / MOVEMENT_STEP_DIVISOR);
  for (let i = 0; i < xIters; i++) {
    const xStep = p.xSpeed === 0 ? 0 : (p.xSpeed < 0 ? -1 : 1);
    if (collisionDetection(p, lvl, p.xPos + xStep, p.yPos, hooks)) p.xPos += xStep;
    else if (p.mCDRampFlag) {
      p.mCDRampFlag = false;
      const diag = reverse ? 1 : -1;
      if (collisionDetection(p, lvl, p.xPos + xStep, p.yPos + diag, hooks)) { p.xPos += xStep; p.yPos += diag; }
      else if (collisionDetection(p, lvl, p.xPos + xStep, p.yPos - diag, hooks)) { p.xPos += xStep; p.yPos -= diag; }
      else p.xSpeed = -(p.xSpeed >> 1);
    }
  }
}
