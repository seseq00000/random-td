import { describe, expect, it } from 'vitest'
import { Game } from '../src/core/gameState.js'
import { Missions } from '../src/core/missions.js'
import type { UnitInstance } from '../src/core/types.js'
import {
  COLLECTOR_COUNT,
  COLLECTOR_GROWTH,
  collectorReward,
  daisoReward,
} from '../src/data/missions.js'
import { unitsOfTier } from '../src/data/units.js'

let uid = 1
function held(defId: string, awakened = false): UnitInstance {
  return { uid: uid++, defId, awakened, paid: 10 }
}

function tierSet(tier: number): UnitInstance[] {
  return unitsOfTier(tier).map((u) => held(u.id))
}

/** 자동 합성이 꺼진 게임 — 미션 재료를 손으로 세팅할 때 쓴다 */
function idleGame(seed = 1): Game {
  const game = new Game(seed)
  game.autoMerge = false
  return game
}

describe('다이소 — 한 티어 전 종류 수집', () => {
  it('6종을 전부 모으면 보상이 나온다', () => {
    const m = new Missions()
    const awards = m.evaluate(tierSet(1))
    expect(awards).toHaveLength(1)
    expect(awards[0]!.kind).toBe('daiso')
    expect(awards[0]!.gold).toBe(daisoReward(1))
  })

  it('5종만으로는 발동하지 않는다', () => {
    const m = new Missions()
    expect(m.evaluate(tierSet(1).slice(0, 5))).toHaveLength(0)
  })

  it('같은 종류를 여러 개 모아도 종수가 부족하면 다이소는 안 된다', () => {
    const m = new Missions()
    const units = Array.from({ length: 10 }, () => held('t1_single'))
    const awards = m.evaluate(units)
    expect(awards.filter((a) => a.kind === 'daiso')).toHaveLength(0)
    // 대신 컬렉터는 달성된다 — 두 미션이 정반대 방향이라는 증거
    expect(awards.filter((a) => a.kind === 'collector')).toHaveLength(1)
  })

  it('티어별로 각각 달성된다', () => {
    const m = new Missions()
    const awards = m.evaluate([...tierSet(1), ...tierSet(3)])
    const tiers = awards.filter((a) => a.kind === 'daiso').map((a) => a.tier)
    expect(new Set(tiers)).toEqual(new Set([1, 3]))
  })

  it('보상은 1회만 — 팔았다가 다시 모아도 재지급되지 않는다', () => {
    const m = new Missions()
    expect(m.evaluate(tierSet(1))).toHaveLength(1)
    expect(m.evaluate([])).toHaveLength(0)
    expect(m.evaluate(tierSet(1))).toHaveLength(0)
  })

  it('상위 티어일수록 보상이 크다', () => {
    for (let t = 1; t < 7; t++) {
      expect(daisoReward(t + 1)).toBeGreaterThan(daisoReward(t))
    }
  })
})

describe(`컬렉터 — 같은 유닛 ${COLLECTOR_COUNT}개`, () => {
  it(`${COLLECTOR_COUNT}개를 모으면 보상이 나온다`, () => {
    const m = new Missions()
    const units = Array.from({ length: COLLECTOR_COUNT }, () => held('t1_single'))
    const awards = m.evaluate(units)
    expect(awards).toHaveLength(1)
    expect(awards[0]!.kind).toBe('collector')
    expect(awards[0]!.gold).toBe(collectorReward(1))
  })

  it(`${COLLECTOR_COUNT - 1}개로는 발동하지 않는다`, () => {
    const m = new Missions()
    const units = Array.from({ length: COLLECTOR_COUNT - 1 }, () => held('t1_single'))
    expect(m.evaluate(units)).toHaveLength(0)
  })

  it('종류마다 따로 달성된다', () => {
    const m = new Missions()
    const units = [
      ...Array.from({ length: COLLECTOR_COUNT }, () => held('t1_single')),
      ...Array.from({ length: COLLECTOR_COUNT }, () => held('t1_splash')),
    ]
    expect(m.evaluate(units).filter((a) => a.kind === 'collector')).toHaveLength(2)
  })

  it('보상은 1회만', () => {
    const m = new Missions()
    const units = Array.from({ length: COLLECTOR_COUNT }, () => held('t1_single'))
    expect(m.evaluate(units)).toHaveLength(1)
    expect(m.evaluate(units)).toHaveLength(0)
  })

  // 튜닝 값이 아니라 커브의 "모양"을 검증한다 —
  // M4 에서 상수가 바뀌어도 이 테스트는 깨지지 않아야 한다.
  it('보상이 티어당 COLLECTOR_GROWTH 배씩 오른다', () => {
    expect(COLLECTOR_GROWTH).toBeGreaterThan(1)
    for (let t = 1; t < 7; t++) {
      // collectorReward 는 반올림하므로 비율로 비교한다
      expect(collectorReward(t + 1) / collectorReward(t)).toBeCloseTo(COLLECTOR_GROWTH, 1)
    }
  })
})

describe('판정 규칙', () => {
  it('각성 유닛도 보유로 센다', () => {
    const m = new Missions()
    const units = unitsOfTier(7).map((u, i) => held(u.id, i === 0))
    expect(m.evaluate(units).some((a) => a.kind === 'daiso' && a.tier === 7)).toBe(true)
  })

  it('필드 + 벤치를 합산해서 판정한다', () => {
    const game = idleGame()
    for (const def of unitsOfTier(1)) game.grantUnit(def.id)
    // 절반을 필드로 옮겨도 다이소가 유지돼야 한다 (이미 달성됐으므로 완료 기록 확인)
    expect(game.missions.completed.has('daiso:1')).toBe(true)
    expect(game.inv.allUnits().length).toBe(6)
  })
})

describe('Game 통합', () => {
  it('다이소 T1 을 채우면 골드가 실제로 들어온다', () => {
    const game = idleGame()
    const before = game.gold
    for (const def of unitsOfTier(1)) game.grantUnit(def.id)
    expect(game.gold).toBe(before + daisoReward(1))
    expect(game.missions.clearedCount()).toBe(1)
  })

  it('자동 합성이 켜져 있으면 컬렉터 개수에 도달할 수 없다 — 잠금이 필요하다', () => {
    const game = new Game(1) // autoMerge 기본 ON
    for (let i = 0; i < 5; i++) game.grantUnit('t1_single')
    expect(game.inv.totalCountOf('t1_single')).toBeLessThan(COLLECTOR_COUNT)
    expect(game.missions.completed.has('collector:t1_single')).toBe(false)
  })

  it('잠그면 필요 개수까지 쌓여 컬렉터가 달성된다', () => {
    const game = new Game(1)
    game.toggleLock('t1_single')
    const before = game.gold
    for (let i = 0; i < COLLECTOR_COUNT; i++) game.grantUnit('t1_single')
    expect(game.inv.totalCountOf('t1_single')).toBe(COLLECTOR_COUNT)
    expect(game.gold).toBe(before + collectorReward(1))
  })

  it('합성이 미션 판정보다 먼저 처리된다 — 자동 합성이 다이소의 최대 적이라는 설계', () => {
    const game = new Game(1)
    // T1 5종을 1개씩 + 마지막 1종을 3개 넣는다.
    // 합성 먼저면 마지막 종류가 사라져 다이소 미달, 판정 먼저면 달성.
    const t1 = unitsOfTier(1)
    for (const def of t1.slice(0, 5)) game.grantUnit(def.id)
    const last = t1[5]!.id
    game.grantUnit(last)
    expect(game.missions.completed.has('daiso:1')).toBe(true) // 6종 갖춘 시점에 달성

    // 이제 같은 종류를 2개 더 넣으면 합성돼서 그 종류가 사라진다
    game.grantUnit(last)
    game.grantUnit(last)
    expect(game.inv.totalCountOf(last)).toBe(0)
  })

  it('미션 누적 수입이 집계된다', () => {
    const game = idleGame()
    for (const def of unitsOfTier(1)) game.grantUnit(def.id)
    expect(game.missions.totalEarned()).toBe(daisoReward(1))
  })

  it('진행도가 UI 용으로 나온다', () => {
    const game = idleGame()
    game.grantUnit('t1_single')
    game.grantUnit('t1_single')
    const rows = game.missionProgress()
    const collector = rows.find((r) => r.key === 'collector:t1_single')
    expect(collector?.have).toBe(2)
    expect(collector?.need).toBe(COLLECTOR_COUNT)
    const daiso = rows.find((r) => r.key === 'daiso:1')
    expect(daiso?.have).toBe(1) // 종수 기준이라 1종만 보유
    expect(daiso?.need).toBe(6)
  })
})
