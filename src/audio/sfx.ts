import type { Role } from '../core/types.js'
import { hz, noise, sequence, tone } from './synth.js'

/**
 * 효과음 정의. **음색을 손볼 땐 이 파일만 고친다.**
 *
 * 각 함수는 `(ctx, dest, at)` 을 받아 그 시각에 소리를 예약한다.
 * 상태를 갖지 않으므로 몇 개가 겹쳐도 서로 간섭하지 않는다 —
 * 겹침 관리(음성 수 제한·스로틀)는 `engine.ts` 가 맡는다.
 */

export type SfxFn = (ctx: BaseAudioContext, dest: AudioNode, at: number) => void

// ── 타워 발사: 역할 5종을 전부 다르게 ────────────────────────
// 투사체 모양(render/projectiles.ts)과 짝을 맞춘다. 총알은 짧고, 포탄은 낮고,
// 화살은 스치고, 고드름은 맑고, 가시는 쉭 — **눈으로 본 것과 귀로 들은 것이 같아야 한다.**

/** 총알 — 짧고 마른 틱. 공속이 제일 빨라서 제일 짧아야 한다. */
const fireSingle: SfxFn = (ctx, dest, at) => {
  noise(ctx, dest, at, { freq: 2400, toFreq: 1200, q: 1.6, attack: 0.001, decay: 0.05, peak: 0.5 })
  tone(ctx, dest, at, { type: 'square', freq: 880, toFreq: 420, attack: 0.001, decay: 0.04, peak: 0.16 })
}

/** 포탄 — 낮은 펑. 느리고 무겁다. */
const fireSplash: SfxFn = (ctx, dest, at) => {
  tone(ctx, dest, at, { type: 'sine', freq: 180, toFreq: 55, attack: 0.004, decay: 0.22, peak: 0.55 })
  noise(ctx, dest, at, { freq: 420, toFreq: 140, q: 0.8, attack: 0.002, decay: 0.16, peak: 0.32 })
}

/** 화살 — 스치는 바람. 사거리가 제일 길어서 "멀리 간다"가 들려야 한다. */
const fireSniper: SfxFn = (ctx, dest, at) => {
  noise(ctx, dest, at, { freq: 900, toFreq: 5200, q: 2.4, attack: 0.006, decay: 0.13, peak: 0.34 })
}

/** 고드름 — 맑은 유리. 슬로우 링과 같은 "차가운" 인상을 소리로 옮긴다. */
const fireControl: SfxFn = (ctx, dest, at) => {
  tone(ctx, dest, at, { type: 'triangle', freq: hz(28), attack: 0.002, decay: 0.3, peak: 0.3 })
  // 배음을 하나 얹으면 금속·유리 느낌이 난다
  tone(ctx, dest, at, { type: 'sine', freq: hz(40), attack: 0.002, decay: 0.18, peak: 0.14 })
}

/** 가시 — 짧은 쉭. 가늘고 날카롭다. */
const firePierce: SfxFn = (ctx, dest, at) => {
  noise(ctx, dest, at, { freq: 3600, toFreq: 1800, q: 3, attack: 0.002, decay: 0.08, peak: 0.36 })
}

const FIRE_BY_ROLE: Record<Role, SfxFn | null> = {
  single: fireSingle,
  splash: fireSplash,
  sniper: fireSniper,
  control: fireControl,
  pierce: firePierce,
  buff: null, // 공격하지 않는다
}

export function fireSfx(role: Role): SfxFn | null {
  return FIRE_BY_ROLE[role]
}

// ── 전투 ─────────────────────────────────────────────────

/**
 * 적 피격 — 아주 짧고 작다.
 * 초당 수십 번 울리는 소리라 **여기서 크면 다른 소리가 전부 묻힌다.**
 */
export const hitSfx: SfxFn = (ctx, dest, at) => {
  noise(ctx, dest, at, { freq: 1600, toFreq: 900, q: 1, attack: 0.001, decay: 0.03, peak: 0.16 })
}

/** 적 처치 — 파열 + 하강. "터졌다"가 읽혀야 한다. */
export const killSfx: SfxFn = (ctx, dest, at) => {
  noise(ctx, dest, at, { freq: 1100, toFreq: 260, q: 0.7, attack: 0.001, decay: 0.14, peak: 0.4 })
  tone(ctx, dest, at, { type: 'triangle', freq: 340, toFreq: 90, attack: 0.001, decay: 0.13, peak: 0.22 })
}

/** 보스 처치 — 더 낮고 길게. 잡은 보람이 있어야 한다. */
export const bossKillSfx: SfxFn = (ctx, dest, at) => {
  noise(ctx, dest, at, { freq: 700, toFreq: 90, q: 0.6, attack: 0.002, decay: 0.5, peak: 0.6 })
  tone(ctx, dest, at, { type: 'sawtooth', freq: 160, toFreq: 40, attack: 0.002, decay: 0.5, peak: 0.34 })
  sequence(ctx, dest, at + 0.06, [hz(-5), hz(-12)], 0.09, {
    type: 'triangle',
    attack: 0.005,
    decay: 0.3,
    peak: 0.22,
  })
}

/** 보스 등장 — 낮은 드론. 화면을 보기 전에 귀로 먼저 안다. */
export const bossSpawnSfx: SfxFn = (ctx, dest, at) => {
  tone(ctx, dest, at, { type: 'sawtooth', freq: hz(-29), toFreq: hz(-24), attack: 0.05, decay: 0.9, peak: 0.4 })
  tone(ctx, dest, at, { type: 'sine', freq: hz(-36), attack: 0.04, decay: 1.0, peak: 0.34 })
  noise(ctx, dest, at + 0.02, { freq: 260, toFreq: 80, q: 0.5, attack: 0.02, decay: 0.6, peak: 0.18 })
}

/** 도전 보스 — 내가 부른 것. 한 옥타브 더 낮게 눌러서 "더 큰 게 왔다"로 만든다. */
export const challengeBossSpawnSfx: SfxFn = (ctx, dest, at) => {
  tone(ctx, dest, at, { type: 'sawtooth', freq: hz(-41), toFreq: hz(-36), attack: 0.06, decay: 1.3, peak: 0.5 })
  tone(ctx, dest, at, { type: 'square', freq: hz(-48), attack: 0.05, decay: 1.3, peak: 0.26 })
  noise(ctx, dest, at + 0.03, { freq: 180, toFreq: 60, q: 0.5, attack: 0.03, decay: 0.9, peak: 0.22 })
}

/** 코어 피격 — 라이프가 깎였다. 화면 흔들림과 같이 온다. */
export const coreHitSfx: SfxFn = (ctx, dest, at) => {
  tone(ctx, dest, at, { type: 'sine', freq: 140, toFreq: 42, attack: 0.002, decay: 0.4, peak: 0.75 })
  noise(ctx, dest, at, { freq: 320, toFreq: 100, q: 0.6, attack: 0.001, decay: 0.28, peak: 0.42 })
  // 경고 — 두 음이 부딪혀 불안하게 들린다
  tone(ctx, dest, at + 0.04, { type: 'square', freq: hz(-13), attack: 0.005, decay: 0.22, peak: 0.16 })
  tone(ctx, dest, at + 0.04, { type: 'square', freq: hz(-12), attack: 0.005, decay: 0.22, peak: 0.14 })
}

// ── 페이즈 ───────────────────────────────────────────────

/** 웨이브 시작 — 상승. "온다"는 신호다. */
export const waveStartSfx: SfxFn = (ctx, dest, at) => {
  sequence(ctx, dest, at, [hz(-12), hz(-5), hz(0)], 0.075, {
    type: 'triangle',
    attack: 0.004,
    decay: 0.18,
    peak: 0.34,
  })
  noise(ctx, dest, at, { freq: 300, toFreq: 1800, q: 1.4, attack: 0.03, decay: 0.25, peak: 0.16 })
}

/** 웨이브 클리어 — 짧은 상승 3음. 자주 울리므로 길면 방해가 된다. */
export const waveClearSfx: SfxFn = (ctx, dest, at) => {
  sequence(ctx, dest, at, [hz(0), hz(4), hz(7)], 0.07, {
    type: 'triangle',
    attack: 0.004,
    decay: 0.2,
    peak: 0.3,
  })
}

export const victorySfx: SfxFn = (ctx, dest, at) => {
  sequence(ctx, dest, at, [hz(0), hz(4), hz(7), hz(12), hz(16), hz(19)], 0.11, {
    type: 'triangle',
    attack: 0.006,
    decay: 0.42,
    peak: 0.4,
  })
}

export const defeatSfx: SfxFn = (ctx, dest, at) => {
  sequence(ctx, dest, at, [hz(0), hz(-3), hz(-8), hz(-15)], 0.16, {
    type: 'sawtooth',
    attack: 0.01,
    decay: 0.5,
    peak: 0.3,
  })
}

// ── UI ───────────────────────────────────────────────────

/** 뽑기 — 짧은 팝. 연타하는 버튼이라 가벼워야 한다. */
export const drawSfx: SfxFn = (ctx, dest, at) => {
  tone(ctx, dest, at, { type: 'sine', freq: 620, toFreq: 1180, attack: 0.002, decay: 0.09, peak: 0.34 })
}

/** 합성 — 상승 아르페지오. "올라갔다"가 들려야 한다. */
export const mergeSfx: SfxFn = (ctx, dest, at) => {
  sequence(ctx, dest, at, [hz(0), hz(7), hz(12), hz(19)], 0.055, {
    type: 'triangle',
    attack: 0.003,
    decay: 0.22,
    peak: 0.3,
  })
}

/**
 * 상위 등급 축하 — 티어가 높을수록 길고 화려하다.
 * `celebrationText` 와 같은 기준(T3+)에서만 울린다.
 */
export function celebrateSfx(tier: number): SfxFn {
  return (ctx, dest, at) => {
    const extra = Math.max(0, tier - 3)
    const notes = [hz(0), hz(4), hz(7), hz(12)]
    for (let i = 0; i < extra; i++) notes.push(hz(16 + i * 3))
    sequence(ctx, dest, at, notes, 0.085, {
      type: 'triangle',
      attack: 0.005,
      decay: 0.38,
      peak: 0.36,
    })
    // 반짝임 — 등급이 높을수록 더 얹는다
    for (let i = 0; i <= extra; i++) {
      tone(ctx, dest, at + 0.05 + i * 0.09, {
        type: 'sine',
        freq: hz(24 + i * 4),
        attack: 0.003,
        decay: 0.3,
        peak: 0.14,
      })
    }
  }
}

/** 슬롯 구매 — 동전 찰칵 */
export const buySfx: SfxFn = (ctx, dest, at) => {
  tone(ctx, dest, at, { type: 'square', freq: hz(19), attack: 0.002, decay: 0.08, peak: 0.22 })
  tone(ctx, dest, at + 0.05, { type: 'square', freq: hz(24), attack: 0.002, decay: 0.12, peak: 0.2 })
}

/** 배치 — 짧은 툭. 자주 누르므로 조용하다. */
export const placeSfx: SfxFn = (ctx, dest, at) => {
  tone(ctx, dest, at, { type: 'sine', freq: 300, toFreq: 180, attack: 0.002, decay: 0.09, peak: 0.28 })
  noise(ctx, dest, at, { freq: 900, toFreq: 400, q: 1, attack: 0.001, decay: 0.05, peak: 0.14 })
}

/** 거절 — 골드 부족·자리 없음 */
export const denySfx: SfxFn = (ctx, dest, at) => {
  tone(ctx, dest, at, { type: 'square', freq: 220, toFreq: 150, attack: 0.003, decay: 0.13, peak: 0.2 })
}
