import {
  CORE_RADIUS_TILES,
  RADIUS_CURVE,
  REVOLUTIONS,
  SPAWN_ANGLE,
  SPAWN_RADIUS_TILES,
  SPIRAL_LENGTH,
} from '../data/field.js'
import { CENTER_PX, tilesToPixels } from './grid.js'
import type { Vec2 } from './types.js'

/**
 * 적의 나선 이동. 경로형(`path.ts`)을 대체한다.
 *
 * 진행도는 여전히 **`dist` 스칼라 하나**다 — 적은 바깥 원에서 스폰돼 빙빙 돌며
 * 코어로 좁혀들고, `dist` 가 클수록 코어에 가깝다. 덕분에
 * `targetPriority: 'first'`("누출 직전을 먼저 막는다")의 의미가 그대로 보존되고,
 * 이동·스폰·슬로우 코드는 손댈 필요가 없다.
 *
 * 전투 코드(`combat.ts`)는 픽셀 거리만 보므로 이 파일을 전혀 모른다.
 * "사거리 = 원이 얼마나 줄었을 때부터 때리는가" 는 별도 구현이 아니라
 * 기존 거리 계산에서 저절로 나온다.
 */

/** 진행도 0~1. 범위를 벗어나면 양 끝에서 멈춘다. */
function progressOf(dist: number): number {
  return Math.max(0, Math.min(1, dist / SPIRAL_LENGTH))
}

/**
 * 스폰 반경에서 코어 반경으로 줄어든다. `RADIUS_CURVE` 지수만큼 **바깥에 오래 머문다** —
 * 사거리가 긴 유닛만 그 구간에 닿으므로, 여기가 역할 다양성의 값어치를 만든다.
 */
export function orbitRadiusTiles(dist: number): number {
  const p = progressOf(dist)
  const t = Math.pow(p, RADIUS_CURVE)
  return SPAWN_RADIUS_TILES + (CORE_RADIUS_TILES - SPAWN_RADIUS_TILES) * t
}

/** 시작 각도에서 REVOLUTIONS 바퀴만큼 한 방향으로 돈다. */
export function orbitAngle(dist: number, angle0: number): number {
  return angle0 + 2 * Math.PI * REVOLUTIONS * progressOf(dist)
}

/** 진행도와 시작 각도로부터 픽셀 좌표를 만든다. */
export function orbitPosition(dist: number, angle0: number): Vec2 {
  const r = tilesToPixels(orbitRadiusTiles(dist))
  const a = orbitAngle(dist, angle0)
  return { x: CENTER_PX.x + r * Math.cos(a), y: CENTER_PX.y + r * Math.sin(a) }
}

/** 코어에 닿았는가 — 누출 판정 */
export function reachedCore(dist: number): boolean {
  return dist >= SPIRAL_LENGTH
}

/**
 * 시작 각도 — 모든 적이 같은 지점에서 나온다.
 *
 * 상수지만 함수로 남겨둔다. 나중에 "웨이브마다 스폰 지점이 바뀐다" 같은 규칙을 넣을 때
 * 호출부(`gameState.spawn`)를 건드리지 않아도 되기 때문이다.
 */
export function spawnAngle(): number {
  return SPAWN_ANGLE
}
