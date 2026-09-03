import type { Role } from '../core/types.js'
import type { FrameEvents } from '../render/observer.js'
import { Music, type MusicScene } from './music.js'
import {
  bossKillSfx,
  bossSpawnSfx,
  buySfx,
  celebrateSfx,
  challengeBossSpawnSfx,
  coreHitSfx,
  defeatSfx,
  denySfx,
  drawSfx,
  fireSfx,
  hitSfx,
  killSfx,
  mergeSfx,
  placeSfx,
  victorySfx,
  waveClearSfx,
  waveStartSfx,
  type SfxFn,
} from './sfx.js'

/**
 * 오디오 엔진.
 *
 * **`import` 만으로 `AudioContext` 를 만들지 않는다.** vitest 는 node 환경이라
 * 모듈을 읽는 순간 터진다. 컨텍스트는 첫 사용자 제스처(`unlock()`)에서 lazy 생성한다.
 *
 * 게임 상태를 절대 건드리지 않는다 — 소리가 결과를 바꾸면 시뮬레이터가 무의미해진다.
 */

/** 동시에 울릴 수 있는 소리 수. `effects.ts` 의 MAX_PARTICLES 와 같은 규율이다. */
const MAX_VOICES = 16

/**
 * 소리별 최소 간격(초).
 *
 * 물량 웨이브는 30마리가 0.7초 간격으로 스폰되고 여러 마리가 동시에 죽는다.
 * 제한이 없으면 소리가 뭉개지고 CPU 가 튄다 — 화면의 파티클 상한과 같은 이유다.
 */
const THROTTLE: Record<string, number> = {
  hit: 0.045,
  kill: 0.06,
  'fire:single': 0.035,
  'fire:splash': 0.05,
  'fire:sniper': 0.035,
  'fire:control': 0.05,
  'fire:pierce': 0.05,
}

/** 이 소리들은 음성이 꽉 차도 반드시 낸다 — 놓치면 판단이 틀어진다 */
const ALWAYS = new Set(['core', 'bossSpawn', 'bossKill', 'waveStart', 'waveClear', 'over', 'celebrate'])

export interface AudioSettings {
  muted: boolean
  /** 0~1 */
  volume: number
}

export const DEFAULT_AUDIO: AudioSettings = {
  muted: false,
  // 폰에서 갑자기 크게 나면 놀란다. 낮게 시작하고 필요하면 올린다.
  volume: 0.6,
}

export class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private sfxBus: GainNode | null = null
  private music: Music | null = null

  private settings: AudioSettings = { ...DEFAULT_AUDIO }
  private scene: MusicScene = 'lobby'

  /** 소리별 마지막 재생 시각(컨텍스트 시간) */
  private lastPlayed = new Map<string, number>()
  /** 예약된 소리들의 종료 시각 — 지금 몇 개가 울리는지 세는 데 쓴다 */
  private voiceEnds: number[] = []

  get enabled(): boolean {
    return this.ctx !== null && !this.settings.muted
  }

  get muted(): boolean {
    return this.settings.muted
  }

  /**
   * 첫 사용자 제스처에서 부른다. 브라우저는 제스처 전에는 소리를 막는다.
   *
   * 여러 번 불러도 안전하다 — 이미 열려 있으면 resume 만 시도한다.
   */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return

      const ctx = new Ctor()
      const master = ctx.createGain()
      const sfxBus = ctx.createGain()
      const musicBus = ctx.createGain()

      // BGM 은 효과음보다 낮게 깔린다 — 효과음이 판단 정보라 우선이다
      sfxBus.gain.value = 1
      musicBus.gain.value = 0.38
      sfxBus.connect(master)
      musicBus.connect(master)
      master.connect(ctx.destination)

      this.ctx = ctx
      this.master = master
      this.sfxBus = sfxBus
      this.music = new Music(ctx, musicBus)

      this.applyGain()
      if (ctx.state === 'suspended') void ctx.resume()
      this.music.setScene(this.scene)
    } catch {
      // 오디오를 못 열어도 게임은 계속돼야 한다
      this.ctx = null
    }
  }

  applySettings(settings: AudioSettings): void {
    this.settings = { ...settings }
    this.applyGain()
    if (this.settings.muted) this.music?.stop()
    else this.music?.setScene(this.scene)
  }

  getSettings(): AudioSettings {
    return { ...this.settings }
  }

  toggleMute(): boolean {
    this.applySettings({ ...this.settings, muted: !this.settings.muted })
    return this.settings.muted
  }

  private applyGain(): void {
    if (!this.master || !this.ctx) return
    const target = this.settings.muted ? 0 : this.settings.volume
    // 뚝 끊으면 클릭 잡음이 난다 — 아주 짧게 램프한다
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.02)
  }

  setScene(scene: MusicScene): void {
    this.scene = scene
    if (!this.settings.muted) this.music?.setScene(scene)
  }

  /** 매 프레임 — BGM 스케줄러를 돌린다 */
  tick(): void {
    if (!this.settings.muted) this.music?.tick()
  }

  // ── 재생 ────────────────────────────────────────────────

  private play(key: string, fn: SfxFn, gain = 1): void {
    const ctx = this.ctx
    const bus = this.sfxBus
    if (!ctx || !bus || this.settings.muted) return

    const now = ctx.currentTime

    const minGap = THROTTLE[key]
    if (minGap !== undefined) {
      const last = this.lastPlayed.get(key)
      if (last !== undefined && now - last < minGap) return
    }

    this.voiceEnds = this.voiceEnds.filter((t) => t > now)
    if (this.voiceEnds.length >= MAX_VOICES && !ALWAYS.has(key)) return

    const node = gain === 1 ? bus : ctx.createGain()
    if (node !== bus) {
      ;(node as GainNode).gain.value = gain
      node.connect(bus)
    }

    try {
      fn(ctx, node, now)
    } catch {
      return
    }
    this.lastPlayed.set(key, now)
    // 정확한 길이를 몰라도 된다 — 상한을 세는 게 목적이라 대략이면 충분하다
    this.voiceEnds.push(now + 0.35)
  }

  // ── 전투 이벤트 ──────────────────────────────────────────

  /**
   * 한 프레임의 이벤트를 소리로 옮긴다.
   *
   * **같은 종류가 여러 개면 한 번만 재생하되 조금 크게 한다.** 30마리가 동시에 죽을 때
   * 30번 울리면 소리가 아니라 잡음이 된다.
   */
  applyEvents(ev: FrameEvents): void {
    if (!this.ctx || this.settings.muted) return

    // 보스 등장은 다른 무엇보다 먼저 들려야 한다
    const bossSpawn = ev.enemySpawns.find((s) => s.type === 'boss')
    if (bossSpawn) {
      this.play('bossSpawn', bossSpawn.challengeBoss ? challengeBossSpawnSfx : bossSpawnSfx)
    }

    if (ev.coreHit) this.play('core', coreHitSfx)

    const bossDeath = ev.enemyDeaths.find((d) => d.type === 'boss')
    if (bossDeath) this.play('bossKill', bossKillSfx)

    const normalDeaths = ev.enemyDeaths.filter((d) => d.type !== 'boss').length
    if (normalDeaths > 0) {
      // 동시에 여럿 죽으면 살짝 키워서 "많이 죽었다"를 표현한다 (상한 있음)
      this.play('kill', killSfx, Math.min(1.6, 1 + (normalDeaths - 1) * 0.18))
    }

    if (ev.enemyHits.length > 0) {
      this.play('hit', hitSfx, Math.min(1.4, 1 + (ev.enemyHits.length - 1) * 0.1))
    }

    // 발사음은 역할별로 한 번씩 — 같은 역할 타워 5개가 동시에 쏴도 한 번이다
    const firedRoles = new Set<Role>()
    for (const f of ev.towerFires) firedRoles.add(f.role)
    for (const role of firedRoles) {
      const fn = fireSfx(role)
      if (fn) this.play(`fire:${role}`, fn)
    }

    if (ev.waveStarted !== null) this.play('waveStart', waveStartSfx)
    if (ev.waveCleared !== null) this.play('waveClear', waveClearSfx)
    if (ev.over) this.play('over', ev.over === 'victory' ? victorySfx : defeatSfx)
  }

  // ── UI 이벤트 ────────────────────────────────────────────

  draw(): void {
    this.play('draw', drawSfx)
  }
  merge(): void {
    this.play('merge', mergeSfx)
  }
  celebrate(tier: number): void {
    this.play('celebrate', celebrateSfx(tier))
  }
  buy(): void {
    this.play('buy', buySfx)
  }
  place(): void {
    this.play('place', placeSfx)
  }
  deny(): void {
    this.play('deny', denySfx)
  }
}
