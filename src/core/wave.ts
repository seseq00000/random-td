import { CHALLENGE_BOSS, FEVER } from '../data/challenge.js'
import {
  BASE_SPEED,
  TYPE_MODIFIERS,
  baseArmor,
  baseCount,
  isBossWave,
  wavePool,
  waveBountyPool,
  waveTypes,
} from '../data/waves.js'
import type { EnemyType } from './types.js'

export interface SpawnGroup {
  type: EnemyType
  count: number
  /** 개체 HP */
  hp: number
  armor: number
  /** 타일/초 */
  speed: number
  /** 개체당 현상금 */
  bounty: number
  /** 도전 보스 소환으로 추가된 개체인가 */
  isChallengeBoss: boolean
}

export interface WavePlan {
  wave: number
  groups: SpawnGroup[]
  totalCount: number
  /** 도전 보스를 제외한 정규 웨이브 HP 총합 — 검산용 */
  regularPool: number
  fever: boolean
}

export interface ChallengeFlags {
  fever: boolean
  challengeBoss: boolean
}

const NO_CHALLENGE: ChallengeFlags = { fever: false, challengeBoss: false }

/**
 * 웨이브 스폰 계획을 만든다.
 *
 * HP 를 **총 풀**로 정의해둔 덕에 도전 배수가 여기 두 줄로 끝난다 —
 * 피버는 풀과 마리수에 배수를 곱하고, 보스 소환은 그룹 하나를 더 붙인다.
 * 전투 로직(combat.ts)은 도전 시스템의 존재를 전혀 모른다.
 */
export function planWave(wave: number, challenges: ChallengeFlags = NO_CHALLENGE): WavePlan {
  const { fever, challengeBoss } = challenges

  const pool = wavePool(wave) * (fever ? FEVER.poolMul : 1)
  const armor = baseArmor(wave)
  const bountyPool = waveBountyPool(wave) * (fever ? FEVER.bountyMul : 1)
  const types = waveTypes(wave)

  /**
   * 피버는 풀(1.8)보다 마리수(2.2)를 더 올린다 → 개체 HP 가 오히려 0.82배.
   * 이 두 배수를 **함께** 적용해야 "물량형 웨이브"라는 설계가 성립한다.
   * 풀만 올리면 개체가 더 단단해져서 의도와 정반대가 된다.
   */
  const feverCountMul = fever ? FEVER.countMul : 1

  const groups: SpawnGroup[] = []

  if (isBossWave(wave)) {
    // 보스 웨이브는 풀 전체가 1마리에 들어간다.
    // 피버를 걸면 보스가 2마리로 갈라진다 — 누출 시 -5 씩이라 진짜 도박이 된다.
    const mod = TYPE_MODIFIERS.boss
    const count = Math.max(1, Math.round(feverCountMul))
    groups.push({
      type: 'boss',
      count,
      hp: pool / count,
      armor: Math.round(armor * mod.armorMul),
      speed: BASE_SPEED * mod.speedMul,
      bounty: Math.round(bountyPool / count),
      isChallengeBoss: false,
    })
  } else {
    // 여러 타입이면 풀과 현상금을 균등 분할한다
    const share = 1 / types.length
    for (const type of types) {
      const mod = TYPE_MODIFIERS[type]
      const count = Math.max(1, Math.round(baseCount(wave) * mod.countMul * feverCountMul * share))
      const groupPool = pool * share
      groups.push({
        type,
        count,
        hp: groupPool / count,
        armor: Math.round(armor * mod.armorMul),
        speed: BASE_SPEED * mod.speedMul,
        bounty: Math.max(1, Math.round((bountyPool * share) / count)),
        isChallengeBoss: false,
      })
    }
  }

  const regularPool = groups.reduce((sum, g) => sum + g.hp * g.count, 0)

  if (challengeBoss) {
    groups.push({
      type: 'boss',
      count: 1,
      hp: wavePool(wave) * CHALLENGE_BOSS.hpMul,
      armor: Math.round(armor * TYPE_MODIFIERS.boss.armorMul),
      speed: BASE_SPEED * CHALLENGE_BOSS.speedMul,
      // 처치 보상은 별도로 지급하므로 현상금은 0
      bounty: 0,
      isChallengeBoss: true,
    })
  }

  return {
    wave,
    groups,
    totalCount: groups.reduce((sum, g) => sum + g.count, 0),
    regularPool,
    fever,
  }
}

/**
 * 스폰 순서를 펼친다. 이중 스폰은 그룹을 번갈아 내보내서
 * "두 타입이 동시에 온다"는 설계 의도가 실제로 화면에 나타나게 한다.
 * 도전 보스는 맨 앞에 세워 플레이어가 바로 인지하게 한다.
 */
export function spawnOrder(plan: WavePlan): SpawnGroup[] {
  const challengeBosses = plan.groups.filter((g) => g.isChallengeBoss)
  const regular = plan.groups.filter((g) => !g.isChallengeBoss)

  const queue: SpawnGroup[] = [...challengeBosses]
  const remaining = regular.map((g) => g.count)

  let anyLeft = true
  while (anyLeft) {
    anyLeft = false
    for (let i = 0; i < regular.length; i++) {
      if (remaining[i]! > 0) {
        queue.push(regular[i]!)
        remaining[i]! -= 1
        anyLeft = true
      }
    }
  }
  return queue
}
