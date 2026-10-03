import { useState } from 'react'
import { eventMonthly, isFunded } from '../lib/calc'
import { formatMonth, monthDiff, num, thisMonth, yen } from '../lib/date'
import { TOPUP_NAME, type HouseholdOutlook } from '../lib/household'
import type { BonusPlan, Confidence, LifeEvent } from '../types'

/** 補填の一覧に出す件数。家計が毎月赤字だと60件並ぶので切る */
const TOPUP_SHOW = 6

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
  household,
  onSave,
  onAdd,
  onRemove,
}: {
  plan: BonusPlan
  events: LifeEvent[]
  household: { outlook: HouseholdOutlook; loaded: boolean; error: boolean }
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
      // 時期が空欄なら、まだ起きるかどうかも決まっていない話。検討中として置いておく
      confidence: targetMonth ? 'likely' : 'considering',
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
        <div className="label">今年のボーナスの行き先</div>
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

      <HouseholdSection {...household} setAside={plan.allocations.find((a) => a.name === TOPUP_NAME)?.amount ?? 0} />

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

/**
 * 家計（わが家のお財布）から回ってくる補填の見込み。
 * 車の買い替えのような大物は家計が持つので、こちらの予定には直接置かず、
 * 家計の見通しが足りなくなった分の半分として入ってくる。
 */
const HouseholdSection = ({
  outlook,
  loaded,
  error,
  setAside,
}: {
  outlook: HouseholdOutlook
  loaded: boolean
  error: boolean
  /** 今年のボーナスから取り分ける額。1年より先の分も少しずつ含むので、1年以内に出す額とは一致しない */
  setAside: number
}) => {
  const month = thisMonth()
  const within = outlook.topUps.filter((t) => monthDiff(month, t.month) <= 12)
  const withinSum = within.reduce((a, t) => a + t.mine, 0)
  const allSum = outlook.topUps.reduce((a, t) => a + t.mine, 0)

  let body: React.ReactNode
  if (error) {
    body = <p className="small" style={{ margin: 0, lineHeight: 1.7 }}>家計のデータを読めませんでした。補填なしで計算しています。</p>
  } else if (!loaded) {
    body = <p className="small" style={{ margin: 0 }}>読み込み中…</p>
  } else if (!outlook.ready) {
    body = (
      <p className="small" style={{ margin: 0, lineHeight: 1.7 }}>
        わが家のお財布で家計の残高を入れると、ここに補填の見込みが出ます。
      </p>
    )
  } else if (outlook.topUps.length === 0) {
    body = (
      <p className="small" style={{ margin: 0, lineHeight: 1.7 }}>
        向こう5年、家計は1ヶ月分の支出（{yen(outlook.floor)}）を割りません。補填は見込んでいません。
      </p>
    )
  } else {
    body = (
      <>
        <div className="row">
          <span style={{ fontSize: 13, fontWeight: 700 }}>この1年で自分が出す分</span>
          <span className="num" style={{ fontSize: 20, fontWeight: 700 }}>
            {yen(withinSum)}
          </span>
        </div>
        <div className="small" style={{ marginTop: 3, lineHeight: 1.6 }}>
          5年の合計 {yen(allSum)}。今年のボーナスからは {yen(setAside)} を取り分けます（1年より先の分も少しずつ）
        </div>
        <div className="divide rows" style={{ gap: 9 }}>
          {outlook.topUps.slice(0, TOPUP_SHOW).map((t) => (
            <div key={t.month}>
              <div className="row">
                <span style={{ fontSize: 13, fontWeight: 700 }}>{formatMonth(t.month)}</span>
                <span className="num" style={{ fontSize: 14, fontWeight: 700 }}>
                  {yen(t.mine)}
                </span>
              </div>
              <div className="row small">
                <span>{t.events.length > 0 ? t.events.join('・') : '毎月の赤字の積み重ね'}</span>
                <span className="num">家計の不足 {yen(t.total)}</span>
              </div>
            </div>
          ))}
          {outlook.topUps.length > TOPUP_SHOW && (
            <div className="small">ほか {outlook.topUps.length - TOPUP_SHOW}回</div>
          )}
        </div>
      </>
    )
  }

  return (
    <section className="card">
      <div className="label" style={{ marginBottom: 10 }}>
        家計への補填の見込み
      </div>
      {body}
      {outlook.ready && !error && (
        <div className="note">
          わが家のお財布の見通しから出しています。家計の残高が1ヶ月分の支出（{yen(outlook.floor)}）を割る月に、
          不足の半分を自分が出す前提です。家計の月の余剰は {outlook.monthlySurplus < 0 ? '−' : ''}
          {yen(Math.abs(outlook.monthlySurplus))}。
          {outlook.uncertain.length > 0 && <>未確定の予定（{outlook.uncertain.join('・')}）も含めています。</>}
          車の買い替えのような大物は、家計アプリの予定に入れてください。
        </div>
      )}
    </section>
  )
}
