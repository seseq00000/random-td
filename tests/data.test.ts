import { describe, expect, it } from 'vitest'
import { adjustLife, earlyStartBonus, leakPenalty, waveClearReward } from '../src/core/economy.js'
import type { Enemy } from '../src/core/types.js'
import {
  CELEBRATE_FROM_TIER,
  TIER_STYLES,
  celebrationText,
  tierLabel,
} from '../src/data/tiers.js'
import {
  ROLE_SPECS,
  TIER_COUNT,
  UNITS,
  UNITS_PER_TIER,
  basePower,
  getUnit,
  unitDps,
  unitsOfTier,
} from '../src/data/units.js'
import {
  DOUBLE_SPAWN_FROM,
  TOTAL_WAVES,
  TYPE_MODIFIERS,
  WAVE_POOL_BASE,
  WAVE_POOL_GROWTH,
  WAVE_SCHEDULE,
  baseCount,
  isBossWave,
  wavePool,
  waveBountyPool,
  waveTypes,
} from '../src/data/waves.js'

describe('등급과 축하 연출', () => {
  it('축하 기준선은 등급명이 붙기 시작하는 티어와 같다', () => {
    // T1·T2 는 "T1" 처럼 숫자로 부르고, T3 부터 레어/유니크/… 로 이름이 붙는다.
    // 두 선이 어긋나면 "이름 없는 흔한 유닛"에 축하가 뜨거나, 그 반대가 된다.
    const firstNamed = TIER_STYLES.findIndex((s) => !/^T\d+$/.test(s.label)) + 1
    expect(CELEBRATE_FROM_TIER).toBe(firstNamed)
  })

  it('기준선 아래는 숫자 표기, 위는 등급명이다', () => {
    expect(tierLabel(CELEBRATE_FROM_TIER - 1)).toMatch(/^T\d+$/)
    expect(tierLabel(CELEBRATE_FROM_TIER)).not.toMatch(/^T\d+$/)
  })

  it('축하 문구는 티어가 올라갈수록 약해지지 않는다', () => {
    // 길이(느낌표 수)로 세기를 표현한다 — 위 등급이 더 밋밋하면 연출이 거꾸로 읽힌다
    for (let t = CELEBRATE_FROM_TIER; t < TIER_STYLES.length; t++) {
      expect(celebrationText(t + 1).length).toBeGreaterThanOrEqual(celebrationText(t).length)
    }
  })

  it('모든 등급에 축하 문구가 있다', () => {
    for (let t = CELEBRATE_FROM_TIER; t <= TIER_STYLES.length; t++) {
      expect(celebrationText(t)).toContain(tierLabel(t))
    }
  })
})

function mkEnemy(type: Enemy['type']): Enemy {
  return {
    uid: 1,
    type,
    hp: 1,
    maxHp: 1,
    armor: 0,
    bounty: 1,
    speed: 1,
    dist: 0,
    angle0: 0,
    slowFactor: 1,
    slowRemaining: 0,
    isChallengeBoss: false,
  }
}

describe('유닛 테이블', () => {
  it('42종이 생성된다', () => {
    expect(UNITS.length).toBe(TIER_COUNT * UNITS_PER_TIER)
    expect(UNITS.length).toBe(42)
  })

  it('유닛 id 가 유일하다', () => {
    expect(new Set(UNITS.map((u) => u.id)).size).toBe(UNITS.length)
  })

  it('유닛 이름이 유일하다', () => {
    expect(new Set(UNITS.map((u) => u.name)).size).toBe(UNITS.length)
  })

  it('각 티어가 6개 역할을 정확히 하나씩 채운다', () => {
    for (let t = 1; t <= TIER_COUNT; t++) {
      const roles = unitsOfTier(t).map((u) => u.role)
      expect(roles.length).toBe(UNITS_PER_TIER)
      expect(new Set(roles)).toEqual(new Set(ROLE_SPECS.map((s) => s.role)))
    }
  })

  it('basePower 는 티어당 3배씩 오른다', () => {
    expect(basePower(1)).toBe(10)
    expect(basePower(4)).toBe(270)
    expect(basePower(7)).toBe(7290)
  })

  it('DPS 가 티어당 정확히 3배가 된다 (커브 공식이 유지되는지)', () => {
    for (const spec of ROLE_SPECS) {
      if (spec.dpsMul === 0) continue
      for (let t = 1; t < TIER_COUNT; t++) {
        const lo = unitDps(getUnit(`t${t}_${spec.role}`))
        const hi = unitDps(getUnit(`t${t + 1}_${spec.role}`))
        expect(hi / lo).toBeCloseTo(3.0, 6)
      }
    }
  })

  it('버프 유닛은 공격하지 않고 오라를 갖는다', () => {
    const buff = getUnit('t1_buff')
    expect(buff.damage).toBe(0)
    expect(buff.targetType).toBe('none')
    expect(buff.aura).toBeDefined()
  })

  it('버프를 뺀 전 역할이 지상을 때린다', () => {
    for (const spec of ROLE_SPECS) {
      const def = getUnit(`t1_${spec.role}`)
      expect(def.targetType).toBe(spec.role === 'buff' ? 'none' : 'ground')
    }
  })

  it('저격은 사거리가 가장 길고, 단일 딜러는 DPS 가 가장 높다', () => {
    // 공중을 없애면서 대공 → 장거리 저격으로 바꿨다.
    // 둘의 역할이 겹치지 않아야 한다 — 멀리서 약하게 vs 가까이서 세게.
    const sniper = getUnit('t1_sniper')
    const single = getUnit('t1_single')
    const ranges = UNITS.filter((u) => u.tier === 1 && u.role !== 'buff').map((u) => u.range)
    expect(sniper.range).toBe(Math.max(...ranges))
    expect(sniper.range).toBeGreaterThan(single.range)
    expect(unitDps(single)).toBeGreaterThan(unitDps(sniper))
  })

  it('없는 id 는 에러', () => {
    expect(() => getUnit('t9_single')).toThrow()
  })
})

describe('웨이브 테이블', () => {
  // 튜닝 값 자체가 아니라 커브의 "모양"을 검증한다 —
  // M4 에서 상수가 바뀌어도 이 테스트는 깨지지 않아야 한다.
  it('HP 풀이 웨이브 1에서 BASE 로 시작해 GROWTH 배씩 오른다', () => {
    expect(wavePool(1)).toBe(WAVE_POOL_BASE)
    for (let w = 1; w < TOTAL_WAVES; w++) {
      expect(wavePool(w + 1) / wavePool(w)).toBeCloseTo(WAVE_POOL_GROWTH, 6)
    }
  })

  it('HP 풀은 단조 증가한다', () => {
    expect(WAVE_POOL_GROWTH).toBeGreaterThan(1)
    for (let w = 1; w < TOTAL_WAVES; w++) {
      expect(wavePool(w + 1)).toBeGreaterThan(wavePool(w))
    }
  })

  it('5의 배수는 보스 웨이브다', () => {
    expect(isBossWave(5)).toBe(true)
    expect(isBossWave(30)).toBe(true)
    expect(isBossWave(4)).toBe(false)
  })

  it('기준 마리수는 웨이브가 갈수록 늘어난다', () => {
    expect(baseCount(1)).toBeLessThan(baseCount(29))
  })

  it('현상금 총액은 마리수가 아니라 웨이브로 정해진다', () => {
    // 이래야 swarm(2.5배 물량)이 2.5배 골드를 주지 않는다
    expect(waveBountyPool(1)).toBeLessThan(waveBountyPool(30))
  })

  it('스케줄이 30웨이브를 덮고 보스 웨이브가 정확히 배치돼 있다', () => {
    expect(WAVE_SCHEDULE.length).toBe(TOTAL_WAVES)
    for (let w = 1; w <= TOTAL_WAVES; w++) {
      const types = waveTypes(w)
      expect(types.length).toBeGreaterThan(0)
      expect(types.includes('boss')).toBe(isBossWave(w))
    }
  })

  it('이중 스폰은 웨이브 21부터만 나온다', () => {
    for (let w = 1; w < DOUBLE_SPAWN_FROM; w++) {
      expect(waveTypes(w).length).toBe(1)
    }
    const doubles = Array.from({ length: TOTAL_WAVES - DOUBLE_SPAWN_FROM + 1 }, (_, i) =>
      waveTypes(DOUBLE_SPAWN_FROM + i),
    ).filter((t) => t.length > 1)
    expect(doubles.length).toBeGreaterThan(0)
  })

  it('장갑은 웨이브 7에 처음 나온다 — 방어력 개념을 일찍 소개한다', () => {
    for (let w = 1; w <= 6; w++) expect(waveTypes(w).includes('armored')).toBe(false)
    expect(waveTypes(7).includes('armored')).toBe(true)
  })

  it('웨이브 3부터는 같은 타입이 연달아 오지 않는다', () => {
    // W1~W2 는 도입부라 일반이 연속으로 나온다 — 처음부터 변화를 주면 학습이 안 된다.
    // 변화는 W3(물량)부터 시작한다.
    for (let w = 3; w < TOTAL_WAVES; w++) {
      const a = waveTypes(w)
      const b = waveTypes(w + 1)
      if (a.includes('boss') || b.includes('boss')) continue
      expect(a.join(',')).not.toBe(b.join(','))
    }
  })

  it('타입 배율이 설계 의도대로다', () => {
    // 장갑은 적고 단단하고 느리다 / 물량은 많고 무방비하고 빠르다
    expect(TYPE_MODIFIERS.armored.countMul).toBeLessThan(1)
    expect(TYPE_MODIFIERS.armored.armorMul).toBeGreaterThan(1)
    expect(TYPE_MODIFIERS.swarm.countMul).toBeGreaterThan(1)
    expect(TYPE_MODIFIERS.swarm.armorMul).toBe(0)
    expect(TYPE_MODIFIERS.boss.speedMul).toBeLessThan(1)
  })
})

describe('경제', () => {
  // 튜닝 값이 아니라 성질을 본다 — 상수는 M4 이후로도 계속 조정된다
  it('웨이브 클리어 보상이 웨이브에 따라 단조 증가한다', () => {
    for (let w = 1; w < TOTAL_WAVES; w++) {
      expect(waveClearReward(w + 1)).toBeGreaterThan(waveClearReward(w))
    }
    expect(waveClearReward(1)).toBeGreaterThan(0)
  })

  it('누출 페널티는 일반 1 / 보스 5', () => {
    expect(leakPenalty(mkEnemy('normal'))).toBe(1)
    expect(leakPenalty(mkEnemy('boss'))).toBe(5)
  })

  it('조기 시작 보너스는 남은 초 (음수는 0)', () => {
    expect(earlyStartBonus(12.7)).toBe(12)
    expect(earlyStartBonus(-3)).toBe(0)
  })

  it('라이프는 상한 20을 넘지 않는다', () => {
    expect(adjustLife(20, 5)).toBe(20)
    expect(adjustLife(19, 1)).toBe(20)
  })

  it('라이프는 0 아래로 내려가지 않는다', () => {
    expect(adjustLife(3, -10)).toBe(0)
  })
})
