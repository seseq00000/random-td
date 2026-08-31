import { describe, expect, it } from 'vitest'
import { Challenges } from '../src/core/challenge.js'
import { Game } from '../src/core/gameState.js'
import { planWave, spawnOrder } from '../src/core/wave.js'
import {
  CHALLENGE_BOSS,
  FEVER,
  TOKEN_MAX,
  challengeBossGold,
  isTokenWave,
} from '../src/data/challenge.js'
import { SPIRAL_LENGTH } from '../src/data/field.js'
import { TOTAL_WAVES, isBossWave, wavePool } from '../src/data/waves.js'

const DT = 1 / 60

function runUntil(game: Game, pred: (g: Game) => boolean, maxSeconds = 300): boolean {
  const steps = Math.ceil(maxSeconds / DT)
  for (let i = 0; i < steps; i++) {
    if (pred(game)) return true
    game.step(DT)
  }
  return pred(game)
}

describe('도전 토큰', () => {
  it('웨이브 5, 9, 13, 17, 21, 25, 29 에 충전된다 — 총 7개', () => {
    const waves = Array.from({ length: TOTAL_WAVES }, (_, i) => i + 1).filter(isTokenWave)
    expect(waves).toEqual([5, 9, 13, 17, 21, 25, 29])
  })

  it('상한 2에서 멈추고 초과분은 버려진다', () => {
    const c = new Challenges()
    for (const w of [5, 9, 13, 17]) c.grantForWave(w)
    expect(c.tokens).toBe(TOKEN_MAX)
    expect(c.granted).toBe(4)
    expect(c.wasted).toBe(2)
  })

  it('토큰이 없으면 선언이 거부된다', () => {
    const c = new Challenges()
    expect(c.declare('fever')).toEqual({ ok: false, reason: 'no-token' })
  })

  it('선언하면 토큰이 줄고, 취소하면 돌아온다', () => {
    const c = new Challenges()
    c.grantForWave(5)
    expect(c.declare('fever')).toEqual({ ok: true, tokensLeft: 0 })
    expect(c.isDeclared('fever')).toBe(true)
    expect(c.cancel('fever')).toBe(true)
    expect(c.tokens).toBe(1)
    expect(c.isDeclared('fever')).toBe(false)
  })

  it('같은 도전을 두 번 선언할 수 없다', () => {
    const c = new Challenges()
    c.grantForWave(5)
    c.grantForWave(9)
    c.declare('fever')
    expect(c.declare('fever')).toEqual({ ok: false, reason: 'already-declared' })
  })

  it('토큰 2개로 피버 + 보스를 동시에 걸 수 있다', () => {
    const c = new Challenges()
    c.grantForWave(5)
    c.grantForWave(9)
    expect(c.declare('fever').ok).toBe(true)
    expect(c.declare('boss').ok).toBe(true)
    expect(c.flags()).toEqual({ fever: true, challengeBoss: true })
  })

  it('전투가 끝나면 선언이 비워진다', () => {
    const c = new Challenges()
    c.grantForWave(5)
    c.declare('fever')
    c.consume()
    expect(c.isDeclared('fever')).toBe(false)
    expect(c.tokens).toBe(0) // 토큰은 돌아오지 않는다
  })
})

describe('웨이브 계획', () => {
  it('정규 웨이브 HP 총합이 풀과 정확히 일치한다', () => {
    for (let w = 1; w <= TOTAL_WAVES; w++) {
      expect(planWave(w).regularPool).toBeCloseTo(wavePool(w), 6)
    }
  })

  it('보스 웨이브는 풀 전체가 1마리에 들어간다', () => {
    for (let w = 5; w <= TOTAL_WAVES; w += 5) {
      const plan = planWave(w)
      expect(isBossWave(w)).toBe(true)
      expect(plan.totalCount).toBe(1)
      expect(plan.groups[0]!.hp).toBeCloseTo(wavePool(w), 6)
    }
  })

  it('이중 스폰 웨이브는 그룹이 2개고 풀을 반씩 나눈다', () => {
    const plan = planWave(21)
    expect(plan.groups.length).toBe(2)
    const [a, b] = plan.groups
    expect(a!.hp * a!.count).toBeCloseTo(b!.hp * b!.count, 4)
  })

  it('장갑은 웨이브 7에 처음 나온다 — 방어력 개념 소개', () => {
    for (let w = 1; w <= 6; w++) {
      expect(planWave(w).groups.some((g) => g.type === 'armored')).toBe(false)
    }
    expect(planWave(7).groups.some((g) => g.type === 'armored')).toBe(true)
  })

  it('물량(swarm)은 마리수가 많고 방어력이 0이다', () => {
    const swarm = planWave(3).groups[0]!
    expect(swarm.type).toBe('swarm')
    expect(swarm.armor).toBe(0)
    expect(swarm.count).toBeGreaterThan(planWave(2).groups[0]!.count)
  })
})

describe('피버타임', () => {
  it('마리수가 2.2배, HP 풀이 1.8배가 된다', () => {
    const normal = planWave(14)
    const fever = planWave(14, { fever: true, challengeBoss: false })
    expect(fever.regularPool / normal.regularPool).toBeCloseTo(FEVER.poolMul, 4)
    expect(fever.totalCount / normal.totalCount).toBeCloseTo(FEVER.countMul, 1)
  })

  it('개체 HP 는 오히려 0.82배로 낮아진다 — 물량형 웨이브가 된다', () => {
    const normal = planWave(14).groups[0]!
    const fever = planWave(14, { fever: true, challengeBoss: false }).groups[0]!
    // 마리수가 정수라 2.2배가 정확히 떨어지지 않는다. 1자리가 실제 정밀도다.
    expect(fever.hp / normal.hp).toBeCloseTo(FEVER.poolMul / FEVER.countMul, 1)
    expect(fever.hp).toBeLessThan(normal.hp)
  })

  it('현상금 총액이 3배가 된다', () => {
    const total = (fever: boolean) =>
      planWave(14, { fever, challengeBoss: false }).groups.reduce(
        (s, g) => s + g.bounty * g.count,
        0,
      )
    expect(total(true) / total(false)).toBeGreaterThan(2.5)
  })

  it('클리어 보상에 clearRewardMul 이 곱해진다', () => {
    const play = (fever: boolean) => {
      const game = new Game(1)
      game.challenges.tokens = 1
      if (fever) game.declareChallenge('fever')
      game.startWaveEarly()
      const goldBefore = game.gold
      game.spawnsRemaining = 0
      game.enemies = []
      game.step(DT)
      return game.gold - goldBefore
    }
    // 구현이 반올림하므로 근사 비교가 아니라 같은 반올림으로 맞춘다
    expect(play(true)).toBe(Math.round(play(false) * FEVER.clearRewardMul))
  })
})

describe('보스 소환', () => {
  it('그룹이 하나 추가되고 HP 가 웨이브 풀의 1.5배다', () => {
    const plan = planWave(12, { fever: false, challengeBoss: true })
    const boss = plan.groups.find((g) => g.isChallengeBoss)
    expect(boss).toBeDefined()
    expect(boss!.hp).toBeCloseTo(wavePool(12) * CHALLENGE_BOSS.hpMul, 6)
    expect(boss!.count).toBe(1)
  })

  it('정규 웨이브 난이도는 그대로다 — 추가일 뿐 대체가 아니다', () => {
    expect(planWave(12, { fever: false, challengeBoss: true }).regularPool).toBeCloseTo(
      planWave(12).regularPool,
      6,
    )
  })

  it('스폰 순서에서 맨 앞에 선다', () => {
    const plan = planWave(12, { fever: false, challengeBoss: true })
    expect(spawnOrder(plan)[0]!.isChallengeBoss).toBe(true)
  })

  it('처치하면 골드와 라이프를 준다', () => {
    const game = new Game(1)
    game.challenges.tokens = 1
    game.declareChallenge('boss')
    game.startWaveEarly()
    game.spawnsRemaining = 0
    game.enemies = []
    game.life = 10

    const goldBefore = game.gold
    // 도전 보스를 HP 1 로 세워두고 잡히게 한다
    game.enemies.push({
      uid: 9001,
      type: 'boss',
      hp: 0,
      maxHp: 1000,
      armor: 0,
      bounty: 0,
      speed: 0,
      dist: 100,
      angle0: 0,
      slowFactor: 1,
      slowRemaining: 0,
      isChallengeBoss: true,
    })
    game.step(DT)

    expect(game.gold).toBe(goldBefore + challengeBossGold(1) + 23) // +클리어 보상
    expect(game.life).toBe(10 + CHALLENGE_BOSS.lifeReward + 1) // +완봉 보너스
  })

  it('놓치면 라이프가 5 깎인다', () => {
    const game = new Game(1)
    game.startWaveEarly()
    game.spawnsRemaining = 0
    game.enemies = []
    game.life = 20
    game.enemies.push({
      uid: 9002,
      type: 'boss',
      hp: 1000,
      maxHp: 1000,
      armor: 0,
      bounty: 0,
      speed: 99,
      dist: SPIRAL_LENGTH - 1,
      angle0: 0,
      slowFactor: 1,
      slowRemaining: 0,
      isChallengeBoss: true,
    })
    game.step(DT)
    expect(game.life).toBe(20 - CHALLENGE_BOSS.lifePenalty)
  })
})

describe('Game 도전 명령', () => {
  it('전투 중에는 선언할 수 없다', () => {
    const game = new Game(1)
    game.challenges.tokens = 1
    game.startWaveEarly()
    expect(game.declareChallenge('fever')).toEqual({ ok: false, reason: 'wrong-phase' })
  })

  it('미리보기가 선언 상태를 반영한다', () => {
    const game = new Game(1)
    game.challenges.tokens = 2
    const before = game.previewWave().totalCount
    game.declareChallenge('fever')
    expect(game.previewWave().totalCount).toBeGreaterThan(before)
    expect(game.previewWave().fever).toBe(true)
  })

  it('실제 전투에서 피버 마리수가 적용된다', () => {
    const game = new Game(1)
    game.challenges.tokens = 1
    const normalCount = game.previewWave().totalCount
    game.declareChallenge('fever')
    game.startWaveEarly()
    expect(game.spawnsRemaining).toBeGreaterThan(normalCount * 2)
  })

  it('웨이브가 끝나면 선언이 다음 웨이브로 넘어가지 않는다', () => {
    const game = new Game(1)
    game.challenges.tokens = 1
    game.declareChallenge('fever')
    game.startWaveEarly()
    game.spawnsRemaining = 0
    game.enemies = []
    game.step(DT)
    expect(game.challenges.isDeclared('fever')).toBe(false)
    runUntil(game, (g) => g.phase === 'prep', 10)
    expect(game.previewWave().fever).toBe(false)
  })
})
