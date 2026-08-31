import { TIER_COUNT } from './units.js'

/**
 * 뽑기 확률 커브. 밸런싱은 이 파일 하나만 고친다.
 *
 * 2단계 추첨: 티어를 먼저 뽑고, 그 티어의 6종에서 균등 추첨.
 * 웨이브가 진행될수록 확률이 상위 티어로 이동한다.
 */

/** 뽑기 1회 비용. 점증 없음 — 플레이어가 암산으로 운영 판단을 할 수 있어야 한다. */
export const GACHA_COST = 10

interface TierBand {
  /** 이 구간이 적용되는 마지막 웨이브 (포함) */
  maxWave: number
  /** 인덱스 0 = T1 … 인덱스 6 = T7. 백분율이며 합이 정확히 100이어야 한다. */
  weights: readonly number[]
}

export const GACHA_TABLE: readonly TierBand[] = [
  { maxWave: 5, weights: [70, 25, 5, 0, 0, 0, 0] },
  { maxWave: 10, weights: [45, 33, 18, 4, 0, 0, 0] },
  { maxWave: 15, weights: [25, 30, 28, 14, 3, 0, 0] },
  { maxWave: 20, weights: [12, 22, 30, 24, 10, 2, 0] },
  { maxWave: 25, weights: [5, 13, 25, 30, 20, 6, 1] },
  { maxWave: Infinity, weights: [2, 8, 18, 30, 26, 12, 4] },
]

/**
 * 로드 시점 검증. 확률표는 손으로 고치는 파일이라
 * 합이 100이 아닌 채로 배포되면 조용히 분포가 틀어진다 — 그 전에 터뜨린다.
 */
for (const band of GACHA_TABLE) {
  if (band.weights.length !== TIER_COUNT) {
    throw new Error(`gachaTable: maxWave ${band.maxWave} 행의 길이가 ${TIER_COUNT} 가 아니다`)
  }
  const sum = band.weights.reduce((a, b) => a + b, 0)
  if (Math.abs(sum - 100) > 1e-9) {
    throw new Error(`gachaTable: maxWave ${band.maxWave} 행의 합이 100 이 아니라 ${sum} 이다`)
  }
  if (band.weights.some((w) => w < 0)) {
    throw new Error(`gachaTable: maxWave ${band.maxWave} 행에 음수 확률이 있다`)
  }
}

/** 해당 웨이브에 적용되는 티어 확률(백분율) */
export function tierWeights(wave: number): readonly number[] {
  for (const band of GACHA_TABLE) {
    if (wave <= band.maxWave) return band.weights
  }
  // GACHA_TABLE 의 마지막 행이 Infinity 이므로 여기 도달하지 않는다
  return GACHA_TABLE[GACHA_TABLE.length - 1]!.weights
}
