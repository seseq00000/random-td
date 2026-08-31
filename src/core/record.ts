import { getUnit } from '../data/units.js'
import type { Game } from './gameState.js'

/**
 * 한 판의 결과 기록.
 *
 * 저장 위치(localStorage / 서버)와 무관한 순수 데이터다.
 * 나중에 서버로 갈아끼울 때 이 스키마를 그대로 쓰면 되도록,
 * 브라우저 전용 타입이나 함수를 여기 넣지 않는다.
 */
export interface RunRecord {
  /** `playedAt-seed` — 같은 시각·같은 시드가 두 번 나올 일이 없다 */
  id: string
  nickname: string
  /** epoch ms */
  playedAt: number
  seed: number
  /** 도달한 웨이브. 클리어하면 TOTAL_WAVES + 1 */
  reachedWave: number
  cleared: boolean
  life: number
  missionsCleared: number
  missionGold: number
  challengesUsed: number
  topTier: number
  slots: number
  /** 게임 내 경과 시간(초). 실시간이 아니다 */
  durationSec: number
}

export const NICKNAME_MAX = 12

/**
 * 닉네임 정규화. 공백을 접고 길이를 자른다.
 * 빈 문자열이면 null — 호출자가 거부한다.
 */
export function normalizeNickname(raw: string): string | null {
  const trimmed = raw.trim().replace(/\s+/g, ' ')
  if (trimmed.length === 0) return null
  return trimmed.slice(0, NICKNAME_MAX)
}

export interface BuildRecordInput {
  nickname: string
  playedAt: number
  challengesUsed: number
}

/** 끝난 게임에서 기록을 만든다. */
export function buildRecord(game: Game, input: BuildRecordInput): RunRecord {
  const topTier = game.inv
    .allUnits()
    .reduce((max, u) => Math.max(max, getUnit(u.defId).tier), 0)

  return {
    id: `${input.playedAt}-${game.seed}`,
    nickname: input.nickname,
    playedAt: input.playedAt,
    seed: game.seed,
    reachedWave: game.wave,
    cleared: game.over === 'victory',
    life: game.life,
    missionsCleared: game.missions.clearedCount(),
    missionGold: game.missionGoldEarned,
    challengesUsed: input.challengesUsed,
    topTier,
    slots: game.slotsOwned,
    durationSec: Math.round(game.elapsedSec),
  }
}

/**
 * 순위 규칙: **도달 웨이브 → 잔여 라이프 → 미션 달성 수 → 먼저 기록한 쪽**.
 *
 * 설계의 멀티 순위 규칙("전원 클리어 시 잔여 라이프로 순위")과 같은 기준이라,
 * 나중에 멀티를 붙여도 정렬 로직을 다시 만들 필요가 없다.
 * 정렬 시 **앞에 오는 쪽이 상위**다 (오름차순 정렬에 그대로 쓴다).
 */
export function compareRecords(a: RunRecord, b: RunRecord): number {
  if (a.reachedWave !== b.reachedWave) return b.reachedWave - a.reachedWave
  if (a.life !== b.life) return b.life - a.life
  if (a.missionsCleared !== b.missionsCleared) return b.missionsCleared - a.missionsCleared
  return a.playedAt - b.playedAt
}

/** 상위부터 정렬한 새 배열 */
export function rankRecords(records: readonly RunRecord[]): RunRecord[] {
  return [...records].sort(compareRecords)
}

/** 특정 기록이 몇 위인지 (1-based). 없으면 0. */
export function rankOf(records: readonly RunRecord[], id: string): number {
  const idx = rankRecords(records).findIndex((r) => r.id === id)
  return idx < 0 ? 0 : idx + 1
}

/** 닉네임별 최고 기록만 남긴 순위표 */
export function bestPerNickname(records: readonly RunRecord[]): RunRecord[] {
  const best = new Map<string, RunRecord>()
  for (const r of records) {
    const current = best.get(r.nickname)
    if (!current || compareRecords(r, current) < 0) best.set(r.nickname, r)
  }
  return rankRecords([...best.values()])
}

/** 한 줄 요약 — 결과 화면과 목록에서 공통으로 쓴다 */
export function describeRecord(r: RunRecord): string {
  return r.cleared
    ? `전 웨이브 클리어 · 잔여 라이프 ${r.life}`
    : `웨이브 ${r.reachedWave} 에서 탈락`
}
