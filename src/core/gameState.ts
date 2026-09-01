import {
  CHALLENGE_BOSS,
  FEVER,
  TOKEN_MAX,
  challengeBossGold,
  isTokenWave,
} from '../data/challenge.js'
import type { ChallengeKind } from '../data/challenge.js'
import { sellValue } from '../data/slots.js'
import { getUnit } from '../data/units.js'
import { SPAWN_INTERVAL, TOTAL_WAVES, TYPE_MODIFIERS } from '../data/waves.js'
import { Challenges, type DeclareResult } from './challenge.js'
import { Missions, type MissionAward, type MissionProgress } from './missions.js'
import { planWave, spawnOrder, type SpawnGroup, type WavePlan } from './wave.js'
import {
  applySlow,
  auraMultipliers,
  currentSpeed,
  damageAfterArmor,
  selectTarget,
  splashTargets,
  towerPixelPos,
  type Targetable,
} from './combat.js'
import {
  MAX_LIFE,
  START_GOLD,
  START_LIFE,
  adjustLife,
  earlyStartBonus,
  leakPenalty,
  waveClearReward,
} from './economy.js'
import { GACHA_COST, rollUnit, type DrawFailure } from './gacha.js'
import { BENCH_CAPACITY, Inventory, type BuySlotResult, type PlaceResult } from './inventory.js'
import { findMerge, mergeProduct } from './merge.js'
import { orbitPosition, reachedCore, spawnAngle } from './orbit.js'
import { SETTLE_DURATION, prepDuration, type Phase } from './phase.js'
import { createRng, type Rng } from './rng.js'
import type { Enemy, Projectile, Tower, UnitInstance, Vec2 } from './types.js'

export { BENCH_CAPACITY }

export type DrawResult =
  | { ok: true; defId: string; cost: number }
  | { ok: false; reason: DrawFailure }

/** 각성은 설계의 "모든 스탯 ×2"를 밸런스 앵커에 맞춰 DPS ×2 로 구현한 것이다. */
export const AWAKEN_DAMAGE_MUL = 2

/** 코어가 맞았을 때 번쩍이는 시간(초) */
export const CORE_FLASH_DURATION = 0.4

export interface GameSnapshot {
  phase: Phase
  phaseTimer: number
  wave: number
  gold: number
  life: number
  slotsOwned: number
  towers: readonly Tower[]
  bench: readonly UnitInstance[]
  enemies: readonly Enemy[]
  projectiles: readonly Projectile[]
  leakedThisWave: number
  spawnsRemaining: number
  tokens: number
  missionsCleared: number
  over: 'none' | 'defeat' | 'victory'
  log: readonly string[]
}

/**
 * 게임 상태 전체. 렌더러와 DOM 을 전혀 모른다 —
 * 이 덕에 유닛 테스트, 리플레이, 헤드리스 밸런싱 시뮬레이터가 그대로 돌아간다.
 */
export class Game {
  readonly inv = new Inventory()
  readonly missions = new Missions()
  readonly challenges = new Challenges()
  private readonly rng: Rng

  phase: Phase = 'prep'
  phaseTimer: number
  wave = 1
  gold = START_GOLD
  life = START_LIFE

  enemies: Enemy[] = []
  projectiles: Projectile[] = []

  /** 자동 합성 스위치. 기본 ON 이지만, 물량으로 쓰고 싶을 때 끌 수 있어야 한다. */
  autoMerge = true

  /**
   * 실제로 **지급된** 미션 골드 누적.
   * `missions.totalEarned()` 는 완료 표시만 보므로, 시뮬레이터가 보상을 차단한
   * 경우(완료 처리만 해두고 지급은 막음)에 실제 수입과 어긋난다.
   */
  missionGoldEarned = 0

  leakedThisWave = 0
  spawnsRemaining = 0
  private spawnTimer = 0
  private spawnQueue: SpawnGroup[] = []
  /**
   * 코어 피격 연출에 남은 시간(초). 렌더러가 이걸 보고 코어를 번쩍인다.
   * 라이프가 줄었다는 걸 로그가 아니라 **화면에서** 읽히게 하려는 것이다.
   */
  coreFlash = 0
  /** 이번 전투에 적용 중인 계획. 준비 페이즈에는 미리보기용으로 쓴다. */
  wavePlan: WavePlan | null = null
  over: 'none' | 'defeat' | 'victory' = 'none'
  log: string[] = []

  private nextEntityUid = 1

  /** 이 판의 시드. 기록에 남겨 같은 판을 재현할 수 있게 한다. */
  readonly seed: number

  /** 시뮬레이션 누적 시간(초) — 기록용. 실시간이 아니라 게임 내 시간이다. */
  elapsedSec = 0

  constructor(seed = 1) {
    this.seed = seed
    this.rng = createRng(seed)
    this.phaseTimer = prepDuration(1)
    this.challenges.grantForWave(1)
  }

  // 인벤토리 위임 — 호출부가 game.towers 처럼 쓰던 걸 그대로 유지한다
  get towers(): Tower[] {
    return this.inv.towers
  }
  get bench(): UnitInstance[] {
    return this.inv.bench
  }
  get slotsOwned(): number {
    return this.inv.slotsOwned
  }
  set slotsOwned(n: number) {
    this.inv.slotsOwned = n
  }

  private uid(): number {
    return this.nextEntityUid++
  }

  private say(text: string): void {
    this.log.push(text)
    if (this.log.length > 60) this.log.shift()
  }

  // ── 명령: 뽑기 ──────────────────────────────────────────

  /**
   * 운영이 가능한 상태인가 — 뽑기·슬롯 구매·배치가 여기에 걸린다.
   *
   * 원래는 **준비 페이즈 전용**이었다. "준비 = 결정, 전투 = 관전"이라는 리듬을 만들려던
   * 것인데, 실제로 해보니 전투가 30~60초씩 이어지는 동안 아무것도 못 해서 답답했다.
   * 지금은 판이 끝나지 않았으면 언제든 된다.
   *
   * **도전 선언은 여전히 준비 페이즈 전용이다.** 웨이브 구성이 전투 시작 시점에
   * 확정되므로, 전투 중에 거는 건 애초에 성립하지 않는다.
   */
  canOperate(): boolean {
    return this.over === 'none'
  }

  /**
   * 뽑기 1회. 벤치 만차면 거부한다 —
   * 판매나 합성으로 비워야 뽑을 수 있다는 게 압박의 일부다.
   */
  draw(): DrawResult {
    if (!this.canOperate()) return { ok: false, reason: 'wrong-phase' }
    if (this.gold < GACHA_COST) return { ok: false, reason: 'insufficient-gold' }
    if (this.inv.benchFull()) return { ok: false, reason: 'bench-full' }

    const defId = rollUnit(this.wave, this.rng)
    this.gold -= GACHA_COST
    this.inv.grant(defId)
    const def = getUnit(defId)
    this.say(`뽑기 → ${def.name} (T${def.tier})`)
    this.onHoldingsChanged()
    return { ok: true, defId, cost: GACHA_COST }
  }

  // ── 명령: 도전 ──────────────────────────────────────────

  /**
   * 도전 선언. 준비 페이즈에만 가능하고, 페이즈가 끝나기 전까지 취소할 수 있다.
   * 한 웨이브에 토큰 2개를 써서 피버 + 보스를 동시에 거는 것도 가능하다.
   */
  declareChallenge(kind: ChallengeKind): DeclareResult {
    if (this.phase !== 'prep') return { ok: false, reason: 'wrong-phase' }
    const result = this.challenges.declare(kind)
    if (result.ok) {
      this.say(kind === 'fever' ? '피버타임 선언! (취소 가능)' : '보스 소환 선언! (취소 가능)')
    }
    return result
  }

  cancelChallenge(kind: ChallengeKind): boolean {
    if (this.phase !== 'prep') return false
    const ok = this.challenges.cancel(kind)
    if (ok) this.say('도전 취소 — 토큰 반환')
    return ok
  }

  /** 지금 선언 상태로 전투를 시작하면 어떤 웨이브가 오는지 (UI 미리보기) */
  previewWave(): WavePlan {
    return planWave(this.wave, this.challenges.flags())
  }

  missionProgress(): MissionProgress[] {
    return this.missions.progress(this.inv.allUnits())
  }

  // ── 명령: 슬롯 ──────────────────────────────────────────

  buySlot(): BuySlotResult {
    if (!this.canOperate()) return { ok: false, reason: 'insufficient-gold' }
    const result = this.inv.buySlot(this.gold)
    if (result.ok) {
      this.gold -= result.cost
      this.say(`슬롯 구매 -${result.cost}골드 (${result.owned}칸)`)
    }
    return result
  }

  nextSlotCost(): number | null {
    return this.inv.nextSlotCost()
  }

  // ── 명령: 배치 / 판매 / 잠금 ────────────────────────────

  /** 빈 슬롯이 있는가 — UI 가 배치 버튼을 활성화할지 판단하는 기준 */
  hasFreeSlot(): boolean {
    return this.inv.nextFreeSlot() !== null
  }

  /**
   * 벤치 → 필드. **자리는 고르지 않는다.**
   *
   * 폰에서 20px 타일을 정확히 탭하는 게 불가능해서 좌표 입력을 통째로 없앴다.
   * 빈 슬롯이 있으면 반드시 성공하고, 없으면 `no-slot` 하나만 돌아온다.
   */
  placeFromBench(uid: number): PlaceResult {
    const result = this.inv.place(uid)
    if (result.ok) this.onHoldingsChanged()
    return result
  }

  returnToBench(uid: number): boolean {
    const ok = this.inv.returnToBench(uid)
    if (ok) this.onHoldingsChanged()
    return ok
  }

  sell(uid: number): number {
    const refund = this.inv.sell(uid)
    if (refund > 0) {
      this.gold += refund
      this.say(`판매 +${refund}골드`)
      this.onHoldingsChanged()
    }
    return refund
  }

  /** 잠긴 종류는 3개가 쌓여도 합성되지 않는다. 잠금을 풀면 즉시 합성이 돈다. */
  toggleLock(defId: string): boolean {
    const locked = this.inv.toggleLock(defId)
    if (!locked) this.onHoldingsChanged()
    return locked
  }

  setAutoMerge(enabled: boolean): void {
    this.autoMerge = enabled
    if (enabled) this.onHoldingsChanged()
  }

  // ── 보유 변경 훅 ────────────────────────────────────────

  /**
   * 보유가 바뀌었을 때의 유일한 진입점. 매 프레임이 아니라 여기서만 재평가한다.
   *
   * **순서가 중요하다: 합성 먼저, 미션 판정 나중.**
   * 반대로 하면 "3개째가 들어온 순간"의 일시적 보유로 다이소가 달성돼버려서,
   * "자동 합성이 다이소의 최대 적"이라는 설계 긴장이 통째로 사라진다.
   */
  private onHoldingsChanged(): void {
    this.resolveMerges()
    this.awardMissions()
  }

  private awardMissions(): void {
    const awards = this.missions.evaluate(this.inv.allUnits())
    for (const award of awards) this.grantMission(award)
  }

  private grantMission(award: MissionAward): void {
    this.gold += award.gold
    this.missionGoldEarned += award.gold
    this.say(`★ ${award.label} 달성 +${award.gold}골드`)
  }

  // ── 합성 ────────────────────────────────────────────────

  /**
   * 자동 합성을 더 이상 할 게 없을 때까지 돌린다.
   * 연쇄(3개 → T2 가 나왔는데 그게 마침 3개째)를 한 번에 처리하기 위해 루프다.
   * 잠금·각성 유닛은 findMerge 가 알아서 제외한다.
   */
  private resolveMerges(): void {
    if (!this.autoMerge) return
    // 42종 × 각 티어 최대 연쇄를 넉넉히 덮는 상한. 무한 루프 방지용 안전장치다.
    for (let guard = 0; guard < 100; guard++) {
      if (!this.mergeOnce()) return
    }
  }

  /**
   * 수동 합성 1회. `defId` 를 주면 **그 종류만** 합성한다.
   *
   * 종류를 지정할 수 있어야 하는 이유: 플레이어가 카드를 눌러서 합성하므로,
   * 누른 것과 다른 종류가 합성되면 조작이 배신당한 것처럼 느껴진다.
   */
  mergeManually(defId?: string): boolean {
    return this.mergeOnce(defId)
  }

  /** 그 종류를 지금 합성할 수 있는가 — UI 가 카드를 밝게 표시할 기준 */
  canMerge(defId: string): boolean {
    return findMerge(this.inv.allUnits(), (id) => this.inv.isLocked(id), defId) !== null
  }

  /** 합성 가능한 종류 전부. 하나라도 있으면 "합성하라"는 신호를 띄운다. */
  mergeableDefIds(): string[] {
    const counts = this.inv.countsByDef()
    const out: string[] = []
    for (const [defId] of counts) {
      if (this.canMerge(defId)) out.push(defId)
    }
    return out
  }

  private mergeOnce(defId?: string): boolean {
    const candidate = findMerge(this.inv.allUnits(), (id) => this.inv.isLocked(id), defId)
    if (!candidate) return false

    const product = mergeProduct(candidate.defId, this.rng)
    const from = getUnit(candidate.defId)
    const to = getUnit(product.defId)

    // 투입 골드는 재료 3개의 합을 물려받는다 — 판매 환급이 실투입을 따라가게 하는 핵심.
    const paid = candidate.members.reduce((sum, m) => sum + m.paid, 0)

    this.inv.remove(candidate.members.map((m) => m.uid))

    // 3개 중 필드에 있던 게 있으면 결과도 필드로 간다 (재료가 빠져 슬롯이 비어 있다).
    // 전부 벤치였으면 벤치로.
    let placed = false
    if (candidate.fromField) {
      placed = this.inv.grantToField(product.defId, product.awakened, paid) !== null
    }
    if (!placed) {
      const granted = this.inv.grant(product.defId, product.awakened, paid)
      if (!granted) {
        // 방어 코드. 3개를 소모하면 최소 1칸이 비므로 실제로는 도달하지 않지만,
        // 재료만 없애고 결과를 잃는 건 부당하므로 판매가로 환급한다.
        const refund = sellValue(paid)
        this.gold += refund
        this.say(`합성 결과를 놓을 자리가 없어 ${refund}골드로 환급됐다`)
        return true
      }
    }

    this.say(
      product.kind === 'awaken'
        ? `각성! ${to.name} (DPS ×${AWAKEN_DAMAGE_MUL})`
        : `합성 ${from.name} ×3 → ${to.name} (T${to.tier})`,
    )
    return true
  }

  // ── 페이즈 ──────────────────────────────────────────────

  startWaveEarly(): boolean {
    if (this.phase !== 'prep') return false
    const bonus = earlyStartBonus(this.phaseTimer)
    if (bonus > 0) {
      this.gold += bonus
      this.say(`조기 시작 보너스 +${bonus}골드`)
    }
    this.beginBattle()
    return true
  }

  /** 고정 스텝(1/60초)으로 호출된다. dt 가 흔들려도 결과가 같아야 한다. */
  step(dt: number): void {
    if (this.over !== 'none') return
    this.elapsedSec += dt
    if (this.coreFlash > 0) this.coreFlash = Math.max(0, this.coreFlash - dt)

    switch (this.phase) {
      case 'prep':
        this.phaseTimer -= dt
        if (this.phaseTimer <= 0) this.beginBattle()
        break
      case 'battle':
        this.stepBattle(dt)
        break
      case 'settle':
        this.phaseTimer -= dt
        if (this.phaseTimer <= 0) this.beginPrep()
        break
    }
  }

  private beginBattle(): void {
    this.phase = 'battle'
    this.phaseTimer = 0
    this.leakedThisWave = 0

    const plan = planWave(this.wave, this.challenges.flags())
    this.wavePlan = plan
    this.spawnQueue = spawnOrder(plan)
    this.spawnsRemaining = this.spawnQueue.length
    this.spawnTimer = 0

    const kinds = [...new Set(plan.groups.map((g) => TYPE_MODIFIERS[g.type].label))].join('+')
    const tags = [plan.fever ? '피버' : null, this.challenges.isDeclared('boss') ? '보스소환' : null]
      .filter(Boolean)
      .join(' · ')
    this.say(
      `웨이브 ${this.wave} 시작 — ${kinds} ${this.spawnsRemaining}마리${tags ? ` [${tags}]` : ''}`,
    )
  }

  private beginPrep(): void {
    this.wave += 1
    if (this.wave > TOTAL_WAVES) {
      this.over = 'victory'
      this.say(`전 웨이브 클리어! 잔여 라이프 ${this.life}`)
      return
    }
    this.phase = 'prep'
    this.phaseTimer = prepDuration(this.wave)

    const charged = this.challenges.grantForWave(this.wave)
    if (charged) {
      this.say(`도전 토큰 +1 (보유 ${this.challenges.tokens}/${TOKEN_MAX})`)
    } else if (isTokenWave(this.wave)) {
      // 상한 때문에 버려졌다 — 아끼는 게 손해라는 걸 알려준다
      this.say(`도전 토큰이 상한(${TOKEN_MAX})을 넘어 버려졌다`)
    }
  }

  // ── 전투 ────────────────────────────────────────────────

  private stepBattle(dt: number): void {
    this.spawn(dt)
    this.moveEnemies(dt)
    this.fireTowers(dt)
    this.moveProjectiles(dt)
    this.reap()

    if (this.spawnsRemaining === 0 && this.enemies.length === 0) {
      this.settleWave()
    }
  }

  private spawn(dt: number): void {
    // spawnsRemaining 이 단일 진실 원천이다. 큐는 "무엇을" 낼지만 담는다.
    if (this.spawnsRemaining <= 0) return
    this.spawnTimer -= dt
    if (this.spawnTimer > 0) return
    this.spawnTimer += SPAWN_INTERVAL

    const group = this.spawnQueue.shift()
    if (!group) {
      this.spawnsRemaining = 0
      return
    }
    this.enemies.push({
      uid: this.uid(),
      type: group.type,
      hp: group.hp,
      maxHp: group.hp,
      armor: group.armor,
      bounty: group.bounty,
      speed: group.speed,
      dist: 0,
      // 모든 적이 같은 지점에서 나온다. 겹치지 않는 건 SPAWN_INTERVAL 덕이다 —
      // 시간차가 곧 나선 위의 간격이 되어 한 줄로 늘어선다.
      angle0: spawnAngle(),
      slowFactor: 1,
      slowRemaining: 0,
      isChallengeBoss: group.isChallengeBoss,
    })
    this.spawnsRemaining -= 1
  }

  private moveEnemies(dt: number): void {
    for (const e of this.enemies) {
      if (e.slowRemaining > 0) e.slowRemaining = Math.max(0, e.slowRemaining - dt)
      // speed 는 타일/초 → 픽셀/초로 환산. dist 가 클수록 코어에 가깝다.
      e.dist += currentSpeed(e) * 40 * dt
      if (reachedCore(e.dist)) this.leak(e)
    }
  }

  private leak(e: Enemy): void {
    e.hp = 0
    this.leakedThisWave += 1
    this.coreFlash = CORE_FLASH_DURATION
    const penalty = e.isChallengeBoss ? CHALLENGE_BOSS.lifePenalty : leakPenalty(e)
    this.life = adjustLife(this.life, -penalty)
    this.say(
      e.isChallengeBoss
        ? `도전 보스를 놓쳤다! 라이프 -${penalty} (남은 라이프 ${this.life})`
        : `누출! 라이프 -${penalty} (남은 라이프 ${this.life})`,
    )
    if (this.life <= 0) {
      this.over = 'defeat'
      this.say(`웨이브 ${this.wave} 에서 탈락`)
    }
  }

  /** 매 프레임 재사용하는 타겟 후보 목록 — 적 위치를 한 번만 계산한다. */
  private targetables(): Targetable[] {
    return this.enemies.map((enemy) => ({ enemy, pos: this.enemyPos(enemy) }))
  }

  private fireTowers(dt: number): void {
    if (this.enemies.length === 0) {
      for (const t of this.towers) t.cooldown = Math.max(0, t.cooldown - dt)
      return
    }
    const candidates = this.targetables()

    for (const tower of this.towers) {
      const def = getUnit(tower.defId)
      if (def.attackSpeed <= 0) continue // 버프 유닛은 공격하지 않는다

      const aura = auraMultipliers(tower, this.towers, getUnit)
      tower.cooldown -= dt
      if (tower.cooldown > 0) continue

      const pos = towerPixelPos(tower)
      const target = selectTarget(pos, def.range, def.targetType, def.targetPriority, candidates)
      if (!target) {
        tower.cooldown = 0
        continue
      }

      const awakenMul = tower.awakened ? AWAKEN_DAMAGE_MUL : 1
      tower.cooldown = 1 / (def.attackSpeed * aura.attackSpeedMul)
      this.projectiles.push({
        uid: this.uid(),
        x: pos.x,
        y: pos.y,
        targetUid: target.uid,
        speed: def.projectileSpeed * 40,
        damage: def.damage * aura.damageMul * awakenMul,
        splashRadius: def.splashRadius,
        pierceCount: def.pierceCount,
        sourceDefId: def.id,
      })
    }
  }

  private moveProjectiles(dt: number): void {
    if (this.projectiles.length === 0) return
    const byUid = new Map(this.enemies.map((e) => [e.uid, e]))
    const candidates = this.targetables()
    const survivors: Projectile[] = []

    for (const p of this.projectiles) {
      const target = byUid.get(p.targetUid)
      if (!target || target.hp <= 0) continue // 목표가 사라지면 투사체도 사라진다

      const tp = this.enemyPos(target)
      const d = Math.hypot(tp.x - p.x, tp.y - p.y)
      const travel = p.speed * dt

      if (travel >= d) {
        this.impact(p, tp, target, candidates)
        continue
      }
      p.x += ((tp.x - p.x) / d) * travel
      p.y += ((tp.y - p.y) / d) * travel
      survivors.push(p)
    }
    this.projectiles = survivors
  }

  private impact(p: Projectile, at: Vec2, target: Enemy, candidates: readonly Targetable[]): void {
    const victims: Enemy[] = [target]

    if (p.splashRadius > 0) {
      for (const e of splashTargets(at, p.splashRadius, candidates)) {
        if (e.uid !== target.uid) victims.push(e)
      }
    } else if (p.pierceCount > 1) {
      // 관통은 충돌 지점 주변의 적을 추가로 맞힌다 (최대 pierceCount 대상)
      const extra = splashTargets(at, 1.0, candidates).filter((e) => e.uid !== target.uid)
      victims.push(...extra.slice(0, p.pierceCount - 1))
    }

    const def = getUnit(p.sourceDefId)
    for (const v of victims) {
      if (v.hp <= 0) continue
      v.hp -= damageAfterArmor(p.damage, v.armor)
      if (def.slow) applySlow(v, def.slow.factor, def.slow.duration)
    }
  }

  /** 죽은 적을 치우고 현상금을 준다. */
  private reap(): void {
    if (this.enemies.length === 0) return
    const alive: Enemy[] = []
    for (const e of this.enemies) {
      if (e.hp > 0) {
        alive.push(e)
        continue
      }
      // 누출로 죽은 적은 leak() 에서 이미 처리됐으므로 현상금이 없다.
      if (reachedCore(e.dist)) continue

      if (e.isChallengeBoss) {
        const gold = challengeBossGold(this.wave)
        this.gold += gold
        this.life = adjustLife(this.life, CHALLENGE_BOSS.lifeReward)
        this.say(
          `도전 보스 처치! +${gold}골드 · 라이프 +${CHALLENGE_BOSS.lifeReward} (${this.life})`,
        )
      } else {
        this.gold += e.bounty
      }
    }
    this.enemies = alive
  }

  private settleWave(): void {
    const fever = this.wavePlan?.fever ?? false
    const reward = Math.round(waveClearReward(this.wave) * (fever ? FEVER.clearRewardMul : 1))
    this.gold += reward

    let msg = `웨이브 ${this.wave} 클리어 +${reward}골드${fever ? ' (피버 ×2)' : ''}`
    if (this.leakedThisWave === 0 && this.life < MAX_LIFE) {
      this.life = adjustLife(this.life, 1)
      msg += ` · 완봉 보너스 라이프 +1 (${this.life})`
    }
    this.say(msg)

    // 선언은 이 전투에만 적용된다. 토큰은 선언 시점에 이미 소모됐다.
    this.challenges.consume()
    this.projectiles = []
    this.phase = 'settle'
    this.phaseTimer = SETTLE_DURATION
  }

  // ── 조회 ────────────────────────────────────────────────

  enemyPos(e: Enemy): Vec2 {
    return orbitPosition(e.dist, e.angle0)
  }

  /**
   * 뽑기 없이 유닛을 넣는다 (테스트·프로브용).
   * 뽑기와 마찬가지로 **보유 변경 이벤트**이므로 합성을 재평가한다.
   */
  grantUnit(defId: string): UnitInstance | null {
    const unit = this.inv.grant(defId)
    if (unit) this.onHoldingsChanged()
    return unit
  }

  snapshot(): GameSnapshot {
    return {
      phase: this.phase,
      phaseTimer: this.phaseTimer,
      wave: this.wave,
      gold: this.gold,
      life: this.life,
      slotsOwned: this.slotsOwned,
      towers: this.towers,
      bench: this.bench,
      enemies: this.enemies,
      projectiles: this.projectiles,
      leakedThisWave: this.leakedThisWave,
      spawnsRemaining: this.spawnsRemaining,
      tokens: this.challenges.tokens,
      missionsCleared: this.missions.clearedCount(),
      over: this.over,
      log: this.log,
    }
  }

  /** 결정론 확인용 — 같은 시드·같은 입력이면 같은 값이 나와야 한다. */
  rngState(): number {
    return this.rng.getState()
  }
}
