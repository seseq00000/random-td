import { MAX_SLOTS } from './core/economy.js'
import { GACHA_COST } from './core/gacha.js'
import { Game } from './core/gameState.js'
import type { SpawnGroup } from './core/wave.js'
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
import { CELEBRATE_FROM_TIER, tierColor, tierLabel } from './data/tiers.js'
import { getUnit } from './data/units.js'
import { TYPE_MODIFIERS } from './data/waves.js'
import { AudioEngine, DEFAULT_AUDIO } from './audio/engine.js'
import {
  VIBRATE,
  Vibration,
  fullscreenSupported,
  isFullscreen,
  isStandalone,
  toggleFullscreen,
} from './ui/settings.js'
import { GameObserver } from './render/observer.js'
import { ROLE_STYLE, Renderer } from './render/renderer.js'
import { createRecordStore } from './storage/recordStore.js'
import { celebrate } from './ui/celebrate.js'
import { renderCodex } from './ui/codex.js'
import { creatureIcon } from './ui/creatureIcon.js'
import { renderInspector } from './ui/inspector.js'
import { renderOdds } from './ui/odds.js'

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector<T>(sel)!

const canvas = $<HTMLCanvasElement>('#game')
const benchEl = $<HTMLDivElement>('#bench')
const previewEl = $<HTMLDivElement>('#wave-preview')
const toastEl = $<HTMLDivElement>('#toast')
const celebrateEl = $<HTMLDivElement>('#celebrate')
const startBtn = $<HTMLButtonElement>('#btn-start')
const drawBtn = $<HTMLButtonElement>('#btn-draw')
const muteBtn = $<HTMLButtonElement>('#btn-mute')
const optSound = $<HTMLButtonElement>('#opt-sound')
const optVibrate = $<HTMLButtonElement>('#opt-vibrate')
const optFullscreen = $<HTMLButtonElement>('#opt-fullscreen')

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

/** 벤치가 비어 있을 때 점선으로 보여줄 최소 칸 수 — 순수 표시용이다 */
const BENCH_MIN_TILES = 8

const store = createRecordStore()
const renderer = new Renderer(canvas)
const observer = new GameObserver()
const audio = new AudioEngine()

// ── 소리 ───────────────────────────────────────────────────
// 브라우저는 사용자 제스처 전에는 소리를 막는다. 게이트의 "시작" 버튼이 자연스러운
// 해제 지점이지만, 결과 화면에서 "다시 하기"로 들어오는 경로도 있어서
// **아무 곳이나 처음 누를 때**도 열어준다.
function unlockAudio(): void {
  audio.unlock()
}
window.addEventListener('pointerdown', unlockAudio, { once: true })
window.addEventListener('keydown', unlockAudio, { once: true })

function syncMuteButton(): void {
  const muted = audio.muted
  muteBtn.textContent = muted ? '🔇' : '🔊'
  muteBtn.classList.toggle('off', muted)
  muteBtn.title = muted ? '소리 켜기' : '소리 끄기'
  muteBtn.setAttribute('aria-label', muteBtn.title)
}

muteBtn.addEventListener('click', () => {
  audio.unlock()
  audio.toggleMute()
  syncMuteButton()
  persistSettings()
})

// ── 메인 메뉴 설정 (사운드 · 진동 · 전체화면) ───────────────
// 시작 전에 켜고 끌 수 있어야 조용한 데서 안 놀란다.

const vibration = new Vibration()
let vibrateOn = true

function persistSettings(): void {
  void store.setAudio({ ...audio.getSettings(), vibrate: vibrateOn })
}

function setOptState(btn: HTMLButtonElement, on: boolean, onText = '켜짐', offText = '꺼짐'): void {
  btn.classList.toggle('off', !on)
  btn.setAttribute('aria-pressed', String(on))
  const state = btn.querySelector('.opt-state')
  if (state) state.textContent = on ? onText : offText
}

function syncSettingsUI(): void {
  setOptState(optSound, !audio.muted)
  const icon = optSound.querySelector('.opt-icon')
  if (icon) icon.textContent = audio.muted ? '🔇' : '🔊'

  setOptState(optVibrate, vibrateOn)
  // 지원 안 하는 기기(iOS 사파리)에서는 아예 감춘다 —
  // 눌러도 아무 일 없는 버튼이 제일 나쁘다
  optVibrate.hidden = !vibration.supported

  const fs = isFullscreen()
  setOptState(optFullscreen, fs, '켜짐', '끄기')
  // 홈 화면에서 실행 중이면 이미 전체화면이라 버튼이 의미 없다
  optFullscreen.hidden = !fullscreenSupported() || isStandalone()
}

optSound.addEventListener('click', () => {
  audio.unlock()
  audio.toggleMute()
  syncMuteButton()
  syncSettingsUI()
  persistSettings()
})

optVibrate.addEventListener('click', () => {
  vibrateOn = !vibrateOn
  vibration.setEnabled(vibrateOn)
  // 켤 때 한 번 울려서 "이게 진동이다"를 바로 알려준다
  if (vibrateOn) vibration.buzz([30])
  syncSettingsUI()
  persistSettings()
})

optFullscreen.addEventListener('click', () => {
  // 전체화면은 **사용자 제스처 안에서만** 허용된다 — 그래서 여기서 직접 부른다
  void toggleFullscreen().then(syncSettingsUI)
})

document.addEventListener('fullscreenchange', syncSettingsUI)

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
  // 이전 판의 uid 가 남아 있으면 엉뚱한 자리에서 파편이 튄다
  observer.reset()
  renderer.reset()
  /**
   * 합성은 **직접 누르는 게 기본**이다.
   *
   * core 의 기본값(`autoMerge = true`)은 그대로 뒀다 — 시뮬레이터와 테스트가
   * "항상 합성하는 플레이어"를 모델로 쓰고 있어서, 그걸 바꾸면 측정된 밸런스가
   * 통째로 흔들린다. 여기서 UI 기본값만 끈다.
   */
  game.setAutoMerge(false)
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
  codex: '뽑기 확률 · 도감',
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

  // 설정은 새로고침해도 유지된다. 저장된 게 없으면 기본값(소리·진동 켜짐, 음량 0.6).
  const saved2 = (await store.getAudio()) ?? { ...DEFAULT_AUDIO, vibrate: true }
  audio.applySettings(saved2)
  vibrateOn = saved2.vibrate
  vibration.setEnabled(vibrateOn)
  syncMuteButton()
  syncSettingsUI()
  audio.setScene('lobby')

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

  // 게이트의 "시작" 버튼이 소리를 여는 가장 자연스러운 지점이다
  audio.unlock()

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
  audio.setScene('lobby')
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
  // 판이 끝났는데 전투 BGM 이 계속 돌면 결과 화면이 안 읽힌다
  audio.setScene('lobby')

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
  if (!result.ok) {
    toast(drawErrorText(result.reason))
    audio.deny()
  } else if (getUnit(result.defId).tier >= CELEBRATE_FROM_TIER) {
    // 등급명이 붙는 티어부터만 축하한다 — T1·T2 까지 띄우면 특별함이 사라진다
    celebrate(celebrateEl, result.defId)
    audio.celebrate(getUnit(result.defId).tier)
    vibration.buzz(VIBRATE.celebrate)
  } else {
    audio.draw()
  }
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
    audio.deny()
    return
  }
  audio.place()
  syncAll()
}

function drawErrorText(reason: string): string {
  switch (reason) {
    case 'insufficient-gold':
      return `골드가 부족하다 (${GACHA_COST}골드 필요)`
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

/**
 * 벤치 — **8종류가 한 화면에 다 보이는 2행 그리드**.
 *
 * 원래는 가로 스크롤 카드였는데, 벤치를 종류 단위로 세면서 8장이 928px 가 됐다.
 * 폰 화면은 390px 이라 한 번에 3장밖에 안 보였고, 자동 합성을 끈 뒤로는
 * **"빛나는 카드를 찾아 스크롤"** 해야 해서 합성이 번거로웠다.
 *
 * 세로를 더 쓰는 건 공짜다 — 캔버스는 높이가 아니라 **폭**에 묶여 있어서
 * 아래를 60px 더 써도 게임 화면이 줄지 않는다.
 *
 * 타일에는 그림·등급·개수와 **버튼 하나만** 둔다. 이름·DPS·팔기·잠금은
 * 타일을 탭해서 여는 상세 시트가 맡는다.
 */
function renderBench(): void {
  benchEl.replaceChildren()
  const groups = groupBench()
  const hasSpace = game.hasFreeSlot()

  for (const g of groups) {
    const def = getUnit(g.defId)
    const total = game.inv.totalCountOf(g.defId)
    const locked = game.inv.isLocked(g.defId)
    const first = g.uids[0]!
    const mergeable = !g.awakened && game.canMerge(g.defId)

    const tile = document.createElement('div')
    tile.className = 'unit-tile'
    tile.style.setProperty('--tier-color', tierColor(def.tier))
    tile.classList.toggle('locked', locked)
    tile.classList.toggle('awakened', g.awakened)
    // 중복은 타일이 겹쳐 쌓인 것처럼 보인다 — 몇 장인지 세지 않아도 읽힌다
    tile.classList.toggle('stacked', g.uids.length > 1)
    // 합성 가능하면 밝게. 자동 합성을 끈 이상 이 신호가 없으면 놓친다.
    tile.classList.toggle('mergeable', mergeable)

    if (g.uids.length > 1) {
      const stack = document.createElement('span')
      stack.className = 'stack-count'
      stack.textContent = `×${g.uids.length}`
      tile.appendChild(stack)
    }
    if (locked) {
      const lockMark = document.createElement('span')
      lockMark.className = 'tile-lock'
      lockMark.textContent = '🔒'
      tile.appendChild(lockMark)
    }

    // 타일 본체를 탭하면 상세가 뜬다 — 호버가 없는 폰에서 상세를 볼 유일한 길이다
    const body = document.createElement('button')
    body.className = 'tile-body'
    body.title = `${def.name} · ${tierLabel(def.tier)} · 보유 ${total}`

    const grade = document.createElement('span')
    grade.className = 'tile-grade'
    grade.textContent = g.awakened ? '★각성' : tierLabel(def.tier)
    grade.style.color = tierColor(def.tier)

    body.append(creatureIcon(def.role, def.tier, g.awakened, 34), grade)
    body.addEventListener('click', () => showSheet('unit', first))

    // 버튼은 하나만. 지금 눌러야 할 게 무엇인지 타일이 스스로 정한다.
    const act = document.createElement('button')
    if (mergeable) {
      act.className = 'tile-act merge'
      act.textContent = '합성'
      act.title = `${def.name} ${MERGE_COUNT}개 → 상위 티어 랜덤 1종 (보유 ${total})`
      act.addEventListener('click', () => {
        if (game.mergeManually(g.defId)) {
          audio.merge()
          syncAll()
        } else {
          toast('합성할 수 없다')
          audio.deny()
        }
      })
    } else {
      act.className = 'tile-act place'
      act.textContent = total >= 2 ? `배치 ${total}/${MERGE_COUNT}` : '배치'
      // 비활성화하지 않는다 — 눌렀을 때 "공간이 없다"가 떠야 이유를 안다
      act.classList.toggle('nospace', !hasSpace)
      act.addEventListener('click', () => placeUnit(first))
    }

    tile.append(body, act)
    benchEl.appendChild(tile)
  }

  // 벤치에는 정원이 없다. 다만 처음 두 줄이 텅 비어 보이면 허전해서
  // **최소 8칸까지만** 점선으로 채운다 — 그 이상은 그냥 늘어나고 세로로 스크롤된다.
  for (let i = groups.length; i < BENCH_MIN_TILES; i++) {
    const slot = document.createElement('div')
    slot.className = 'unit-tile empty'
    if (i === groups.length && groups.length === 0) slot.textContent = '뽑기'
    benchEl.appendChild(slot)
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

  if (unit.awakened) return

  // 잠금은 타일에서 뺐다(자리가 없다). 대신 여기서 켜고 끈다 —
  // 컬렉터 미션을 노릴 때만 쓰는 기능이라 한 단계 안쪽이 맞다.
  const locked = game.inv.isLocked(unit.defId)
  const lock = document.createElement('button')
  lock.className = 'sheet-action'
  lock.classList.toggle('declared', locked)
  lock.textContent = locked ? '🔒 합성 잠금 해제' : '🔓 합성 잠그기'
  lock.title = locked
    ? '지금은 3개가 쌓여도 합성되지 않는다'
    : `잠그면 ${MERGE_COUNT}개가 쌓여도 합성되지 않는다 (컬렉터 미션용)`
  lock.addEventListener('click', () => {
    game.toggleLock(unit.defId)
    syncAll()
  })
  sheetBody.appendChild(lock)

  const canMergeThis = game.canMerge(unit.defId)
  if (canMergeThis) {
    const merge = document.createElement('button')
    merge.className = 'sheet-action primary'
    merge.textContent = `합성하기 — ${MERGE_COUNT}개 → 상위 티어`
    merge.addEventListener('click', () => {
      if (game.mergeManually(unit.defId)) {
        audio.merge()
        closeSheet()
        syncAll()
      } else {
        toast('합성할 수 없다')
        audio.deny()
      }
    })
    sheetBody.appendChild(merge)
  }
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
  const canBuy = game.canOperate()
  const gold = Math.floor(game.gold)

  const summary = document.createElement('div')
  summary.className = 'mission-summary'
  // 벤치는 정원이 없다 — 병목은 전부 필드 슬롯이 진다
  summary.textContent = `필드 ${game.towers.length}/${game.slotsOwned}칸 · 벤치 ${game.inv.benchStacks()}종류 (${game.bench.length}장, 제한 없음)`
  sheetBody.appendChild(summary)

  const cost = game.nextSlotCost()
  const buy = document.createElement('button')
  buy.className = 'sheet-action primary'
  if (cost === null) {
    buy.textContent = `슬롯 최대 (${MAX_SLOTS}칸)`
    buy.disabled = true
  } else {
    buy.textContent = `슬롯 구매 — ${cost}골드`
    buy.disabled = !canBuy || gold < cost
    buy.addEventListener('click', () => {
      const result = game.buySlot()
      if (result.ok) {
        audio.buy()
      } else {
        toast(result.reason === 'max-slots' ? '슬롯은 최대다' : '골드가 부족하다')
        audio.deny()
      }
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

    const name = document.createElement('span')
    name.className = 'name'
    name.textContent = `${def.name}${t.awakened ? ' ★' : ''}`

    const meta = document.createElement('span')
    meta.className = 'meta'
    meta.textContent = `${tierLabel(def.tier)} · 사거리 ${def.range}`

    info.append(creatureIcon(def.role, def.tier, t.awakened, 30), name, meta)
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
  // 확률표를 도감 앞에 둔다 — "무엇이 있나"보다 "무엇이 나올 확률인가"가
  // 뽑기 버튼을 누르기 직전에 필요한 정보다.
  const odds = document.createElement('div')
  odds.className = 'odds'
  renderOdds(odds, game.wave)
  sheetBody.appendChild(odds)

  const divider = document.createElement('div')
  divider.className = 'sheet-divider'
  sheetBody.appendChild(divider)

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

/** 값이 바뀔 때만 튀게 한다 — 매 프레임 애니메이션을 다시 걸면 아예 안 보인다 */
function setStat(el: HTMLElement, value: string): void {
  if (el.textContent === value) return
  el.textContent = value
  el.classList.remove('bump')
  void el.offsetWidth
  el.classList.add('bump')
}

function updateHud(): void {
  const gold = Math.floor(game.gold)
  setStat(statWave, String(game.wave))
  setStat(statLife, String(game.life))
  setStat(statGold, String(gold))

  const inPrep = game.phase === 'prep' && game.over === 'none'

  if (game.over === 'defeat') startBtn.textContent = '패배'
  else if (game.over === 'victory') startBtn.textContent = '승리'
  else if (game.phase === 'prep') startBtn.textContent = `준비 ${Math.ceil(game.phaseTimer)}초 ▶`
  else if (game.phase === 'settle') startBtn.textContent = '정산'
  else startBtn.textContent = `전투 · ${game.enemies.length + game.spawnsRemaining}`

  startBtn.disabled = !inPrep
  startBtn.classList.toggle('ready', inPrep)
  // 뽑기는 전투 중에도 된다 — 준비 페이즈 전용이던 제한을 풀었다
  // 벤치 정원이 없으므로 뽑기를 막는 건 골드뿐이다
  drawBtn.disabled = !game.canOperate() || gold < GACHA_COST

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

  // 관찰자가 프레임 간 차이로 이벤트를 뽑고, 렌더러와 오디오가 **같은 이벤트**를 쓴다.
  // 양쪽에서 따로 diff 하면 두 로직이 반드시 어긋난다.
  const events = observer.observe(game)
  audio.applyEvents(events)

  // 진동은 **아껴 쓴다** — 손에 계속 울리면 금방 거슬리고 배터리도 먹는다.
  // 판단이 걸린 순간(라이프가 깎였다 / 보스가 왔다)에만 준다.
  if (events.coreHit) vibration.buzz(VIBRATE.coreHit)
  else if (events.enemySpawns.some((s) => s.type === 'boss')) vibration.buzz(VIBRATE.bossSpawn)
  if (events.over === 'defeat') vibration.buzz(VIBRATE.defeat)

  // BGM 은 곡을 바꾸지 않고 레이어만 켠다 — 준비↔전투가 매 웨이브 일어나므로
  // 곡이 바뀌면 그때마다 끊겨서 오히려 산만하다
  if (running) audio.setScene(game.phase === 'battle' ? 'battle' : 'prep')
  audio.tick()

  // 이펙트는 실제 경과 시간으로 돌린다 — 시뮬은 고정 스텝이지만 연출은 그럴 이유가 없다
  renderer.draw(game, { selectedTowerUid }, elapsed, events)

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
