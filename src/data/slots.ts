import { MAX_SLOTS, START_SLOTS } from '../core/economy.js'
import { GACHA_COST } from './gachaTable.js'
import { TIER_POWER_GROWTH } from './units.js'

/**
 * 타워 슬롯 가격표. 4번째부터 구매하며 약 1.55배씩 오른다.
 *
 * 전 슬롯 개방 총비용 1,450골드 = 뽑기 145회.
 * 이게 게임에서 가장 큰 단일 의사결정이다 — "필드를 넓힐까, 더 뽑을까".
 */
/**
 * ⚠ 공중 제거 후 재튜닝: 원안 40/60/90/140/220/350/550 (총 1,450).
 *
 * 공중이 사라지자 모든 전략이 T7 에 도달해서(최고티어 6.9) 티어가 더 이상 실력 차를
 * 만들지 못했고, **슬롯 수만 남았다**(기본 6.9칸 vs 전 시스템 9.1칸).
 * 골드가 남아도 보드 상한에 막히니 미션·도전이 결과를 못 바꿨다.
 *
 * 가격을 약 3배로 올려 **슬롯을 진짜 병목으로** 만들었다.
 * 이제 골드를 많이 번 쪽만 10칸을 다 연다 — 설계의 "가장 큰 단일 의사결정"이 되살아난다.
 */
export const SLOT_PRICES: readonly number[] = [60, 110, 200, 360, 640, 1150, 2000]

if (SLOT_PRICES.length !== MAX_SLOTS - START_SLOTS) {
  throw new Error(
    `slots: 가격표 길이(${SLOT_PRICES.length})가 구매 가능 슬롯 수(${MAX_SLOTS - START_SLOTS})와 다르다`,
  )
}

/** 전 슬롯 개방 총비용 — 밸런싱 검산용 */
export const TOTAL_SLOT_COST = SLOT_PRICES.reduce((a, b) => a + b, 0)

/**
 * `owned` 개를 가진 상태에서 다음 슬롯 1개의 가격.
 * 이미 최대면 null.
 */
export function nextSlotPrice(owned: number): number | null {
  if (owned >= MAX_SLOTS) return null
  const idx = owned - START_SLOTS
  return SLOT_PRICES[idx] ?? null
}

export const SELL_REFUND_RATE = 0.5

/**
 * 유닛 판매 환급액 — **실제로 낸 골드**의 50%.
 *
 * 티어 기준으로 계산하면 안 된다. 후반 뽑기는 10골드로 T5·T6 을 직접 주는데,
 * 티어 기준 환급은 그걸 수백 골드로 쳐줘서 무한 골드 경로가 열린다.
 * (프로브에서 실제로 터졌다 — 예산상 상한 360회여야 할 뽑기가 11,585회)
 *
 * `paid` 는 뽑기면 GACHA_COST, 합성 결과면 재료 3개의 합이다.
 * 그래서 합성으로 올린 T6(2,430골드 투입)는 1,215골드를 돌려받고,
 * 운으로 뽑은 T6(10골드 투입)는 5골드를 돌려받는다 — 팔지 말고 쓰라는 뜻이다.
 */
export function sellValue(paid: number): number {
  return Math.floor(paid * SELL_REFUND_RATE)
}

/** 그 티어를 합성으로 만드는 데 드는 이론 투입 골드 — 밸런싱 검산용 */
export function buildCost(tier: number): number {
  return GACHA_COST * Math.pow(TIER_POWER_GROWTH, tier - 1)
}
