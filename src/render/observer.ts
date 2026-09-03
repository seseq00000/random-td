import type { Game } from '../core/gameState.js'
import type { EnemyType, Role, Vec2 } from '../core/types.js'
import { getUnit } from '../data/units.js'

/**
 * 게임 상태를 프레임마다 **관찰해서** 이벤트를 뽑아낸다.
 *
 * `core/` 에 "방금 맞았다" 같은 연출용 필드를 넣지 않기 위한 장치다.
 * 한 번 허용하면 `Enemy.hitFlash`, `Tower.justFired`, … 가 계속 쌓이고
 * 시뮬레이터가 쓰지도 않는 필드를 들고 다니게 된다.
 *
 * **읽기만 한다.** 게임 상태를 절대 바꾸지 않으므로 결정론에 영향이 없고,
 * 시뮬레이터는 이 파일을 아예 로드하지 않는다.
 *
 * 렌더러(파티클)와 오디오(효과음)가 **같은 이벤트를 공유**한다 —
 * 양쪽에서 따로 diff 하면 두 로직이 반드시 어긋난다.
 */

export interface EnemyHitEvent {
  uid: number
  pos: Vec2
}

export interface EnemyDeathEvent {
  uid: number
  pos: Vec2
  type: EnemyType
  challengeBoss: boolean
}

export interface EnemySpawnEvent {
  type: EnemyType
  challengeBoss: boolean
}

export interface TowerFireEvent {
  uid: number
  role: Role
}

export interface ProjectileHitEvent {
  pos: Vec2
  role: Role
}

export interface FrameEvents {
  enemyHits: EnemyHitEvent[]
  enemyDeaths: EnemyDeathEvent[]
  enemySpawns: EnemySpawnEvent[]
  towerFires: TowerFireEvent[]
  projectileHits: ProjectileHitEvent[]
  /** 코어가 이번 프레임에 뚫렸는가 (상승 엣지) */
  coreHit: boolean
  /** 전투로 들어간 웨이브 번호. 아니면 null */
  waveStarted: number | null
  /** 정산으로 넘어간 웨이브 번호. 아니면 null */
  waveCleared: number | null
  /** 판이 이번 프레임에 끝났는가 */
  over: 'defeat' | 'victory' | null
}

function emptyEvents(): FrameEvents {
  return {
    enemyHits: [],
    enemyDeaths: [],
    enemySpawns: [],
    towerFires: [],
    projectileHits: [],
    coreHit: false,
    waveStarted: null,
    waveCleared: null,
    over: null,
  }
}

export class GameObserver {
  private prevHp = new Map<number, number>()
  private prevPos = new Map<number, Vec2>()
  private prevType = new Map<number, EnemyType>()
  private prevChallenge = new Map<number, boolean>()
  private prevCooldown = new Map<number, number>()
  /** 투사체 직전 위치 + 역할. 역할은 착탄 파편·효과음을 투사체와 맞추는 데 쓴다. */
  private prevProjectile = new Map<number, { pos: Vec2; role: Role }>()
  private prevCoreFlash = 0
  private prevPhase: string | null = null
  private prevOver: 'none' | 'defeat' | 'victory' = 'none'

  /** 새 판을 시작할 때. 이전 판의 uid 가 남아 있으면 엉뚱한 이벤트가 튄다. */
  reset(): void {
    this.prevHp.clear()
    this.prevPos.clear()
    this.prevType.clear()
    this.prevChallenge.clear()
    this.prevCooldown.clear()
    this.prevProjectile.clear()
    this.prevCoreFlash = 0
    this.prevPhase = null
    this.prevOver = 'none'
  }

  observe(game: Game): FrameEvents {
    const ev = emptyEvents()

    // 코어 피격은 **상승 엣지**에서만. 매 프레임 보면 흔들림이 계속 걸린다.
    if (game.coreFlash > this.prevCoreFlash) ev.coreHit = true
    this.prevCoreFlash = game.coreFlash

    // ── 페이즈 전이 ──
    if (this.prevPhase !== null && game.phase !== this.prevPhase) {
      if (game.phase === 'battle') ev.waveStarted = game.wave
      if (game.phase === 'settle') ev.waveCleared = game.wave
    }
    this.prevPhase = game.phase

    if (game.over !== 'none' && this.prevOver === 'none') ev.over = game.over
    this.prevOver = game.over

    // ── 적: 스폰 / 피격 / 처치 ──
    const live = new Set<number>()
    for (const e of game.enemies) {
      live.add(e.uid)
      const pos = game.enemyPos(e)
      const before = this.prevHp.get(e.uid)

      if (before === undefined) {
        // 처음 보는 uid = 방금 스폰됐다. 보스 등장음이 여기서 나온다.
        ev.enemySpawns.push({ type: e.type, challengeBoss: e.isChallengeBoss })
      } else if (e.hp < before) {
        ev.enemyHits.push({ uid: e.uid, pos })
      }

      this.prevHp.set(e.uid, e.hp)
      this.prevPos.set(e.uid, pos)
      this.prevType.set(e.uid, e.type)
      this.prevChallenge.set(e.uid, e.isChallengeBoss)
    }

    for (const uid of [...this.prevHp.keys()]) {
      if (live.has(uid)) continue
      const pos = this.prevPos.get(uid)
      const type = this.prevType.get(uid)
      if (pos && type) {
        ev.enemyDeaths.push({
          uid,
          pos,
          type,
          challengeBoss: this.prevChallenge.get(uid) ?? false,
        })
      }
      this.prevHp.delete(uid)
      this.prevPos.delete(uid)
      this.prevType.delete(uid)
      this.prevChallenge.delete(uid)
    }

    // ── 타워: 발사 순간 ──
    const towerUids = new Set<number>()
    for (const t of game.towers) {
      towerUids.add(t.uid)
      const before = this.prevCooldown.get(t.uid)
      // 쿨다운이 올라갔다 = 방금 쐈다
      if (before !== undefined && t.cooldown > before) {
        ev.towerFires.push({ uid: t.uid, role: getUnit(t.defId).role })
      }
      this.prevCooldown.set(t.uid, t.cooldown)
    }
    for (const uid of [...this.prevCooldown.keys()]) {
      if (!towerUids.has(uid)) this.prevCooldown.delete(uid)
    }

    // ── 투사체: 사라진 = 착탄 ──
    const projUids = new Set<number>()
    for (const p of game.projectiles) projUids.add(p.uid)
    for (const [uid, prev] of [...this.prevProjectile]) {
      if (projUids.has(uid)) continue
      ev.projectileHits.push({ pos: prev.pos, role: prev.role })
      this.prevProjectile.delete(uid)
    }
    for (const p of game.projectiles) {
      this.prevProjectile.set(p.uid, {
        pos: { x: p.x, y: p.y },
        role: getUnit(p.sourceDefId).role,
      })
    }

    return ev
  }
}
