import { describe, expect, it } from 'vitest'
import {
  applySlow,
  auraMultipliers,
  canTarget,
  currentSpeed,
  damageAfterArmor,
  selectTarget,
  splashTargets,
} from '../src/core/combat.js'
import { TILE, tileToPixel } from '../src/core/grid.js'
import type { Enemy, EnemyType, Tower } from '../src/core/types.js'
import { getUnit } from '../src/data/units.js'

let nextUid = 1
function enemy(overrides: Partial<Enemy> = {}): Enemy {
  return {
    uid: nextUid++,
    type: 'normal',
    hp: 100,
    maxHp: 100,
    armor: 0,
    bounty: 1,
    speed: 1.5,
    dist: 0,
    angle0: 0,
    slowFactor: 1,
    slowRemaining: 0,
    isChallengeBoss: false,
    ...overrides,
  }
}

function tower(defId: string, tx: number, ty: number, uid = nextUid++): Tower {
  return { uid, defId, awakened: false, paid: 10, tx, ty, cooldown: 0 }
}

describe('damageAfterArmor', () => {
  it('방어력을 감산한다', () => {
    expect(damageAfterArmor(50, 10)).toBe(40)
  })

  it('방어력이 데미지보다 커도 최소 1은 들어간다', () => {
    expect(damageAfterArmor(5, 999)).toBe(1)
    expect(damageAfterArmor(0, 0)).toBe(1)
  })
})

describe('canTarget', () => {
  // 공중 적을 없애면서 ground/air/both 구분이 사라졌다.
  // 이제 갈리는 건 "버프 유닛은 공격하지 않는다" 하나뿐이다.
  const types: EnemyType[] = ['normal', 'armored', 'swarm', 'boss']

  it('ground 는 모든 적 타입을 때린다', () => {
    for (const type of types) expect(canTarget('ground', enemy({ type }))).toBe(true)
  })

  it('none(버프 유닛)은 아무것도 못 때린다', () => {
    for (const type of types) expect(canTarget('none', enemy({ type }))).toBe(false)
  })
})

describe('selectTarget', () => {
  const pos = tileToPixel(5, 5)
  const near = { enemy: enemy({ dist: 10, hp: 50 }), pos: tileToPixel(6, 5) }
  const far = { enemy: enemy({ dist: 900, hp: 200 }), pos: tileToPixel(8, 5) }
  const outOfRange = { enemy: enemy({ dist: 5000, hp: 999 }), pos: tileToPixel(15, 5) }

  it('사거리 밖은 고르지 않는다', () => {
    const t = selectTarget(pos, 4, 'ground', 'first', [outOfRange])
    expect(t).toBeNull()
  })

  it('first 는 가장 많이 진행한 적을 고른다', () => {
    const t = selectTarget(pos, 4, 'ground', 'first', [near, far])
    expect(t).toBe(far.enemy)
  })

  it('closest 는 가장 가까운 적을 고른다', () => {
    const t = selectTarget(pos, 4, 'ground', 'closest', [near, far])
    expect(t).toBe(near.enemy)
  })

  it('strongest 는 HP 가 가장 많은 적을 고른다', () => {
    const t = selectTarget(pos, 4, 'ground', 'strongest', [near, far])
    expect(t).toBe(far.enemy)
  })

  it('죽은 적은 고르지 않는다', () => {
    const dead = { enemy: enemy({ hp: 0, dist: 9999 }), pos: tileToPixel(6, 5) }
    const t = selectTarget(pos, 4, 'ground', 'first', [dead, near])
    expect(t).toBe(near.enemy)
  })

  it('공격하지 않는 유닛(버프)은 아무도 못 고른다', () => {
    expect(selectTarget(pos, 4, 'none', 'first', [near, far])).toBeNull()
  })

  it('후보가 없으면 null', () => {
    expect(selectTarget(pos, 4, 'ground', 'first', [])).toBeNull()
  })
})

describe('auraMultipliers — 버프는 인접 타일에만', () => {
  const buffId = getUnit('t1_buff').id

  it('인접 타일 타워에 버프가 적용된다', () => {
    const target = tower('t1_single', 5, 5)
    const buff = tower(buffId, 6, 5)
    const m = auraMultipliers(target, [target, buff], getUnit)
    expect(m.damageMul).toBeCloseTo(1.25)
    expect(m.attackSpeedMul).toBeCloseTo(1.25)
  })

  it('대각선도 인접으로 친다', () => {
    const target = tower('t1_single', 5, 5)
    const buff = tower(buffId, 6, 6)
    expect(auraMultipliers(target, [target, buff], getUnit).damageMul).toBeCloseTo(1.25)
  })

  it('2타일 떨어지면 적용되지 않는다', () => {
    const target = tower('t1_single', 5, 5)
    const buff = tower(buffId, 7, 5)
    const m = auraMultipliers(target, [target, buff], getUnit)
    expect(m.damageMul).toBe(1)
    expect(m.attackSpeedMul).toBe(1)
  })

  it('버프 2개는 곱연산으로 중첩된다', () => {
    const target = tower('t1_single', 5, 5)
    const b1 = tower(buffId, 6, 5)
    const b2 = tower(buffId, 4, 5)
    const m = auraMultipliers(target, [target, b1, b2], getUnit)
    expect(m.damageMul).toBeCloseTo(1.25 * 1.25)
  })

  it('자기 자신은 버프하지 않는다', () => {
    const self = tower(buffId, 5, 5)
    expect(auraMultipliers(self, [self], getUnit).damageMul).toBe(1)
  })
})

describe('splashTargets', () => {
  it('반경 안의 적만 모은다', () => {
    const center = tileToPixel(5, 5)
    const inside = { enemy: enemy(), pos: tileToPixel(6, 5) }
    const outside = { enemy: enemy(), pos: tileToPixel(9, 5) }
    const hit = splashTargets(center, 1.2, [inside, outside])
    expect(hit).toEqual([inside.enemy])
  })

  it('반경 0(단일 대상)이면 빈 배열', () => {
    const center = tileToPixel(5, 5)
    expect(splashTargets(center, 0, [{ enemy: enemy(), pos: center }])).toEqual([])
  })

  it('경계선 위의 적은 포함한다', () => {
    const center = tileToPixel(5, 5)
    const onEdge = { enemy: enemy(), pos: { x: center.x + TILE, y: center.y } }
    expect(splashTargets(center, 1, [onEdge])).toEqual([onEdge.enemy])
  })
})

describe('슬로우', () => {
  it('슬로우가 걸리면 속도가 준다', () => {
    const e = enemy({ speed: 2 })
    expect(currentSpeed(e)).toBe(2)
    applySlow(e, 0.65, 1.5)
    expect(currentSpeed(e)).toBeCloseTo(1.3)
  })

  it('더 강한 슬로우가 약한 것을 덮어쓴다', () => {
    const e = enemy({ speed: 2 })
    applySlow(e, 0.8, 1.5)
    applySlow(e, 0.5, 1.5)
    expect(e.slowFactor).toBe(0.5)
  })

  it('약한 슬로우는 강한 것을 덮어쓰지 못하고 지속시간만 갱신한다', () => {
    const e = enemy({ speed: 2 })
    applySlow(e, 0.5, 1.0)
    applySlow(e, 0.9, 3.0)
    expect(e.slowFactor).toBe(0.5)
    expect(e.slowRemaining).toBe(3.0)
  })

  it('지속시간이 끝나면 원래 속도로 돌아온다', () => {
    const e = enemy({ speed: 2 })
    applySlow(e, 0.5, 1.5)
    e.slowRemaining = 0
    expect(currentSpeed(e)).toBe(2)
  })
})
