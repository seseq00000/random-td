import { describe, expect, it } from 'vitest'
import { Game } from '../src/core/gameState.js'
import { GameObserver } from '../src/render/observer.js'
import { SPIRAL_LENGTH } from '../src/data/field.js'
import { unitsOfTier } from '../src/data/units.js'

/**
 * 이 로직은 원래 `Renderer` 안에 있어서 캔버스 없이는 못 돌렸다.
 * 관찰자로 빼면서 처음으로 단위 테스트가 가능해졌다.
 */

const DT = 1 / 60

function enemy(uid: number, hp = 100, over: Partial<{ type: 'normal' | 'boss'; dist: number }> = {}) {
  return {
    uid,
    type: over.type ?? ('normal' as const),
    hp,
    maxHp: 100,
    armor: 0,
    bounty: 1,
    speed: 0,
    dist: over.dist ?? 0,
    angle0: 0,
    slowFactor: 1,
    slowRemaining: 0,
    isChallengeBoss: false,
  }
}

describe('GameObserver — 스폰 / 피격 / 처치', () => {
  it('처음 보는 적은 스폰으로 잡는다', () => {
    const game = new Game(1)
    const obs = new GameObserver()
    game.enemies = [enemy(1)]

    const ev = obs.observe(game)
    expect(ev.enemySpawns.length).toBe(1)
    expect(ev.enemyHits.length).toBe(0)
  })

  it('같은 적을 두 번 봐도 스폰은 한 번뿐이다', () => {
    const game = new Game(1)
    const obs = new GameObserver()
    game.enemies = [enemy(1)]

    obs.observe(game)
    const ev = obs.observe(game)
    expect(ev.enemySpawns.length).toBe(0)
  })

  it('HP 가 줄면 피격이다', () => {
    const game = new Game(1)
    const obs = new GameObserver()
    const e = enemy(1, 100)
    game.enemies = [e]
    obs.observe(game)

    e.hp = 60
    const ev = obs.observe(game)
    expect(ev.enemyHits.length).toBe(1)
    expect(ev.enemyHits[0]!.uid).toBe(1)
  })

  it('HP 가 그대로면 피격이 아니다', () => {
    const game = new Game(1)
    const obs = new GameObserver()
    game.enemies = [enemy(1, 100)]
    obs.observe(game)
    const ev = obs.observe(game)
    expect(ev.enemyHits.length).toBe(0)
  })

  it('사라진 적은 처치다 — 직전 위치와 타입이 남아 있어야 한다', () => {
    const game = new Game(1)
    const obs = new GameObserver()
    game.enemies = [enemy(1, 100, { type: 'boss', dist: SPIRAL_LENGTH * 0.5 })]
    obs.observe(game)

    game.enemies = []
    const ev = obs.observe(game)
    expect(ev.enemyDeaths.length).toBe(1)
    expect(ev.enemyDeaths[0]!.type).toBe('boss')
    // 이미 사라진 뒤라 game 에서 위치를 다시 구할 수 없다 — 관찰자가 기억하고 있어야 한다
    expect(Number.isFinite(ev.enemyDeaths[0]!.pos.x)).toBe(true)
  })

  it('처치된 uid 는 잊는다 — 같은 번호가 재사용돼도 유령 이벤트가 안 난다', () => {
    const game = new Game(1)
    const obs = new GameObserver()
    game.enemies = [enemy(1)]
    obs.observe(game)
    game.enemies = []
    obs.observe(game)

    // 같은 uid 가 다시 나타나면 처치가 아니라 **스폰**이어야 한다
    game.enemies = [enemy(1)]
    const ev = obs.observe(game)
    expect(ev.enemySpawns.length).toBe(1)
    expect(ev.enemyDeaths.length).toBe(0)
  })
})

describe('GameObserver — 코어 피격', () => {
  it('상승 엣지에서만 한 번 잡는다', () => {
    const game = new Game(1)
    const obs = new GameObserver()
    obs.observe(game)

    game.coreFlash = 0.4
    expect(obs.observe(game).coreHit).toBe(true)
    // 값이 그대로거나 줄어드는 동안은 다시 울리면 안 된다
    expect(obs.observe(game).coreHit).toBe(false)
    game.coreFlash = 0.2
    expect(obs.observe(game).coreHit).toBe(false)
  })
})

describe('GameObserver — 타워 발사', () => {
  it('쿨다운이 올라간 프레임을 발사로 잡고 역할을 함께 준다', () => {
    const game = new Game(1)
    const obs = new GameObserver()
    game.grantUnit('t1_sniper')
    game.placeFromBench(game.bench[0]!.uid)
    const tower = game.towers[0]!

    tower.cooldown = 0
    obs.observe(game)

    tower.cooldown = 0.8 // 방금 쐈다
    const ev = obs.observe(game)
    expect(ev.towerFires.length).toBe(1)
    expect(ev.towerFires[0]!.role).toBe('sniper')
  })

  it('쿨다운이 줄어드는 동안은 발사가 아니다', () => {
    const game = new Game(1)
    const obs = new GameObserver()
    game.grantUnit('t1_single')
    game.placeFromBench(game.bench[0]!.uid)
    const tower = game.towers[0]!

    tower.cooldown = 0.8
    obs.observe(game)
    tower.cooldown = 0.5
    expect(obs.observe(game).towerFires.length).toBe(0)
  })
})

describe('GameObserver — 페이즈 전이', () => {
  it('전투로 들어가면 웨이브 시작을 알린다', () => {
    const game = new Game(1)
    const obs = new GameObserver()
    obs.observe(game) // 첫 관찰은 기준선만 잡는다
    expect(game.phase).toBe('prep')

    game.startWaveEarly()
    const ev = obs.observe(game)
    expect(ev.waveStarted).toBe(1)
  })

  it('첫 프레임에는 전이를 만들지 않는다 — 켜자마자 소리가 나면 안 된다', () => {
    const game = new Game(1)
    const obs = new GameObserver()
    const ev = obs.observe(game)
    expect(ev.waveStarted).toBeNull()
    expect(ev.waveCleared).toBeNull()
  })

  it('판이 끝나는 순간을 한 번만 알린다', () => {
    const game = new Game(1)
    const obs = new GameObserver()
    obs.observe(game)

    game.over = 'defeat'
    expect(obs.observe(game).over).toBe('defeat')
    expect(obs.observe(game).over).toBeNull()
  })
})

describe('GameObserver — reset', () => {
  it('리셋하면 이전 판의 적이 처치로 새지 않는다', () => {
    const game = new Game(1)
    const obs = new GameObserver()
    game.enemies = [enemy(1), enemy(2)]
    obs.observe(game)

    obs.reset()
    game.enemies = []
    const ev = obs.observe(game)
    expect(ev.enemyDeaths.length).toBe(0)
  })
})

describe('GameObserver — 게임 상태를 바꾸지 않는다', () => {
  it('관찰만으로 시뮬 결과가 달라지지 않는다', () => {
    const play = (watch: boolean) => {
      const game = new Game(4242)
      for (const def of unitsOfTier(1)) game.grantUnit(def.id)
      for (const b of [...game.bench]) game.placeFromBench(b.uid)
      game.startWaveEarly()

      const obs = new GameObserver()
      for (let i = 0; i < 60 * 40; i++) {
        game.step(DT)
        if (watch) obs.observe(game)
      }
      return { wave: game.wave, life: game.life, gold: Math.round(game.gold), over: game.over }
    }
    // 관찰자를 돌린 판과 안 돌린 판이 완전히 같아야 한다 — 결정론의 전제다
    expect(play(true)).toEqual(play(false))
  })
})
