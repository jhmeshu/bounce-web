// Port of tile_table.c — sprite_index refers to objects_nm.png 48x72 (4 cols x 6 rows, 12px cells)
export const enum TF { None=0, FlipX=1, FlipY=2, FlipXY=3, Rot90=4, Rot180=5, Rot270=6, Rot270FlipX=7, Rot270FlipY=8, Rot270FlipXY=9 }
export const enum RT { Normal=0, Composite=1, Hoop=8 }
export interface TileMeta { orientation: number; sprite: number; transform: TF; render: RT; }
// orientations: 0 none, 1 TL,2 TR,3 BL,4 BR, 5 vertTop,6 vertBottom,7 horizLeft,8 horizRight
export const TILE_DB: TileMeta[] = [
  { orientation: 0, sprite: 255, transform: TF.None, render: RT.Normal }, // 0
  { orientation: 0, sprite: 1, transform: TF.None, render: RT.Normal }, // 1 red brick atlas[1] (1,0)
  { orientation: 0, sprite: 9, transform: TF.None, render: RT.Normal }, // 2 blue rubber atlas[9] (1,2)
  { orientation: 0, sprite: 12, transform: TF.None, render: RT.Normal }, // 3 spike up
  { orientation: 0, sprite: 12, transform: TF.Rot270, render: RT.Normal }, // 4 spike left
  { orientation: 0, sprite: 12, transform: TF.FlipY, render: RT.Normal }, // 5 spike down
  { orientation: 0, sprite: 12, transform: TF.Rot90, render: RT.Normal }, // 6 spike right
  { orientation: 0, sprite: 16, transform: TF.None, render: RT.Normal }, // 7 checkpoint gem
  { orientation: 0, sprite: 19, transform: TF.None, render: RT.Normal }, // 8 checkpoint on
  { orientation: 0, sprite: 14, transform: TF.None, render: RT.Normal }, // 9 exit
  { orientation: 0, sprite: 13, transform: TF.None, render: RT.Composite }, // 10 moving spikes
  { orientation: 0, sprite: 255, transform: TF.None, render: RT.Normal }, // 11
  { orientation: 0, sprite: 255, transform: TF.None, render: RT.Normal }, // 12
  { orientation: 5, sprite: 21, transform: TF.None, render: RT.Hoop }, // 13
  { orientation: 6, sprite: 21, transform: TF.None, render: RT.Hoop }, // 14
  { orientation: 7, sprite: 21, transform: TF.None, render: RT.Hoop }, // 15
  { orientation: 8, sprite: 21, transform: TF.None, render: RT.Hoop }, // 16
  { orientation: 5, sprite: 23, transform: TF.None, render: RT.Hoop }, // 17
  { orientation: 6, sprite: 23, transform: TF.None, render: RT.Hoop }, // 18
  { orientation: 7, sprite: 23, transform: TF.None, render: RT.Hoop }, // 19
  { orientation: 8, sprite: 23, transform: TF.None, render: RT.Hoop }, // 20
  { orientation: 5, sprite: 20, transform: TF.None, render: RT.Hoop }, // 21
  { orientation: 6, sprite: 20, transform: TF.None, render: RT.Hoop }, // 22
  { orientation: 7, sprite: 20, transform: TF.None, render: RT.Hoop }, // 23
  { orientation: 8, sprite: 20, transform: TF.None, render: RT.Hoop }, // 24
  { orientation: 5, sprite: 22, transform: TF.None, render: RT.Hoop }, // 25
  { orientation: 6, sprite: 22, transform: TF.None, render: RT.Hoop }, // 26
  { orientation: 7, sprite: 22, transform: TF.None, render: RT.Hoop }, // 27
  { orientation: 8, sprite: 22, transform: TF.None, render: RT.Hoop }, // 28
  { orientation: 0, sprite: 15, transform: TF.None, render: RT.Normal }, // 29 extra life
  { orientation: 1, sprite: 0, transform: TF.Rot180, render: RT.Normal }, // 30 ramp
  { orientation: 2, sprite: 0, transform: TF.Rot90, render: RT.Normal }, // 31
  { orientation: 4, sprite: 0, transform: TF.None, render: RT.Normal }, // 32
  { orientation: 3, sprite: 0, transform: TF.Rot270, render: RT.Normal }, // 33
  { orientation: 1, sprite: 8, transform: TF.Rot180, render: RT.Normal }, // 34 rubber ramp
  { orientation: 2, sprite: 8, transform: TF.Rot90, render: RT.Normal }, // 35
  { orientation: 4, sprite: 8, transform: TF.None, render: RT.Normal }, // 36
  { orientation: 3, sprite: 8, transform: TF.Rot270, render: RT.Normal }, // 37
  { orientation: 0, sprite: 5, transform: TF.FlipX, render: RT.Normal }, // 38 speed
  { orientation: 0, sprite: 7, transform: TF.None, render: RT.Normal }, // 39 deflator floor
  { orientation: 0, sprite: 7, transform: TF.Rot90, render: RT.Normal }, // 40
  { orientation: 0, sprite: 7, transform: TF.Rot180, render: RT.Normal }, // 41
  { orientation: 0, sprite: 7, transform: TF.Rot270, render: RT.Normal }, // 42
  { orientation: 0, sprite: 18, transform: TF.None, render: RT.Normal }, // 43 inflator
  { orientation: 0, sprite: 18, transform: TF.Rot90, render: RT.Normal }, // 44
  { orientation: 0, sprite: 18, transform: TF.Rot180, render: RT.Normal }, // 45
  { orientation: 0, sprite: 18, transform: TF.Rot270, render: RT.Normal }, // 46
  { orientation: 0, sprite: 11, transform: TF.None, render: RT.Normal }, // 47 gravity
  { orientation: 0, sprite: 11, transform: TF.Rot90, render: RT.Normal }, // 48
  { orientation: 0, sprite: 11, transform: TF.Rot180, render: RT.Normal }, // 49
  { orientation: 0, sprite: 11, transform: TF.Rot270, render: RT.Normal }, // 50
  { orientation: 0, sprite: 10, transform: TF.None, render: RT.Normal }, // 51 jump
  { orientation: 0, sprite: 10, transform: TF.Rot270, render: RT.Normal }, // 52
  { orientation: 0, sprite: 10, transform: TF.Rot180, render: RT.Normal }, // 53
  { orientation: 0, sprite: 10, transform: TF.Rot90, render: RT.Normal }, // 54
];
