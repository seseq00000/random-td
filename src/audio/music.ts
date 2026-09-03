import { hz } from './synth.js'

/**
 * 절차적 BGM.
 *
 * 오디오 파일이 없으므로 음을 코드로 찍는다. 짧은 루프를 **미리 스케줄링**해서
 * `setTimeout` 의 지터가 박자에 새지 않게 한다 (Web Audio 의 표준 lookahead 방식).
 *
 * 인게임은 **곡을 바꾸지 않고 레이어만 켠다.** 준비 → 전투 전환이 매 웨이브 일어나는데
 * 곡이 바뀌면 그때마다 끊겨서 오히려 산만해진다.
 */

export type MusicScene = 'lobby' | 'prep' | 'battle' | 'off'

/** 한 박(초). 느긋한 템포 — 게임 화면이 이미 바쁘다. */
const BEAT = 0.5
/** 한 마디 = 8박 */
const BAR = BEAT * 8
/** 이만큼 앞서 예약해둔다 */
const LOOKAHEAD = 0.6

/**
 * 조성은 A 마이너 펜타토닉. 어떤 음을 섞어도 안 부딪혀서
 * 절차적으로 찍어도 "틀린 음"이 안 나온다.
 */
const PENTA = [0, 3, 5, 7, 10]

/** 로비 — 잔잔한 아르페지오. 두 마디마다 근음이 바뀐다. */
const LOBBY_ROOTS = [-12, -10, -15, -10]
/** 인게임 — 같은 조성, 조금 더 어둡게 */
const GAME_ROOTS = [-12, -12, -15, -14]

export class Music {
  private scene: MusicScene = 'off'
  /** 다음으로 예약할 마디의 시작 시각 */
  private nextBarAt = 0
  private bar = 0

  constructor(
    private readonly ctx: AudioContext,
    private readonly dest: AudioNode,
  ) {}

  setScene(scene: MusicScene): void {
    if (this.scene === scene) return
    const wasOff = this.scene === 'off'
    this.scene = scene
    if (scene === 'off') return
    if (wasOff) {
      // 처음 켤 때만 박자를 다시 잡는다. 준비↔전투는 흐름을 이어간다.
      this.nextBarAt = this.ctx.currentTime + 0.1
      this.bar = 0
    }
  }

  stop(): void {
    this.scene = 'off'
  }

  /** 매 프레임 호출. 앞으로 LOOKAHEAD 안에 들어온 마디를 예약한다. */
  tick(): void {
    if (this.scene === 'off') return
    const now = this.ctx.currentTime
    if (this.nextBarAt < now) this.nextBarAt = now + 0.05

    while (this.nextBarAt < now + LOOKAHEAD) {
      this.scheduleBar(this.nextBarAt, this.bar)
      this.nextBarAt += BAR
      this.bar++
    }
  }

  private scheduleBar(at: number, bar: number): void {
    const lobby = this.scene === 'lobby'
    const roots = lobby ? LOBBY_ROOTS : GAME_ROOTS
    const root = roots[Math.floor(bar / 2) % roots.length]!

    // ── 베이스: 마디 첫 박에 길게 한 음 ──
    this.note(at, hz(root - 12), BEAT * 6, lobby ? 0.16 : 0.2, 'sine')

    // ── 아르페지오: 펜타토닉을 오르내린다 ──
    // 로비는 성기게(2박마다), 전투는 촘촘하게(1박마다) — 같은 곡의 밀도만 바꾼다
    const step = lobby ? 2 : this.scene === 'battle' ? 1 : 2
    for (let b = 0; b < 8; b += step) {
      const deg = PENTA[(bar * 3 + b) % PENTA.length]!
      const oct = b % 4 === 0 ? 0 : 12
      this.note(at + b * BEAT, hz(root + deg + oct), BEAT * 1.4, lobby ? 0.1 : 0.11, 'triangle')
    }

    if (this.scene === 'battle') {
      // 전투에서만 얹는 레이어 — 곡을 바꾸지 않고 긴박함만 더한다
      for (let b = 0; b < 8; b += 2) {
        this.note(at + b * BEAT, hz(root - 24), BEAT * 0.5, 0.13, 'square')
      }
      // 5도 패드 — 두께
      this.note(at, hz(root + 7), BAR * 0.9, 0.06, 'sawtooth')
    }
  }

  private note(
    at: number,
    freq: number,
    dur: number,
    peak: number,
    type: OscillatorType,
  ): void {
    const { ctx } = this
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.value = freq

    // 저역이 뭉치면 효과음이 안 들린다 — BGM 은 위쪽을 깎아 자리를 비워준다
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 1800

    const gain = ctx.createGain()
    const g = gain.gain
    g.setValueAtTime(0.0001, at)
    g.exponentialRampToValueAtTime(peak, at + 0.04)
    g.exponentialRampToValueAtTime(0.0001, at + dur)

    osc.connect(filter).connect(gain).connect(this.dest)
    osc.start(at)
    osc.stop(at + dur + 0.05)
  }
}
