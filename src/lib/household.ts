import { monthOf, monthsBetween, shiftMonth, thisMonth } from './date'

/**
 * 家計（わが家のお財布）の見通しから、敏さんに回ってくる補填を出す。
 *
 * 大物の支出（車・出産・保険・税）は家計が持ち、足りなくなった分は夫婦の折半で足す取り決め。
 * だから「家計が足りなくなる月と額」が分かれば、こちらの予定に入れられる。
 *
 * 見通しの計算は わが家のお財布/src/lib/forecast.ts の buildForecast と同じにしてある
 * （両アプリで数字を一致させるため）。**片方を直したら、もう片方も直すこと。**
 * 違うのは1点だけ。あちらは残高が0円を割る月を出すが、こちらは
 * 「1ヶ月分の支出を割ったら、そこまで戻すように補填する」として毎月積み上げ直す。
 * 口座が空になるまで待たずに足すのが実際の運用なので。
 */

/* ---- 家計アプリのデータの形（必要なところだけ） ---- */

export type HhReceipt = { date: string; items: { amount: number }[] }
export type HhIncomeSource = { amount: number; active: boolean }
export type HhIncomeRecord = { date: string; kind: string; amount: number }
export type HhEvent = {
  id: string
  name: string
  month: string
  amount: number
  kind: 'spend' | 'income'
  repeat: 'once' | 'yearly' | 'biennial'
  certain: boolean
}
export type HhPlan = { balance: number; balanceAsOf: string; assumedSpend: number; updatedAt: number }

export type HouseholdData = {
  receipts: HhReceipt[]
  income: HhIncomeSource[]
  incomeRecords: HhIncomeRecord[]
  events: HhEvent[]
  plan: HhPlan | null
}

/** 家計アプリの config と同じ値 */
const FORECAST_MONTHS = 60
const LOOKBACK = 6
const INCOME_FORECAST: Record<string, 'recent' | 'yearly' | 'none'> = {
  売電: 'recent',
  '018サポート': 'yearly',
  その他: 'none',
}

/** 夫婦の折半。敏さんの持ち分 */
export const MY_SHARE = 0.5

const sumReceipt = (r: HhReceipt): number => r.items.reduce((a, i) => a + i.amount, 0)

/** 月の支出。記録の平均（今月は除く・直近6ヶ月）、記録が無ければ手置きの想定額 */
const estimateSpend = (receipts: HhReceipt[], plan: HhPlan, current: string): number => {
  const byMonth = new Map<string, number>()
  for (const r of receipts) {
    const m = monthOf(r.date)
    if (m >= current) continue
    byMonth.set(m, (byMonth.get(m) ?? 0) + sumReceipt(r))
  }
  const months = [...byMonth.keys()].sort().reverse().slice(0, LOOKBACK)
  if (months.length === 0) return Math.max(0, plan.assumedSpend)
  return Math.round(months.reduce((a, m) => a + (byMonth.get(m) ?? 0), 0) / months.length)
}

/** 記録した収入（売電・018サポート）の月額 */
const estimateRecordedIncome = (records: HhIncomeRecord[], current: string): number => {
  const lastMonth = shiftMonth(current, -1)
  let sum = 0
  for (const [kind, method] of Object.entries(INCOME_FORECAST)) {
    if (method === 'none') continue
    const past = records.filter((r) => r.kind === kind && monthOf(r.date) < current)
    if (past.length === 0) continue
    let span: string[]
    if (method === 'yearly') {
      span = monthsBetween(shiftMonth(lastMonth, -11), lastMonth)
    } else {
      const first = past.reduce((min, r) => (monthOf(r.date) < min ? monthOf(r.date) : min), current)
      const earliest = shiftMonth(lastMonth, -(LOOKBACK - 1))
      span = monthsBetween(first > earliest ? first : earliest, lastMonth)
    }
    const total = past.filter((r) => span.includes(monthOf(r.date))).reduce((a, r) => a + r.amount, 0)
    if (total > 0) sum += Math.round(total / span.length)
  }
  return sum
}

const STEP: Record<HhEvent['repeat'], number> = { once: 0, yearly: 12, biennial: 24 }

/** 繰り返す予定を、見通しの範囲に入る回数ぶんに展開する */
const expand = (events: HhEvent[], until: string): Map<string, HhEvent[]> => {
  const out = new Map<string, HhEvent[]>()
  const put = (m: string, e: HhEvent) => out.set(m, [...(out.get(m) ?? []), e])
  for (const e of events) {
    const step = STEP[e.repeat] ?? 0
    if (step === 0) {
      put(e.month, e)
      continue
    }
    let m = e.month
    for (let i = 0; m <= until && i < 120; i += 1) {
      put(m, e)
      m = shiftMonth(m, step)
    }
  }
  return out
}

export type TopUp = {
  month: string
  /** 家計に足りない額（夫婦合計） */
  total: number
  /** 敏さんの持ち分 */
  mine: number
  /** その月の家計の予定（なぜ足りなくなるかの手がかり） */
  events: string[]
}

export type HouseholdOutlook = {
  /** 見通しが出せたか。家計アプリで残高を一度も入れていなければ出せない */
  ready: boolean
  monthlySpend: number
  monthlySurplus: number
  /** 補填の線。家計の1ヶ月分の支出 */
  floor: number
  topUps: TopUp[]
  /** 未確定の予定の名前。込みで計算していることを画面で断るため */
  uncertain: string[]
}

const EMPTY: HouseholdOutlook = { ready: false, monthlySpend: 0, monthlySurplus: 0, floor: 0, topUps: [], uncertain: [] }

/**
 * 補填の見込みを出す。
 *
 * 未確定の予定（まだ決まっていないもの）も含める（2026-10-03に決定）。補填はまずボーナスとNISA一括で
 * 吸収されるので、含めても月の予算が減るのは不足がボーナスを超えたときだけ。慎重な側に倒す。
 *
 * 今月より前に補填が要ると出た月は、今月に寄せる（もう足りていないということなので）。
 */
export const householdOutlook = (data: HouseholdData, current = thisMonth()): HouseholdOutlook => {
  const plan = data.plan
  if (!plan || plan.updatedAt === 0) return EMPTY

  const monthlyIncome = data.income.filter((i) => i.active).reduce((a, i) => a + Math.max(0, i.amount), 0)
  const spend = estimateSpend(data.receipts, plan, current)
  const surplus = monthlyIncome + estimateRecordedIncome(data.incomeRecords, current) - spend
  const floor = spend

  const until = shiftMonth(current, FORECAST_MONTHS)
  const byMonth = expand(data.events, until)
  const span = monthsBetween(shiftMonth(monthOf(plan.balanceAsOf), 1), until, FORECAST_MONTHS + 24)

  let balance = plan.balance
  const topUps = new Map<string, TopUp>()
  for (const month of span) {
    balance += surplus
    const inMonth = byMonth.get(month) ?? []
    for (const e of inMonth) balance += e.kind === 'income' ? e.amount : -e.amount
    if (balance >= floor) continue

    const need = floor - balance
    balance = floor
    const at = month < current ? current : month
    const t = topUps.get(at) ?? { month: at, total: 0, mine: 0, events: [] }
    t.total += need
    t.mine = Math.ceil(t.total * MY_SHARE)
    for (const e of inMonth) if (e.kind === 'spend' && !t.events.includes(e.name)) t.events.push(e.name)
    topUps.set(at, t)
  }

  return {
    ready: true,
    monthlySpend: spend,
    monthlySurplus: surplus,
    floor,
    topUps: [...topUps.values()],
    uncertain: [...new Set(data.events.filter((e) => !e.certain).map((e) => e.name))],
  }
}

/** 補填を、こちらの予定（ライフイベント）の形にする。ボーナスから引き当てる */
export const topUpEvents = (outlook: HouseholdOutlook) =>
  outlook.topUps.map((t) => ({
    id: `household_${t.month}`,
    name: TOPUP_NAME,
    targetMonth: t.month,
    amount: t.mine,
    confidence: 'likely' as const,
    repeat: null,
    fundedFrom: 'bonus' as const,
  }))

export const TOPUP_NAME = '家計への補填（折半）'
