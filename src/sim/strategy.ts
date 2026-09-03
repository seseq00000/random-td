import { GACHA_COST } from '../core/gacha.js'
import { Game } from '../core/gameState.js'
import { getUnit } from '../data/units.js'
import { UNITS } from '../data/units.js'
import { tierWeights } from '../data/gachaTable.js'
import { TIER_COUNT } from '../data/units.js'

/**
 * 준비 페이즈 운영 AI. 시뮬레이터와 프로브가 공유한다.
 *
 * 목적은 "사람이 잘 플레이했을 때"의 상한을 재는 것이다.
 * AI 가 나쁘면 밸런스가 실제보다 어렵게 측정되므로, 여기 품질이 곧 측정 신뢰도다.
 */

/**
 * 나선 필드로 바뀌면서 **"목 자리" 개념이 사라졌다.**
 *
 * 경로형에서는 어디에 놓느냐가 uptime 을 좌우해서 배치 최적화가 실력 요소였고,
 * AI 도 좋은 자리 목록(GOOD_SPOTS)을 들고 다녔다. 이제 자리는 자동 배정이라
 * AI 가 고를 게 **"무엇을 놓을지"만** 남는다 — 측정하는 실력 축이 하나 줄었다는 뜻이므로
 * 전략 간 스프레드가 좁아졌는지 재측정에서 반드시 확인해야 한다.
 */

export interface Strategy {
  name: string
  label: string
  /** 미션 보상을 받는가. false 면 전부 완료 처리해 지급을 막는다. */
  missionRewards: boolean
  /** 컬렉터 미션을 노리고 잠금을 운영하는가 */
  huntCollectors: boolean
  useChallenges: boolean
  /** 슬롯에 배정할 골드 비율 */
  slotBudget: number
  /** 도전을 걸 최소 라이프 */
  challengeLifeFloor: number
  /** 역할별 최고 티어를 먼저 깔아 커버리지를 확보한다 */
  smartPlacement: boolean
}

export const STRATEGIES: readonly Strategy[] = [
  {
    name: 'bare',
    label: '기본 경제만',
    missionRewards: false,
    huntCollectors: false,
    useChallenges: false,
    slotBudget: 0.45,
    challengeLifeFloor: 99,
    smartPlacement: false,
  },
  {
    name: 'passive',
    label: '미션 방치',
    missionRewards: true,
    huntCollectors: false,
    useChallenges: false,
    slotBudget: 0.45,
    challengeLifeFloor: 99,
    smartPlacement: false,
  },
  {
    name: 'mission',
    label: '미션 적극',
    missionRewards: true,
    huntCollectors: true,
    useChallenges: false,
    slotBudget: 0.45,
    challengeLifeFloor: 99,
    smartPlacement: false,
  },
  {
    name: 'full',
    label: '미션+도전',
    missionRewards: true,
    huntCollectors: true,
    useChallenges: true,
    slotBudget: 0.5,
    challengeLifeFloor: 12,
    smartPlacement: false,
  },
  /**
   * 설계 3.4 의 추가 검증 목표를 직접 시험한다:
   * **"보드가 커브에 딱 맞을 때 도전 기댓값은 음수여야 한다."**
   *
   * 라이프 여유를 보지 않고 토큰이 있으면 무조건 거는 전략이다.
   * 이게 `full` 보다 **나빠야** 도전에 판단이 개입한다는 뜻이고,
   * 더 좋으면 "무조건 쓰는 게 이득"이라 선택이 사라진 것이다.
   */
  {
    name: 'reckless',
    label: '도전 남발',
    missionRewards: true,
    huntCollectors: true,
    useChallenges: true,
    slotBudget: 0.5,
    challengeLifeFloor: 0,
    smartPlacement: false,
  },
]

export function strategyByName(name: string): Strategy {
  const s = STRATEGIES.find((x) => x.name === name)
  if (!s) throw new Error(`알 수 없는 전략: ${name} (가능: ${STRATEGIES.map((x) => x.name).join(', ')})`)
  return s
}

/**
 * 미션 보상을 차단한다. 전부 "이미 받은 것"으로 표시하면 재지급되지 않는다.
 * 프로덕션 코드에 시뮬레이터 전용 스위치를 넣지 않기 위한 방법이다.
 */
export function blockMissionRewards(game: Game): void {
  for (let t = 1; t <= TIER_COUNT; t++) game.missions.completed.add(`daiso:${t}`)
  for (const u of UNITS) game.missions.completed.add(`collector:${u.id}`)
}

/**
 * 배치 가치 = 티어.
 *
 * 순수 DPS 로 정렬해봤더니 오히려 나빠졌다(클리어 57% → 30%).
 * DPS 가 낮은 제어(슬로우)·대공은 숫자로 안 보이는 가치가 크고,
 * DPS 정렬은 단일 딜러에 몰려 물량·공중 웨이브에서 무너진다.
 * **역할 다양성이 순수 화력보다 중요하다** — 설계가 주장한 바로 그 지점이다.
 */
function placementValue(defId: string): number {
  return getUnit(defId).tier
}

/**
 * 벤치에서 가장 센 유닛부터 빈 목 자리에 채워 넣는다.
 *
 * `smart` 면 **역할별로 최고 티어를 먼저 하나씩** 깔아 커버리지를 확보한 뒤
 * 남는 슬롯을 티어순으로 채운다. 공중·물량 웨이브가 번갈아 오는 설계에서
 * 이게 단순 티어순보다 낫다.
 */
export function fillField(game: Game, smart = false): void {
  const byTier = [...game.bench].sort((a, b) => placementValue(b.defId) - placementValue(a.defId))

  const order = smart ? diversityFirst(game, byTier) : byTier

  for (const unit of order) {
    if (!game.hasFreeSlot()) break
    game.placeFromBench(unit.uid)
  }
}

/** 필드에 없는 역할부터 채우도록 순서를 재배열한다 */
function diversityFirst(game: Game, byTier: { uid: number; defId: string }[]): typeof byTier {
  const covered = new Set(game.towers.map((t) => getUnit(t.defId).role))
  const first: typeof byTier = []
  const rest: typeof byTier = []

  for (const unit of byTier) {
    const role = getUnit(unit.defId).role
    if (!covered.has(role)) {
      covered.add(role)
      first.push(unit)
    } else {
      rest.push(unit)
    }
  }
  return [...first, ...rest]
}

/** 필드가 벤치보다 약하면 교체한다. 안 하면 슬롯이 찬 뒤 초반 T1 이 그대로 남는다. */
export function upgradeField(game: Game, smart = false): void {
  for (const benchUnit of [...game.bench]) {
    const benchValue = placementValue(benchUnit.defId)
    const benchRole = getUnit(benchUnit.defId).role

    // 숙련 플레이는 **같은 역할끼리** 교체해 커버리지를 깨지 않는다
    const pool = smart
      ? game.towers.filter((t) => getUnit(t.defId).role === benchRole)
      : game.towers
    const weakest = pool.reduce<(typeof game.towers)[number] | null>(
      (min, t) => (min === null || placementValue(t.defId) < placementValue(min.defId) ? t : min),
      null,
    )
    if (!weakest) continue
    if (placementValue(weakest.defId) >= benchValue) continue
    game.sell(weakest.uid)
    game.placeFromBench(benchUnit.uid)
  }
}

/**
 * 컬렉터 미션 운영.
 *
 * 3개면 합성되므로 5개를 모으려면 **2개가 된 시점에 잠가야** 한다.
 * 단, 무기한 잠그면 그 종류가 영영 합성되지 않아 보드가 약해진다 —
 * 그래서 **가망 판정**을 둔다: 해당 티어가 뽑기에서 이미 저물었으면 포기하고 푼다.
 */
/** 이 티어가 지금 뽑기에서 사실상 안 나오면 5개 채우기를 포기한다 */
function tierIsStale(wave: number, tier: number): boolean {
  return (tierWeights(wave)[tier - 1] ?? 0) < STALE_TIER_PCT
}

const STALE_TIER_PCT = 5
/** 이 티어 미만은 보상이 잠금 비용을 못 갚는다 (T1 40골드 / T2 80골드) */
const MIN_COLLECTOR_TIER = 3

export function manageLocks(game: Game): void {
  const counts = new Map<string, number>()
  for (const u of game.inv.allUnits()) counts.set(u.defId, (counts.get(u.defId) ?? 0) + 1)

  for (const defId of [...game.inv.lockedDefIds]) {
    const count = counts.get(defId) ?? 0
    const done = game.missions.completed.has(`collector:${defId}`)
    const tier = getUnit(defId).tier
    // 보상을 받았거나, 재료가 사라졌거나, 그 티어가 뽑기에서 저물었으면 포기한다.
    // 무기한 잠그면 그 종류가 영영 합성되지 않아 보드가 약해진다.
    if (done || count === 0 || tierIsStale(game.wave, tier)) game.toggleLock(defId)
  }

  // 한 번에 한 종류만 노린다 — 벤치 8칸을 다 잡아먹으면 운영이 막힌다
  if (game.inv.lockedDefIds.size > 0) return

  // 보상이 큰 쪽(고티어)을 우선한다. 저티어 컬렉터는 40~80골드라 잠글 가치가 없다.
  let best: { defId: string; count: number; tier: number } | null = null
  for (const [defId, count] of counts) {
    if (count < 2) continue
    if (game.missions.completed.has(`collector:${defId}`)) continue
    const tier = getUnit(defId).tier
    if (tier < MIN_COLLECTOR_TIER) continue
    if (tierIsStale(game.wave, tier)) continue
    if (!best || tier > best.tier || (tier === best.tier && count > best.count)) {
      best = { defId, count, tier }
    }
  }
  if (best) game.toggleLock(best.defId)
}

/**
 * 도전 판단 — "보드가 커브보다 앞설 때만 이득"이라는 설계 의도를 옮긴 것.
 * 직전 웨이브를 완봉했고 라이프에 여유가 있을 때만 건다.
 */
export function decideChallenges(game: Game, s: Strategy): number {
  if (!s.useChallenges) return 0
  if (game.challenges.tokens <= 0) return 0
  if (game.life < s.challengeLifeFloor) return 0

  let used = 0
  const roles = game.towers.map((t) => getUnit(t.defId).role)
  const single = roles.filter((r) => r === 'single').length
  const splashy = roles.filter((r) => r === 'splash' || r === 'pierce').length

  // 단일 딜러가 많으면 보스 소환, 스플래시·관통이 많으면 피버
  if (single >= splashy) {
    if (game.declareChallenge('boss').ok) used++
  } else if (game.declareChallenge('fever').ok) used++

  // 라이프가 넉넉하면 하나 더
  if (game.challenges.tokens > 0 && game.life >= s.challengeLifeFloor + 5) {
    if (game.declareChallenge('fever').ok) used++
    else if (game.declareChallenge('boss').ok) used++
  }
  return used
}

export interface PrepResult {
  draws: number
  challenges: number
  slotsBought: number
}

export function playPrep(game: Game, s: Strategy): PrepResult {
  let draws = 0
  let slotsBought = 0

  for (let guard = 0; guard < 400; guard++) {
    const slotCost = game.nextSlotCost()
    const wantSlot =
      s.slotBudget > 0 &&
      slotCost !== null &&
      game.inv.slotsFree() <= 0 &&
      game.gold >= slotCost / s.slotBudget

    if (wantSlot && game.buySlot().ok) {
      slotsBought++
      fillField(game, s.smartPlacement)
      continue
    }
    if (game.gold < GACHA_COST) break

    // 벤치 정원이 사라져서 자리를 비우려고 파는 단계가 없어졌다 —
    // 이제 뽑기를 막는 건 위의 골드 검사뿐이다.
    if (!game.draw().ok) break
    draws++
    if (s.huntCollectors) manageLocks(game)
    fillField(game, s.smartPlacement)
    upgradeField(game, s.smartPlacement)
  }

  if (s.huntCollectors) manageLocks(game)
  fillField(game, s.smartPlacement)
  upgradeField(game, s.smartPlacement)
  return { draws, challenges: decideChallenges(game, s), slotsBought }
}
