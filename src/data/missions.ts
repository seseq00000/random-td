import { TIER_COUNT, UNITS_PER_TIER } from './units.js'

/**
 * 미션 보상표 — 이 게임의 주 골드 수입원.
 *
 * 다이소는 **넓게**(한 티어 6종 전부), 컬렉터는 **깊게**(한 종류 5개).
 * 정반대 방향이라 동시 추진이 어렵고, 뽑기 결과를 보고 노선을 정하는 판단이 생긴다.
 * 이게 "매번 다른 판"을 만드는 실제 엔진이다.
 */

/**
 * 다이소 — 한 티어의 6종을 전부 1개 이상 동시 보유 ("다 있어")
 *
 * ⚠ M4 튜닝: 원안은 80/150/280/500/900/1600/3000 (합 6,510)이었다.
 * 설계 3.3절이 "T5 이상은 거의 불가능"을 전제했는데 **실제로는 T7 까지 달성된다.**
 * 상위 티어 급증을 완만하게 바꿔 합계를 절반으로 낮췄다.
 * 상위 티어 미션은 이미 "강한 보드"라는 보상이 붙어 있어 골드까지 급증할 이유가 없다.
 */
export const DAISO_REWARDS: readonly number[] = [60, 100, 160, 240, 340, 460, 600]

/** 컬렉터 — 같은 유닛 N개 동시 보유 */
export const COLLECTOR_COUNT = 4
export const COLLECTOR_BASE = 30
/** ⚠ M4 튜닝: 원안 2.0 → 1.5. T7 컬렉터가 2,560골드면 후반 경제가 무너진다. */
export const COLLECTOR_GROWTH = 1.5

if (DAISO_REWARDS.length !== TIER_COUNT) {
  throw new Error(`missions: 다이소 보상표 길이(${DAISO_REWARDS.length})가 ${TIER_COUNT} 가 아니다`)
}

export function daisoReward(tier: number): number {
  return DAISO_REWARDS[tier - 1] ?? 0
}

/** T1 40 … T7 671 — 상위 티어일수록 5개 모으기가 어렵지만 보상 급증은 억제한다 */
export function collectorReward(tier: number): number {
  return Math.round(COLLECTOR_BASE * Math.pow(COLLECTOR_GROWTH, tier - 1))
}

/**
 * 다이소에 필요한 종류 수. 유닛 테이블의 티어당 종수와 반드시 같아야 한다 —
 * 어긋나면 달성 불가능한 미션이 조용히 생긴다.
 */
export const DAISO_SPECIES = UNITS_PER_TIER

/**
 * 설계 기준: T5 이상 다이소는 현실적으로 거의 불가능하다.
 * **T6·T7 은 의도된 "로망 보상"**이고, 실질 설계 기준은 T1~T4 다.
 */
export const DAISO_REALISTIC_MAX_TIER = 4
