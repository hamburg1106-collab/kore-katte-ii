import type { CardRule } from '../config'
import type { Method } from '../types'

/** 月の区切りは1日〜末日。給料日基準にはしない（繰り越すのでリセット感は要らない） */

/** Dateから YYYY-MM-DD を作る。toISOStringはUTCになり日本の深夜が前日になるので使わない */
export const toDateKey = (d: Date): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** YYYY-MM-DD → YYYY-MM */
export const monthOf = (dateKey: string): string => dateKey.slice(0, 7)

export const todayKey = (): string => toDateKey(new Date())

export const thisMonth = (): string => monthOf(todayKey())

/** YYYY-MM をnヶ月ずらす */
export const shiftMonth = (month: string, diff: number): string => {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + diff, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** その月の日数 */
export const daysInMonth = (month: string): number => {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

/** 今月の残り日数（今日を含む） */
export const daysLeftInMonth = (): number => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1
}

/** 「2026年10月」 */
export const formatMonth = (month: string): string => {
  const [y, m] = month.split('-')
  return `${y}年${Number(m)}月`
}

/** 「10/19」 */
export const formatShortDay = (dateKey: string): string => {
  const [, m, d] = dateKey.split('-').map(Number)
  return `${m}/${d}`
}

/** 「11月27日」 */
export const formatDayJa = (dateKey: string): string => {
  const [, m, d] = dateKey.split('-').map(Number)
  return `${m}月${d}日`
}

/** 「277,620」。単位を別の要素で持つ場所（ホームの大きな数字など）だけこちら */
export const num = (n: number): string => Math.round(n).toLocaleString('ja-JP')

/** 「277,620円」。画面に出す金額は原則こちら。単位の付く画面と付かない画面を混ぜない */
export const yen = (n: number): string => `${num(n)}円`

/** from月からto月までを古い順に。固定費の未計上チェックに使う */
export const monthsBetween = (from: string, to: string, limit = 60): string[] => {
  const out: string[] = []
  let cur = from
  while (cur <= to && out.length < limit) {
    out.push(cur)
    cur = shiftMonth(cur, 1)
  }
  return out
}

/** from月からto月までの月数。同じ月なら0 */
export const monthDiff = (from: string, to: string): number => {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

/**
 * 使った日から引き落とし予定日を出す。
 *
 * カードは「先に使って、後で口座から出る」。締め日をまたぐかどうかで1ヶ月ずれる。
 *   楽天（月末締め→翌月27日）: 10/20に使う → 11/27
 *   ビュー（5日締め→翌月4日） : 10/20に使う → 11/5締め → 12/4
 *
 * 現金・口座・PayPayは即時。PayPayは1万円単位のオートチャージなので
 * 未使用残高が最大1万円ぶん先に出るが、頻度が低いので残高照合で吸収する。
 */
export const payoutDateFor = (
  method: Method,
  dateKey: string,
  rules: Record<'rakuten' | 'view', CardRule>,
): string => {
  if (method !== 'rakuten' && method !== 'view') return dateKey

  const rule = rules[method]
  const [y, m, d] = dateKey.split('-').map(Number)

  // 締め日を過ぎていたら、締めは翌月になる
  const closesNextMonth = d > rule.closingDay
  const closingMonth = new Date(y, m - 1 + (closesNextMonth ? 1 : 0), 1)

  const payMonth = new Date(
    closingMonth.getFullYear(),
    closingMonth.getMonth() + rule.payAfterMonths,
    1,
  )
  // 支払日が月末を超える設定でも壊れないように丸める
  const last = new Date(payMonth.getFullYear(), payMonth.getMonth() + 1, 0).getDate()
  const payDay = Math.min(rule.payDay, last)

  return toDateKey(new Date(payMonth.getFullYear(), payMonth.getMonth(), payDay))
}
