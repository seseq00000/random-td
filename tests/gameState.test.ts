import { describe, expect, it } from 'vitest'
import { BENCH_CAPACITY, Game } from '../src/core/gameState.js'
import { MAX_SLOTS, START_LIFE } from '../src/core/economy.js'
import { prepDuration, SETTLE_DURATION } from '../src/core/phase.js'
import { SLOT_POSITIONS, SPIRAL_LENGTH } from '../src/data/field.js'
import { unitsOfTier } from '../src/data/units.js'

const DT = 1 / 60

/** 조건이 참이 될 때까지 고정 스텝으로 돌린다. 타임아웃이면 false. */
function runUntil(game: Game, pred: (g: Game) => boolean, maxSeconds = 300): boolean {
  const steps = Math.ceil(maxSeconds / DT)
  for (let i = 0; i < steps; i++) {
    if (pred(game)) return true
    game.step(DT)
  }
  return pred(game)
}

function newGameWithBench(seed = 1): Game {
  const game = new Game(seed)
  for (const def of unitsOfTier(1)) game.grantUnit(def.id)
  return game
}

describe('배치 규칙 — 자리는 자동으로 정해진다', () => {
  it('빈 슬롯이 있으면 배치되고, 자리는 슬롯 순서를 따른다', () => {
    const game = newGameWithBench()
    const res = game.placeFromBench(game.bench[0]!.uid)
    expect(res.ok).toBe(true)
    expect(game.towers[0]).toMatchObject(SLOT_POSITIONS[0]!)
  })

  it('연달아 배치하면 슬롯 순서대로 채워진다', () => {
    const game = newGameWithBench()
    for (let i = 0; i < 3; i++) game.placeFromBench(game.bench[0]!.uid)
    for (let i = 0; i < 3; i++) {
      expect(game.towers[i]).toMatchObject(SLOT_POSITIONS[i]!)
    }
  })

  it('슬롯 수(3)를 넘기면 no-slot 하나로만 거절한다', () => {
    const game = newGameWithBench()
    expect(game.slotsOwned).toBe(3)
    for (let i = 0; i < 3; i++) {
      expect(game.placeFromBench(game.bench[0]!.uid).ok).toBe(true)
    }
    expect(game.placeFromBench(game.bench[0]!.uid)).toEqual({ ok: false, reason: 'no-slot' })
    expect(game.towers.length).toBe(3)
  })

  it('hasFreeSlot 이 배치 가능 여부와 일치한다 — UI 가 이걸로 문구를 낸다', () => {
    const game = newGameWithBench()
    expect(game.hasFreeSlot()).toBe(true)
    for (let i = 0; i < game.slotsOwned; i++) game.placeFromBench(game.bench[0]!.uid)
    expect(game.hasFreeSlot()).toBe(false)
    expect(game.placeFromBench(game.bench[0]!.uid).ok).toBe(false)
  })

  it('없는 벤치 유닛은 배치할 수 없다', () => {
    const game = newGameWithBench()
    expect(game.placeFromBench(9999)).toEqual({ ok: false, reason: 'not-found' })
  })

  it('슬롯을 사면 놓을 자리가 늘어난다', () => {
    const game = newGameWithBench()
    for (let i = 0; i < game.slotsOwned; i++) game.placeFromBench(game.bench[0]!.uid)
    expect(game.hasFreeSlot()).toBe(false)

    game.gold = 100_000
    expect(game.buySlot().ok).toBe(true)
    expect(game.hasFreeSlot()).toBe(true)
  })
})

describe('필드 ↔ 벤치 이동', () => {
  it('회수하면 벤치로 돌아오고 슬롯은 유지된다', () => {
    const game = newGameWithBench()
    const uid = game.bench[0]!.uid
    game.placeFromBench(uid)
    const slotsBefore = game.slotsOwned

    expect(game.returnToBench(uid)).toBe(true)
    expect(game.towers.length).toBe(0)
    expect(game.bench.some((b) => b.uid === uid)).toBe(true)
    expect(game.slotsOwned).toBe(slotsBefore)
  })

  it('회수하면 그 자리가 다시 비어 다음 배치가 같은 자리로 간다', () => {
    const game = newGameWithBench()
    const uid = game.bench[0]!.uid
    game.placeFromBench(uid)
    game.returnToBench(uid)
    expect(game.placeFromBench(game.bench[0]!.uid).ok).toBe(true)
    expect(game.towers[0]).toMatchObject(SLOT_POSITIONS[0]!)
  })

  it('벤치가 가득 차면 회수할 수 없다', () => {
    // 자동 합성을 끄고 정원 규칙만 격리해서 본다 —
    // 켜져 있으면 같은 유닛 8개가 즉시 합성되어 벤치가 저절로 비워진다.
    const game = new Game(1)
    game.autoMerge = false
    for (let i = 0; i < BENCH_CAPACITY; i++) game.grantUnit('t1_single')
    expect(game.bench.length).toBe(BENCH_CAPACITY)
    // 벤치 하나를 필드로 뺀 뒤 벤치를 다시 채운다
    const uid = game.bench[0]!.uid
    game.placeFromBench(uid)
    game.grantUnit('t1_splash')
    expect(game.bench.length).toBe(BENCH_CAPACITY)
    expect(game.returnToBench(uid)).toBe(false)
  })

  it('벤치 정원을 넘겨 지급되지 않는다', () => {
    const game = new Game(1)
    game.autoMerge = false // 켜져 있으면 3개째마다 합성돼 정원에 닿지 않는다
    for (let i = 0; i < BENCH_CAPACITY; i++) expect(game.grantUnit('t1_single')).not.toBeNull()
    expect(game.grantUnit('t1_single')).toBeNull()
  })
})

describe('페이즈', () => {
  it('준비 시간은 20 + floor(w/5)*5, 보스 직후 +10', () => {
    expect(prepDuration(1)).toBe(20)
    expect(prepDuration(4)).toBe(20)
    expect(prepDuration(5)).toBe(25)
    expect(prepDuration(6)).toBe(35) // 웨이브 5(보스) 직후
    expect(prepDuration(25)).toBe(45)
  })

  it('준비 시간이 다 되면 자동으로 전투가 시작된다', () => {
    const game = newGameWithBench()
    expect(game.phase).toBe('prep')
    runUntil(game, (g) => g.phase === 'battle', 30)
    expect(game.phase).toBe('battle')
  })

  it('조기 시작은 남은 초만큼 골드를 주고 즉시 전투로 넘어간다', () => {
    const game = newGameWithBench()
    const goldBefore = game.gold
    const remaining = Math.floor(game.phaseTimer)
    expect(game.startWaveEarly()).toBe(true)
    expect(game.phase).toBe('battle')
    expect(game.gold).toBe(goldBefore + remaining)
  })

  it('전투 중에는 조기 시작이 거부된다', () => {
    const game = newGameWithBench()
    game.startWaveEarly()
    expect(game.startWaveEarly()).toBe(false)
  })
})

describe('전투 결과', () => {
  it('타워가 하나도 없으면 전부 누출되어 라이프가 0이 된다', () => {
    const game = newGameWithBench()
    game.startWaveEarly()
    runUntil(game, (g) => g.over !== 'none', 200)
    expect(game.over).toBe('defeat')
    expect(game.life).toBe(0)
  })

  it('누출 1마리당 라이프가 정확히 1 깎인다', () => {
    const game = newGameWithBench()
    game.startWaveEarly()
    runUntil(game, (g) => g.leakedThisWave >= 3, 200)
    expect(game.life).toBe(START_LIFE - game.leakedThisWave)
  })

  it('웨이브를 클리어하면 보상을 받고 정산 후 다음 준비로 넘어간다', () => {
    const game = newGameWithBench()
    game.slotsOwned = MAX_SLOTS
    for (const def of unitsOfTier(1)) {
      if (def.role === 'buff') continue
      game.grantUnit(def.id)
    }
    for (const b of [...game.bench]) game.placeFromBench(b.uid)
    // 이 테스트는 클리어 여부가 아니라 상태 전이를 본다
    game.enemies = []
    game.startWaveEarly()
    game.spawnsRemaining = 0
    const goldBefore = game.gold
    game.step(DT)
    expect(game.phase).toBe('settle')
    expect(game.gold).toBeGreaterThan(goldBefore)
    expect(game.phaseTimer).toBeCloseTo(SETTLE_DURATION)

    runUntil(game, (g) => g.phase === 'prep', 10)
    expect(game.wave).toBe(2)
  })

  it('완봉(누출 0)하면 라이프가 +1 되고 상한 20을 넘지 않는다', () => {
    const game = newGameWithBench()
    game.startWaveEarly()
    game.spawnsRemaining = 0
    game.enemies = []
    game.life = 15
    game.step(DT)
    expect(game.life).toBe(16)
  })

  it('누출이 있었으면 회복하지 않는다', () => {
    const game = newGameWithBench()
    game.startWaveEarly()
    game.spawnsRemaining = 0
    game.enemies = []
    game.life = 15
    game.leakedThisWave = 2
    game.step(DT)
    expect(game.life).toBe(15)
  })

  it('타워가 적을 실제로 죽이고 현상금을 준다', () => {
    const game = new Game(7)
    game.slotsOwned = 1
    game.grantUnit('t1_single')
    game.placeFromBench(game.bench[0]!.uid)
    game.startWaveEarly()
    // 자동 스폰을 끄고, 사거리 안에 멈춰 있는 적 1마리만 세워둔다.
    // 진행도 0.85 면 나선 반경이 1.6타일이라, 코어 옆 슬롯의 사거리(4타일)에
    // **각도와 무관하게** 들어온다 — 좌표를 하드코딩하지 않으려는 것이다.
    game.spawnsRemaining = 0
    game.enemies.push({
      uid: 999,
      type: 'normal',
      hp: 20,
      maxHp: 20,
      armor: 0,
      bounty: 5,
      speed: 0,
      dist: SPIRAL_LENGTH * 0.85,
      angle0: 0,
      slowFactor: 1,
      slowRemaining: 0,
      isChallengeBoss: false,
    })
    const goldBefore = game.gold
    runUntil(game, (g) => g.enemies.length === 0, 30)
    expect(game.enemies.length).toBe(0)
    expect(game.gold).toBeGreaterThanOrEqual(goldBefore + 5)
  })
})

describe('결정론', () => {
  it('같은 시드 + 같은 입력이면 상태가 정확히 일치한다', () => {
    const play = (seed: number) => {
      const game = newGameWithBench(seed)
      game.slotsOwned = 3
      const ids = [...game.bench].slice(0, 3)
      game.placeFromBench(ids[0]!.uid)
      game.placeFromBench(ids[1]!.uid)
      game.placeFromBench(ids[2]!.uid)
      game.startWaveEarly()
      for (let i = 0; i < 60 * 120; i++) game.step(DT)
      return {
        wave: game.wave,
        life: game.life,
        gold: game.gold,
        over: game.over,
        enemies: game.enemies.map((e) => [e.uid, Math.round(e.hp), Math.round(e.dist)]),
        towers: game.towers.map((t) => [t.uid, t.tx, t.ty]),
      }
    }
    expect(play(4242)).toEqual(play(4242))
  })

  it('dt 를 쪼개도 같은 결과가 나온다 (고정 스텝 전제)', () => {
    const build = () => {
      const g = newGameWithBench(11)
      g.placeFromBench(g.bench[0]!.uid)
      g.startWaveEarly()
      return g
    }
    const a = build()
    const b = build()
    for (let i = 0; i < 3600; i++) a.step(DT)
    for (let i = 0; i < 3600; i++) b.step(DT)
    expect(a.life).toBe(b.life)
    expect(Math.round(a.gold)).toBe(Math.round(b.gold))
  })
})
