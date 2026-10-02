import type { Asset, BonusPlan, FixedCost, LifeEvent, Profile, Txn } from '../types'
import { monthDiff, monthOf, todayKey } from './date'

/** 資産の合計（純資産） */
export const totalAssets = (assets: Asset[]): number =>
  assets.reduce((sum, a) => sum + a.balance, 0)

/** 口座残高。残高照合で更新される */
export const cashBalance = (assets: Asset[]): number =>
  assets.filter((a) => a.kind === 'cash').reduce((sum, a) => sum + a.balance, 0)

/** 生活防衛費の不足額。埋まったら0になって引当から消える */
export const emergencyShortfall = (profile: Profile, assets: Asset[]): number =>
  Math.max(0, profile.emergencyFund - cashBalance(assets))

/** 固定費の月合計。消費も資金移動も、どちらも財布からは出ていく */
export const fixedTotal = (fixed: FixedCost[]): number =>
  fixed.filter((f) => f.active).reduce((sum, f) => sum + f.amount, 0)

/** 固定費のうち、純粋な消費だけ */
export const fixedExpenseTotal = (fixed: FixedCost[]): number =>
  fixed.filter((f) => f.active && f.kind === 'expense').reduce((sum, f) => sum + f.amount, 0)

/** 固定費のうち、資産に積み上がるぶん */
export const fixedTransferTotal = (fixed: FixedCost[]): number =>
  fixed.filter((f) => f.active && f.kind === 'transfer').reduce((sum, f) => sum + f.amount, 0)

/** 引当の対象になるイベントか。検討中と、時期・金額が未定のものは対象外 */
export const isFunded = (e: LifeEvent): boolean =>
  e.confidence !== 'considering' && e.targetMonth !== '' && e.amount > 0

/**
 * イベント1件の月あたり引当額。金額を期日までの残り月数で割る。
 *
 * 期日を過ぎている（残り0以下）ものは、今月すぐ必要なものとして全額を返す。
 */
export const eventMonthly = (e: LifeEvent, fromMonth: string): number => {
  if (!isFunded(e)) return 0
  const months = monthDiff(fromMonth, e.targetMonth)
  if (months <= 0) return e.amount
  return e.amount / months
}

/**
 * ボーナスの配分を作る。
 *
 * 決めごと（設計の要）:
 *   - ボーナスは月の生活費に混ぜない。イベント引当と投資に全振りする
 *   - NISA一括は聖域ではなく調整弁。引当を先に確保して、余った分を回す
 *   - それでも足りない分だけ、月次の予算から引く
 *
 * 期日を動かせるのはNISAだけ。入学金も車検も時期はこちらで選べない。
 * 優先順位の低いものを先に確保すると、高いものが破綻する。
 */
export const buildBonusPlan = (
  profile: Profile,
  events: LifeEvent[],
  assets: Asset[],
  fromMonth: string,
): BonusPlan => {
  const annual = profile.bonusAmount * profile.bonusMonths.length

  const allocations: { name: string; amount: number }[] = []

  // 生活防衛費の不足が最優先。資産から毎回計算するので、埋まれば自動で消える
  const shortfall = emergencyShortfall(profile, assets)
  if (shortfall > 0) allocations.push({ name: '生活防衛費の不足', amount: shortfall })

  for (const e of events) {
    if (!isFunded(e) || e.fundedFrom !== 'bonus') continue
    allocations.push({ name: e.name, amount: Math.round(eventMonthly(e, fromMonth) * 12) })
  }

  const allocated = allocations.reduce((sum, a) => sum + a.amount, 0)

  // 調整弁。引当を引いた残りの範囲でしかNISAに入れない
  const nisa = Math.max(0, Math.min(profile.annualNisaLump, annual - allocated))
  const surplus = Math.max(0, annual - allocated - nisa)

  // NISAをゼロにしてもなお足りないぶんは、月次から引くしかない
  const monthlyShortfall = allocated > annual ? (allocated - annual) / 12 : 0

  return { annual, allocations, allocated, nisa, surplus, monthlyShortfall }
}

export type Budget = {
  /** 今月の予算（繰越込み） */
  budget: number
  /** 今月すでに使った額 */
  used: number
  /** つかっていい額 */
  remaining: number
  /** 消化率（0-100） */
  pct: number
  /** 内訳 */
  breakdown: {
    takeHome: number
    fixed: number
    transfer: number
    monthlyAllocation: number
    carryOver: number
  }
}

/**
 * 今月つかっていい額。
 *
 *   予算 = 手取り月収 − 固定費 − 月次引当 + 前月繰越
 *   つかっていい額 = 予算 − 今月の実績
 *
 * 固定費は予算から先に引いてあるので、自動計上ぶん（source==='fixed'）を
 * 実績に数えると二重に引くことになる。除外する。
 *
 * 以前は「もしもシナリオ」で月の予算から一律に差し引く仕組みがあったが、やめた。
 * ライフイベントはボーナス→NISAの順で吸収するという原則を素通りして、
 * 実際より怖い数字を出していたため。将来の支出はすべてライフイベントとして持つ。
 */
export const monthlyBudget = (
  profile: Profile,
  fixed: FixedCost[],
  events: LifeEvent[],
  txns: Txn[],
  month: string,
  carryOver: number,
  plan: BonusPlan,
): Budget => {
  // 固定費は計上済みの実額を優先する。毎月金額が変わるもの（variable）があるため、
  // テンプレの金額で計算すると月合計が実態からずれる。
  const posted = txns
    .filter((t) => monthOf(t.date) === month && t.source === 'fixed')
    .reduce((sum, t) => sum + t.amount, 0)

  const expense = posted > 0 ? posted : fixedExpenseTotal(fixed)
  const transfer = posted > 0 ? 0 : fixedTransferTotal(fixed)

  // 月次から引くイベント（原則ボーナス持ちなので、ふつうは0）
  const monthlyEvents = events
    .filter((e) => isFunded(e) && e.fundedFrom === 'monthly')
    .reduce((sum, e) => sum + eventMonthly(e, month), 0)

  const monthlyAllocation = Math.round(monthlyEvents + plan.monthlyShortfall)

  const budget = profile.takeHome - expense - transfer - monthlyAllocation + carryOver

  const used = txns
    .filter((t) => monthOf(t.date) === month && t.source !== 'fixed')
    .reduce((sum, t) => sum + t.amount, 0)

  const remaining = budget - used
  const pct = budget > 0 ? Math.min(100, Math.round((used / budget) * 100)) : 100

  return {
    budget,
    used,
    remaining,
    pct,
    breakdown: {
      takeHome: profile.takeHome,
      fixed: expense,
      transfer,
      monthlyAllocation,
      carryOver,
    },
  }
}

/**
 * 起点の月から指定の月の前月までを順に閉じて、繰越額を出す。
 *
 * 使い残しは消えない（Q17で繰り越しに決めた）ので、月末に慌てて使い切る動機が無い。
 * 過去の月ぶんを毎回たどるが、起点は2026年10月なので回数はたかが知れている。
 */
export const carryOverAt = (
  profile: Profile,
  fixed: FixedCost[],
  events: LifeEvent[],
  txns: Txn[],
  month: string,
  plan: BonusPlan,
): number => {
  let carry = 0
  let cur = profile.startMonth
  while (cur < month) {
    carry = monthlyBudget(profile, fixed, events, txns, cur, carry, plan).remaining
    const [y, m] = cur.split('-').map(Number)
    const next = new Date(y, m, 1)
    cur = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
  }
  return Math.round(carry)
}

/** まだ口座から出ていないカード利用分 */
export const pendingCardTotal = (txns: Txn[]): number => {
  const today = todayKey()
  return txns
    .filter((t) => (t.method === 'rakuten' || t.method === 'view') && t.payoutDate > today)
    .reduce((sum, t) => sum + t.amount, 0)
}

/**
 * 実質残高 = 口座残高 − カード未確定分。
 *
 * 口座残高だけ見ると、まだ請求が来ていないカード利用分が使える金に見える。
 * 月末に一気に落ちて青くなるのを防ぐための数字。
 */
export const realBalance = (assets: Asset[], txns: Txn[]): number =>
  cashBalance(assets) - pendingCardTotal(txns)

/** ペース予測を出し始める日。月初の数日は1件の買い物で予測が大きく振れるので出さない */
export const FORECAST_FROM_DAY = 5

export type Pace = {
  /** 今日あと使える額。マイナスなら今日の1日分をこえている */
  todayLeft: number
  /** 今日の始まり時点での1日あたりの額 */
  perDay: number
  /** 今日使った額 */
  spentToday: number
  /** 残り日数（今日を含む） */
  daysLeft: number
  /** このペースで使い続けたときの月末の残り。予測を出すには早すぎる日は null */
  forecast: number | null
}

/**
 * 今月の残りを1日あたりに割る。
 *
 * 「今月あと3万円」より「今日あと1,000円」のほうが、買う瞬間の判断に直結する。
 * 今日使ったぶんで1日あたりの額が下がると、使うほど目標が逃げていくので、
 * 1日あたりの額は「今日の始まり時点」の残りから出し、そこから今日の分を引く。
 */
export const dailyPace = (budget: Budget, txns: Txn[], month: string, today: string): Pace => {
  const [y, m, d] = today.split('-').map(Number)
  const days = new Date(y, m, 0).getDate()
  const daysLeft = days - d + 1

  const spentToday = txns
    .filter((t) => t.date === today && t.source !== 'fixed' && monthOf(t.date) === month)
    .reduce((sum, t) => sum + t.amount, 0)

  const atStartOfDay = budget.remaining + spentToday
  const perDay = atStartOfDay > 0 ? Math.floor(atStartOfDay / daysLeft) : 0

  // 今日までの実績を日割りして月末まで延ばす。今日はまだ途中だが1日として数える
  const forecast = d >= FORECAST_FROM_DAY ? Math.round(budget.budget - (budget.used / d) * days) : null

  return { todayLeft: perDay - spentToday, perDay, spentToday, daysLeft, forecast }
}
