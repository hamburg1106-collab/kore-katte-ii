import type { Budget } from '../lib/calc'
import { pendingCardTotal, cashBalance } from '../lib/calc'
import { daysLeftInMonth, formatMonth, formatShortDay, num } from '../lib/date'
import type { Asset, Txn } from '../types'
import { METHODS } from '../config'

const methodLabel = (id: string) => METHODS.find((m) => m.id === id)?.label ?? id

export const HomeScreen = ({
  month,
  budget,
  assets,
  txns,
  secondChild,
  scenarioLabel,
  onScenario,
}: {
  month: string
  budget: Budget
  assets: Asset[]
  txns: Txn[]
  secondChild: boolean
  scenarioLabel: string
  onScenario: (v: boolean) => void
}) => {
  const pending = pendingCardTotal(txns)
  const bank = cashBalance(assets)
  const recent = txns.filter((t) => t.source !== 'fixed').slice(0, 4)

  return (
    <div className="screen">
      <div className="head">
        <h1>{formatMonth(month)}</h1>
        <span className="sub">残り{daysLeftInMonth()}日</span>
      </div>

      {budget.breakdown.takeHome === 0 && (
        <section className="card" style={{ borderColor: 'var(--green)' }}>
          <div className="label" style={{ color: 'var(--green)' }}>
            準備がまだです
          </div>
          <p className="small" style={{ margin: '8px 0 0', lineHeight: 1.7 }}>
            設定タブの「初期データ」に seed.local.json を貼り付けると、ここに金額が出ます。
          </p>
        </section>
      )}

      <section className="card green">
        <div className="label">今月つかっていい額</div>
        <div className="big">
          <span className="num">{num(budget.remaining)}</span>
          <span className="unit">円</span>
        </div>
        <div className="bar">
          <span style={{ width: `${budget.pct}%` }} />
        </div>
        <div className="row small" style={{ marginTop: 9 }}>
          <span>使った {num(budget.used)}円</span>
          <span>予算 {num(budget.budget)}円</span>
        </div>
      </section>

      <section style={{ margin: '0 16px 16px' }}>
        <div className="label" style={{ marginBottom: 8 }}>
          シナリオ
        </div>
        <div className="seg">
          <button type="button" aria-pressed={!secondChild} onClick={() => onScenario(false)}>
            いまのまま
          </button>
          <button type="button" aria-pressed={secondChild} onClick={() => onScenario(true)}>
            {scenarioLabel}
          </button>
        </div>
        <p className="small" style={{ margin: '8px 0 0', lineHeight: 1.5 }}>
          {secondChild
            ? '追加の引当ぶん、自由に使える額が減ったところ。'
            : '今の実額。ボーナスの余剰は「予定」で見られる。'}
        </p>
      </section>

      <section className="card">
        <div className="row">
          <span style={{ fontSize: 13, fontWeight: 700 }}>実質残高</span>
          <span className="num" style={{ fontSize: 25, fontWeight: 700 }}>
            {num(bank - pending)}
          </span>
        </div>
        <div className="divide rows small">
          <div className="row">
            <span>口座残高</span>
            <span className="num">{num(bank)}</span>
          </div>
          <div className="row">
            <span>カード未確定（楽天・ビュー）</span>
            <span className="num minus">−{num(pending)}</span>
          </div>
        </div>
      </section>

      <section style={{ margin: '0 16px' }}>
        <div className="label" style={{ marginBottom: 9 }}>
          直近の記録
        </div>
        {recent.length === 0 ? (
          <p className="small" style={{ margin: 0, lineHeight: 1.7 }}>
            まだ記録がありません。買ったら「入力」から金額を入れてください。
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {recent.map((t) => (
              <div
                key={t.id}
                className="card"
                style={{ margin: 0, borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px' }}
              >
                <span className="num small" style={{ width: 38 }}>
                  {formatShortDay(t.date)}
                </span>
                <span style={{ flexGrow: 1, fontSize: 13, fontWeight: 500 }}>{t.memo || '（メモなし）'}</span>
                <span className="chip">{methodLabel(t.method)}</span>
                <span className="num" style={{ fontSize: 14, fontWeight: 700 }}>
                  {num(t.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
