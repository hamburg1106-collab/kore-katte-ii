import { useEffect, useMemo, useState } from 'react'
import { METHODS, type CardRule } from '../config'
import { formatDayJa, formatShortDay, num, payoutDateFor, todayKey, yen } from '../lib/date'
import { memoSuggestions, quickPicks, type QuickPick } from '../lib/memo'
import type { Method, Txn } from '../types'

const methodLabel = (id: Method) => METHODS.find((m) => m.id === id)?.label ?? id

/** 保存したことの知らせを出しておく時間。取り消しの猶予でもある */
const TOAST_MS = 8000

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '←']

/** 引き落とし予定の説明。即時のものは手段ごとに言い方を変える */
const payoutText = (method: Method, date: string, rules: Record<'rakuten' | 'view', CardRule>): string => {
  if (method === 'rakuten' || method === 'view') return formatDayJa(payoutDateFor(method, date, rules))
  if (method === 'paypay') return '即時（1万円オートチャージ）'
  return '即時'
}

export const InputScreen = ({
  cardRules,
  txns,
  todayLeft,
  onSave,
  onUndo,
}: {
  cardRules: Record<'rakuten' | 'view', CardRule>
  txns: Txn[]
  /** 今日あと使える額。予算をこえている月は null */
  todayLeft: number | null
  onSave: (t: Omit<Txn, 'id'>) => { id: string; written: Promise<void> }
  onUndo: (id: string) => Promise<void>
}) => {
  const today = todayKey()
  const [digits, setDigits] = useState('')
  const [memo, setMemo] = useState('')
  const [method, setMethod] = useState<Method>('rakuten')
  const [date, setDate] = useState(today)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [last, setLast] = useState<{ id: string; text: string } | null>(null)

  const picks = useMemo(() => quickPicks(txns, today), [txns, today])
  const suggestions = useMemo(() => memoSuggestions(txns), [txns])

  useEffect(() => {
    if (!last) return
    const timer = setTimeout(() => setLast(null), TOAST_MS)
    return () => clearTimeout(timer)
  }, [last])

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
  const write = (value: number, text: string, how: Method) => {
    setError(null)
    const { id, written } = onSave({
      date,
      amount: value,
      memo: text,
      method: how,
      payoutDate: payoutDateFor(how, date, cardRules),
      // 手入力は消費として扱う。投資や貯蓄への振替は設定の固定費で持つ
      kind: 'expense',
      source: 'manual',
      createdAt: Date.now(),
    })
    written.catch((e) => {
      console.error('[txn:add]', e)
      setError('保存できませんでした。もう一度押してください。')
    })
    const when = date === today ? '' : `${formatShortDay(date)}に `
    setLast({ id, text: `${when}${text || 'メモなし'} ${yen(value)}を記録しました` })
  }

  const save = () => {
    if (amount <= 0 || !date) return
    write(amount, memo.trim(), method)
    setDigits('')
    setMemo('')
    setDone(true)
  }

  /** よく使う組み合わせを1タップで記録する。押し間違いは直後の「取り消す」で戻せる */
  const quick = (p: QuickPick) => {
    if (!date) return
    write(p.amount, p.memo, p.method)
    setDone(false)
  }

  const undo = () => {
    if (!last) return
    void onUndo(last.id).catch((e) => console.error('[txn:undo]', e))
    setLast(null)
    setDone(false)
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

      {picks.length > 0 && (
        <section style={{ margin: '0 16px 12px' }}>
          <div className="label" style={{ marginBottom: 8 }}>
            よく使う（押すとすぐ記録）
          </div>
          <div className="quick">
            {picks.map((p) => (
              <button
                key={`${p.memo}|${p.amount}`}
                type="button"
                aria-label={`${p.memo} ${p.amount}円を${methodLabel(p.method)}で記録する`}
                onClick={() => quick(p)}
              >
                <span className="quick-memo">{p.memo}</span>
                <span className="quick-sub">
                  <span className="num">{yen(p.amount)}</span>・{methodLabel(p.method)}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

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
            list="memo-suggestions"
            autoComplete="off"
            onChange={(e) => setMemo(e.target.value)}
          />
          {/* 前と同じ言葉を選べるようにする。表記がそろうほどメモ別の集計が正確になる */}
          <datalist id="memo-suggestions">
            {suggestions.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
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

      {/* 浮かせると保存ボタンを隠して次の記録が入れられないので、流れの中に置く */}
      {last && (
        <div className="toast" role="status">
          <div style={{ flexGrow: 1, minWidth: 0 }}>
            <div>{last.text}</div>
            {todayLeft !== null && (
              <div className="toast-sub">
                {todayLeft >= 0 ? `今日あと ${yen(todayLeft)}` : `今日の1日分を ${yen(-todayLeft)} こえています`}
              </div>
            )}
          </div>
          <button type="button" onClick={undo}>
            取り消す
          </button>
        </div>
      )}

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
