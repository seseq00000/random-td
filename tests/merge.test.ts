import { describe, expect, it } from 'vitest'
import { AWAKEN_DAMAGE_MUL, Game } from '../src/core/gameState.js'
import { MERGE_COUNT, findMerge, mergeProduct } from '../src/core/merge.js'
import { createRng } from '../src/core/rng.js'
import type { UnitInstance } from '../src/core/types.js'
import { SLOT_POSITIONS } from '../src/data/field.js'
import { TIER_COUNT, getUnit } from '../src/data/units.js'

const noLock = () => false

function unit(uid: number, defId: string, awakened = false): UnitInstance {
  return { uid, defId, awakened, paid: 10 }
}

/** 자동 합성을 끈 게임 — 재료를 손으로 세팅할 수 있다 */
function idleGame(seed = 1): Game {
  const game = new Game(seed)
  game.autoMerge = false
  return game
}

describe('findMerge — 조합 탐색', () => {
  it('같은 유닛 3개가 모이면 찾는다', () => {
    const units = [unit(1, 't1_single'), unit(2, 't1_single'), unit(3, 't1_single')]
    const found = findMerge(units, noLock)
    expect(found?.defId).toBe('t1_single')
    expect(found?.members.map((m) => m.uid)).toEqual([1, 2, 3])
  })

  it('2개면 발동하지 않는다', () => {
    const units = [unit(1, 't1_single'), unit(2, 't1_single')]
    expect(findMerge(units, noLock)).toBeNull()
  })

  it('다른 종류가 섞여 있으면 3개를 채운 종류만 찾는다', () => {
    const units = [
      unit(1, 't1_single'),
      unit(2, 't1_splash'),
      unit(3, 't1_splash'),
      unit(4, 't1_splash'),
      unit(5, 't1_single'),
    ]
    expect(findMerge(units, noLock)?.defId).toBe('t1_splash')
  })

  it('잠긴 유닛은 5개여도 발동하지 않는다', () => {
    const units = Array.from({ length: 5 }, (_, i) => unit(i + 1, 't1_single'))
    expect(findMerge(units, noLock)).not.toBeNull()
    expect(findMerge(units, (id) => id === 't1_single')).toBeNull()
  })

  it('잠긴 종류가 있어도 잠기지 않은 다른 종류는 합성한다', () => {
    const units = [
      ...Array.from({ length: 4 }, (_, i) => unit(i + 1, 't1_single')),
      ...Array.from({ length: 3 }, (_, i) => unit(i + 10, 't1_splash')),
    ]
    const found = findMerge(units, (id) => id === 't1_single')
    expect(found?.defId).toBe('t1_splash')
  })

  it('각성 유닛은 재료가 되지 않는다', () => {
    const units = Array.from({ length: 3 }, (_, i) => unit(i + 1, 't7_single', true))
    expect(findMerge(units, noLock)).toBeNull()
  })

  it('4개 이상이면 uid 가 작은 3개만 뽑는다', () => {
    const units = [5, 2, 9, 1].map((uid) => unit(uid, 't1_single'))
    expect(findMerge(units, noLock)?.members.map((m) => m.uid)).toEqual([1, 2, 5])
  })

  it('재료 중 필드에 있던 게 있으면 fromField 가 참이다', () => {
    const game = idleGame()
    game.grantUnit('t1_single')
    game.grantUnit('t1_single')
    game.grantUnit('t1_single')
    game.placeFromBench(game.bench[1]!.uid)

    const found = findMerge(game.inv.allUnits(), noLock)
    expect(found?.fromField).toBe(true)
  })

  it('전부 벤치에 있으면 fromField 가 거짓이다', () => {
    const units = Array.from({ length: 3 }, (_, i) => unit(i + 1, 't1_single'))
    expect(findMerge(units, noLock)?.fromField).toBe(false)
  })
})

describe('mergeProduct — 결과 판정', () => {
  it('T1~T6 은 티어+1 중 랜덤 종류를 준다', () => {
    const rng = createRng(42)
    for (let tier = 1; tier < TIER_COUNT; tier++) {
      const product = mergeProduct(`t${tier}_single`, rng)
      expect(product.kind).toBe('upgrade')
      expect(product.awakened).toBe(false)
      expect(getUnit(product.defId).tier).toBe(tier + 1)
    }
  })

  it('상위 티어 6종이 모두 나올 수 있다 (랜덤 승급)', () => {
    const rng = createRng(7)
    const seen = new Set<string>()
    for (let i = 0; i < 500; i++) seen.add(mergeProduct('t1_single', rng).defId)
    expect(seen.size).toBe(6)
  })

  it('T7 은 같은 유닛의 각성을 준다', () => {
    const rng = createRng(1)
    const product = mergeProduct('t7_splash', rng)
    expect(product.kind).toBe('awaken')
    expect(product.defId).toBe('t7_splash')
    expect(product.awakened).toBe(true)
  })
})

describe('Game 자동 합성', () => {
  it('3개째가 들어오는 시점에 합성되어 T2 하나가 된다', () => {
    const game = new Game(1)
    game.grantUnit('t1_single')
    game.grantUnit('t1_single')
    expect(game.bench.length).toBe(2)

    game.grantUnit('t1_single')
    expect(game.bench.length).toBe(1)
    expect(getUnit(game.bench[0]!.defId).tier).toBe(2)
  })

  it('자동 합성을 꺼두면 3개가 그대로 남는다', () => {
    const game = idleGame()
    for (let i = 0; i < 3; i++) game.grantUnit('t1_single')
    expect(game.bench.length).toBe(3)
  })

  it('수동 합성으로 한 번씩 처리할 수 있다', () => {
    const game = idleGame()
    for (let i = 0; i < 3; i++) game.grantUnit('t1_single')
    expect(game.mergeManually()).toBe(true)
    expect(game.bench.length).toBe(1)
    expect(game.mergeManually()).toBe(false)
  })

  it('잠금이 걸리면 3개가 쌓여도 합성되지 않고, 풀면 즉시 합성된다', () => {
    const game = new Game(1)
    game.toggleLock('t1_single')
    for (let i = 0; i < 3; i++) game.grantUnit('t1_single')
    expect(game.bench.length).toBe(3)

    game.toggleLock('t1_single')
    expect(game.bench.length).toBe(1)
    expect(getUnit(game.bench[0]!.defId).tier).toBe(2)
  })

  it('자동 합성을 다시 켜면 밀린 조합을 한꺼번에 처리한다', () => {
    const game = idleGame()
    for (let i = 0; i < 3; i++) game.grantUnit('t1_single')
    for (let i = 0; i < 3; i++) game.grantUnit('t1_splash')
    expect(game.bench.length).toBe(6)

    game.setAutoMerge(true)
    expect(game.bench.length).toBe(2)
  })

  it('T1 9개를 차례로 지급하면 T2 3개 이하로 압축된다', () => {
    // 벤치는 8칸이라 9개를 한꺼번에 놓을 수 없다.
    // 자동 합성을 켠 채 하나씩 넣으면 3개째마다 합성돼 정원에 닿지 않는다.
    const game = new Game(1)
    for (let i = 0; i < 9; i++) expect(game.grantUnit('t1_single')).not.toBeNull()

    const tiers = game.bench.map((b) => getUnit(b.defId).tier)
    // T2 3개, 그 3개가 우연히 같은 종류면 T3 하나로 한 번 더 이어진다.
    expect(game.bench.length).toBeLessThanOrEqual(3)
    expect(Math.min(...tiers)).toBeGreaterThanOrEqual(2)
  })

  it('벤치 정원 때문에 자동 합성을 끄면 9개를 넣을 수 없다', () => {
    const game = idleGame()
    let granted = 0
    for (let i = 0; i < 9; i++) if (game.grantUnit('t1_single')) granted++
    expect(granted).toBe(8)
  })

  it('합성 결과가 필드에 있던 자리를 물려받는다', () => {
    const game = idleGame()
    for (let i = 0; i < 3; i++) game.grantUnit('t1_single')
    game.placeFromBench(game.bench[0]!.uid)
    expect(game.towers.length).toBe(1)

    game.setAutoMerge(true)
    expect(game.towers.length).toBe(1)
    expect(game.towers[0]).toMatchObject(SLOT_POSITIONS[0]!)
    expect(getUnit(game.towers[0]!.defId).tier).toBe(2)
    expect(game.bench.length).toBe(0)
  })

  it('전부 벤치에 있었으면 결과도 벤치로 간다', () => {
    const game = new Game(1)
    for (let i = 0; i < 3; i++) game.grantUnit('t1_single')
    expect(game.towers.length).toBe(0)
    expect(game.bench.length).toBe(1)
  })

  it('필드 3개를 합성하면 슬롯 2칸이 도로 비워진다', () => {
    const game = idleGame()
    game.slotsOwned = 3
    for (let i = 0; i < 3; i++) game.grantUnit('t1_single')
    for (const b of [...game.bench]) game.placeFromBench(b.uid)
    expect(game.towers.length).toBe(3)
    expect(game.inv.slotsFree()).toBe(0)

    game.setAutoMerge(true)
    expect(game.towers.length).toBe(1)
    expect(game.inv.slotsFree()).toBe(2)
  })
})

describe('T7 각성', () => {
  it('T7 3개는 같은 유닛의 각성이고, DPS 가 2배가 된다', () => {
    const game = idleGame()
    for (let i = 0; i < 3; i++) game.grantUnit('t7_single')
    game.setAutoMerge(true)

    expect(game.bench.length).toBe(1)
    const result = game.bench[0]!
    expect(result.defId).toBe('t7_single')
    expect(result.awakened).toBe(true)
    expect(AWAKEN_DAMAGE_MUL).toBe(2)
  })

  it('각성 유닛 3개는 더 이상 합성되지 않는다', () => {
    const game = new Game(1)
    for (let i = 0; i < 9; i++) game.grantUnit('t7_single')
    // 9개 → 각성 3개. 각성은 재료가 아니므로 여기서 멈춘다.
    expect(game.bench.every((b) => b.awakened)).toBe(true)
    expect(game.bench.length).toBe(3)
  })
})

describe('결정론', () => {
  it('같은 시드면 합성 결과 종류까지 동일하다', () => {
    const play = (seed: number) => {
      const g = new Game(seed)
      for (let i = 0; i < 9; i++) g.grantUnit('t1_single')
      return g.bench.map((b) => `${b.defId}:${b.awakened}`)
    }
    expect(play(777)).toEqual(play(777))
  })

  it('MERGE_COUNT 는 3이다', () => {
    expect(MERGE_COUNT).toBe(3)
  })
})
