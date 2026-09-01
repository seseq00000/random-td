/**
 * 파티클 이펙트.
 *
 * **전부 렌더러 소유다.** core/ 는 이 파일을 모르고, 이펙트는 게임 상태를 바꾸지 않는다 —
 * 시뮬레이터가 이펙트 없이 같은 결과를 내야 하기 때문이다(결정론). 그래서 파티클은
 * `game` 을 읽지 않고, 렌더러가 프레임 간 차이(HP 감소, 적 소멸)를 관찰해서 만들어 낸다.
 */

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  /** 남은 수명(초) */
  life: number
  maxLife: number
  size: number
  color: string
  /** 중력 계수 — 0 이면 곧게 뻗는다 */
  gravity: number
}

/** 화면이 죽지 않을 상한. 물량 웨이브에서 수십 마리가 동시에 죽어도 프레임을 지킨다. */
const MAX_PARTICLES = 260

export class Effects {
  private particles: Particle[] = []

  /** 처치 순간의 방사형 파열 */
  burst(x: number, y: number, color: string, count = 9, speed = 110): void {
    const base = Math.random() * Math.PI * 2
    for (let i = 0; i < count; i++) {
      const a = base + (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4
      const v = speed * (0.55 + Math.random() * 0.75)
      this.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 0.34 + Math.random() * 0.2,
        maxLife: 0.54,
        size: 1.8 + Math.random() * 2.2,
        color,
        gravity: 120,
      })
    }
  }

  /** 피격 순간의 짧은 불꽃. 처치보다 훨씬 작아야 "죽은 것"과 구분된다. */
  spark(x: number, y: number, color = '#ffe9a0'): void {
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2
      const v = 45 + Math.random() * 55
      this.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 0.13 + Math.random() * 0.08,
        maxLife: 0.21,
        size: 1.2 + Math.random() * 1.3,
        color,
        gravity: 0,
      })
    }
  }

  /** 코어가 뚫렸을 때 — 크고 느리게 퍼진다 */
  coreBreach(x: number, y: number): void {
    this.burst(x, y, '#ff8a8a', 16, 170)
  }

  private push(p: Particle): void {
    if (this.particles.length >= MAX_PARTICLES) return
    this.particles.push(p)
  }

  update(dt: number): void {
    if (this.particles.length === 0) return
    const alive: Particle[] = []
    for (const p of this.particles) {
      p.life -= dt
      if (p.life <= 0) continue
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += p.gravity * dt
      // 공기저항 — 없으면 파편이 끝까지 같은 속도로 날아가 부자연스럽다
      p.vx *= 1 - 2.2 * dt
      p.vy *= 1 - 2.2 * dt
      alive.push(p)
    }
    this.particles = alive
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.particles.length === 0) return
    ctx.save()
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife))
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  clear(): void {
    this.particles = []
  }
}
