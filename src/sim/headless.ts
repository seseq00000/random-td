/**
 * 헤드리스 밸런싱 시뮬레이터 — M4 의 핵심 도구.
 *
 *   npm run sim                       # 전 전략 비교표 (설계 3.4절 대조)
 *   npm run sim -- --runs=1000
 *   npm run sim -- --strategy=full --diag
 *
 * `core/` 가 렌더러·DOM 을 모르기 때문에 그대로 Node 에서 돌아간다.
 * 42종 + 미션 + 도전을 손으로 균형 잡는 건 불가능하다 — 여기서 재고 `data/` 만 고친다.
 */

import { AWAKEN_DAMAGE_MUL, Game } from '../core/gameState.js'
import type { WavePlan } from '../core/wave.js'
import { getUnit, unitDps } from '../data/units.js'
import { TOTAL_WAVES, isBossWave, waveTypes } from '../data/waves.js'
import {
  STRATEGIES,
  blockMissionRewards,
  playPrep,
  strategyByName,
  type Strategy,
} from './strategy.js'

const DT = 1 / 60

// ── 결과 타입 ──────────────────────────────────────────────

export interface WaveRecord {
  wave: number
  /** 웨이브 시작 시점 보드 이론 DPS */
  boardDps: number
  /** 전투 지속 시간(초) */
  duration: number
  /** 처치한 HP 총량 */
  hpKilled: number
  leaked: number
  spawned: number
  bossWave: boolean
}

export interface RunResult {
  seed: number
  reachedWave: number
  cleared: boolean
  life: number
  draws: number
  slots: number
  topTier: number
  finalBoardDps: number
  missionsCleared: number
  missionGold: number
  challengesUsed: number
  tokensWasted: number
  waves: WaveRecord[]
}

// ── 단일 판 실행 ───────────────────────────────────────────

function boardDps(game: Game): number {
  return game.towers.reduce((sum, t) => {
    const def = getUnit(t.defId)
    return sum + unitDps(def) * (t.awakened ? AWAKEN_DAMAGE_MUL : 1)
  }, 0)
}

function topTier(game: Game): number {
  return game.inv.allUnits().reduce((max, u) => Math.max(max, getUnit(u.defId).tier), 0)
}

/** 계획된 웨이브의 총 HP (도전 보스 포함) */
function plannedHp(plan: WavePlan | null): number {
  if (!plan) return 0
  return plan.groups.reduce((sum, g) => sum + g.hp * g.count, 0)
}

export function runOne(seed: number, s: Strategy): RunResult {
  const game = new Game(seed)
  if (!s.missionRewards) blockMissionRewards(game)

  let draws = 0
  let challengesUsed = 0
  const waves: WaveRecord[] = []

  // 현재 전투 추적
  let battleWave = 0
  let battleDps = 0
  let battleSteps = 0
  let battleHp = 0
  let battleSpawned = 0

  const record = (leaked: number) => {
    if (battleWave === 0) return
    waves.push({
      wave: battleWave,
      boardDps: battleDps,
      duration: battleSteps * DT,
      // 누출 0 인 웨이브만 계수 계산에 쓰므로, 그 경우 계획 HP = 처치 HP 다
      hpKilled: battleHp,
      leaked,
      spawned: battleSpawned,
      bossWave: isBossWave(battleWave),
    })
  }

  for (let step = 0; step < 60 * 60 * 150; step++) {
    if (game.over !== 'none') break

    if (game.phase === 'prep') {
      const played = playPrep(game, s)
      draws += played.draws
      challengesUsed += played.challenges

      battleWave = game.wave
      battleDps = boardDps(game)
      battleSteps = 0

      game.startWaveEarly()
      // 계획은 전투 시작 시점에 확정된다 (선언한 도전이 반영된 값)
      battleHp = plannedHp(game.wavePlan)
      battleSpawned = game.wavePlan?.totalCount ?? 0
      continue
    }

    const beforePhase = game.phase
    if (beforePhase === 'battle') battleSteps++
    game.step(DT)

    if (beforePhase === 'battle' && game.phase !== 'battle') record(game.leakedThisWave)
  }

  // 탈락으로 끝난 웨이브도 남긴다 (계수 계산에서는 leaked>0 이라 걸러진다)
  if (game.phase === 'battle') record(game.leakedThisWave)

  return {
    seed,
    reachedWave: game.wave,
    cleared: game.over === 'victory',
    life: game.life,
    draws,
    slots: game.slotsOwned,
    topTier: topTier(game),
    finalBoardDps: boardDps(game),
    missionsCleared: game.missions.clearedCount(),
    missionGold: game.missionGoldEarned,
    challengesUsed,
    tokensWasted: game.challenges.wasted,
    waves,
  }
}

// ── 집계 ───────────────────────────────────────────────────

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const sorted = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

export interface Summary {
  strategy: Strategy
  runs: number
  meanWave: number
  medianWave: number
  clearRate: number
  meanLife: number
  meanDraws: number
  meanSlots: number
  meanTopTier: number
  meanMissions: number
  meanMissionGold: number
  meanChallenges: number
  meanTokensWasted: number
}

export function summarize(strategy: Strategy, results: RunResult[]): Summary {
  return {
    strategy,
    runs: results.length,
    meanWave: mean(results.map((r) => r.reachedWave)),
    medianWave: median(results.map((r) => r.reachedWave)),
    clearRate: (results.filter((r) => r.cleared).length / results.length) * 100,
    meanLife: mean(results.map((r) => r.life)),
    meanDraws: mean(results.map((r) => r.draws)),
    meanSlots: mean(results.map((r) => r.slots)),
    meanTopTier: mean(results.map((r) => r.topTier)),
    meanMissions: mean(results.map((r) => r.missionsCleared)),
    meanMissionGold: mean(results.map((r) => r.missionGold)),
    meanChallenges: mean(results.map((r) => r.challengesUsed)),
    meanTokensWasted: mean(results.map((r) => r.tokensWasted)),
  }
}

export function runStrategy(s: Strategy, runs: number): RunResult[] {
  return Array.from({ length: runs }, (_, i) => runOne(i + 1, s))
}

// ── 출력 ───────────────────────────────────────────────────

const TARGETS: Record<string, string> = {
  bare: '클리어 0% · W17~20',
  passive: '—',
  mission: 'W24~27',
  full: '클리어 35~50%',
  reckless: 'full 보다 나빠야 함',
}

function printTable(summaries: Summary[]): void {
  console.log(
    '\n  전략'.padEnd(20) +
      '평균W  중앙W  클리어  라이프   미션  미션골드   도전  버림  최고T  슬롯   뽑기   목표',
  )
  console.log('  ' + '─'.repeat(102))

  for (const s of summaries) {
    console.log(
      `  ${s.strategy.label.padEnd(16)}` +
        `${s.meanWave.toFixed(1).padStart(6)}` +
        `${s.medianWave.toFixed(0).padStart(7)}` +
        `${`${s.clearRate.toFixed(0)}%`.padStart(8)}` +
        `${s.meanLife.toFixed(1).padStart(8)}` +
        `${s.meanMissions.toFixed(1).padStart(7)}` +
        `${Math.round(s.meanMissionGold).toLocaleString().padStart(10)}` +
        `${s.meanChallenges.toFixed(1).padStart(7)}` +
        `${s.meanTokensWasted.toFixed(1).padStart(6)}` +
        `${s.meanTopTier.toFixed(1).padStart(7)}` +
        `${s.meanSlots.toFixed(1).padStart(6)}` +
        `${Math.round(s.meanDraws).toString().padStart(7)}` +
        `   ${TARGETS[s.strategy.name] ?? ''}`,
    )
  }
}

/**
 * 웨이브별 유효 출력 계수 — `실제 처치 HP / (보드 DPS × 전투 시간)`.
 *
 * M1 에서 0.33 으로 잡았지만, 이건 웨이브 타입에 따라 크게 다를 수 있다.
 * 보스 웨이브는 단일 개체라 타워가 계속 사거리 안에 두므로 uptime 이 훨씬 높다.
 * 이 표가 HP 커브 튜닝의 근거다.
 */
function printEfficiency(results: RunResult[]): void {
  console.log('\n  === 웨이브별 유효 출력 계수 (처치 HP / 보드DPS × 시간) ===')
  console.log('  웨이브  타입          완봉수  평균계수   평균시간   보드DPS')
  console.log('  ' + '─'.repeat(62))

  for (let w = 1; w <= TOTAL_WAVES; w++) {
    const records = results
      .flatMap((r) => r.waves)
      .filter((rec) => rec.wave === w && rec.leaked === 0 && rec.boardDps > 0 && rec.duration > 0)
    if (records.length === 0) continue

    const ratios = records.map((rec) => rec.hpKilled / (rec.boardDps * rec.duration))
    const label = waveTypes(w).join('+')
    console.log(
      `  W${String(w).padStart(2)}     ${label.padEnd(14)}` +
        `${String(records.length).padStart(5)}` +
        `${mean(ratios).toFixed(3).padStart(10)}` +
        `${mean(records.map((r) => r.duration)).toFixed(1).padStart(10)}초` +
        `${Math.round(mean(records.map((r) => r.boardDps))).toLocaleString().padStart(11)}`,
    )
  }

  const all = results.flatMap((r) => r.waves).filter((r) => r.leaked === 0 && r.boardDps > 0)
  const bossRatios = all.filter((r) => r.bossWave).map((r) => r.hpKilled / (r.boardDps * r.duration))
  const normalRatios = all
    .filter((r) => !r.bossWave)
    .map((r) => r.hpKilled / (r.boardDps * r.duration))

  console.log('  ' + '─'.repeat(62))
  console.log(`  일반 웨이브 평균 계수: ${mean(normalRatios).toFixed(3)}`)
  console.log(`  보스 웨이브 평균 계수: ${mean(bossRatios).toFixed(3)}`)
}

// ── CLI ────────────────────────────────────────────────────

function parseArgs(argv: string[]): { runs: number; strategy: string | null; diag: boolean } {
  let runs = 100
  let strategy: string | null = null
  let diag = false

  for (const arg of argv) {
    const runsMatch = /^--runs=(\d+)$/.exec(arg)
    if (runsMatch) runs = Number(runsMatch[1])
    const stratMatch = /^--strategy=(.+)$/.exec(arg)
    if (stratMatch) strategy = stratMatch[1]!
    if (arg === '--diag') diag = true
  }
  return { runs, strategy, diag }
}

function main(): void {
  const { runs, strategy, diag } = parseArgs(process.argv.slice(2))

  const targets = strategy ? [strategyByName(strategy)] : STRATEGIES
  console.log(`시뮬레이션: 전략 ${targets.length}종 × ${runs}판`)

  const summaries: Summary[] = []
  const allResults: RunResult[] = []

  for (const s of targets) {
    const results = runStrategy(s, runs)
    summaries.push(summarize(s, results))
    if (s.name === (strategy ?? 'full')) allResults.push(...results)
  }

  printTable(summaries)

  console.log('\n  설계의 핵심 주장 검증:')
  const get = (name: string) => summaries.find((s) => s.strategy.name === name)
  const bare = get('bare')
  const mission = get('mission')
  const full = get('full')
  const reckless = get('reckless')

  const check = (label: string, ok: boolean, detail: string) =>
    console.log(`    ${ok ? '✅' : '❌'} ${label} — ${detail}`)

  if (bare) {
    // "0%" 가 아니라 "≤2%" 로 본다. 표본 수백 판이면 운 좋은 시드가 한둘 나오는 게
    // 정상이고, 설계 의도는 "사실상 불가능"이지 "수학적으로 불가능"이 아니다.
    check(
      '미션·도전 없이는 끝까지 못 간다',
      bare.clearRate <= 2 && bare.meanWave >= 17 && bare.meanWave <= 20,
      `클리어 ${bare.clearRate.toFixed(1)}% · 평균 W${bare.meanWave.toFixed(1)} (목표 ≤2% · W17~20)`,
    )
  }
  if (mission) {
    // 설계 3.4 원안: 미션만 활용 → 평균 탈락 W24~27
    check(
      '미션이 격차를 메운다',
      mission.meanWave >= 24 && mission.meanWave <= 27,
      `평균 W${mission.meanWave.toFixed(1)} · 클리어 ${mission.clearRate.toFixed(0)}% (목표 W24~27)`,
    )
  }
  if (full && mission) {
    // 설계 3.4 원안: 미션+도전 → 30웨이브 클리어율 35~50%
    check(
      '도전이 추가로 기여한다',
      full.clearRate >= 35 && full.clearRate <= 50 && full.clearRate > mission.clearRate,
      `${mission.clearRate.toFixed(0)}% → ${full.clearRate.toFixed(0)}% (목표 35~50%)`,
    )
  }
  if (reckless && full) {
    check(
      '도전은 보드가 앞설 때만 이득 (남발은 손해)',
      reckless.clearRate < full.clearRate,
      `남발 ${reckless.clearRate.toFixed(0)}% vs 판단 ${full.clearRate.toFixed(0)}%`,
    )
  }

  if (diag && allResults.length > 0) printEfficiency(allResults)
}

main()
