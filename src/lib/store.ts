import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_CARD_RULES, DEFAULT_PROFILE, type CardRule } from '../config'
import type { Asset, FixedCost, LifeEvent, MonthState, Profile, Reconcile, Txn } from '../types'
import { monthsBetween, payoutDateFor, thisMonth } from './date'
import { db } from './firebase'
import type { Seed } from './seed'

/** 保存先。プロジェクトは他のアプリと共用しているので shikin/ で分ける */
const root = (uid: string) => doc(db, 'shikin', uid)
const sub = (uid: string, name: string) => collection(db, 'shikin', uid, name)

/** ルート文書。プロフィール＋カードのルールを持つ */
type RootDoc = Profile & {
  cardRules: Record<'rakuten' | 'view', CardRule>
}

export type Data = {
  loading: boolean
  profile: Profile
  cardRules: Record<'rakuten' | 'view', CardRule>
  fixed: FixedCost[]
  txns: Txn[]
  events: LifeEvent[]
  assets: Asset[]
  months: MonthState[]
  reconciles: Reconcile[]
  /**
   * txns と months が1回でも届いたか。
   *
   * loading はルート文書の購読で落ちるので、これだけを見て固定費の自動計上を
   * 始めると、months が空配列のまま（＝まだ届いていない）条件を満たしてしまい、
   * 機種変更や再インストールの直後に過去ぶんを丸ごと二重計上する。
   */
  txnsLoaded: boolean
  monthsLoaded: boolean
}

const EMPTY: Data = {
  loading: true,
  profile: DEFAULT_PROFILE,
  cardRules: DEFAULT_CARD_RULES,
  fixed: [],
  txns: [],
  events: [],
  assets: [],
  months: [],
  reconciles: [],
  txnsLoaded: false,
  monthsLoaded: false,
}

/**
 * 初回だけ、空のルート文書を作る。
 *
 * 金額は一切書かない（config.ts の注記を参照）。実額は設定画面の
 * 「初期データの取り込み」から入れる。
 */
export const ensureSeed = async (uid: string): Promise<void> => {
  const snap = await getDoc(root(uid))
  if (snap.exists()) return
  await setDoc(root(uid), { ...DEFAULT_PROFILE, cardRules: DEFAULT_CARD_RULES })
}

/**
 * seed.local.json の中身を取り込む。
 *
 * 固定費・イベント・資産は、いったん全部消してから入れ直す。追記にすると
 * 取り込むたびに固定費が12件ずつ増えて、月合計が倍々になるため。
 * 記録（txns）と月次の状態には触らない。
 */
export const importSeed = async (uid: string, seed: Seed): Promise<void> => {
  const batch = writeBatch(db)

  for (const name of ['fixed', 'events', 'assets']) {
    const existing = await getDocs(sub(uid, name))
    for (const d of existing.docs) batch.delete(d.ref)
  }

  batch.set(root(uid), { ...DEFAULT_PROFILE, ...seed.profile, cardRules: DEFAULT_CARD_RULES })

  for (const f of seed.fixed) batch.set(doc(sub(uid, 'fixed')), f)
  for (const e of seed.events) batch.set(doc(sub(uid, 'events')), e)
  for (const a of seed.assets) batch.set(doc(sub(uid, 'assets')), { ...a, updatedAt: Date.now() })

  await batch.commit()
}

/**
 * 未計上の月があれば固定費を計上する。
 *
 * months/<YYYY-MM> に印を付けることで、起動するたびに二重計上されるのを防ぐ。
 * 毎月金額が変わるもの（variable）はテンプレの金額で仮置きし、設定画面から直す。
 */
export const postFixedCosts = async (
  uid: string,
  profile: Profile,
  fixed: FixedCost[],
  months: MonthState[],
  txns: Txn[],
  cardRules: Record<'rakuten' | 'view', CardRule>,
): Promise<void> => {
  const done = new Set(months.filter((m) => m.fixedPosted).map((m) => m.id))
  // 保険。印が消えていても、その月に計上済みの記録があれば手を出さない
  for (const t of txns) if (t.source === 'fixed') done.add(t.date.slice(0, 7))

  const targets = monthsBetween(profile.startMonth, thisMonth()).filter((m) => !done.has(m))
  if (targets.length === 0) return

  const active = fixed.filter((f) => f.active)
  const batch = writeBatch(db)

  for (const month of targets) {
    // 固定費は月初に落ちるものとして1日で計上する
    const date = `${month}-01`
    for (const f of active) {
      batch.set(doc(sub(uid, 'txns')), {
        date,
        amount: f.amount,
        memo: f.name,
        method: f.method,
        payoutDate: payoutDateFor(f.method, date, cardRules),
        kind: f.kind,
        source: 'fixed',
        createdAt: Date.now(),
      })
    }
    batch.set(doc(db, 'shikin', uid, 'months', month), { carryOver: 0, fixedPosted: true })
  }
  await batch.commit()
}

const withIds = <T>(docs: { id: string; data: () => unknown }[]): T[] =>
  docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as T)

/** 全部まとめて購読する。1人用なので件数はたかが知れている */
export const useData = (uid: string | null): Data => {
  const [state, setState] = useState<Data>(EMPTY)

  useEffect(() => {
    if (!uid) {
      setState({ ...EMPTY, loading: false })
      return
    }

    let alive = true
    const patch = (p: Partial<Data>) => {
      if (alive) setState((prev) => ({ ...prev, ...p }))
    }

    const oops = (where: string) => (e: unknown) => console.error(`[store] ${where}`, e)

    /**
     * 購読を先に張る。ensureSeed の完了を待ってから張ると、電波が悪くて
     * getDoc が失敗したときに購読が1つも立たず、手元（IndexedDB）に残高も記録も
     * あるのに画面が全部0になる。onSnapshot はキャッシュから即座に返すので、
     * 圏外でも前回の内容が出る。
     */
    const unsubs: (() => void)[] = [
      onSnapshot(
        root(uid),
        (snap) => {
          const d = snap.data() as RootDoc | undefined
          // 初回起動でまだ文書が無いときも、読み込み中のままにはしない
          if (!d) {
            patch({ loading: false })
            return
          }
          const { cardRules, ...profile } = d
          patch({
            profile: { ...DEFAULT_PROFILE, ...profile },
            cardRules: cardRules ?? DEFAULT_CARD_RULES,
            loading: false,
          })
        },
        oops('root'),
      ),
      onSnapshot(sub(uid, 'fixed'), (s) => patch({ fixed: withIds<FixedCost>(s.docs) }), oops('fixed')),
      onSnapshot(
        sub(uid, 'txns'),
        (s) => patch({ txns: withIds<Txn>(s.docs), txnsLoaded: true }),
        oops('txns'),
      ),
      onSnapshot(sub(uid, 'events'), (s) => patch({ events: withIds<LifeEvent>(s.docs) }), oops('events')),
      onSnapshot(sub(uid, 'assets'), (s) => patch({ assets: withIds<Asset>(s.docs) }), oops('assets')),
      onSnapshot(
        sub(uid, 'months'),
        (s) => patch({ months: withIds<MonthState>(s.docs), monthsLoaded: true }),
        oops('months'),
      ),
      onSnapshot(
        sub(uid, 'reconcile'),
        (s) => patch({ reconciles: withIds<Reconcile>(s.docs) }),
        oops('reconcile'),
      ),
    ]

    // 空のルート文書づくりは裏で走らせる。失敗しても画面は動く
    ensureSeed(uid).catch(oops('ensureSeed'))

    return () => {
      alive = false
      for (const u of unsubs) u()
    }
  }, [uid])

  // 日付の新しい順。Firestore側で並べるとインデックスが要るのでここで並べる
  return useMemo(
    () => ({
      ...state,
      txns: [...state.txns].sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : b.date < a.date ? -1 : 1)),
    }),
    [state],
  )
}

export const addTxn = (uid: string, t: Omit<Txn, 'id'>): Promise<void> =>
  setDoc(doc(sub(uid, 'txns')), t)

export const updateTxn = (uid: string, id: string, patch: Partial<Txn>): Promise<void> =>
  updateDoc(doc(db, 'shikin', uid, 'txns', id), patch)

export const removeTxn = (uid: string, id: string): Promise<void> =>
  deleteDoc(doc(db, 'shikin', uid, 'txns', id))

export const saveProfile = (uid: string, patch: Partial<RootDoc>): Promise<void> =>
  updateDoc(root(uid), patch)

export const saveAsset = (uid: string, id: string, balance: number): Promise<void> =>
  updateDoc(doc(db, 'shikin', uid, 'assets', id), { balance, updatedAt: Date.now() })

export const saveEvent = (uid: string, id: string, patch: Partial<LifeEvent>): Promise<void> =>
  updateDoc(doc(db, 'shikin', uid, 'events', id), patch)

export const addEvent = (uid: string, e: Omit<LifeEvent, 'id'>): Promise<void> =>
  setDoc(doc(sub(uid, 'events')), e)

export const removeEvent = (uid: string, id: string): Promise<void> =>
  deleteDoc(doc(db, 'shikin', uid, 'events', id))

export const saveFixed = (uid: string, id: string, patch: Partial<FixedCost>): Promise<void> =>
  updateDoc(doc(db, 'shikin', uid, 'fixed', id), patch)

/**
 * 月末の残高照合。
 *
 * 実際の口座残高を入れて、登録してある残高をその値に更新し、履歴に1行残す。
 *
 * 以前はここで差額を「使途不明」の支出として自動計上していたが、やめた。
 * 比べていた `expected` は「前回照合したときの残高」であって記録から計算した
 * 残高ではなく、差額の中身は給料も今月の支出もカード未確定分も混ざった
 * 寄せ集めだった。正しい期待残高を出すには「前回照合日以降に payoutDate が
 * 到来した記録」と「その間の給料」を積む必要があり、今のデータでは出せない。
 * 嘘の数字を自動で書き込むより、書かない方が安全。
 *
 * 同じ月に何度押しても、残高の上書きと履歴の差し替えだけなので増殖しない。
 */
export const reconcile = async (
  uid: string,
  month: string,
  bankBalance: number,
  expected: number,
  cashAssetId: string,
): Promise<void> => {
  const batch = writeBatch(db)

  batch.set(doc(db, 'shikin', uid, 'reconcile', month), {
    bankBalance,
    // 登録してあった残高との差。何に使ったかまでは分からない
    diff: expected - bankBalance,
    postedAt: Date.now(),
  })
  batch.update(doc(db, 'shikin', uid, 'assets', cashAssetId), {
    balance: bankBalance,
    updatedAt: Date.now(),
  })
  await batch.commit()
}
