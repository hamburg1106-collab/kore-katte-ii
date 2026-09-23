import { useState } from 'react'
import { eventMonthly, isFunded } from '../lib/calc'
import { formatMonth, monthDiff, num, thisMonth, yen } from '../lib/date'
import type { BonusPlan, Confidence, LifeEvent } from '../types'

const BADGE: Record<Confidence, { cls: string; label: string }> = {
  fixed: { cls: 'badge fixed', label: '確定' },
  likely: { cls: 'badge likely', label: '見込み' },
  considering: { cls: 'badge considering', label: '検討中' },
}

const NEXT: Record<Confidence, Confidence> = {
  fixed: 'likely',
  likely: 'considering',
  considering: 'fixed',
}

export const EventsScreen = ({
  plan,
  events,
  onSave,
  onAdd,
  onRemove,
}: {
  plan: BonusPlan
  events: LifeEvent[]
  onSave: (id: string, patch: Partial<LifeEvent>) => Promise<void>
  onAdd: (e: Omit<LifeEvent, 'id'>) => Promise<void>
  onRemove: (id: string) => Promise<void>
}) => {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [targetMonth, setTargetMonth] = useState('')
  const [amount, setAmount] = useState('')
  const month = thisMonth()

  // 完了は待たない（圏外だと返らない）。手元には入っている
  const add = () => {
    if (!name.trim()) return
    void onAdd({
      name: name.trim(),
      targetMonth,
      amount: Number(amount.replace(/[^\d]/g, '')) || 0,
      confidence: 'likely',
      repeat: null,
      fundedFrom: 'bonus',
    }).catch((e) => console.error('[event:add]', e))
    setName('')
    setTargetMonth('')
    setAmount('')
    setAdding(false)
  }

  return (
    <div className="screen">
      <div className="head">
        <h1>予定</h1>
        <span className="sub">{new Date().getFullYear()}年</span>
      </div>

      <section className="card dark" style={{ borderRadius: 18, padding: '18px 20px' }}>
        <div className="label">今年、先に取り分けられる額（ボーナス）</div>
        <div className="big">
          <span className="num" style={{ fontSize: 34 }}>
            {num(plan.annual)}
          </span>
          <span className="unit" style={{ fontSize: 14 }}>
            円
          </span>
        </div>
        <div className="rows" style={{ marginTop: 16, gap: 8, fontSize: 12 }}>
          {plan.allocations.map((a) => (
            <div key={a.name} className="row small">
              <span>{a.name}</span>
              <span className="num">−{yen(a.amount)}</span>
            </div>
          ))}
          <div className="row small">
            <span>NISA一括（あとから削る枠）</span>
            <span className="num">−{yen(plan.nisa)}</span>
          </div>
          <div className="row divide" style={{ color: 'var(--gold)' }}>
            <span style={{ fontWeight: 700, fontSize: 12 }}>余剰</span>
            <span className="num" style={{ fontSize: 16, fontWeight: 700 }}>
              {yen(plan.surplus)}
            </span>
          </div>
        </div>
        {plan.monthlyShortfall > 0 && (
          <p className="small" style={{ margin: '12px 0 0', lineHeight: 1.6 }}>
            ボーナスだけでは足りません。月あたり {yen(plan.monthlyShortfall)} を生活費から引いています。
          </p>
        )}
      </section>

      <section style={{ margin: '0 16px' }}>
        <div className="row" style={{ marginBottom: 10 }}>
          <span className="label">ライフイベント</span>
          <button type="button" className="ghost" onClick={() => setAdding((v) => !v)}>
            {adding ? 'やめる' : '＋ 追加'}
          </button>
        </div>

        {adding && (
          <div className="card" style={{ margin: '0 0 9px' }}>
            <div className="rows" style={{ gap: 9 }}>
              <input type="text" placeholder="名前（例: 車の買い替え）" value={name} onChange={(e) => setName(e.target.value)} />
              <input type="month" value={targetMonth} onChange={(e) => setTargetMonth(e.target.value)} />
              <input
                type="number"
                inputMode="numeric"
                placeholder="金額"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <button type="button" className="primary" style={{ minHeight: 44 }} onClick={add}>
                追加する
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {events.map((e) => {
            const funded = isFunded(e)
            const left = e.targetMonth ? monthDiff(month, e.targetMonth) : 0
            return (
              <div
                key={e.id}
                className="card"
                style={{
                  margin: 0,
                  borderRadius: 14,
                  background: funded ? 'var(--card)' : '#fbf8f2',
                  borderStyle: funded ? 'solid' : 'dashed',
                }}
              >
                {/* バッジも×も、見た目は小さいまま当たり判定だけ44px角にする（.tap） */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '-6px 0' }}>
                  <button
                    type="button"
                    className="tap"
                    aria-label={`${e.name}の確度（いま${BADGE[e.confidence].label}）を変える`}
                    onClick={() => onSave(e.id, { confidence: NEXT[e.confidence] })}
                  >
                    <span className={BADGE[e.confidence].cls}>{BADGE[e.confidence].label}</span>
                  </button>
                  <span style={{ flexGrow: 1, fontSize: 14, fontWeight: 700 }}>{e.name}</span>
                  <button
                    type="button"
                    className="tap"
                    style={{ color: 'var(--muted)', fontSize: 16 }}
                    aria-label={`${e.name}を削除`}
                    onClick={() => {
                      if (confirm(`「${e.name}」を削除しますか？`)) void onRemove(e.id)
                    }}
                  >
                    ×
                  </button>
                </div>

                <div className="row" style={{ marginTop: 10 }}>
                  <span className="small">
                    {e.targetMonth ? `${formatMonth(e.targetMonth)}${left > 0 ? ` ・ あと${left}ヶ月` : ''}` : '時期未定'}
                  </span>
                  <span className="num" style={{ fontSize: 17, fontWeight: 700 }}>
                    {e.amount > 0 ? yen(e.amount) : '—'}
                  </span>
                </div>

                {funded ? (
                  <div className="row divide small">
                    <span>月あたり先に取り分ける額</span>
                    <span className="num" style={{ fontWeight: 700 }}>
                      {yen(eventMonthly(e, month))}
                    </span>
                  </div>
                ) : (
                  <p className="small" style={{ margin: '10px 0 0', fontSize: 11, lineHeight: 1.6 }}>
                    まだ取り分けていません。バッジを押して確定・見込みにすると、月あたりの額が出ます。
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
