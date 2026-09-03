/**
 * 도전 시스템 상수 — 라이프를 걸고 골드를 산다.
 *
 * 설계 의도: **보드가 커브보다 앞서 있을 때만 이득**이어야 한다.
 * 딱 맞는 보드로 걸면 손해가 나야 "적절히 사용"이 실력이 된다.
 * 그래서 배수를 골드 쪽에 몰아주고(×3.0) 난이도 쪽은 절제했다(×1.8).
 */

/** 토큰 충전 주기 — 이 웨이브들의 준비 페이즈에 +1 */
export const TOKEN_INTERVAL = 4
export const TOKEN_FIRST_WAVE = 5
export const TOKEN_MAX = 2

/** 웨이브 5, 9, 13, 17, 21, 25, 29 — 총 7개 */
export function isTokenWave(wave: number): boolean {
  return wave >= TOKEN_FIRST_WAVE && (wave - TOKEN_FIRST_WAVE) % TOKEN_INTERVAL === 0
}

/**
 * 피버타임 배수.
 * HP 풀(1.8)보다 마리수(2.2)를 더 올려서 **개체 HP 가 오히려 0.82배**가 된다 →
 * 물량형 웨이브가 되고, 스플래시·관통 유닛이 많을수록 유리하다.
 */
export const FEVER = {
  /**
   * ⚠ 벤치 완화 후 재튜닝: 1.8 → 1.65.
   * 골드는 이미 29% 더 버는데 클리어율이 오히려 낮았다(56% → 48%) —
   * **보상이 아니라 위험이 문제**라는 뜻이라 난이도 쪽을 내렸다.
   * countMul 은 그대로라 개체 HP 는 0.75배가 된다 — "물량형 웨이브" 성질은 유지된다.
   */
  poolMul: 1.65,
  countMul: 2.2,
  /**
   * ⚠ M4 튜닝: 3.0 → 3.5 → 4.0.
   * ⚠ 나선 전환 후: → 4.8. 도전이 골드를 더 벌고도 클리어율이 같았다(45% vs 42%) —
   * 번 골드가 생존으로 전환되지 않았다는 뜻이라 전환율 자체를 올린다.
   */
  bountyMul: 4.8,
  clearRewardMul: 2.5,
} as const

/** 개체 HP 배수 — 검산용 (0.818…) */
export const FEVER_UNIT_HP_MUL = FEVER.poolMul / FEVER.countMul

/**
 * 보스 소환 — 그 웨이브에 **추가로** 보스 1마리가 함께 나온다.
 * 그 웨이브 전체보다 1.5배 강한 단일 개체라, 보드에 여유가 없으면 못 잡는다.
 * 단일 딜러 빌드가 유리해서 피버(스플래시 유리)와 정반대다.
 */
export const CHALLENGE_BOSS = {
  /**
   * ⚠ 공중 제거 후 재튜닝: 1.5 → 1.3.
   * 난이도 커브를 다시 잡고 나니 pool ×1.5 짜리 보스는 성공률이 너무 낮아
   * **도전이 항상 손해**가 됐다(도전 37% < 미도전 39%). 성공 가능한 수준으로 낮춘다.
   */
  hpMul: 1.2,
  /**
   * 처치 보상 = base + perWave × wave.
   * ⚠ M4 튜닝: 150+25w → 200+45w. 원안으로는 도전 6회가 클리어율을 8%p 밖에 못 바꿨다.
   * ⚠ 공중 제거 후: → 250+60w. 난이도가 올라 도전의 기대 이득이 다시 음수가 됐다.
   */
  goldBase: 330,
  goldPerWave: 85,
  /** 처치 시 라이프 회복 — 도전이 다음 도전의 밑천이 되는 선순환 */
  lifeReward: 2,
  /**
   * 누출 시 라이프 손실.
   * ⚠ 벤치 완화 후 재튜닝: 5 → 3. 위 poolMul 과 같은 이유 —
   * 도전이 순손해라 "쓸지 말지"가 선택이 아니라 "쓰면 안 되는 것"이 돼 있었다.
   */
  lifePenalty: 3,
  speedMul: 0.8,
} as const

export function challengeBossGold(wave: number): number {
  return CHALLENGE_BOSS.goldBase + CHALLENGE_BOSS.goldPerWave * wave
}

export type ChallengeKind = 'fever' | 'boss'
