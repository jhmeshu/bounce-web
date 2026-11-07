// Faithful port of types.h constants
export const TILE_SIZE = 12;
export const SCREEN_WIDTH = 480;
export const SCREEN_HEIGHT = 272;
export const HUD_HEIGHT = 17;
export const MAX_LEVEL = 11;

export const NORMAL_SIZE = 12;
export const HALF_NORMAL_SIZE = 6;
export const ENLARGED_SIZE = 16;
export const HALF_ENLARGED_SIZE = 8;
export const POPPED_SIZE = 12;

export const JUMP_STRENGTH = -67;
export const JUMP_BONUS_STRENGTH = -80;

export const NORMAL_GRAVITY_ACCELL = 4;
export const LARGE_GRAVITY_ACCELL = 3;
export const NORMAL_MAX_GRAVITY = 80;
export const LARGE_MAX_GRAVITY = 38;

export const UWATER_MAX_GRAVITY = 42;
export const UWATER_GRAVITY_ACCELL = 6;
export const UWATER_LARGE_MAX_GRAVITY = -30;
export const LARGE_UWATER_GRAVITY_ACCELL = -2;
export const BASE_GRAVITY = 10;

export const MAX_TOTAL_SPEED = 150;
export const HORZ_ACCELL = 6;
export const FRICTION_DECELL = 4;
export const MAX_HORZ_SPEED = 50;
export const MAX_HORZ_BONUS_SPEED = 100;

export const MIN_BOUNCE_SPEED = 10;
export const ROOF_COLLISION_SPEED = 20;
export const BONUS_DURATION = 300;
export const POPPED_FRAMES = 5;
export const THIN_TILE_SIZE = 4;
export const MOVEMENT_STEP_DIVISOR = 10;
// Cap for the free-space placement walk. The original has no cap (its offset is a
// wrapping byte, so a fully enclosed ball loops forever); we need a bound.
export const MAX_PLACEMENT_OFFSET = 64;

export const RING_POINTS = 500;
export const GEM_POINTS = 200;
export const LIFE_POINTS = 1000;
export const EXIT_POINTS = 5000;

export const TILE_FLAG_WATER = 0x40;
export const TILE_ID_MASK = 0x3f; // ~0xC0 & 0xFF

// Tile IDs
export const TILE_CHECKPOINT = 7;
export const TILE_CHECKPOINT_ON = 8;
export const TILE_EXIT = 9;
export const TILE_EXTRA_LIFE = 29;
export const TILE_SPEED_BONUS = 38;
export const TILE_DEFLATOR_FLOOR = 39;
export const TILE_DEFLATOR_LEFT_WALL = 40;
export const TILE_DEFLATOR_CEILING = 41;
export const TILE_DEFLATOR_RIGHT_WALL = 42;
export const TILE_INFLATOR_FLOOR = 43;
export const TILE_INFLATOR_LEFT_WALL = 44;
export const TILE_INFLATOR_CEILING = 45;
export const TILE_INFLATOR_RIGHT_WALL = 46;
export const TILE_GRAVITY_FLOOR = 47;
export const TILE_GRAVITY_LEFT_WALL = 48;
export const TILE_GRAVITY_CEILING = 49;
export const TILE_GRAVITY_RIGHT_WALL = 50;
export const TILE_JUMP_FLOOR = 51;
export const TILE_JUMP_LEFT_WALL = 52;
export const TILE_JUMP_CEILING = 53;
export const TILE_JUMP_RIGHT_WALL = 54;

// Colors (CSS hex converted from ABGR in level.h)
export const COL = {
  background: 0xe3d3a2,
  water: 0x1060b0,
  hud: 0x0853aa,
  selectionBg: 0xff3521,
  textNormal: 0x000000,
  white: 0xffffff,
  disabled: 0x808080,
  bonusBar: 0xff7f03,
  bonusFrame: 0xffffff,
  exitLight: 0xfc9d9e,
  exitDark: 0xe33a3f,
  exitFourth: 0xc2848e,
};

export enum MoveDir { Left = 1, Right = 2, Down = 4, Up = 8 }
export enum BallState { Normal = 0, Dead = 1, Popped = 2 }
export enum SizeState { Small = 0, Large = 1 }

export interface Player {
  xPos: number; yPos: number;
  globalBallX: number; globalBallY: number;
  xSpeed: number; ySpeed: number;
  direction: number;
  ballSize: number; mHalfBallSize: number;
  jumpOffset: number;
  ballState: BallState; sizeState: SizeState;
  mGroundedFlag: boolean; mCDRubberFlag: boolean; mCDRampFlag: boolean;
  speedBonusCntr: number; gravBonusCntr: number; jumpBonusCntr: number;
  popCntr: number; slideCntr: number;
  isInWater: boolean;
  groundedTimer?: number;
}
