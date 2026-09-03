import { describe, expect, it } from 'vitest'
import { MAX_SLOTS, START_SLOTS } from '../src/core/economy.js'
import { Game } from '../src/core/gameState.js'
import { Inventory } from '../src/core/inventory.js'
import { SLOT_POSITIONS } from '../src/data/field.js'
import { SLOT_PRICES, TOTAL_SLOT_COST, nextSlotPrice, sellValue } from '../src/data/slots.js'
import { GACHA_COST } from '../src/data/gachaTable.js'
import { unitsOfTier } from '../src/data/units.js'

/** 자동 합성을 끈 게임 — 슬롯/벤치 규칙만 격리해서 본다 */
function idleGame(seed = 1): Game {
  const game = new Game(seed)
  game.autoMerge = false
  return game
}

describe('슬롯 가격표', () => {
  it('가격표 길이가 구매 가능 슬롯 수와 일치한다', () => {
    expect(SLOT_PRICES.length).toBe(MAX_SLOTS - START_SLOTS)
  })

  it('가격이 단조 증가한다', () => {
    for (let i = 1; i < SLOT_PRICES.length; i++) {
      expect(SLOT_PRICES[i]!).toBeGreaterThan(SLOT_PRICES[i - 1]!)
    }
  })

  // 수식 값이 아니라 성질을 본다 — 슬롯은 "가장 큰 단일 의사결정"이어야 한다
  it('전 슬롯 개방 총비용이 가격표 합과 일치하고, 뽑기 수백 회에 해당한다', () => {
    expect(TOTAL_SLOT_COST).toBe(SLOT_PRICES.reduce((a, b) => a + b, 0))
    expect(TOTAL_SLOT_COST / GACHA_COST).toBeGreaterThan(100)
  })

  it('마지막 슬롯 하나가 첫 슬롯보다 10배 이상 비싸다 — 후반 결정을 무겁게 한다', () => {
    expect(SLOT_PRICES[SLOT_PRICES.length - 1]!).toBeGreaterThan(SLOT_PRICES[0]! * 10)
  })

  it('nextSlotPrice 는 보유 수에 맞는 가격을 준다', () => {
    expect(nextSlotPrice(START_SLOTS)).toBe(SLOT_PRICES[0])
    expect(nextSlotPrice(MAX_SLOTS - 1)).toBe(SLOT_PRICES[SLOT_PRICES.length - 1])
  })

  it('최대치에서는 null 이다', () => {
    expect(nextSlotPrice(MAX_SLOTS)).toBeNull()
    expect(nextSlotPrice(MAX_SLOTS + 5)).toBeNull()
  })
})

describe('슬롯 구매', () => {
  it('골드를 차감하고 슬롯이 늘어난다', () => {
    const game = idleGame()
    game.gold = 100
    const cost = game.nextSlotCost()!
    const result = game.buySlot()
    expect(result.ok).toBe(true)
    expect(game.slotsOwned).toBe(START_SLOTS + 1)
    expect(game.gold).toBe(100 - cost)
  })

  it('골드가 부족하면 거부하고 아무것도 바뀌지 않는다', () => {
    const game = idleGame()
    game.gold = 1
    expect(game.buySlot()).toEqual({ ok: false, reason: 'insufficient-gold' })
    expect(game.slotsOwned).toBe(START_SLOTS)
    expect(game.gold).toBe(1)
  })

  it('11번째 슬롯 구매는 거부된다', () => {
    const game = idleGame()
    game.gold = 100_000
    for (let i = START_SLOTS; i < MAX_SLOTS; i++) expect(game.buySlot().ok).toBe(true)
    expect(game.slotsOwned).toBe(MAX_SLOTS)
    expect(game.buySlot()).toEqual({ ok: false, reason: 'max-slots' })
    expect(game.slotsOwned).toBe(MAX_SLOTS)
  })

  it('전 슬롯을 사면 정확히 TOTAL_SLOT_COST 만큼 쓴다', () => {
    const game = idleGame()
    game.gold = 100_000
    const before = game.gold
    while (game.buySlot().ok) {
      /* 최대치까지 */
    }
    expect(before - game.gold).toBe(TOTAL_SLOT_COST)
  })

  it('전투 중에도 살 수 있다 — 관전만 하는 시간이 없어야 한다', () => {
    const game = idleGame()
    game.gold = 10_000
    game.startWaveEarly()
    expect(game.phase).toBe('battle')
    expect(game.buySlot().ok).toBe(true)
    expect(game.slotsOwned).toBe(START_SLOTS + 1)
  })

  it('판이 끝나면 살 수 없다', () => {
    const game = idleGame()
    game.gold = 10_000
    game.over = 'defeat'
    expect(game.buySlot().ok).toBe(false)
    expect(game.slotsOwned).toBe(START_SLOTS)
  })

  it('산 슬롯은 유닛을 빼도 유지된다', () => {
    const game = idleGame()
    game.gold = 100
    game.buySlot()
    game.grantUnit('t1_single')
    const uid = game.bench[0]!.uid
    game.placeFromBench(uid)
    game.returnToBench(uid)
    expect(game.slotsOwned).toBe(START_SLOTS + 1)
  })

  it('슬롯을 사면 놓을 수 있는 자리가 하나 늘어난다', () => {
    const game = idleGame()
    expect(game.inv.ownedSlots().length).toBe(START_SLOTS)
    game.gold = 100
    game.buySlot()
    expect(game.inv.ownedSlots().length).toBe(START_SLOTS + 1)
  })
})

describe('판매 환급', () => {
  it('실제로 낸 골드의 50% 를 돌려준다', () => {
    expect(sellValue(GACHA_COST)).toBe(5)
    expect(sellValue(30)).toBe(15)
    expect(sellValue(2430)).toBe(1215)
  })

  it('합성으로 올린 유닛은 재료 3개의 투입 골드를 물려받는다', () => {
    const game = new Game(1)
    for (let i = 0; i < 3; i++) game.grantUnit('t1_single')
    expect(game.bench.length).toBe(1)
    // T1 3개 = 30골드 투입 → 환급 15
    expect(game.bench[0]!.paid).toBe(GACHA_COST * 3)
    expect(game.sell(game.bench[0]!.uid)).toBe(15)
  })

  it('운으로 뽑은 고티어는 뽑기 비용만 환급된다 — 무한 골드 경로를 막는다', () => {
    // 후반 뽑기는 10골드로 T6 를 직접 주기도 한다.
    // 티어 기준 환급이면 여기서 골드가 무한히 불어난다.
    const game = idleGame()
    game.gold = 1000
    const lucky = game.inv.grant('t6_single', false, GACHA_COST)!
    expect(game.sell(lucky.uid)).toBe(5)
  })

  it('뽑고 파는 것을 반복해도 골드가 늘지 않는다', () => {
    const game = new Game(4242)
    game.gold = 500
    const before = game.gold
    for (let i = 0; i < 200; i++) {
      const result = game.draw()
      if (!result.ok) break
      // 방금 뽑은 것만 즉시 되판다
      const last = game.bench[game.bench.length - 1]
      if (last) game.sell(last.uid)
    }
    expect(game.gold).toBeLessThan(before)
  })

  it('판매하면 골드가 들어오고 유닛이 사라진다', () => {
    const game = idleGame()
    game.grantUnit('t1_single')
    const uid = game.bench[0]!.uid
    const goldBefore = game.gold
    expect(game.sell(uid)).toBe(5)
    expect(game.gold).toBe(goldBefore + 5)
    expect(game.bench.length).toBe(0)
  })

  it('필드에 배치된 유닛도 팔 수 있고 슬롯이 비워진다', () => {
    const game = idleGame()
    game.grantUnit('t1_single')
    const uid = game.bench[0]!.uid
    game.placeFromBench(uid)
    game.sell(uid)
    expect(game.towers.length).toBe(0)
    expect(game.inv.slotsFree()).toBe(START_SLOTS)
    // 비워진 자리에 다시 놓을 수 있다
    expect(game.hasFreeSlot()).toBe(true)
  })

  it('없는 uid 는 0을 돌려준다', () => {
    expect(idleGame().sell(9999)).toBe(0)
  })
})

describe('Inventory 집계', () => {
  it('보유 개수는 필드 + 벤치 합산이다', () => {
    const inv = new Inventory()
    inv.grant('t1_single')
    inv.grant('t1_single')
    const uid = inv.bench[0]!.uid
    inv.place(uid)

    expect(inv.bench.length).toBe(1)
    expect(inv.towers.length).toBe(1)
    expect(inv.totalCountOf('t1_single')).toBe(2)
    expect(inv.benchCountOf('t1_single')).toBe(1)
  })

  it('countsByDef 는 각성 유닛을 세지 않는다', () => {
    const inv = new Inventory()
    inv.grant('t7_single', false)
    inv.grant('t7_single', true)
    expect(inv.countsByDef().get('t7_single')).toBe(1)
    expect(inv.totalCountOf('t7_single')).toBe(2)
  })

  it('벤치는 정원이 없어 무엇이든 받는다', () => {
    const inv = new Inventory()
    for (const def of [...unitsOfTier(1), ...unitsOfTier(2), ...unitsOfTier(3)]) {
      expect(inv.grant(def.id)).not.toBeNull()
    }
    // 종류를 18개 벌려도, 같은 걸 또 넣어도 거부되지 않는다
    expect(inv.benchStacks()).toBe(18)
    expect(inv.grant('t1_single')).not.toBeNull()
    expect(inv.grant('t7_pierce')).not.toBeNull()
    expect(inv.bench.length).toBe(20)
  })

  it('benchStacks 는 종류만 센다 — 중복은 한 칸으로 보인다', () => {
    const inv = new Inventory()
    for (let i = 0; i < 5; i++) inv.grant('t1_single')
    expect(inv.bench.length).toBe(5)
    expect(inv.benchStacks()).toBe(1)
  })

  it('각성체는 같은 defId 라도 별개 스택이다', () => {
    const inv = new Inventory()
    inv.grant('t7_single', false)
    expect(inv.benchStacks()).toBe(1)
    // 각성은 합성 재료가 아니라 별개 취급이므로 칸을 따로 쓴다
    inv.grant('t7_single', true)
    expect(inv.benchStacks()).toBe(2)
  })

  it('슬롯 여유 칸이 배치에 따라 줄어든다', () => {
    const inv = new Inventory()
    expect(inv.slotsFree()).toBe(START_SLOTS)
    inv.grant('t1_single')
    inv.place(inv.bench[0]!.uid)
    expect(inv.slotsFree()).toBe(START_SLOTS - 1)
  })

  it('remove 는 필드와 벤치 양쪽에서 지우고 자리를 비운다', () => {
    const inv = new Inventory()
    inv.grant('t1_single')
    inv.grant('t1_splash')
    const fieldUid = inv.bench[0]!.uid
    const benchUid = inv.bench[1]!.uid
    inv.place(fieldUid)

    inv.remove([fieldUid, benchUid])
    expect(inv.allUnits().length).toBe(0)
    expect(inv.nextFreeSlot()).toEqual(SLOT_POSITIONS[0])
  })

  it('빈 슬롯이 없으면 nextFreeSlot 이 null 이다', () => {
    const inv = new Inventory()
    for (let i = 0; i < START_SLOTS; i++) {
      inv.grant('t1_single')
      inv.place(inv.bench[0]!.uid)
    }
    expect(inv.nextFreeSlot()).toBeNull()
  })

  it('잠금 토글이 켜고 끈다', () => {
    const inv = new Inventory()
    expect(inv.isLocked('t1_single')).toBe(false)
    expect(inv.toggleLock('t1_single')).toBe(true)
    expect(inv.isLocked('t1_single')).toBe(true)
    expect(inv.toggleLock('t1_single')).toBe(false)
    expect(inv.isLocked('t1_single')).toBe(false)
  })
})
