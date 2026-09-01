import { TIER_COUNT } from './units.js'

/**
 * 티어 등급명과 등급 색.
 *
 * 이름과 색을 **함께** 둔다 — "티어 N 은 뭐라 부르고 무슨 색인가"를 한 곳에서 본다.
 * 둘 다 손으로 튜닝하는 값이라 `data/` 가 맞는 자리다.
 *
 * T1·T2 는 숫자를 그대로 쓴다. 초반 유닛에 등급을 붙이면 등급이 흔해져서
 * **"레어를 뽑았다"는 순간**이 살아나지 않는다.
 */
export interface TierStyle {
  /** 텍스트 UI 에 쓰는 표기 */
  label: string
  /** 테두리·강조 색 */
  color: string
}

export const TIER_STYLES: readonly TierStyle[] = [
  { label: 'T1', color: '#9aa4b0' },
  { label: 'T2', color: '#6fbf73' },
  { label: '레어', color: '#4aa8e0' },
  { label: '유니크', color: '#a06ae0' },
  { label: '에픽', color: '#e08a3c' },
  { label: '레전드', color: '#e0574a' },
  { label: '신화', color: '#f0c651' },
]

if (TIER_STYLES.length !== TIER_COUNT) {
  throw new Error(`tiers: 등급표 길이(${TIER_STYLES.length})가 ${TIER_COUNT} 가 아니다`)
}

/** 범위 밖이면 가장 가까운 끝으로 떨군다 — 화면이 비는 것보다 낫다. */
function styleOf(tier: number): TierStyle {
  const idx = Math.min(TIER_STYLES.length - 1, Math.max(0, Math.round(tier) - 1))
  return TIER_STYLES[idx]!
}

/**
 * 텍스트 UI 용 등급 표기.
 * 필드 타워(40px)에는 쓰지 마라 — "레전드" 네 글자가 안 들어간다. 거기선 숫자를 쓴다.
 */
export function tierLabel(tier: number): string {
  return styleOf(tier).label
}

export function tierColor(tier: number): string {
  return styleOf(tier).color
}

/** 각성(T7 3개 합성) 광채 */
export const AWAKEN_GLOW = '#ffe9a0'

/**
 * 이 티어부터 뽑기 축하 연출을 띄운다.
 *
 * **등급명이 붙기 시작하는 지점과 같아야 한다.** T1·T2 는 숫자로 부르는 흔한 유닛이라
 * 여기에 연출을 붙이면 초반 내내 팝업이 떠서 "레어를 뽑았다"가 안 특별해진다.
 * 등급명(레어/유니크/…)과 축하는 같은 선을 공유해야 한다.
 */
export const CELEBRATE_FROM_TIER = 3

/** 축하 문구 — 위로 갈수록 세진다 */
export function celebrationText(tier: number): string {
  if (tier >= 7) return '신화 등장!!!'
  if (tier >= 6) return '레전드 등장!!'
  if (tier >= 5) return '에픽 등장!!'
  if (tier >= 4) return '유니크 등장!'
  return '레어 등장!'
}
