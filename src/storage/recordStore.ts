import type { RunRecord } from '../core/record.js'

/**
 * 기록 저장소. **인터페이스를 먼저 두는 이유**는 지금 localStorage 로 시작하되
 * 나중에 서버 구현을 끼워 넣을 때 UI 코드를 건드리지 않기 위해서다.
 *
 * 동기 API 로 두면 서버 구현에서 async 로 바뀌어 전부 고쳐야 하므로,
 * 처음부터 Promise 를 반환한다.
 */
export interface RecordStore {
  list(): Promise<RunRecord[]>
  add(record: RunRecord): Promise<void>
  clear(): Promise<void>
  /** 마지막으로 쓴 닉네임 — 재방문 시 자동으로 채워준다 */
  getNickname(): Promise<string | null>
  setNickname(nickname: string): Promise<void>
  /**
   * 한 번이라도 보유했던 유닛 id — 도감의 "발견함" 표시용.
   * 판마다 리셋되면 수집하는 맛이 없으므로 **영구 누적**한다.
   */
  getDiscovered(): Promise<string[]>
  addDiscovered(defIds: readonly string[]): Promise<void>
  /**
   * 소리 설정. 뮤트는 **새로고침해도 유지돼야** 한다 —
   * 조용한 데서 껐는데 다시 켜면 그게 제일 짜증나는 일이다.
   */
  getAudio(): Promise<StoredAudio | null>
  setAudio(settings: StoredAudio): Promise<void>
}

export interface StoredAudio {
  muted: boolean
  /** 0~1 */
  volume: number
}

/** 저장 상한. 넘으면 오래된 것부터 버린다 — localStorage 용량은 유한하다. */
export const MAX_RECORDS = 200

const RECORDS_KEY = 'random-td:records:v1'
const NICKNAME_KEY = 'random-td:nickname:v1'
const DISCOVERED_KEY = 'random-td:discovered:v1'
const AUDIO_KEY = 'random-td:audio:v1'

/** 테스트와 SSR 용 인메모리 구현 */
export class MemoryRecordStore implements RecordStore {
  private records: RunRecord[] = []
  private nickname: string | null = null
  private readonly discovered = new Set<string>()
  private audio: StoredAudio | null = null

  async list(): Promise<RunRecord[]> {
    return [...this.records]
  }
  async add(record: RunRecord): Promise<void> {
    this.records.push(record)
    if (this.records.length > MAX_RECORDS) {
      this.records = this.records.slice(-MAX_RECORDS)
    }
  }
  async clear(): Promise<void> {
    this.records = []
  }
  async getNickname(): Promise<string | null> {
    return this.nickname
  }
  async setNickname(nickname: string): Promise<void> {
    this.nickname = nickname
  }
  async getDiscovered(): Promise<string[]> {
    return [...this.discovered]
  }
  async addDiscovered(defIds: readonly string[]): Promise<void> {
    for (const id of defIds) this.discovered.add(id)
  }
  async getAudio(): Promise<StoredAudio | null> {
    return this.audio ? { ...this.audio } : null
  }
  async setAudio(settings: StoredAudio): Promise<void> {
    this.audio = { ...settings }
  }
}

/**
 * localStorage 구현.
 *
 * 저장소가 깨졌거나(수동 편집, 다른 버전) 용량이 찼을 때 게임이 죽으면 안 된다 —
 * 모든 접근을 try/catch 로 감싸고 실패하면 "기록 없음"으로 취급한다.
 */
export class LocalRecordStore implements RecordStore {
  constructor(private readonly storage: Storage) {}

  async list(): Promise<RunRecord[]> {
    const raw = this.read(RECORDS_KEY)
    if (!raw) return []
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter(isRunRecord)
    } catch {
      return []
    }
  }

  async add(record: RunRecord): Promise<void> {
    const all = await this.list()
    all.push(record)
    const trimmed = all.length > MAX_RECORDS ? all.slice(-MAX_RECORDS) : all
    this.write(RECORDS_KEY, JSON.stringify(trimmed))
  }

  async clear(): Promise<void> {
    this.remove(RECORDS_KEY)
  }

  async getNickname(): Promise<string | null> {
    return this.read(NICKNAME_KEY)
  }

  async setNickname(nickname: string): Promise<void> {
    this.write(NICKNAME_KEY, nickname)
  }

  async getDiscovered(): Promise<string[]> {
    const raw = this.read(DISCOVERED_KEY)
    if (!raw) return []
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter((v): v is string => typeof v === 'string')
    } catch {
      return []
    }
  }

  async getAudio(): Promise<StoredAudio | null> {
    const raw = this.read(AUDIO_KEY)
    if (!raw) return null
    try {
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null) return null
      const a = parsed as Record<string, unknown>
      if (typeof a.muted !== 'boolean' || typeof a.volume !== 'number') return null
      // 손댄 값이 들어와도 스피커가 터지면 안 된다
      return { muted: a.muted, volume: Math.max(0, Math.min(1, a.volume)) }
    } catch {
      return null
    }
  }

  async setAudio(settings: StoredAudio): Promise<void> {
    this.write(AUDIO_KEY, JSON.stringify(settings))
  }

  /** 합집합으로 누적한다 — 같은 유닛을 다시 봐도 중복이 쌓이지 않는다. */
  async addDiscovered(defIds: readonly string[]): Promise<void> {
    if (defIds.length === 0) return
    const merged = new Set(await this.getDiscovered())
    for (const id of defIds) merged.add(id)
    this.write(DISCOVERED_KEY, JSON.stringify([...merged]))
  }

  private read(key: string): string | null {
    try {
      return this.storage.getItem(key)
    } catch {
      return null
    }
  }
  private write(key: string, value: string): void {
    try {
      this.storage.setItem(key, value)
    } catch {
      // 용량 초과 등 — 기록을 못 남겨도 게임은 계속돼야 한다
    }
  }
  private remove(key: string): void {
    try {
      this.storage.removeItem(key)
    } catch {
      /* 위와 같음 */
    }
  }
}

/**
 * 저장된 값이 우리가 아는 모양인지 확인한다.
 * 스키마가 바뀌거나 사람이 손댄 데이터가 들어와도 조용히 걸러진다.
 */
function isRunRecord(value: unknown): value is RunRecord {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    typeof r.nickname === 'string' &&
    typeof r.playedAt === 'number' &&
    typeof r.seed === 'number' &&
    typeof r.reachedWave === 'number' &&
    typeof r.cleared === 'boolean' &&
    typeof r.life === 'number'
  )
}

/** 브라우저면 localStorage, 아니면 인메모리 */
export function createRecordStore(): RecordStore {
  try {
    if (typeof localStorage !== 'undefined') return new LocalRecordStore(localStorage)
  } catch {
    /* 사생활 보호 모드 등에서 접근 자체가 던질 수 있다 */
  }
  return new MemoryRecordStore()
}
