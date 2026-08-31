import { describe, expect, it } from 'vitest'
import type { Role } from '../src/core/types.js'
import { CREATURES, NICKNAME_TIERS, creatureOf, nicknameOf } from '../src/data/creatures.js'
import { TIER_STYLES, tierColor, tierLabel } from '../src/data/tiers.js'
import { ROLE_SPECS, TIER_COUNT, UNITS, UNITS_PER_TIER, unitsOfTier } from '../src/data/units.js'

const ALL_ROLES = ROLE_SPECS.map((s) => s.role)

describe('동물 매핑', () => {
  it('6개 역할 전부에 동물이 있다', () => {
    expect(CREATURES.length).toBe(UNITS_PER_TIER)
    for (const role of ALL_ROLES) expect(() => creatureOf(role)).not.toThrow()
  })

  it('한 동물이 한 역할만 맡는다', () => {
    expect(new Set(CREATURES.map((c) => c.role)).size).toBe(CREATURES.length)
  })

  it('한 글자 표기와 몸통색이 서로 겹치지 않는다 — 카드에서 구분돼야 한다', () => {
    expect(new Set(CREATURES.map((c) => c.glyph)).size).toBe(CREATURES.length)
    expect(new Set(CREATURES.map((c) => c.body)).size).toBe(CREATURES.length)
  })

  it('모든 동물에 역할 설명이 있다 — 범례에서 쓴다', () => {
    for (const c of CREATURES) expect(c.blurb.length).toBeGreaterThan(5)
  })

  it('없는 역할은 에러', () => {
    expect(() => creatureOf('nope' as Role)).toThrow()
  })
})

describe('애칭 사다리', () => {
  it('역할마다 정확히 티어 수만큼 있다', () => {
    expect(NICKNAME_TIERS).toBe(TIER_COUNT)
    for (const c of CREATURES) expect(c.nicknames.length).toBe(TIER_COUNT)
  })

  it('한 동물 안에서 애칭이 중복되지 않는다', () => {
    for (const c of CREATURES) {
      expect(new Set(c.nicknames).size).toBe(c.nicknames.length)
    }
  })

  it('범위 밖 티어는 양 끝으로 떨어진다', () => {
    for (const c of CREATURES) {
      expect(nicknameOf(c.role, 0)).toBe(c.nicknames[0])
      expect(nicknameOf(c.role, 99)).toBe(c.nicknames[TIER_COUNT - 1])
    }
  })
})

describe('유닛 이름 = 기존 이름 + 애칭', () => {
  it('42종이 여전히 유일하다', () => {
    expect(new Set(UNITS.map((u) => u.name)).size).toBe(UNITS.length)
  })

  it('모든 이름이 그 역할·티어의 애칭으로 끝난다', () => {
    for (const u of UNITS) {
      expect(u.name.endsWith(nicknameOf(u.role, u.tier))).toBe(true)
    }
  })

  it('애칭 앞에 원래 SF 이름이 남아 있다 — 갭 유머가 핵심이다', () => {
    for (const u of UNITS) {
      const prefix = u.name.slice(0, u.name.length - nicknameOf(u.role, u.tier).length).trim()
      expect(prefix.length).toBeGreaterThan(1)
    }
  })

  it('벤치 카드에 들어갈 만큼 짧다', () => {
    for (const u of UNITS) expect(u.name.length).toBeLessThanOrEqual(12)
  })

  it('같은 티어의 6종이 서로 다른 동물이다', () => {
    for (let t = 1; t <= TIER_COUNT; t++) {
      const roles = unitsOfTier(t).map((u) => u.role)
      expect(new Set(roles).size).toBe(UNITS_PER_TIER)
    }
  })
})

describe('티어 등급', () => {
  it('1~7 전부에 이름과 색이 있다', () => {
    expect(TIER_STYLES.length).toBe(TIER_COUNT)
    for (let t = 1; t <= TIER_COUNT; t++) {
      expect(tierLabel(t).length).toBeGreaterThan(0)
      expect(tierColor(t)).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('T1·T2 는 숫자 표기, T3 부터 등급명이다', () => {
    expect(tierLabel(1)).toBe('T1')
    expect(tierLabel(2)).toBe('T2')
    for (let t = 3; t <= TIER_COUNT; t++) {
      expect(tierLabel(t)).not.toMatch(/^T\d/)
    }
  })

  it('등급명과 색이 서로 겹치지 않는다', () => {
    expect(new Set(TIER_STYLES.map((s) => s.label)).size).toBe(TIER_STYLES.length)
    expect(new Set(TIER_STYLES.map((s) => s.color)).size).toBe(TIER_STYLES.length)
  })

  it('범위 밖은 양 끝으로 폴백한다 — 화면이 비는 것보다 낫다', () => {
    expect(tierLabel(0)).toBe(tierLabel(1))
    expect(tierLabel(-5)).toBe(tierLabel(1))
    expect(tierLabel(99)).toBe(tierLabel(TIER_COUNT))
  })
})
