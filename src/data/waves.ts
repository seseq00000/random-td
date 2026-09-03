import type { EnemyType } from '../core/types.js'

/**
 * 난이도의 유일한 소스. 개체 HP 가 아니라 **웨이브 총 HP 풀**을 정의한다.
 * 마리수와 난이도가 분리되어 물량형/단일형을 같은 난이도로 만들 수 있고,
 * 피버타임의 "HP ×1.8 / 마리수 ×2.2" 같은 변형이 한 줄로 표현된다.
 */

export const TOTAL_WAVES = 30

/**
 * 난이도 커브. **수치를 손대기 전에 `npm run sim` 으로 현재 값부터 다시 재라.**
 * 손 추정은 기록상 3배 낙관적으로 나온다.
 *
 * ⚠ 나선 필드 전환 후 재튜닝. 경로형에서는 적이 타워 옆을 스쳐 지나가서 uptime 이
 * 낮았지만, 나선에서는 **적이 항상 중앙을 향해 들어오므로** 사거리 안에 머무는 시간이
 * 길다. 실측 유효 출력 계수가 통째로 뛰었다:
 *
 *   | 타입 | 경로형 | 나선 |
 *   |---|---|---|
 *   | 물량 | 0.05~0.16 | 0.16~0.42 |
 *   | 일반 | 0.12~0.27 | 0.28~0.74 (평균 0.445) |
 *   | 보스 | 0.18~0.46 | 0.32~0.85 (평균 0.548) |
 *
 * 같은 커브를 두자 기본 경제만으로 W28·클리어 28% 가 나왔다(목표 W17~20·0%).
 * 커브 전체를 올려서 되잡는다.
 */
export const WAVE_POOL_BASE = 1580
export const WAVE_POOL_GROWTH = 1.335

/** 웨이브 전체 적 HP 총합 */
export function wavePool(wave: number): number {
  return WAVE_POOL_BASE * Math.pow(WAVE_POOL_GROWTH, wave - 1)
}

export function isBossWave(wave: number): boolean {
  return wave % 5 === 0
}

/** 타입 배율 적용 전의 기준 마리수 */
export function baseCount(wave: number): number {
  return 10 + Math.floor(wave / 3) * 2
}

/** 기준 방어력 */
export function baseArmor(wave: number): number {
  return Math.floor(wave / 4)
}

/**
 * 웨이브 전체가 주는 현상금 총액.
 * 마리수가 아니라 **총액**을 정의해야 swarm(2.5배 물량)이 2.5배 골드를 주지 않는다.
 */
export function waveBountyPool(wave: number): number {
  // ⚠ 공중 제거 후 재튜닝: 원안 `10 + 2w`. 위 waveClearReward 와 같은 이유로 낮췄다.
  return 10 + wave * 2
}

/** 기준 이동 속도 (타일/초) */
export const BASE_SPEED = 1.5

export interface TypeModifier {
  /** 기준 마리수 대비 배율. boss 는 항상 1마리라 무시된다. */
  countMul: number
  armorMul: number
  speedMul: number
  label: string
}

/**
 * HP 풀은 고정이고 타입은 **분배 방식**만 바꾼다.
 * 그래서 어떤 타입이 와도 웨이브의 총 난이도는 같고, 요구되는 역할만 달라진다.
 */
export const TYPE_MODIFIERS: Record<EnemyType, TypeModifier> = {
  normal: { countMul: 1.0, armorMul: 1, speedMul: 1.0, label: '일반' },
  armored: { countMul: 0.6, armorMul: 3, speedMul: 0.85, label: '장갑' },
  swarm: { countMul: 2.5, armorMul: 0, speedMul: 1.15, label: '물량' },
  boss: { countMul: 1, armorMul: 2, speedMul: 0.73, label: '보스' },
}

/** 이 웨이브부터 두 타입이 동시에 온다 — 단일 대응 빌드를 막는다. */
export const DOUBLE_SPAWN_FROM = 21

/**
 * 30웨이브 타입 스케줄. 인덱스 0 = 웨이브 1.
 *
 * 설계 의도:
 * - 5의 배수는 항상 보스 (풀 전체가 1마리)
 * - 같은 타입이 연달아 오지 않게 한다
 * - 장갑은 W7 에 처음 나와 방어력 개념을 일찍 소개한다
 * - W21 부터 이중 스폰 — 미션으로 확보한 역할 다양성이 실제로 쓰이게 만든다
 *
 * 공중은 제거했다. "대공 유닛이 안 나오면 웨이브가 통째로 누출"되는 구조가
 * 랜덤 뽑기 게임에서 너무 가혹했다. 그 자리는 남은 3종으로 고르게 채웠다.
 *
 * 남은 타입이 3종이라 이중 스폰 조합은 {일반+장갑, 일반+물량, 장갑+물량} 3가지뿐이다.
 * 후반이 반복적으로 느껴지면 그때 새 타입을 추가한다.
 */
export const WAVE_SCHEDULE: readonly (readonly EnemyType[])[] = [
  ['normal'], // 1
  ['normal'], // 2
  ['swarm'], // 3
  ['normal'], // 4
  ['boss'], // 5
  ['normal'], // 6
  ['armored'], // 7  — 방어력 개념 소개
  ['swarm'], // 8
  ['normal'], // 9
  ['boss'], // 10
  ['armored'], // 11
  ['swarm'], // 12
  ['normal'], // 13
  ['armored'], // 14
  ['boss'], // 15
  ['swarm'], // 16
  ['armored'], // 17
  ['normal'], // 18
  ['armored'], // 19
  ['boss'], // 20
  ['normal', 'swarm'], // 21
  ['armored', 'swarm'], // 22
  ['normal', 'armored'], // 23
  ['swarm', 'normal'], // 24
  ['boss'], // 25
  ['swarm', 'armored'], // 26
  ['normal', 'armored'], // 27
  ['swarm', 'normal'], // 28
  ['armored', 'swarm'], // 29
  ['boss'], // 30
]

if (WAVE_SCHEDULE.length !== TOTAL_WAVES) {
  throw new Error(`waves: 스케줄 길이(${WAVE_SCHEDULE.length})가 ${TOTAL_WAVES} 가 아니다`)
}
for (let i = 0; i < WAVE_SCHEDULE.length; i++) {
  const wave = i + 1
  const types = WAVE_SCHEDULE[i]!
  if (types.length === 0) throw new Error(`waves: 웨이브 ${wave} 에 타입이 없다`)
  if (isBossWave(wave) && (types.length !== 1 || types[0] !== 'boss')) {
    throw new Error(`waves: 웨이브 ${wave} 는 보스 웨이브여야 한다`)
  }
  if (!isBossWave(wave) && types.includes('boss')) {
    throw new Error(`waves: 웨이브 ${wave} 는 보스 웨이브가 아닌데 boss 가 들어 있다`)
  }
  if (wave < DOUBLE_SPAWN_FROM && types.length > 1) {
    throw new Error(`waves: 이중 스폰은 웨이브 ${DOUBLE_SPAWN_FROM} 부터다 (웨이브 ${wave})`)
  }
}

export function waveTypes(wave: number): readonly EnemyType[] {
  return WAVE_SCHEDULE[wave - 1] ?? ['normal']
}

/** 스폰 간격(초) */
export const SPAWN_INTERVAL = 0.7
