import {
  COLLECTOR_COUNT,
  DAISO_SPECIES,
  collectorReward,
  daisoReward,
} from '../data/missions.js'
import { TIER_COUNT, getUnit, unitsOfTier } from '../data/units.js'
import type { UnitInstance } from './types.js'

export type MissionKind = 'daiso' | 'collector'

export interface MissionAward {
  kind: MissionKind
  /** daiso 면 티어, collector 면 유닛 defId */
  key: string
  tier: number
  gold: number
  label: string
}

export interface MissionProgress {
  kind: MissionKind
  key: string
  tier: number
  have: number
  need: number
  gold: number
  label: string
  done: boolean
}

function daisoKey(tier: number): string {
  return `daiso:${tier}`
}

function collectorKey(defId: string): string {
  return `collector:${defId}`
}

/**
 * 미션 판정과 영구 완료 기록.
 *
 * **"동시 보유" 순간에 즉시 판정**되고 영구 완료된다 —
 * 보상을 받은 뒤 팔거나 합성해도 회수되지 않는다.
 * 그래서 "6종을 잠깐 모았다가 바로 합성"이 정상 플레이가 된다.
 */
export class Missions {
  /** 이미 보상을 지급한 미션 키 */
  readonly completed = new Set<string>()

  /**
   * 보유 상태를 훑어 새로 달성된 미션을 돌려준다. 골드 지급은 호출자가 한다.
   *
   * 매 프레임이 아니라 **보유 변경 이벤트**(뽑기·합성·판매·이동)에서만 부른다.
   */
  evaluate(units: readonly UnitInstance[]): MissionAward[] {
    const counts = countByDef(units)
    const awards: MissionAward[] = []

    // 컬렉터 — 같은 유닛 N개
    for (const [defId, count] of counts) {
      if (count < COLLECTOR_COUNT) continue
      const key = collectorKey(defId)
      if (this.completed.has(key)) continue
      const def = getUnit(defId)
      this.completed.add(key)
      awards.push({
        kind: 'collector',
        key,
        tier: def.tier,
        gold: collectorReward(def.tier),
        label: `컬렉터 — ${def.name} ${COLLECTOR_COUNT}개`,
      })
    }

    // 다이소 — 한 티어의 전 종류를 1개 이상씩
    for (let tier = 1; tier <= TIER_COUNT; tier++) {
      const key = daisoKey(tier)
      if (this.completed.has(key)) continue
      if (!hasFullTier(counts, tier)) continue
      this.completed.add(key)
      awards.push({
        kind: 'daiso',
        key,
        tier,
        gold: daisoReward(tier),
        label: `다이소 — T${tier} ${DAISO_SPECIES}종 수집`,
      })
    }

    return awards
  }

  /** UI 용 진행도. 미완료 미션 중 가까운 것부터 보여준다. */
  progress(units: readonly UnitInstance[]): MissionProgress[] {
    const counts = countByDef(units)
    const rows: MissionProgress[] = []

    for (let tier = 1; tier <= TIER_COUNT; tier++) {
      const have = unitsOfTier(tier).filter((u) => (counts.get(u.id) ?? 0) > 0).length
      const key = daisoKey(tier)
      rows.push({
        kind: 'daiso',
        key,
        tier,
        have,
        need: DAISO_SPECIES,
        gold: daisoReward(tier),
        label: `다이소 T${tier}`,
        done: this.completed.has(key),
      })
    }

    for (const [defId, count] of counts) {
      const key = collectorKey(defId)
      const def = getUnit(defId)
      rows.push({
        kind: 'collector',
        key,
        tier: def.tier,
        have: count,
        need: COLLECTOR_COUNT,
        gold: collectorReward(def.tier),
        label: `컬렉터 ${def.name}`,
        done: this.completed.has(key),
      })
    }

    return rows
  }

  clearedCount(): number {
    return this.completed.size
  }

  totalEarned(): number {
    let sum = 0
    for (const key of this.completed) {
      const [kind, rest] = key.split(':')
      if (kind === 'daiso') sum += daisoReward(Number(rest))
      else if (rest) sum += collectorReward(getUnit(rest).tier)
    }
    return sum
  }
}

/**
 * 종류별 보유 개수. 각성 유닛도 센다 —
 * 각성한 T7 저격병도 여전히 "보유 중인 저격병"이다.
 */
function countByDef(units: readonly UnitInstance[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const u of units) counts.set(u.defId, (counts.get(u.defId) ?? 0) + 1)
  return counts
}

function hasFullTier(counts: Map<string, number>, tier: number): boolean {
  return unitsOfTier(tier).every((u) => (counts.get(u.id) ?? 0) > 0)
}
