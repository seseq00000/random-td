import type { Role, TargetPriority, TargetType, UnitDef } from '../core/types.js'
import { CREATURES, NICKNAME_TIERS, nicknameOf } from './creatures.js'

/**
 * 42종을 손으로 밸런싱하지 않는다.
 * 티어 파워 커브 × 역할별 배율로 생성하고, 밸런싱은 이 파일의 상수만 고친다.
 */

export const TIER_COUNT = 7
export const UNITS_PER_TIER = 6

export const TIER_POWER_BASE = 10
export const TIER_POWER_GROWTH = 3.0

/** T1=10, T4=270, T7=7,290 */
export function basePower(tier: number): number {
  return TIER_POWER_BASE * Math.pow(TIER_POWER_GROWTH, tier - 1)
}

interface RoleSpec {
  role: Role
  /** basePower 대비 DPS 배율. 유틸리티가 강한 역할일수록 낮다. */
  dpsMul: number
  range: number
  attackSpeed: number
  splashRadius: number
  pierceCount: number
  projectileSpeed: number
  targetType: TargetType
  targetPriority: TargetPriority
  slow?: { factor: number; duration: number }
  aura?: { damageMul: number; attackSpeedMul: number }
}

/**
 * 각 티어의 6종이 이 6개 슬롯을 하나씩 채운다.
 * 티어가 달라도 역할 구성이 같아서 다이소 미션이 곧 "역할 풀세트"가 된다.
 */
export const ROLE_SPECS: readonly RoleSpec[] = [
  {
    role: 'single',
    dpsMul: 1.4,
    range: 4,
    attackSpeed: 1.2,
    splashRadius: 0,
    pierceCount: 1,
    projectileSpeed: 14,
    targetType: 'ground',
    targetPriority: 'strongest',
  },
  {
    role: 'splash',
    dpsMul: 1.0,
    range: 3.5,
    attackSpeed: 0.8,
    splashRadius: 1.2,
    pierceCount: 1,
    projectileSpeed: 9,
    targetType: 'ground',
    targetPriority: 'first',
  },
  {
    // 원래는 대공 전용이었다. 공중 적을 없애면서 **최장 사거리 저격**으로 바꿨다.
    // DPS 를 낮춰 single(사거리 4 / dpsMul 1.4) 과 겹치지 않게 한다 —
    // 멀리서 약하게 vs 가까이서 세게.
    //
    // 사거리는 6 을 유지한다. 7 로 올려봤더니 uptime 이 급등해서
    // 기본 경제만으로 클리어율이 32% 까지 뛰었다 (사거리 = 유효 출력의 지배 변수).
    role: 'sniper',
    dpsMul: 1.1,
    range: 6,
    attackSpeed: 1.5,
    splashRadius: 0,
    pierceCount: 1,
    projectileSpeed: 18,
    targetType: 'ground',
    targetPriority: 'first',
  },
  {
    role: 'control',
    dpsMul: 0.5,
    range: 4.5,
    attackSpeed: 1.0,
    splashRadius: 0,
    pierceCount: 1,
    projectileSpeed: 12,
    targetType: 'ground',
    targetPriority: 'first',
    slow: { factor: 0.65, duration: 1.5 },
  },
  {
    role: 'pierce',
    dpsMul: 0.9,
    range: 5,
    attackSpeed: 0.7,
    splashRadius: 0,
    pierceCount: 3,
    projectileSpeed: 20,
    targetType: 'ground',
    targetPriority: 'first',
  },
  {
    role: 'buff',
    dpsMul: 0,
    range: 1.5,
    attackSpeed: 0,
    splashRadius: 0,
    pierceCount: 0,
    projectileSpeed: 0,
    targetType: 'none',
    targetPriority: 'first',
    aura: { damageMul: 1.25, attackSpeedMul: 1.25 },
  },
]

/** 티어별 6종 이름. 인덱스가 ROLE_SPECS 순서와 대응한다. */
const UNIT_NAMES: readonly (readonly string[])[] = [
  ['저격병', '화염병', '망원포', '냉동포', '관통창', '지휘관'],
  ['속사수', '박격포', '원거리포', '한파탑', '작살포', '전략가'],
  ['정예저격', '융단폭격', '관측포', '빙결진', '레일건', '군단장'],
  ['처형자', '용암포', '초장포', '절대영도', '천공창', '대공작'],
  ['섬멸자', '운석포', '지평선포', '시간정지', '차원창', '섭정'],
  ['파멸자', '초신성포', '대륙간포', '영원한겨울', '공허창', '대군주'],
  ['종결자', '빅뱅포', '무한사정포', '종말의겨울', '무한창', '창조주'],
]

// 애칭 사다리와 역할 목록이 유닛 테이블과 어긋나면 조용히 이상한 이름이 생긴다.
// 여기서 한 번에 검증한다 — creatures.ts 는 units.ts 를 import 할 수 없어서(순환) 이쪽이 맡는다.
if (NICKNAME_TIERS !== TIER_COUNT) {
  throw new Error(`units: 애칭 사다리(${NICKNAME_TIERS})와 티어 수(${TIER_COUNT})가 다르다`)
}
if (CREATURES.length !== UNITS_PER_TIER) {
  throw new Error(`units: 동물 수(${CREATURES.length})와 티어당 종수(${UNITS_PER_TIER})가 다르다`)
}
if (new Set(CREATURES.map((c) => c.role)).size !== ROLE_SPECS.length) {
  throw new Error('units: 동물이 모든 역할을 하나씩 덮지 않는다')
}

function buildUnit(tier: number, slot: number): UnitDef {
  const spec = ROLE_SPECS[slot]!
  // 무시무시한 SF 이름 + 귀여운 동물 애칭. 그 갭이 이 게임의 톤이다.
  // 예: `절대영도 늘보경`, `빅뱅포 곰왕`, `종결자 냥신`
  const name = `${UNIT_NAMES[tier - 1]![slot]!} ${nicknameOf(spec.role, tier)}`
  const power = basePower(tier)
  // 공격 1회 데미지 = 목표 DPS / 초당 공격 횟수. buff 는 공격하지 않는다.
  const damage = spec.attackSpeed === 0 ? 0 : (power * spec.dpsMul) / spec.attackSpeed

  return {
    id: `t${tier}_${spec.role}`,
    name,
    tier,
    role: spec.role,
    damage,
    range: spec.range,
    attackSpeed: spec.attackSpeed,
    splashRadius: spec.splashRadius,
    pierceCount: spec.pierceCount,
    projectileSpeed: spec.projectileSpeed,
    targetType: spec.targetType,
    targetPriority: spec.targetPriority,
    ...(spec.slow ? { slow: spec.slow } : {}),
    ...(spec.aura ? { aura: spec.aura } : {}),
  }
}

/** 42종 전체. 티어 오름차순, 티어 안에서는 ROLE_SPECS 순서. */
export const UNITS: readonly UnitDef[] = Array.from({ length: TIER_COUNT }, (_, t) =>
  Array.from({ length: UNITS_PER_TIER }, (_, s) => buildUnit(t + 1, s)),
).flat()

const UNIT_BY_ID = new Map(UNITS.map((u) => [u.id, u]))

export function getUnit(id: string): UnitDef {
  const u = UNIT_BY_ID.get(id)
  if (!u) throw new Error(`알 수 없는 유닛 id: ${id}`)
  return u
}

export function unitsOfTier(tier: number): readonly UnitDef[] {
  return UNITS.filter((u) => u.tier === tier)
}

/** 유닛의 이론 DPS — 밸런싱 검산과 시뮬레이터용 */
export function unitDps(def: UnitDef): number {
  return def.damage * def.attackSpeed
}
