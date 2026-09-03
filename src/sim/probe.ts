/**
 * 헤드리스 밸런스 프로브 — M4 시뮬레이터의 씨앗.
 * core 가 렌더러를 모르기 때문에 그대로 Node 에서 돌아간다.
 *
 *   npx vite-node src/sim/probe.ts
 *
 * "설계 상수가 실제로 어떤 난이도를 만드는가"를 추측이 아니라 측정으로 확인한다.
 * 설계 문서 3.4절의 난이도 목표를 이 출력과 대조한다.
 */

import { GACHA_COST } from '../core/gacha.js'
import { AWAKEN_DAMAGE_MUL, Game } from '../core/gameState.js'
import { planWave } from '../core/wave.js'
import { getUnit, unitDps, unitsOfTier } from '../data/units.js'

const DT = 1 / 60
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8]

export interface Strategy {
  name: string
  /** 슬롯에 배정할 골드 비율. 0 이면 슬롯을 사지 않는다. */
  slotBudget: number
  /** 컬렉터 미션을 노리고 잠금을 거는가 */
  useMissions: boolean
  /** 도전 토큰을 쓰는가 */
  useChallenges: boolean
}

const STRATEGIES: Strategy[] = [
  { name: '미션0·도전0', slotBudget: 0.45, useMissions: false, useChallenges: false },
  { name: '미션만', slotBudget: 0.45, useMissions: true, useChallenges: false },
  { name: '미션+도전', slotBudget: 0.45, useMissions: true, useChallenges: true },
  { name: '전 시스템 적극', slotBudget: 0.6, useMissions: true, useChallenges: true },
]

interface RunResult {
  reachedWave: number
  cleared: boolean
  life: number
  boardDps: number
  topTier: number
  slots: number
  draws: number
  missionsCleared: number
  missionGold: number
  challengesUsed: number
  tokensWasted: number
}

function boardDps(game: Game): number {
  return game.towers.reduce((sum, t) => {
    const def = getUnit(t.defId)
    return sum + unitDps(def) * (t.awakened ? AWAKEN_DAMAGE_MUL : 1)
  }, 0)
}

function topTier(game: Game): number {
  return game.inv.allUnits().reduce((max, u) => Math.max(max, getUnit(u.defId).tier), 0)
}

/** 벤치에서 가장 센 유닛부터 빈 슬롯에 채워 넣는다. 자리는 자동 배정된다. */
function fillField(game: Game): void {
  const byPower = [...game.bench].sort((a, b) => getUnit(b.defId).tier - getUnit(a.defId).tier)
  for (const unit of byPower) {
    if (!game.hasFreeSlot()) break
    game.placeFromBench(unit.uid)
  }
}

/** 필드가 벤치보다 약하면 교체한다. 안 하면 슬롯이 찬 뒤 초반 T1 이 그대로 남는다. */
function upgradeField(game: Game): void {
  for (const benchUnit of [...game.bench]) {
    const benchTier = getUnit(benchUnit.defId).tier
    const weakest = game.towers.reduce<(typeof game.towers)[number] | null>(
      (min, t) => (min === null || getUnit(t.defId).tier < getUnit(min.defId).tier ? t : min),
      null,
    )
    if (!weakest) return
    if (getUnit(weakest.defId).tier >= benchTier) continue
    game.sell(weakest.uid)
    game.placeFromBench(benchUnit.uid)
  }
}

/**
 * 컬렉터 미션 운영: 4개까지 쌓인 종류를 잠가 5개를 채우게 하고,
 * 달성했거나 가망이 없으면 풀어 합성으로 돌린다.
 *
 * 4개를 자연스럽게 쌓으려면 이미 잠겨 있어야 하므로(3개면 합성되니까),
 * **2개가 된 시점에 잠근다** — UI 가 `2/5 · 잠글까요?` 배지를 띄우는 이유와 같다.
 */
function manageLocks(game: Game): void {
  const counts = new Map<string, number>()
  for (const u of game.inv.allUnits()) counts.set(u.defId, (counts.get(u.defId) ?? 0) + 1)

  for (const [defId, count] of counts) {
    const done = game.missions.completed.has(`collector:${defId}`)
    const locked = game.inv.isLocked(defId)

    if (done && locked) {
      game.toggleLock(defId) // 보상을 받았으면 풀어서 합성으로 돌린다
    } else if (!done && !locked && count >= 2) {
      // 벤치를 다 잡아먹지 않도록 한 번에 한 종류만 노린다
      if ([...game.inv.lockedDefIds].length === 0) game.toggleLock(defId)
    }
  }
}

/**
 * 도전 판단: 지난 웨이브를 완봉했고 라이프에 여유가 있으면 건다.
 * "보드가 커브보다 앞설 때만 이득"이라는 설계 의도를 AI 로 옮긴 것이다.
 */
function decideChallenges(game: Game): number {
  if (game.challenges.tokens <= 0) return 0
  if (game.life < 12) return 0

  let used = 0
  // 단일 딜러가 많으면 보스 소환, 스플래시·관통이 많으면 피버
  const roles = game.towers.map((t) => getUnit(t.defId).role)
  const single = roles.filter((r) => r === 'single').length
  const splashy = roles.filter((r) => r === 'splash' || r === 'pierce').length

  if (single >= splashy && game.declareChallenge('boss').ok) used++
  else if (game.declareChallenge('fever').ok) used++

  // 라이프가 넉넉하면 하나 더 건다
  if (game.challenges.tokens > 0 && game.life >= 17) {
    if (game.declareChallenge('fever').ok) used++
    else if (game.declareChallenge('boss').ok) used++
  }
  return used
}

function playPrep(game: Game, s: Strategy): { draws: number; challenges: number } {
  let draws = 0

  for (let guard = 0; guard < 400; guard++) {
    const slotCost = game.nextSlotCost()
    const wantSlot =
      s.slotBudget > 0 &&
      slotCost !== null &&
      game.inv.slotsFree() <= 0 &&
      game.gold >= slotCost / s.slotBudget

    if (wantSlot && game.buySlot().ok) {
      fillField(game)
      continue
    }
    if (game.gold < GACHA_COST) break
    // 벤치 정원이 사라져서 자리를 비우려고 파는 단계가 없어졌다
    if (!game.draw().ok) break
    draws++
    if (s.useMissions) manageLocks(game)
    fillField(game)
    upgradeField(game)
  }

  if (s.useMissions) manageLocks(game)
  fillField(game)
  upgradeField(game)
  const challenges = s.useChallenges ? decideChallenges(game) : 0
  return { draws, challenges }
}

function run(seed: number, s: Strategy): RunResult {
  const game = new Game(seed)
  let draws = 0
  let challengesUsed = 0

  for (let step = 0; step < 60 * 60 * 120; step++) {
    if (game.over !== 'none') break
    if (game.phase === 'prep') {
      const played = playPrep(game, s)
      draws += played.draws
      challengesUsed += played.challenges
      game.startWaveEarly()
      continue
    }
    game.step(DT)
  }

  return {
    reachedWave: game.wave,
    cleared: game.over === 'victory',
    life: game.life,
    boardDps: boardDps(game),
    topTier: topTier(game),
    slots: game.slotsOwned,
    draws,
    missionsCleared: game.missions.clearedCount(),
    missionGold: game.missions.totalEarned(),
    challengesUsed,
    tokensWasted: game.challenges.wasted,
  }
}

function avg(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function main(): void {
  console.log('=== 설계 3.4절 난이도 목표 대비 실측 ===\n')
  console.log(
    '  전략'.padEnd(20) +
      '평균탈락  클리어율   미션    미션골드   도전  최고티어  슬롯   뽑기',
  )
  console.log('  ' + '─'.repeat(84))

  for (const s of STRATEGIES) {
    const runs = SEEDS.map((seed) => run(seed, s))
    const clearRate = (runs.filter((r) => r.cleared).length / runs.length) * 100
    console.log(
      `  ${s.name.padEnd(18)}` +
        `W${avg(runs.map((r) => r.reachedWave)).toFixed(1).padStart(5)}` +
        `${`${clearRate.toFixed(0)}%`.padStart(9)}` +
        `${avg(runs.map((r) => r.missionsCleared)).toFixed(1).padStart(8)}` +
        `${Math.round(avg(runs.map((r) => r.missionGold))).toLocaleString().padStart(11)}` +
        `${avg(runs.map((r) => r.challengesUsed)).toFixed(1).padStart(7)}` +
        `${`T${Math.round(avg(runs.map((r) => r.topTier)))}`.padStart(9)}` +
        `${avg(runs.map((r) => r.slots)).toFixed(1).padStart(7)}` +
        `${Math.round(avg(runs.map((r) => r.draws))).toString().padStart(7)}`,
    )
  }

  console.log('\n  설계 목표: 미션0·도전0 → W17~20 · 미션만 → W24~27')
  console.log('             미션+도전 → 클리어율 35~50% · 전 시스템 → 80% 이상')

  console.log('\n=== 웨이브 구성 (타입 · 마리수) ===')
  for (const w of [1, 3, 7, 8, 10, 15, 21, 22, 30]) {
    const plan = planWave(w)
    const desc = plan.groups.map((g) => `${g.type} ×${g.count}`).join(' + ')
    console.log(
      `  W${String(w).padStart(2)}  ${desc.padEnd(30)} 개체HP ${Math.round(plan.groups[0]!.hp).toLocaleString()}`,
    )
  }

  console.log('\n=== 피버 효과 검산 (W14) ===')
  const normal = planWave(14)
  const fever = planWave(14, { fever: true, challengeBoss: false })
  console.log(`  평시:  ${normal.totalCount}마리 · 개체HP ${Math.round(normal.groups[0]!.hp)}`)
  console.log(`  피버:  ${fever.totalCount}마리 · 개체HP ${Math.round(fever.groups[0]!.hp)}`)
  console.log(
    `  → 마리수 ×${(fever.totalCount / normal.totalCount).toFixed(2)}` +
      ` · 개체HP ×${(fever.groups[0]!.hp / normal.groups[0]!.hp).toFixed(2)} (물량형)`,
  )

  console.log('\n=== 유닛 DPS 커브 ===')
  for (const tier of [1, 4, 7]) {
    const dps = unitsOfTier(tier).map((u) => Math.round(unitDps(u)))
    console.log(`  T${tier}: ${dps.join(' / ')}`)
  }
}

main()
