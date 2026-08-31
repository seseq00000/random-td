/** 공유 타입. core/ 안의 순환 의존을 피하려고 한 곳에 모은다. */

export type Role = 'single' | 'splash' | 'sniper' | 'control' | 'pierce' | 'buff'

export type TargetType = 'ground' | 'none'

export type TargetPriority = 'first' | 'closest' | 'strongest'

export type EnemyType = 'normal' | 'armored' | 'swarm' | 'boss'

export interface Vec2 {
  x: number
  y: number
}

export interface TileCoord {
  tx: number
  ty: number
}

/** 유닛 정의 — data/units.ts 가 커브 공식으로 생성한다. 런타임 중 불변. */
export interface UnitDef {
  id: string
  name: string
  tier: number
  role: Role
  /** 1회 공격 데미지 */
  damage: number
  /** 사거리 (타일) */
  range: number
  /** 초당 공격 횟수 */
  attackSpeed: number
  /** 스플래시 반경 (타일). 0 이면 단일 대상 */
  splashRadius: number
  /** 관통 최대 대상 수. 1 이면 관통 없음 */
  pierceCount: number
  /** 투사체 속도 (타일/초). 0 이면 즉시 명중 */
  projectileSpeed: number
  targetType: TargetType
  targetPriority: TargetPriority
  /** 슬로우 효과 — control 역할만 사용 */
  slow?: { factor: number; duration: number }
  /** 인접 타일 버프 — buff 역할만 사용 */
  aura?: { damageMul: number; attackSpeedMul: number }
}

/**
 * 보유 중인 유닛 한 개. 필드에 있든 벤치에 있든 동일한 정체성을 갖는다 —
 * 미션 판정이 "필드 + 벤치 합산"이므로 이 구분이 흐려지면 안 된다.
 */
export interface UnitInstance {
  uid: number
  defId: string
  /**
   * T7 3개를 합성해 각성한 상태. 설계의 "모든 스탯 ×2"는
   * 밸런스 앵커(10슬롯 × T7 각성 = 145,800 DPS)에 맞춰 **DPS ×2**로 구현한다.
   */
  awakened: boolean
  /**
   * 이 유닛에 실제로 들어간 골드. 뽑기는 GACHA_COST, 합성 결과는 재료 3개의 합.
   *
   * 판매 환급을 **티어**가 아니라 이 값 기준으로 계산해야 한다.
   * 티어 기준으로 하면 후반에 10골드로 뽑은 T6 를 수백 골드에 파는
   * 무한 골드 경로가 열린다 — 실제로 프로브에서 뽑기 11,585회로 터졌다.
   */
  paid: number
}

/** 필드에 배치된 유닛 인스턴스 */
export interface Tower extends UnitInstance {
  tx: number
  ty: number
  /** 다음 공격까지 남은 시간(초) */
  cooldown: number
}

/** 진행 중인 적 인스턴스 */
export interface Enemy {
  uid: number
  type: EnemyType
  hp: number
  maxHp: number
  armor: number
  bounty: number
  /** 기본 이동 속도 (타일/초) */
  speed: number
  /**
   * 나선 위 진행 거리 (픽셀). 클수록 코어에 가깝다 —
   * `targetPriority: 'first'` 가 "누출 직전을 먼저 막는다"로 읽히는 근거다.
   */
  dist: number
  /** 나선 시작 각도(rad). 스폰 순번에서 황금각으로 정해진다. */
  angle0: number
  /** 남은 슬로우 시간(초)과 계수 */
  slowFactor: number
  slowRemaining: number
  /**
   * 도전(보스 소환)으로 추가된 개체.
   * 처치·누출 시 정규 적과 다른 보상/페널티가 적용된다.
   */
  isChallengeBoss: boolean
}

export interface Projectile {
  uid: number
  x: number
  y: number
  targetUid: number
  speed: number
  damage: number
  splashRadius: number
  pierceCount: number
  sourceDefId: string
}
