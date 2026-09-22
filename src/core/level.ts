import { TILE_SIZE, TILE_FLAG_WATER, TILE_ID_MASK, MAX_LEVEL } from './constants';

export interface MovingObject { topLeft: [number, number]; botRight: [number, number]; direction: [number, number]; offset: [number, number]; }
export interface LevelData {
  width: number; height: number;
  startPosX: number; startPosY: number; startTileX: number; startTileY: number;
  ballSize: number; exitPosX: number; exitPosY: number; totalRings: number;
  tiles: Uint8Array; // row-major w*h raw bytes
  movingObjects: MovingObject[];
}

export function parseLevel(buf: ArrayBuffer): LevelData | null {
  const data = new Uint8Array(buf);
  if (data.length < 8) return null;
  let o = 0;
  const startX = data[o++], startY = data[o++];
  const ballSize = data[o++], exitX = data[o++], exitY = data[o++];
  const totalRings = data[o++], w = data[o++], h = data[o++];
  if (w <= 0 || h <= 0 || w > 255 || h > 255) return null;
  if (o + w * h > data.length) return null;
  const tiles = data.slice(o, o + w * h);
  o += w * h;
  const half = ballSize === 0 ? 6 : 8;
  const lvl: LevelData = {
    width: w, height: h,
    startPosX: startX * TILE_SIZE + half, startPosY: startY * TILE_SIZE + half,
    startTileX: startX, startTileY: startY,
    ballSize, exitPosX: exitX, exitPosY: exitY, totalRings,
    tiles, movingObjects: [],
  };
  if (data.length - o >= 1) {
    const n = data[o++];
    if (n > 0 && n <= 16 && data.length - o >= n * 8) {
      for (let i = 0; i < n; i++) {
        const tlx = data[o++], tly = data[o++];
        const brx = data[o++], bry = data[o++];
        let dx = data[o++]; if (dx > 127) dx -= 256;
        let dy = data[o++]; if (dy > 127) dy -= 256;
        const ox = data[o++], oy = data[o++];
        lvl.movingObjects.push({ topLeft: [tlx, tly], botRight: [brx, bry], direction: [dx, dy], offset: [ox, oy] });
      }
    }
  }
  return lvl;
}

export async function loadLevel(n: number): Promise<LevelData | null> {
  if (n < 1 || n > MAX_LEVEL) return null;
  const id = String(n).padStart(3, '0');
  const res = await fetch(`./levels/J2MElvl.${id}`);
  if (!res.ok) return null;
  const buf = await res.arrayBuffer();
  return parseLevel(buf);
}

export function tileIdAt(lvl: LevelData, tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= lvl.width || ty >= lvl.height) return 1;
  return lvl.tiles[ty * lvl.width + tx] & TILE_ID_MASK;
}
export function tileRawAt(lvl: LevelData, tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= lvl.width || ty >= lvl.height) return 1;
  return lvl.tiles[ty * lvl.width + tx];
}
export function setTileId(lvl: LevelData, tx: number, ty: number, id: number) {
  if (tx < 0 || ty < 0 || tx >= lvl.width || ty >= lvl.height) return;
  const i = ty * lvl.width + tx;
  const flags = lvl.tiles[i] & ~TILE_ID_MASK;
  lvl.tiles[i] = (flags | (id & TILE_ID_MASK)) & 0xff;
}
export function isWater(lvl: LevelData, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= lvl.width || ty >= lvl.height) return false;
  return (lvl.tiles[ty * lvl.width + tx] & TILE_FLAG_WATER) !== 0;
}
export function updateMovingObjects(lvl: LevelData) {
  for (const obj of lvl.movingObjects) {
    obj.offset[0] += obj.direction[0];
    const maxX = (obj.botRight[0] - obj.topLeft[0] - 2) * TILE_SIZE;
    const maxY = (obj.botRight[1] - obj.topLeft[1] - 2) * TILE_SIZE;
    if (obj.offset[0] <= 0) { obj.offset[0] = 0; obj.direction[0] = -obj.direction[0]; }
    else if (obj.offset[0] >= maxX) { obj.offset[0] = maxX; obj.direction[0] = -obj.direction[0]; }
    obj.offset[1] += obj.direction[1];
    if (obj.offset[1] <= 0) { obj.offset[1] = 0; obj.direction[1] = -obj.direction[1]; }
    else if (obj.offset[1] >= maxY) { obj.offset[1] = maxY; obj.direction[1] = -obj.direction[1]; }
  }
}
export function findMovingObjectAt(lvl: LevelData, tx: number, ty: number): number {
  for (let i = 0; i < lvl.movingObjects.length; i++) {
    const o = lvl.movingObjects[i];
    if (o.topLeft[0] <= tx && o.botRight[0] > tx && o.topLeft[1] <= ty && o.botRight[1] > ty) return i;
  }
  return -1;
}
