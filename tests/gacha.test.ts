import { describe, expect, it } from 'vitest'
import { rollTier, rollUnit } from '../src/core/gacha.js'
import { Game } from '../src/core/gameState.js'
import { createRng } from '../src/core/rng.js'
import { GACHA_COST, GACHA_TABLE, tierWeights } from '../src/data/gachaTable.js'
import { BENCH_CAPACITY } from '../src/core/inventory.js'
import { TIER_COUNT, getUnit, unitsOfTier } from '../src/data/units.js'
import { TOTAL_WAVES } from '../src/data/waves.js'

describe('확률표 무결성', () => {
  it('모든 행의 합이 정확히 100이다', () => {
    for (const band of GACHA_TABLE) {
      const sum = band.weights.reduce((a, b) => a + b, 0)
      expect(sum).toBeCloseTo(100, 9)
    }
  })

  it('모든 행의 길이가 티어 수와 같다', () => {
    for (const band of GACHA_TABLE) expect(band.weights.length).toBe(TIER_COUNT)
  })

  it('모든 웨이브(1~30)가 어떤 행에든 매핑된다', () => {
    for (let w = 1; w <= TOTAL_WAVES; w++) {
      const weights = tierWeights(w)
      expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 9)
    }
  })

  it('웨이브가 진행될수록 확률이 상위 티어로 이동한다', () => {
    // 기대 티어 = Σ(티어 × 확률). 단조 증가해야 한다.
    const expectedTier = (w: number) =>
      tierWeights(w).reduce((sum, p, i) => sum + (i + 1) * p, 0) / 100

    const samples = [1, 6, 11, 16, 21, 26].map(expectedTier)
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!).toBeGreaterThan(samples[i - 1]!)
    }
  })

  it('T7 은 후반에만 등장하고 확률이 매우 낮다 — 정상 경로는 T6 3개 합성이다', () => {
    expect(tierWeights(1)[6]).toBe(0)
    expect(tierWeights(20)[6]).toBe(0)
    expect(tierWeights(30)[6]).toBeLessThanOrEqual(5)
  })
})

describe('rollTier 분포', () => {
  it('고정 시드 10만 회 추첨이 테이블과 ±0.5%p 내로 일치한다', () => {
    for (const wave of [1, 8, 13, 18, 23, 28]) {
      const rng = createRng(1234 + wave)
      const N = 100_000
      const counts = new Array(TIER_COUNT).fill(0)
      for (let i = 0; i < N; i++) counts[rollTier(wave, rng) - 1]++

      const expected = tierWeights(wave)
      for (let t = 0; t < TIER_COUNT; t++) {
        const actualPct = (counts[t] / N) * 100
        expect(Math.abs(actualPct - expected[t]!)).toBeLessThan(0.5)
      }
    }
  })

  it('확률 0인 티어는 절대 나오지 않는다', () => {
    const rng = createRng(99)
    for (let i = 0; i < 20_000; i++) {
      // 웨이브 1 은 T4~T7 확률이 0
      expect(rollTier(1, rng)).toBeLessThanOrEqual(3)
    }
  })

  it('항상 유효한 티어 범위를 낸다', () => {
    const rng = createRng(7)
    for (let w = 1; w <= TOTAL_WAVES; w++) {
      for (let i = 0; i < 200; i++) {
        const t = rollTier(w, rng)
        expect(t).toBeGreaterThanOrEqual(1)
        expect(t).toBeLessThanOrEqual(TIER_COUNT)
      }
    }
  })
})

describe('rollUnit — 2단계 추첨', () => {
  it('티어 안에서 6종이 균등하게 나온다', () => {
    const rng = createRng(555)
    const counts = new Map<string, number>()
    const N = 120_000
    for (let i = 0; i < N; i++) {
      const id = rollUnit(1, rng)
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    // 웨이브 1 의 T1 은 70% 라 표본이 충분하다.
    // T2(25%)·T3(5%)는 표본이 작아 균등성 판정이 흔들리므로 대상에서 뺀다.
    const ids = unitsOfTier(1).map((u) => u.id)
    const tierTotal = ids.reduce((s, id) => s + (counts.get(id) ?? 0), 0)
    expect(tierTotal).toBeGreaterThan(50_000)
    for (const id of ids) {
      const share = (counts.get(id) ?? 0) / tierTotal
      expect(Math.abs(share - 1 / 6)).toBeLessThan(0.01)
    }
  })

  it('항상 실존하는 유닛 id 를 낸다', () => {
    const rng = createRng(31)
    for (let w = 1; w <= TOTAL_WAVES; w++) {
      for (let i = 0; i < 100; i++) expect(() => getUnit(rollUnit(w, rng))).not.toThrow()
    }
  })
})

describe('Game.draw — 뽑기 명령', () => {
  it('골드를 차감하고 벤치에 유닛이 들어온다', () => {
    const game = new Game(1)
    const goldBefore = game.gold
    const result = game.draw()
    expect(result.ok).toBe(true)
    expect(game.gold).toBe(goldBefore - GACHA_COST)
    expect(game.bench.length).toBe(1)
  })

  it('골드가 부족하면 거부한다', () => {
    const game = new Game(1)
    game.gold = GACHA_COST - 1
    expect(game.draw()).toEqual({ ok: false, reason: 'insufficient-gold' })
    expect(game.bench.length).toBe(0)
  })

  it('벤치가 가득 차면 거부하고 골드도 안 깎인다', () => {
    const game = new Game(1)
    game.autoMerge = false
    game.gold = 10_000
    // 벤치는 **종류**로 센다 — 같은 걸 8개 넣어봐야 한 칸이다.
    // 서로 다른 종류로 8칸을 채워야 실제로 막힌다.
    const kinds = [...unitsOfTier(1), ...unitsOfTier(2)].slice(0, BENCH_CAPACITY)
    for (const def of kinds) expect(game.grantUnit(def.id)).not.toBeNull()
    expect(game.inv.benchStacks()).toBe(BENCH_CAPACITY)

    const goldBefore = game.gold
    expect(game.draw()).toEqual({ ok: false, reason: 'bench-full' })
    expect(game.gold).toBe(goldBefore)
  })

  it('벤치가 종류로 꽉 차도 이미 가진 종류는 계속 받는다', () => {
    const game = new Game(1)
    game.autoMerge = false
    const kinds = [...unitsOfTier(1), ...unitsOfTier(2)].slice(0, BENCH_CAPACITY)
    for (const def of kinds) game.grantUnit(def.id)
    expect(game.inv.benchFull()).toBe(true)

    // 중복은 칸을 안 쓰므로 몇 장이든 들어간다 — 이게 "스택은 한 칸" 규칙이다
    const dup = kinds[0]!.id
    expect(game.grantUnit(dup)).not.toBeNull()
    expect(game.grantUnit(dup)).not.toBeNull()
    expect(game.inv.totalCountOf(dup)).toBe(3)
    expect(game.inv.benchStacks()).toBe(BENCH_CAPACITY)
  })

  it('전투 중에도 뽑을 수 있다 — 관전만 하는 시간이 없어야 한다', () => {
    const game = new Game(1)
    game.gold = 1000
    game.startWaveEarly()
    expect(game.phase).toBe('battle')
    expect(game.draw().ok).toBe(true)
  })

  it('판이 끝나면 뽑을 수 없다', () => {
    const game = new Game(1)
    game.gold = 1000
    game.over = 'defeat'
    expect(game.draw()).toEqual({ ok: false, reason: 'wrong-phase' })
  })

  it('같은 시드는 같은 뽑기 순서를 낸다', () => {
    const roll = (seed: number) => {
      const g = new Game(seed)
      g.autoMerge = false
      g.gold = 60
      const ids: string[] = []
      for (let i = 0; i < 6; i++) {
        const r = g.draw()
        if (r.ok) ids.push(r.defId)
      }
      return ids
    }
    expect(roll(2024)).toEqual(roll(2024))
    expect(roll(1)).not.toEqual(roll(2))
  })
})
