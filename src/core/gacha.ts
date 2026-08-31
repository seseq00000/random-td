import { GACHA_COST, tierWeights } from '../data/gachaTable.js'
import { unitsOfTier } from '../data/units.js'
import type { Rng } from './rng.js'

export type DrawFailure = 'insufficient-gold' | 'bench-full' | 'wrong-phase'

/**
 * 1단계 — 티어 추첨. 백분율 가중치를 누적해서 고른다.
 * 확률표의 합이 100인지는 gachaTable 로드 시점에 이미 검증됐다.
 */
export function rollTier(wave: number, rng: Rng): number {
  const weights = tierWeights(wave)
  const roll = rng.next() * 100
  let acc = 0
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i]!
    if (roll < acc) return i + 1
  }
  // 부동소수 오차로 마지막 칸을 넘긴 경우 — 확률이 0이 아닌 최상위 티어로 떨군다
  for (let i = weights.length - 1; i >= 0; i--) {
    if (weights[i]! > 0) return i + 1
  }
  return 1
}

/** 2단계 — 해당 티어의 6종에서 균등 추첨 */
export function rollUnit(wave: number, rng: Rng): string {
  const tier = rollTier(wave, rng)
  return rng.pick(unitsOfTier(tier)).id
}

export { GACHA_COST }
