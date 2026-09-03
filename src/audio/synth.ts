/**
 * Web Audio 프리미티브.
 *
 * **오디오 파일이 0개다.** 이 프로젝트가 이미지 없이 동물 42종을 그리는 것과 같은 방식으로,
 * 소리도 전부 여기서 합성한다 — 라이선스 문제가 없고 번들이 안 늘고 음색을 코드로 튜닝한다.
 *
 * 이 파일은 **소리의 재료**만 만든다. "무슨 소리인가"는 `sfx.ts` 가 정한다.
 */

/** 노이즈 버퍼는 만드는 게 비싸다 — 컨텍스트당 한 번만 만들어 재사용한다. */
const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>()

export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = noiseCache.get(ctx)
  if (cached) return cached

  const len = Math.floor(ctx.sampleRate * 0.5)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  noiseCache.set(ctx, buf)
  return buf
}

export interface EnvelopeSpec {
  /** 최고 음량까지 걸리는 시간(초). 0 에 가까울수록 타격감이 산다 */
  attack: number
  /** 사라지는 데 걸리는 시간(초) */
  decay: number
  /** 최고 음량 (0~1) */
  peak: number
}

/**
 * 게인 노드에 ADSR 대신 **AD** 만 건다.
 *
 * 게임 효과음은 눌렀다 떼는 악기가 아니라 "한 번 터지고 사라지는" 소리라
 * sustain/release 가 필요 없다. 단순할수록 겹칠 때 덜 지저분하다.
 */
export function envelope(
  ctx: BaseAudioContext,
  at: number,
  spec: EnvelopeSpec,
): GainNode {
  const gain = ctx.createGain()
  const g = gain.gain
  g.setValueAtTime(0.0001, at)
  g.exponentialRampToValueAtTime(Math.max(0.0001, spec.peak), at + Math.max(0.001, spec.attack))
  // 0 으로 가는 지수 램프는 규격상 불가라 아주 작은 값으로 떨어뜨린 뒤 끊는다
  g.exponentialRampToValueAtTime(0.0001, at + spec.attack + spec.decay)
  return gain
}

export interface ToneSpec extends EnvelopeSpec {
  type: OscillatorType
  /** 시작 주파수(Hz) */
  freq: number
  /** 끝 주파수(Hz). 생략하면 고정음 */
  toFreq?: number
}

/** 음정이 있는 소리 한 방. 하강 스윕을 주면 "떨어지는" 인상이 된다. */
export function tone(
  ctx: BaseAudioContext,
  dest: AudioNode,
  at: number,
  spec: ToneSpec,
): void {
  const osc = ctx.createOscillator()
  osc.type = spec.type
  osc.frequency.setValueAtTime(spec.freq, at)
  if (spec.toFreq !== undefined && spec.toFreq !== spec.freq) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(1, spec.toFreq),
      at + spec.attack + spec.decay,
    )
  }
  const env = envelope(ctx, at, spec)
  osc.connect(env).connect(dest)
  osc.start(at)
  osc.stop(at + spec.attack + spec.decay + 0.02)
}

export interface NoiseSpec extends EnvelopeSpec {
  /** 밴드패스 중심 주파수 */
  freq: number
  /** 끝 주파수 — 스윕하면 "휙" 소리가 된다 */
  toFreq?: number
  /** Q 값. 높을수록 좁고 삐 소리에 가까워진다 */
  q?: number
}

/** 음정 없는 소리 — 타격·파열·바람. 필터로 성격을 준다. */
export function noise(
  ctx: BaseAudioContext,
  dest: AudioNode,
  at: number,
  spec: NoiseSpec,
): void {
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(ctx)
  // 같은 버퍼를 매번 같은 지점부터 읽으면 반복이 귀에 걸린다
  const dur = spec.attack + spec.decay
  const offset = Math.random() * Math.max(0, (src.buffer.duration - dur) * 0.9)

  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = spec.q ?? 1.2
  filter.frequency.setValueAtTime(spec.freq, at)
  if (spec.toFreq !== undefined && spec.toFreq !== spec.freq) {
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, spec.toFreq), at + dur)
  }

  const env = envelope(ctx, at, spec)
  src.connect(filter).connect(env).connect(dest)
  src.start(at, offset, dur + 0.05)
  src.stop(at + dur + 0.05)
}

/** 음 여러 개를 순서대로 — 팡파르·아르페지오용 */
export function sequence(
  ctx: BaseAudioContext,
  dest: AudioNode,
  at: number,
  freqs: readonly number[],
  step: number,
  spec: Omit<ToneSpec, 'freq'>,
): void {
  for (let i = 0; i < freqs.length; i++) {
    tone(ctx, dest, at + i * step, { ...spec, freq: freqs[i]! })
  }
}

/** 반음 단위 음정 → Hz (A4 = 440) */
export function hz(semitonesFromA4: number): number {
  return 440 * Math.pow(2, semitonesFromA4 / 12)
}
