import { isBossWave } from '../data/waves.js'

export type Phase = 'prep' | 'battle' | 'settle'

/** 정산 연출 길이(초) */
export const SETTLE_DURATION = 3

/**
 * 준비 페이즈 길이. 후반엔 한 번에 결정할 게 많아지므로 시간도 늘어난다.
 * 조기 시작 보너스가 "남은 초 × 1골드"이므로, 시간이 늘면 숙련자 보상 상한도 함께 커진다.
 *
 * @param upcomingWave 이 준비 페이즈 다음에 시작될 웨이브 번호
 */
export function prepDuration(upcomingWave: number): number {
  const base = 20 + Math.floor(upcomingWave / 5) * 5
  const afterBoss = upcomingWave > 1 && isBossWave(upcomingWave - 1) ? 10 : 0
  return base + afterBoss
}
