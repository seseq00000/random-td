import { TIER_COUNT, getUnit, unitsOfTier } from '../data/units.js'
import type { Rng } from './rng.js'
import type { UnitInstance } from './types.js'

/** 합성에 필요한 동일 유닛 수 */
export const MERGE_COUNT = 3

export interface MergeCandidate {
  defId: string
  /** 소모될 3개. uid 오름차순이라 결정론적이다. */
  members: UnitInstance[]
  /**
   * 3개 중 필드에 있던 게 있는가 — 있으면 결과도 필드로 간다.
   *
   * 예전엔 "물려받을 자리"(Tower)를 들고 다녔지만, 자리를 플레이어가 고르지 않게 되면서
   * 좌표는 의미가 없어졌다. 필드에 있었느냐만 알면 빈 슬롯이 알아서 배정된다.
   */
  fromField: boolean
}

export interface MergeProduct {
  defId: string
  awakened: boolean
  kind: 'upgrade' | 'awaken'
}

function isTower(u: UnitInstance): boolean {
  return 'tx' in u
}

/**
 * 합성 가능한 조합을 하나 찾는다. 없으면 null.
 *
 * 제외 규칙:
 * - **잠긴 종류**는 3개, 5개가 쌓여도 합성하지 않는다 (컬렉터 미션용)
 * - **각성 유닛**은 더 이상 합성 재료가 되지 않는다 (T7 각성이 최종 단계)
 *
 * 결정론을 위해 defId 사전순 → uid 오름차순으로 훑는다.
 * 같은 시드·같은 보유 상태면 항상 같은 조합이 나와야 리플레이가 재현된다.
 */
export function findMerge(
  units: readonly UnitInstance[],
  isLocked: (defId: string) => boolean,
): MergeCandidate | null {
  const groups = new Map<string, UnitInstance[]>()
  for (const u of units) {
    if (u.awakened) continue
    if (isLocked(u.defId)) continue
    const list = groups.get(u.defId)
    if (list) list.push(u)
    else groups.set(u.defId, [u])
  }

  for (const defId of [...groups.keys()].sort()) {
    const list = groups.get(defId)!
    if (list.length < MERGE_COUNT) continue
    const members = [...list].sort((a, b) => a.uid - b.uid).slice(0, MERGE_COUNT)
    return { defId, members, fromField: members.some(isTower) }
  }
  return null
}

/**
 * 3개를 소모해 무엇이 나오는가.
 *
 * - T1~T6: **티어+1 중 랜덤 1종**. 랜덤TD의 정체성이고, 부수적으로
 *   42종 승급표를 손으로 짤 필요가 없어진다.
 * - T7: 같은 유닛의 **각성**(DPS ×2). 최종 티어의 소모처.
 */
export function mergeProduct(defId: string, rng: Rng): MergeProduct {
  const tier = getUnit(defId).tier

  if (tier >= TIER_COUNT) {
    return { defId, awakened: true, kind: 'awaken' }
  }
  return { defId: rng.pick(unitsOfTier(tier + 1)).id, awakened: false, kind: 'upgrade' }
}
