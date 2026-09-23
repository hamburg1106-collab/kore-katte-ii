import type { Asset, FixedCost, LifeEvent, Profile } from '../types'

/**
 * 取り込み・書き出しで使う形。
 *
 * 実物は seed.local.json（.gitignore済み）にある。リポジトリには入れない。
 */
export type Seed = {
  profile: Partial<Profile>
  fixed: Omit<FixedCost, 'id'>[]
  events: Omit<LifeEvent, 'id'>[]
  assets: { name: string; kind: Asset['kind']; balance: number }[]
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * 貼り付けられた文字列をSeedとして読む。
 *
 * 壊れたJSONを黙って取り込むと、何が入ったか分からないまま残高が狂う。
 * 足りない項目があればその場で理由を返して、書き込みは一切しない。
 */
export const parseSeed = (text: string): { ok: true; seed: Seed } | { ok: false; error: string } => {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'JSONとして読めませんでした。全文を貼れているか確認してください。' }
  }
  if (!isObj(raw)) return { ok: false, error: '中身がオブジェクトではありません。' }

  const { profile, fixed, events, assets } = raw
  if (!isObj(profile)) return { ok: false, error: 'profile がありません。' }
  if (!Array.isArray(fixed)) return { ok: false, error: 'fixed がありません。' }
  if (!Array.isArray(events)) return { ok: false, error: 'events がありません。' }
  if (!Array.isArray(assets)) return { ok: false, error: 'assets がありません。' }

  for (const f of fixed) {
    if (!isObj(f) || typeof f.name !== 'string' || typeof f.amount !== 'number') {
      return { ok: false, error: 'fixed の中に name か amount が無い行があります。' }
    }
  }
  for (const a of assets) {
    if (!isObj(a) || typeof a.name !== 'string' || typeof a.balance !== 'number') {
      return { ok: false, error: 'assets の中に name か balance が無い行があります。' }
    }
  }

  return { ok: true, seed: raw as unknown as Seed }
}

/** いまFirestoreにある内容を、そのまま取り込める形で書き出す。バックアップ用 */
export const buildSeed = (
  profile: Profile,
  fixed: FixedCost[],
  events: LifeEvent[],
  assets: Asset[],
): string =>
  JSON.stringify(
    {
      profile,
      fixed: fixed.map(({ id: _id, ...rest }) => rest),
      events: events.map(({ id: _id, ...rest }) => rest),
      assets: assets.map((a) => ({ name: a.name, kind: a.kind, balance: a.balance })),
    },
    null,
    2,
  )
