import type { Method, Txn } from '../types'
import { daysInMonth, monthOf, toDateKey, todayKey } from './date'

/**
 * メモで「何に使ったか」を見る。
 *
 * カテゴリは作らない。選ぶ手間が増えるほど記録が途絶えるので、
 * いつものメモ欄に同じ言葉を入れておけば、あとから言葉ごとに集計できる形にした。
 * 「コーヒー」と「ｺｰﾋｰ」、前後の空白を同じものとして扱うために正規化してから比べる。
 */
export const memoKey = (memo: string): string => memo.normalize('NFKC').trim().toLowerCase()

/** 手入力の記録だけ。固定費や過去の使途不明分は「何に使ったか」の対象外 */
const manualOnly = (txns: Txn[]): Txn[] => txns.filter((t) => t.source === 'manual' && t.memo.trim() !== '')

export type QuickPick = {
  memo: string
  amount: number
  method: Method
  count: number
}

/** 1タップ入力に出す候補の条件 */
const QUICK_DAYS = 90
const QUICK_MIN_COUNT = 2
const QUICK_MAX = 6

/**
 * よく入れる「メモ＋金額」の組み合わせ。入力画面に1タップのボタンとして出す。
 *
 * 自分で登録する方式にはしない。登録の手間がかかると結局使わないので、
 * 直近90日に2回以上入れたものを自動で拾う。値段が変わればそちらが自然に上に来る。
 * 支払い手段は、その組み合わせで最後に使ったものを引き継ぐ。
 */
export const quickPicks = (txns: Txn[], today = todayKey()): QuickPick[] => {
  // 日付はローカル時刻で組み立てる。文字列をそのまま new Date に渡すとUTC扱いになる
  const [y, m, d] = today.split('-').map(Number)
  const fromKey = toDateKey(new Date(y, m - 1, d - QUICK_DAYS))

  const groups = new Map<string, QuickPick & { last: string; lastAt: number }>()
  for (const t of manualOnly(txns)) {
    if (t.date < fromKey) continue
    const key = `${memoKey(t.memo)}|${t.amount}`
    const g = groups.get(key)
    if (!g) {
      groups.set(key, { memo: t.memo.trim(), amount: t.amount, method: t.method, count: 1, last: t.date, lastAt: t.createdAt })
      continue
    }
    g.count += 1
    // 最後に使った手段と表記を採る
    if (t.date > g.last || (t.date === g.last && t.createdAt > g.lastAt)) {
      g.last = t.date
      g.lastAt = t.createdAt
      g.method = t.method
      g.memo = t.memo.trim()
    }
  }

  return [...groups.values()]
    .filter((g) => g.count >= QUICK_MIN_COUNT)
    .sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : -1))
    .slice(0, QUICK_MAX)
    .map(({ memo, amount, method, count }) => ({ memo, amount, method, count }))
}

/**
 * メモ欄の入力候補。よく使う順。
 * 表記がそろうほど集計が正確になるので、前と同じ言葉を選びやすくする。
 */
export const memoSuggestions = (txns: Txn[], limit = 40): string[] => {
  const counts = new Map<string, { memo: string; count: number }>()
  for (const t of manualOnly(txns)) {
    const key = memoKey(t.memo)
    const c = counts.get(key)
    if (c) c.count += 1
    else counts.set(key, { memo: t.memo.trim(), count: 1 })
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((c) => c.memo)
}

export type MemoGroup = {
  memo: string
  count: number
  total: number
  /** 月の合計に占める割合（0-100） */
  share: number
  /** 年に直すといくらか。習慣になっていないもの（月1回）や、月初で早すぎるときは null */
  yearly: number | null
}

/** 年換算を出すのに必要な、月の経過日数 */
const YEARLY_FROM_DAY = 5

/**
 * 月の記録をメモごとにまとめる。多い順。
 *
 * 年換算は「その月に2回以上あったもの」だけに付ける。1回きりのタクシーを
 * 12倍しても意味のない数字になるため。習慣的な少額の出費（コーヒーなど）を
 * 年の額で見せて、積み重なりに気づけるようにするのが目的。
 *
 * 今月はまだ途中なので、経過日数で割って1ヶ月ぶんに延ばしてから12倍する。
 */
export const memoSummary = (txns: Txn[], month: string, today = todayKey()): MemoGroup[] => {
  const inMonth = txns.filter((t) => monthOf(t.date) === month && t.source !== 'fixed')
  const monthTotal = inMonth.reduce((sum, t) => sum + t.amount, 0)

  const isCurrent = month === monthOf(today)
  const elapsed = isCurrent ? Number(today.slice(8, 10)) : daysInMonth(month)
  const stretch = isCurrent ? daysInMonth(month) / elapsed : 1
  const canProject = !isCurrent || elapsed >= YEARLY_FROM_DAY

  const groups = new Map<string, { memo: string; count: number; total: number }>()
  for (const t of inMonth) {
    const label = t.memo.trim() || (t.source === 'unknown' ? '使途不明' : '（メモなし）')
    const key = memoKey(label)
    const g = groups.get(key)
    if (g) {
      g.count += 1
      g.total += t.amount
    } else {
      groups.set(key, { memo: label, count: 1, total: t.amount })
    }
  }

  return [...groups.values()]
    .sort((a, b) => b.total - a.total)
    .map((g) => ({
      ...g,
      share: monthTotal > 0 ? Math.round((g.total / monthTotal) * 100) : 0,
      yearly: canProject && g.count >= 2 ? Math.round(g.total * stretch * 12) : null,
    }))
}

/** 記録のある最初の月。一覧で遡れる下限 */
export const firstMonth = (txns: Txn[], startMonth: string): string => {
  let first = startMonth
  for (const t of txns) {
    const m = monthOf(t.date)
    if (m < first) first = m
  }
  return first
}
