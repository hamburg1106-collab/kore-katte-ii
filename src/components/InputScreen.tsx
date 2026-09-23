import { useState } from 'react'
import { METHODS, type CardRule } from '../config'
import { formatDayJa, num, payoutDateFor, todayKey } from '../lib/date'
import type { Method, Txn } from '../types'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '←']

/** 引き落とし予定の説明。即時のものは手段ごとに言い方を変える */
const payoutText = (method: Method, date: string, rules: Record<'rakuten' | 'view', CardRule>): string => {
  if (method === 'rakuten' || method === 'view') return formatDayJa(payoutDateFor(method, date, rules))
  if (method === 'paypay') return '即時（1万円オートチャージ）'
  return '即時'
}

export const InputScreen = ({
  cardRules,
  onSave,
}: {
  cardRules: Record<'rakuten' | 'view', CardRule>
  onSave: (t: Omit<Txn, 'id'>) => Promise<void>
}) => {
  const today = todayKey()
  const [digits, setDigits] = useState('')
  const [memo, setMemo] = useState('')
  const [method, setMethod] = useState<Method>('rakuten')
  const [date, setDate] = useState(today)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const amount = digits === '' ? 0 : parseInt(digits, 10)

  const tap = (key: string) => {
    setDone(false)
    if (key === '←') {
      setDigits((d) => d.slice(0, -1))
      return
    }
    setDigits((d) => (d.length >= 8 ? d : (d + key).replace(/^0+(?=\d)/, '')))
  }

  /**
   * 保存。完了を待たない。
   *
   * Firestoreの書き込みはサーバーが受け取るまで解決しないので、圏外で await すると
   * 「保存中…」から戻らず、次の記録も入れられなくなる。実際にはその場で手元
   * （IndexedDB）に入っていて、電波が戻れば自動で送られる。だから画面は先に進める。
   */
  const save = () => {
    if (amount <= 0 || !date) return
    setError(null)
    void onSave({
      date,
      amount,
      memo: memo.trim(),
      method,
      payoutDate: payoutDateFor(method, date, cardRules),
      // 手入力は消費として扱う。投資や貯蓄への振替は設定の固定費で持つ
      kind: 'expense',
      source: 'manual',
      createdAt: Date.now(),
    }).catch((e) => {
      console.error('[txn:add]', e)
      setError('保存できませんでした。もう一度押してください。')
    })
    setDigits('')
    setMemo('')
    setDone(true)
  }

  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="head">
        <h1>記録する</h1>
        {/* 入れ忘れた前日ぶんも入れられるように、日付は変えられる */}
        <label className="date-pick">
          <span className="sub" style={{ color: date === today ? undefined : 'var(--terra)' }}>
            {date === today ? '今日' : date.replace(/-/g, '/')}
          </span>
          <input
            type="date"
            value={date}
            aria-label="使った日"
            onChange={(e) => setDate(e.target.value || today)}
          />
        </label>
      </div>

      <section className="card" style={{ borderRadius: 18, padding: '18px 20px 16px' }}>
        <div
          style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 4, minHeight: 52 }}
        >
          <span
            className="num"
            style={{ fontSize: 46, fontWeight: 700, lineHeight: 1, color: amount === 0 ? '#b6b0a2' : 'var(--ink)' }}
          >
            {num(amount)}
          </span>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--sub)' }}>円</span>
        </div>
        <div className="divide">
          <label htmlFor="memo" className="label" style={{ display: 'block', marginBottom: 6 }}>
            メモ
          </label>
          <input
            id="memo"
            type="text"
            value={memo}
            placeholder="ラーメン"
            onChange={(e) => setMemo(e.target.value)}
          />
        </div>
      </section>

      <section style={{ margin: '0 16px 16px' }}>
        <div className="label" style={{ marginBottom: 8 }}>
          支払い手段
        </div>
        <div className="methods">
          {METHODS.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={method === m.id}
              onClick={() => setMethod(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div
          style={{
            marginTop: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            background: 'var(--chip)',
            borderRadius: 10,
            padding: '9px 12px',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5v5l3 2" />
          </svg>
          <span style={{ fontSize: 12, color: 'var(--sub)', fontWeight: 500 }}>
            引き落とし予定 <strong>{payoutText(method, date, cardRules)}</strong>
          </span>
        </div>
      </section>

      <div style={{ flexGrow: 1 }} />

      <section style={{ margin: '0 16px 12px' }}>
        <div className="pad">
          {KEYS.map((k) => (
            <button key={k} type="button" className={k === '←' ? 'back' : undefined} onClick={() => tap(k)}>
              {k}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="primary"
          style={{ marginTop: 10 }}
          disabled={amount <= 0}
          onClick={save}
        >
          {done ? '保存しました' : '保存する'}
        </button>
        {error && (
          <p className="small" style={{ margin: '8px 0 0', color: 'var(--terra)', lineHeight: 1.6 }}>
            {error}
          </p>
        )}
      </section>
    </div>
  )
}
