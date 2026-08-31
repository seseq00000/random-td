import type { Enemy } from './types.js'

export const START_GOLD = 60
export const START_LIFE = 20
export const MAX_LIFE = 20
export const START_SLOTS = 3
export const MAX_SLOTS = 10

/**
 * 웨이브 클리어 보상.
 *
 * ⚠ 공중 제거 후 재튜닝: 원안 `20 + 3w` (30웨이브 합 1,995).
 * 공중이 사라져 판이 안정되자 **기본 수입만으로 W24 까지 갔다**(목표 W17~20).
 * 미션 골드는 그대로 두고 기본 수입만 줄여서, 미션·도전을 쓰는 쪽과의 격차를 벌렸다.
 */
export function waveClearReward(wave: number): number {
  return 20 + wave * 3
}

/** 누출 페널티 — 보스는 5배 */
export function leakPenalty(enemy: Enemy): number {
  return enemy.type === 'boss' ? 5 : 1
}

/** 조기 시작 보너스: 남은 준비 초 × 1골드 */
export function earlyStartBonus(secondsRemaining: number): number {
  return Math.max(0, Math.floor(secondsRemaining))
}

/**
 * 라이프 증감. 상한(MAX_LIFE)을 넘지 않고 0 아래로도 내려가지 않는다.
 * 0 도달 판정은 호출자가 반환값으로 한다.
 */
export function adjustLife(current: number, delta: number): number {
  return Math.max(0, Math.min(MAX_LIFE, current + delta))
}
