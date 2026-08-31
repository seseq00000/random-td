import { MAX_SLOTS } from './core/economy.js'
import { GACHA_COST } from './core/gacha.js'
import { Game } from './core/gameState.js'
import type { SpawnGroup } from './core/wave.js'
import { BENCH_CAPACITY } from './core/inventory.js'
import { MERGE_COUNT } from './core/merge.js'
import {
  bestPerNickname,
  buildRecord,
  describeRecord,
  normalizeNickname,
  rankOf,
  rankRecords,
  type RunRecord,
} from './core/record.js'
import { CHALLENGE_BOSS, FEVER, TOKEN_MAX, challengeBossGold } from './data/challenge.js'
import type { ChallengeKind } from './data/challenge.js'
import { sellValue } from './data/slots.js'
import { tierColor, tierLabel } from './data/tiers.js'
import { getUnit } from './data/units.js'
import { TYPE_MODIFIERS } from './data/waves.js'
import { ROLE_STYLE, Renderer } from './render/renderer.js'
import { createRecordStore } from './storage/recordStore.js'
import { renderCodex } from './ui/codex.js'
import { renderInspector } from './ui/inspector.js'

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector<T>(sel)!

const canvas = $<HTMLCanvasElement>('#game')
const benchEl = $<HTMLDivElement>('#bench')
const previewEl = $<HTMLDivElement>('#wave-preview')
const toastEl = $<HTMLDivElement>('#toast')
const startBtn = $<HTMLButtonElement>('#btn-start')
const drawBtn = $<HTMLButtonElement>('#btn-draw')

const sheetEl = $<HTMLElement>('#sheet')
const sheetBackdrop = $<HTMLDivElement>('#sheet-backdrop')
const sheetTitle = $<HTMLHeadingElement>('#sheet-title')
const sheetBody = $<HTMLDivElement>('#sheet-body')
const sheetClose = $<HTMLButtonElement>('#sheet-close')
const sheetTabs = $<HTMLElement>('#sheet-tabs')

const gateEl = $<HTMLDivElement>('#gate')
const nicknameInput = $<HTMLInputElement>('#nickname')
const gateError = $<HTMLParagraphElement>('#gate-error')
const enterBtn = $<HTMLButtonElement>('#btn-enter')
const gateRankingEl = $<HTMLDivElement>('#gate-ranking')

const resultEl = $<HTMLDivElement>('#result')
const resultTitle = $<HTMLHeadingElement>('#result-title')
const resultSub = $<HTMLParagraphElement>('#result-sub')
const resultStats = $<HTMLDivElement>('#result-stats')
const resultRanking = $<HTMLDivElement>('#result-ranking')
const againBtn = $<HTMLButtonElement>('#btn-again')
const changeNameBtn = $<HTMLButtonElement>('#btn-change-name')

const statWave = $<HTMLElement>('#stat-wave')
const statLife = $<HTMLElement>('#stat-life')
const statGold = $<HTMLElement>('#stat-gold')
const tabMissions = $<HTMLElement>('#tab-missions')
const tabChallenge = $<HTMLElement>('#tab-challenge')
const tabField = $<HTMLElement>('#tab-field')

const store = createRecordStore()
const renderer = new Renderer(canvas)

// ── 판 단위 상태 ───────────────────────────────────────────

const newSeed = (): number => Date.now() & 0xffffffff

let game = new Game(newSeed())
let nickname = ''
let records: RunRecord[] = []
/** 이번 판에 선언한 도전 횟수 — 기록에 남긴다 */
let challengesUsed = 0
let recordSaved = false
let running = false

let selectedTowerUid: number | null = null
/** 한 번이라도 보유했던 유닛 (영구 누적) */
let discovered = new Set<string>()

function startNewGame(): void {
  game = new Game(newSeed())
  challengesUsed = 0
  recordSaved = false
  selectedTowerUid = null
  lastLogLength = 0
  lastSignature = ''
  closeSheet()
  running = true
  syncAll()
}

// ── 토스트 ─────────────────────────────────────────────────
// 캔버스에 그리던 걸 DOM 으로 옮겼다 — 폰에서 글씨가 훨씬 또렷하고,
// 캔버스가 화면 폭에 맞춰 축소돼도 읽을 수 있는 크기로 남는다.

let toastTimer: number | undefined

function toast(text: string): void {
  toastEl.textContent = text
  toastEl.hidden = false
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toastEl.hidden = true
  }, 2200)
}

// ── 시트 ───────────────────────────────────────────────────
// 하단에 항상 보이는 건 뽑기와 보유 유닛뿐이다. 나머지는 전부 여기로 들어간다.

type SheetId = 'missions' | 'challenge' | 'field' | 'codex' | 'log' | 'unit'

const SHEET_TITLE: Record<SheetId, string> = {
  missions: '미션',
  challenge: '도전',
  field: '필드',
  codex: '도감',
  log: '기록',
  unit: '유닛 상세',
}

let openSheet: SheetId | null = null
/** `unit` 시트가 보고 있는 유닛 */
let sheetUnitUid: number | null = null

function showSheet(id: SheetId, unitUid: number | null = null): void {
  openSheet = id
  sheetUnitUid = unitUid
  sheetTitle.textContent = SHEET_TITLE[id]
  sheetEl.hidden = false
  sheetBackdrop.hidden = false
  renderSheet()
}

function closeSheet(): void {
  openSheet = null
  sheetUnitUid = null
  sheetEl.hidden = true
  sheetBackdrop.hidden = true
}

sheetClose.addEventListener('click', closeSheet)
sheetBackdrop.addEventListener('click', closeSheet)

sheetTabs.addEventListener('click', (ev) => {
  const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-sheet]')
  if (!btn) return
  const id = btn.dataset.sheet as SheetId
  if (openSheet === id) closeSheet()
  else showSheet(id)
})

function renderSheet(): void {
  if (!openSheet) return
  sheetBody.replaceChildren()

  switch (openSheet) {
    case 'missions':
      renderMissionSheet()
      break
    case 'challenge':
      renderChallengeSheet()
      break
    case 'field':
      renderFieldSheet()
      break
    case 'codex':
      renderCodexSheet()
      break
    case 'log':
      renderLogSheet()
      break
    case 'unit':
      renderUnitSheet()
      break
  }
}

// ── 입장 게이트 ────────────────────────────────────────────

async function boot(): Promise<void> {
  records = await store.list()
  discovered = new Set(await store.getDiscovered())
  const saved = await store.getNickname()
  if (saved) nicknameInput.value = saved
  renderRanking(gateRankingEl, null)
  nicknameInput.focus()
}

async function enter(): Promise<void> {
  const normalized = normalizeNickname(nicknameInput.value)
  if (!normalized) {
    gateError.textContent = '닉네임을 입력해라'
    gateError.hidden = false
    nicknameInput.focus()
    return
  }
  gateError.hidden = true
  nickname = normalized
  await store.setNickname(nickname)

  gateEl.hidden = true
  resultEl.hidden = true
  startNewGame()
}

enterBtn.addEventListener('click', () => void enter())
nicknameInput.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') void enter()
})

againBtn.addEventListener('click', () => {
  resultEl.hidden = true
  startNewGame()
})

changeNameBtn.addEventListener('click', () => {
  resultEl.hidden = true
  gateEl.hidden = false
  nicknameInput.value = nickname
  renderRanking(gateRankingEl, null)
  nicknameInput.focus()
})

// ── 결과 처리 ──────────────────────────────────────────────

async function finishRun(): Promise<void> {
  if (recordSaved) return
  recordSaved = true
  running = false
  closeSheet()

  const record = buildRecord(game, {
    nickname,
    playedAt: Date.now(),
    challengesUsed,
  })
  await store.add(record)

  // 이 판에서 보유했던 유닛을 도감에 영구 누적한다
  const seenThisRun = [...new Set(game.inv.allUnits().map((u) => u.defId))]
  await store.addDiscovered(seenThisRun)
  for (const id of seenThisRun) discovered.add(id)

  records = await store.list()
  showResult(record)
}

function showResult(record: RunRecord): void {
  const rank = rankOf(records, record.id)
  const mine = rankRecords(records.filter((r) => r.nickname === nickname))[0]

  resultTitle.textContent = record.cleared ? '🏆 전 웨이브 클리어!' : '패배'
  resultSub.textContent =
    `${nickname} · ${describeRecord(record)} · 전체 ${rank}위 / ${records.length}판` +
    (mine ? ` · 최고 ${describeRecord(mine)}` : '')

  resultStats.replaceChildren()
  const stats: [string, string][] = [
    ['도달 웨이브', String(record.reachedWave > 30 ? '30 (클리어)' : record.reachedWave)],
    ['잔여 라이프', String(record.life)],
    ['미션 달성', `${record.missionsCleared}개 · ${record.missionGold.toLocaleString()}골드`],
    ['도전 사용', `${record.challengesUsed}회`],
    ['최고 티어 / 슬롯', `${tierLabel(record.topTier)} / ${record.slots}칸`],
    ['소요 시간', `${Math.floor(record.durationSec / 60)}분 ${record.durationSec % 60}초`],
  ]
  for (const [label, value] of stats) {
    const row = document.createElement('div')
    row.className = 'stat-row'
    const l = document.createElement('span')
    l.textContent = label
    const v = document.createElement('b')
    v.textContent = value
    row.append(l, v)
    resultStats.appendChild(row)
  }

  renderRanking(resultRanking, record.id)
}

/** 닉네임별 최고 기록 순위표. `highlightId` 가 있으면 그 줄을 강조한다. */
function renderRanking(target: HTMLElement, highlightId: string | null): void {
  target.replaceChildren()

  const title = document.createElement('div')
  title.className = 'ranking-title'
  title.textContent = '랭킹 (닉네임별 최고 기록)'
  target.appendChild(title)

  const top = bestPerNickname(records).slice(0, 8)
  if (top.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'ranking-empty'
    empty.textContent = '아직 기록이 없다 — 첫 판을 남겨라'
    target.appendChild(empty)
    return
  }

  for (let i = 0; i < top.length; i++) {
    const r = top[i]!
    const row = document.createElement('div')
    row.className = 'ranking-row'
    if (r.id === highlightId) row.classList.add('me')
    if (r.cleared) row.classList.add('cleared')

    const rank = document.createElement('span')
    rank.className = 'rank'
    rank.textContent = `${i + 1}`

    const name = document.createElement('span')
    name.className = 'name'
    name.textContent = r.nickname

    const wave = document.createElement('span')
    wave.className = 'wave'
    wave.textContent = r.cleared ? '클리어' : `W${r.reachedWave}`

    const detail = document.createElement('span')
    detail.className = 'detail'
    detail.textContent = `♥${r.life} · 미션${r.missionsCleared}`

    row.append(rank, name, wave, detail)
    target.appendChild(row)
  }
}

// ── 명령 ───────────────────────────────────────────────────

drawBtn.addEventListener('click', () => {
  const result = game.draw()
  if (!result.ok) toast(drawErrorText(result.reason))
  syncAll()
})

startBtn.addEventListener('click', () => {
  if (!game.startWaveEarly()) toast('전투 중에는 시작할 수 없다')
  syncAll()
})

/**
 * 배치. **자리를 고르지 않는다** — 빈 슬롯이 있으면 들어가고, 없으면 문구만 뜬다.
 * 폰에서 20px 타일을 정확히 탭하는 게 불가능해서 좌표 입력을 통째로 없앤 결과다.
 */
function placeUnit(uid: number): void {
  const result = game.placeFromBench(uid)
  if (!result.ok) {
    toast(
      result.reason === 'no-slot'
        ? `배치할 공간이 없다 (${game.towers.length}/${game.slotsOwned}칸) — 필드 탭에서 슬롯을 사라`
        : '배치할 수 없다',
    )
    return
  }
  syncAll()
}

function drawErrorText(reason: string): string {
  switch (reason) {
    case 'insufficient-gold':
      return `골드가 부족하다 (${GACHA_COST}골드 필요)`
    case 'bench-full':
      return '벤치가 가득 찼다 — 배치하거나 팔아라'
    case 'wrong-phase':
      return '준비 페이즈에만 뽑을 수 있다'
    default:
      return '뽑을 수 없다'
  }
}

// ── 벤치 (하단 독) ─────────────────────────────────────────
// 같은 종류를 한 카드로 묶는다 — 잠금이 종류 단위이고,
// 합성/미션 진행도(N/3, N/4)도 종류 단위로 봐야 판단이 된다.

interface BenchGroup {
  defId: string
  uids: number[]
  awakened: boolean
}

function groupBench(): BenchGroup[] {
  const groups = new Map<string, BenchGroup>()
  for (const u of game.bench) {
    const key = `${u.defId}:${u.awakened}`
    const g = groups.get(key)
    if (g) g.uids.push(u.uid)
    else groups.set(key, { defId: u.defId, uids: [u.uid], awakened: u.awakened })
  }
  return [...groups.values()].sort((a, b) => {
    const ta = getUnit(a.defId).tier
    const tb = getUnit(b.defId).tier
    return tb - ta || a.defId.localeCompare(b.defId)
  })
}

function renderBench(): void {
  benchEl.replaceChildren()
  const groups = groupBench()

  if (groups.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'empty'
    empty.textContent = '벤치가 비었다 — 뽑기를 눌러라'
    benchEl.appendChild(empty)
    return
  }

  const hasSpace = game.hasFreeSlot()

  for (const g of groups) {
    const def = getUnit(g.defId)
    const style = ROLE_STYLE[def.role]
    const total = game.inv.totalCountOf(g.defId)
    const locked = game.inv.isLocked(g.defId)
    const dps = Math.round(def.damage * def.attackSpeed * (g.awakened ? 2 : 1))
    const first = g.uids[0]!

    const card = document.createElement('div')
    card.className = 'unit-card'
    // 왼쪽 띠 = 티어 등급, 글리프 배경 = 동물. 두 축을 분리한다.
    card.style.setProperty('--tier-color', tierColor(def.tier))
    card.style.setProperty('--role-color', style.color)
    card.classList.toggle('locked', locked)
    card.classList.toggle('awakened', g.awakened)

    // 카드 본체를 **탭**하면 상세가 뜬다. 호버가 없는 폰에서 상세를 볼 수 있는 유일한 길이다.
    const pick = document.createElement('button')
    pick.className = 'pick'
    pick.innerHTML = `
      <span class="glyph">${style.glyph}</span>
      <span class="name">${def.name}${g.awakened ? ' ★' : ''}</span>
      <span class="meta">${tierLabel(def.tier)} · DPS ${dps}${g.uids.length > 1 ? ` · ×${g.uids.length}` : ''}</span>
    `
    pick.addEventListener('click', () => showSheet('unit', first))

    const actions = document.createElement('div')
    actions.className = 'card-actions'

    const place = document.createElement('button')
    place.className = 'place'
    place.textContent = '배치'
    // 비활성화하지 않는다 — 눌렀을 때 "공간이 없다"가 떠야 이유를 안다.
    place.classList.toggle('nospace', !hasSpace)
    place.addEventListener('click', () => placeUnit(first))
    actions.appendChild(place)

    if (total >= 2 && !g.awakened) {
      const badge = document.createElement('span')
      badge.className = 'badge'
      badge.textContent = total >= MERGE_COUNT ? `${total}` : `${total}/${MERGE_COUNT}`
      badge.title = `보유 ${total}개 (필드 + 벤치). ${MERGE_COUNT}개면 합성된다`
      actions.appendChild(badge)
    }

    if (!g.awakened) {
      const lock = document.createElement('button')
      lock.className = 'mini lock'
      lock.textContent = locked ? '🔒' : '🔓'
      lock.title = locked
        ? '잠김 — 합성되지 않는다. 눌러서 해제'
        : '잠그면 3개가 쌓여도 합성되지 않는다 (컬렉터 미션용)'
      lock.addEventListener('click', () => {
        game.toggleLock(g.defId)
        syncAll()
      })
      actions.appendChild(lock)
    }

    card.append(pick, actions)
    benchEl.appendChild(card)
  }
}

// ── 시트 내용 ──────────────────────────────────────────────

function renderUnitSheet(): void {
  const unit = sheetUnitUid === null ? null : (game.inv.find(sheetUnitUid) ?? null)
  if (!unit) {
    closeSheet()
    return
  }
  const box = document.createElement('div')
  box.id = 'inspector'
  sheetBody.appendChild(box)

  const onField = game.towers.some((t) => t.uid === unit.uid)
  renderInspector(box, unit, {
    onField,
    onRecall: () => {
      if (game.returnToBench(unit.uid)) {
        if (selectedTowerUid === unit.uid) selectedTowerUid = null
      } else {
        toast('벤치가 가득 찼다')
      }
      syncAll()
    },
    onPlace: () => {
      placeUnit(unit.uid)
      syncAll()
    },
    onSell: () => {
      game.sell(unit.uid)
      if (selectedTowerUid === unit.uid) selectedTowerUid = null
      closeSheet()
      syncAll()
    },
  })
}

function renderMissionSheet(): void {
  const all = game.missionProgress()

  const summary = document.createElement('div')
  summary.className = 'mission-summary'
  summary.textContent = `달성 ${game.missions.clearedCount()}개 · 누적 ${game.missionGoldEarned.toLocaleString()}골드`
  sheetBody.appendChild(summary)

  const hint = document.createElement('p')
  hint.className = 'sheet-hint'
  hint.textContent = '주 골드 수입원이다. 동시 보유하는 순간 즉시 판정된다.'
  sheetBody.appendChild(hint)

  // 진행 중인 것만, 완성에 가까운 순으로. 다 보여주면 42종+7티어라 읽히지 않는다.
  const active = all
    .filter((r) => !r.done && r.have > 0)
    .sort((a, b) => b.have / b.need - a.have / a.need || a.tier - b.tier)
    .slice(0, 8)

  if (active.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'mission-empty'
    empty.textContent = '뽑기를 시작하면 진행도가 표시된다'
    sheetBody.appendChild(empty)
    return
  }

  for (const row of active) {
    const el = document.createElement('div')
    el.className = 'mission-row'
    el.title =
      row.kind === 'daiso'
        ? `${tierLabel(row.tier)} 6종을 전부 1개 이상 동시 보유하면 ${row.gold}골드`
        : `같은 유닛 ${row.need}개를 동시 보유하면 ${row.gold}골드 (자동 합성을 잠금으로 막아야 한다)`

    const label = document.createElement('span')
    label.className = 'mission-label'
    label.textContent = row.label

    const bar = document.createElement('span')
    bar.className = 'mission-bar'
    const fill = document.createElement('span')
    fill.style.width = `${Math.min(100, (row.have / row.need) * 100)}%`
    bar.appendChild(fill)

    const count = document.createElement('span')
    count.className = 'mission-count'
    count.textContent = `${row.have}/${row.need}`

    const gold = document.createElement('span')
    gold.className = 'mission-gold'
    gold.textContent = `+${row.gold}`

    el.append(label, bar, count, gold)
    sheetBody.appendChild(el)
  }
}

const FEVER_HP_MUL = (FEVER.poolMul / FEVER.countMul).toFixed(2)

function renderChallengeSheet(): void {
  const inPrep = game.phase === 'prep' && game.over === 'none'

  const summary = document.createElement('div')
  summary.className = 'mission-summary'
  summary.textContent = `도전 토큰 ${game.challenges.tokens}/${TOKEN_MAX} (4웨이브마다 1개)`
  sheetBody.appendChild(summary)

  const hint = document.createElement('p')
  hint.className = 'sheet-hint'
  hint.textContent = '라이프를 걸고 골드를 산다. 보드가 앞설 때만 이득이다.'
  sheetBody.appendChild(hint)

  sheetBody.appendChild(challengeButton('fever', inPrep))
  sheetBody.appendChild(challengeButton('boss', inPrep))

  const toggle = document.createElement('label')
  toggle.className = 'toggle'
  const chk = document.createElement('input')
  chk.type = 'checkbox'
  chk.checked = game.autoMerge
  chk.addEventListener('change', () => {
    game.setAutoMerge(chk.checked)
    syncAll()
  })
  const span = document.createElement('span')
  span.textContent = '자동 합성'
  toggle.append(chk, span)

  if (!game.autoMerge) {
    const manual = document.createElement('button')
    manual.className = 'mini'
    manual.textContent = '수동 합성'
    manual.addEventListener('click', () => {
      if (!game.mergeManually()) toast('합성할 조합이 없다')
      syncAll()
    })
    toggle.appendChild(manual)
  }
  sheetBody.appendChild(toggle)
}

/** 선언 버튼은 토글이다 — 준비 페이즈가 끝나기 전까지 취소하면 토큰을 돌려받는다 */
function challengeButton(kind: ChallengeKind, inPrep: boolean): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.className = 'sheet-action'
  const declared = game.challenges.isDeclared(kind)
  btn.classList.toggle('declared', declared)
  btn.disabled = !inPrep || (!declared && game.challenges.tokens <= 0)

  if (declared) {
    btn.textContent = kind === 'fever' ? '🔥 피버 선언됨 (취소)' : '💀 보스 선언됨 (취소)'
    btn.title = '준비 페이즈가 끝나기 전까지 취소하면 토큰을 돌려받는다'
  } else {
    btn.textContent = kind === 'fever' ? '🔥 피버타임' : '💀 보스 소환'
    btn.title =
      kind === 'fever'
        ? `마리수 ×${FEVER.countMul} · 처치 골드 ×${FEVER.bountyMul} · 클리어 보상 ×${FEVER.clearRewardMul}\n` +
          `개체 HP 는 오히려 ${FEVER_HP_MUL} 배 — 스플래시·관통 빌드에 유리하다.`
        : `HP 가 이 웨이브 전체의 ×${CHALLENGE_BOSS.hpMul} 인 보스 1마리 추가.\n` +
          `처치: +${challengeBossGold(game.wave)}골드, 라이프 +${CHALLENGE_BOSS.lifeReward}\n` +
          `누출: 라이프 -${CHALLENGE_BOSS.lifePenalty}`
  }

  btn.addEventListener('click', () => {
    if (game.challenges.isDeclared(kind)) {
      if (game.cancelChallenge(kind)) challengesUsed--
    } else {
      const result = game.declareChallenge(kind)
      if (result.ok) {
        challengesUsed++
      } else {
        toast(
          result.reason === 'no-token'
            ? '도전 토큰이 없다 (4웨이브마다 1개)'
            : result.reason === 'wrong-phase'
              ? '준비 페이즈에만 선언할 수 있다'
              : '이미 선언했다',
        )
      }
    }
    syncAll()
  })
  return btn
}

/** 필드 시트 — 슬롯 구매와 배치된 타워 관리. 캔버스를 탭할 필요가 없어야 한다. */
function renderFieldSheet(): void {
  const inPrep = game.phase === 'prep' && game.over === 'none'
  const gold = Math.floor(game.gold)

  const summary = document.createElement('div')
  summary.className = 'mission-summary'
  summary.textContent = `필드 ${game.towers.length}/${game.slotsOwned}칸 · 벤치 ${game.bench.length}/${BENCH_CAPACITY}`
  sheetBody.appendChild(summary)

  const cost = game.nextSlotCost()
  const buy = document.createElement('button')
  buy.className = 'sheet-action primary'
  if (cost === null) {
    buy.textContent = `슬롯 최대 (${MAX_SLOTS}칸)`
    buy.disabled = true
  } else {
    buy.textContent = `슬롯 구매 — ${cost}골드`
    buy.disabled = !inPrep || gold < cost
    buy.addEventListener('click', () => {
      const result = game.buySlot()
      if (!result.ok) toast(result.reason === 'max-slots' ? '슬롯은 최대다' : '골드가 부족하다')
      syncAll()
    })
  }
  sheetBody.appendChild(buy)

  const hint = document.createElement('p')
  hint.className = 'sheet-hint'
  hint.textContent = '슬롯은 이 게임에서 가장 큰 결정이다 — 필드를 넓힐까, 더 뽑을까.'
  sheetBody.appendChild(hint)

  if (game.towers.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'mission-empty'
    empty.textContent = '배치된 유닛이 없다 — 아래 카드의 배치 버튼을 눌러라'
    sheetBody.appendChild(empty)
    return
  }

  // 강한 순으로 — 무엇을 빼고 무엇을 남길지가 여기서 판단된다
  const towers = [...game.towers].sort(
    (a, b) => getUnit(b.defId).tier - getUnit(a.defId).tier,
  )

  for (const t of towers) {
    const def = getUnit(t.defId)
    const style = ROLE_STYLE[def.role]

    const row = document.createElement('div')
    row.className = 'field-row'
    row.style.setProperty('--tier-color', tierColor(def.tier))
    row.style.setProperty('--role-color', style.color)

    const info = document.createElement('button')
    info.className = 'field-info'
    info.innerHTML = `
      <span class="glyph">${style.glyph}</span>
      <span class="name">${def.name}${t.awakened ? ' ★' : ''}</span>
      <span class="meta">${tierLabel(def.tier)} · 사거리 ${def.range}</span>
    `
    info.addEventListener('click', () => showSheet('unit', t.uid))

    const recall = document.createElement('button')
    recall.className = 'mini'
    recall.textContent = '회수'
    recall.addEventListener('click', () => {
      if (!game.returnToBench(t.uid)) toast('벤치가 가득 찼다')
      syncAll()
    })

    const sell = document.createElement('button')
    sell.className = 'mini'
    sell.textContent = `팔기 +${sellValue(t.paid)}`
    sell.addEventListener('click', () => {
      game.sell(t.uid)
      syncAll()
    })

    row.append(info, recall, sell)
    sheetBody.appendChild(row)
  }
}

function renderCodexSheet(): void {
  const held = new Map<string, number>()
  for (const u of game.inv.allUnits()) held.set(u.defId, (held.get(u.defId) ?? 0) + 1)
  // 지금 보유한 것도 즉시 발견 처리한다 — 판이 끝나기 전에 도감을 열어봐도 맞게 보인다
  for (const id of held.keys()) discovered.add(id)

  const box = document.createElement('div')
  box.id = 'codex'
  sheetBody.appendChild(box)
  renderCodex(box, { held, discovered })
}

function renderLogSheet(): void {
  if (game.log.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'mission-empty'
    empty.textContent = '아직 기록이 없다'
    sheetBody.appendChild(empty)
    return
  }
  for (const line of game.log.slice(-40).reverse()) {
    const div = document.createElement('div')
    div.className = 'log-line'
    div.textContent = line
    sheetBody.appendChild(div)
  }
}

// ── 웨이브 미리보기 ────────────────────────────────────────

/**
 * 적 타입 설명. 새 UI 를 만들지 않고 이미 있는 칩의 툴팁을 채운다 —
 * **판단이 필요한 시점(준비 페이즈)에 바로 보인다.**
 */
function enemyTooltip(group: SpawnGroup): string {
  const hp = `개체 HP ${Math.round(group.hp).toLocaleString()} · 방어 ${group.armor}`

  if (group.isChallengeBoss) {
    return (
      `도전 보스 — 웨이브 HP 의 ×${CHALLENGE_BOSS.hpMul}\n${hp}\n` +
      `잡으면 골드 +라이프 ${CHALLENGE_BOSS.lifeReward}, 놓치면 라이프 -${CHALLENGE_BOSS.lifePenalty}`
    )
  }
  switch (group.type) {
    case 'armored':
      return `장갑 — 방어력 ${TYPE_MODIFIERS.armored.armorMul}배 · 수가 적고 느리다\n${hp}\n공격력이 낮으면 거의 안 박힌다`
    case 'swarm':
      return `물량 — 방어력 0 · 수가 ${TYPE_MODIFIERS.swarm.countMul}배 · 빠르다\n${hp}\n광역·관통이 유리하다`
    case 'boss':
      return `보스 — 웨이브 HP 전체가 1마리에 들어 있다\n${hp}\n누출 시 라이프 -5`
    default:
      return `일반\n${hp}`
  }
}

function renderPreview(): void {
  previewEl.replaceChildren()
  if (game.over !== 'none') return

  const plan = game.phase === 'prep' ? game.previewWave() : game.wavePlan
  if (!plan) return

  for (const group of plan.groups) {
    const chip = document.createElement('span')
    chip.className = `preview-chip type-${group.type}`
    if (group.isChallengeBoss) chip.classList.add('challenge')
    chip.textContent = group.isChallengeBoss
      ? `💀 보스 ×1`
      : `${TYPE_MODIFIERS[group.type].label} ×${group.count}`
    chip.title = enemyTooltip(group)
    previewEl.appendChild(chip)
  }

  if (plan.fever) {
    const chip = document.createElement('span')
    chip.className = 'preview-chip fever'
    chip.textContent = `🔥 피버 ×${FEVER.bountyMul}`
    previewEl.appendChild(chip)
  }
}

// ── 상단 바 ────────────────────────────────────────────────

let lastLogLength = 0

function updateHud(): void {
  const gold = Math.floor(game.gold)
  statWave.textContent = String(game.wave)
  statLife.textContent = String(game.life)
  statGold.textContent = String(gold)

  const inPrep = game.phase === 'prep' && game.over === 'none'

  if (game.over === 'defeat') startBtn.textContent = '패배'
  else if (game.over === 'victory') startBtn.textContent = '승리'
  else if (game.phase === 'prep') startBtn.textContent = `준비 ${Math.ceil(game.phaseTimer)}초 ▶`
  else if (game.phase === 'settle') startBtn.textContent = '정산'
  else startBtn.textContent = `전투 · ${game.enemies.length + game.spawnsRemaining}`

  startBtn.disabled = !inPrep
  startBtn.classList.toggle('ready', inPrep)
  drawBtn.disabled = !inPrep || gold < GACHA_COST || game.inv.benchFull()

  // 탭 배지 — 시트를 열지 않고도 "볼 게 있다"가 보여야 한다
  const activeMissions = game.missionProgress().filter((r) => !r.done && r.have > 0).length
  tabMissions.textContent = activeMissions > 0 ? String(activeMissions) : ''
  tabChallenge.textContent = game.challenges.tokens > 0 ? String(game.challenges.tokens) : ''
  tabField.textContent = `${game.towers.length}/${game.slotsOwned}`
  tabField.classList.toggle('warn', !game.hasFreeSlot())

  if (game.log.length !== lastLogLength) {
    lastLogLength = game.log.length
    if (openSheet === 'log') renderSheet()
  }
}

/** 보유 상태가 바뀌었을 때만 부르면 되는 무거운 갱신 */
function syncAll(): void {
  renderBench()
  renderPreview()
  renderSheet()
  updateHud()
}

// ── 루프 ──────────────────────────────────────────────────
// 시뮬은 고정 스텝(1/60초), 렌더는 rAF. 프레임률이 흔들려도 시뮬 결과는 같다.

const FIXED_DT = 1 / 60
const MAX_CATCHUP = 0.25
let accumulator = 0
let lastTime = performance.now()
let lastSignature = ''

function frame(now: number): void {
  const elapsed = Math.min((now - lastTime) / 1000, MAX_CATCHUP)
  lastTime = now

  if (running) {
    accumulator += elapsed
    while (accumulator >= FIXED_DT) {
      game.step(FIXED_DT)
      accumulator -= FIXED_DT
    }
    if (game.over !== 'none') void finishRun()
  } else {
    accumulator = 0
  }

  renderer.draw(game, { selectedTowerUid })

  // 시뮬 진행이 패널 내용을 바꾸는 지점들(웨이브 전환, 미션 달성, 토큰 충전)을
  // 서명 하나로 감지한다. 매 프레임 DOM 을 다시 그리지 않기 위한 것이다.
  const signature = [
    game.bench.map((b) => `${b.defId}${b.awakened ? '*' : ''}`).join(','),
    game.wave,
    game.phase,
    game.challenges.tokens,
    game.missions.clearedCount(),
    game.towers.length,
    game.slotsOwned,
  ].join('|')
  if (signature !== lastSignature) {
    lastSignature = signature
    renderBench()
    renderPreview()
    renderSheet()
  }

  updateHud()
  requestAnimationFrame(frame)
}

void boot()
syncAll()
requestAnimationFrame(frame)

// 개발 편의 — 콘솔에서 상태를 들여다볼 수 있게
Object.assign(globalThis, {
  get game() {
    return game
  },
  store,
})
