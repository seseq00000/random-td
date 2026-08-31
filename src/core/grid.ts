import type { TileCoord, Vec2 } from './types.js'

/**
 * 필드 기하. 15×15 타일, 타일 40px → 600×600 캔버스.
 *
 * 경로형(18×12 가로)에서 **정사각**으로 바꿨다. 적이 중앙 코어를 향해 나선으로
 * 좁혀들어오므로 필드가 원형이고, 원을 담으려면 정사각이어야 한다.
 * 폰 세로 화면에도 정사각이 맞는다 — `aspect-ratio: 1` 로 폭에 맞춰 늘리면 끝이다.
 */
export const TILE = 40
export const GRID_W = 15
export const GRID_H = 15
export const FIELD_W = GRID_W * TILE
export const FIELD_H = GRID_H * TILE

/** 중앙 코어가 놓인 타일. 적이 여기 닿으면 라이프가 깎인다. */
export const CENTER_TILE: TileCoord = { tx: 7, ty: 7 }

/** 타일 중심의 픽셀 좌표 */
export function tileToPixel(tx: number, ty: number): Vec2 {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 }
}

/** 코어 중심의 픽셀 좌표 — 나선의 원점 */
export const CENTER_PX: Vec2 = tileToPixel(CENTER_TILE.tx, CENTER_TILE.ty)

export function pixelToTile(x: number, y: number): TileCoord {
  return { tx: Math.floor(x / TILE), ty: Math.floor(y / TILE) }
}

export function inBounds(tx: number, ty: number): boolean {
  return tx >= 0 && tx < GRID_W && ty >= 0 && ty < GRID_H
}

/** 타일 좌표를 Set/Map 키로 쓸 정수로 압축한다. */
export function tileKey(tx: number, ty: number): number {
  return ty * GRID_W + tx
}

/** 타일 단위 거리 → 픽셀 거리 */
export function tilesToPixels(tiles: number): number {
  return tiles * TILE
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
