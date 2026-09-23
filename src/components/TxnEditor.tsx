import { useState } from 'react'
import { METHODS, type CardRule } from '../config'
import { payoutDateFor } from '../lib/date'
import type { Method, Txn } from '../types'

/**
 * 記録1件を直す／消すための下から出るシート。
 *
 * 入力画面は「速く入れる」ためのものなので、訂正はここに分ける。
 * 日付と支払い手段を変えたら引き落とし予定日も計算し直す。放っておくと
 * カード未確定分（＝実質残高）がずれたままになる。
 */
export const TxnEditor = ({
  txn,
  cardRules,
  onSave,
  onRemove,
  onClose,
}: {
  txn: Txn
  cardRules: Record<'rakuten' | 'view', CardRule>
  onSave: (id: string, patch: Partial<Txn>) => Promise<void>
  onRemove: (id: string) => Promise<void>
  onClose: () => void
}) => {
  const [amount, setAmount] = useState(String(txn.amount))
  const [memo, setMemo] = useState(txn.memo)
  const [method, setMethod] = useState<Method>(txn.method)
  const [date, setDate] = useState(txn.date)

  const value = Number(amount.replace(/[^\d]/g, ''))

  const save = () => {
    if (!value || !date) return
    // 完了は待たない。圏外でも手元には入る（store.ts の注記を参照）
    void onSave(txn.id, {
      amount: value,
      memo: memo.trim(),
      method,
      date,
      payoutDate: payoutDateFor(method, date, cardRules),
    }).catch((e) => console.error('[txn:save]', e))
    onClose()
  }

  const remove = () => {
    if (!confirm(`${txn.memo || 'この記録'}（${txn.amount.toLocaleString('ja-JP')}円）を消しますか？`)) return
    void onRemove(txn.id).catch((e) => console.error('[txn:remove]', e))
    onClose()
  }

  return (
    <div className="sheet-back" role="presentation" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="記録を直す" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>記録を直す</span>
          <button type="button" className="ghost" onClick={onClose}>
            閉じる
          </button>
        </div>

        <div className="rows" style={{ gap: 12 }}>
          <div>
            <label htmlFor="edit-amount" className="label" style={{ display: 'block', marginBottom: 6 }}>
              金額
            </label>
            <input
              id="edit-amount"
              type="number"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="edit-memo" className="label" style={{ display: 'block', marginBottom: 6 }}>
              メモ
            </label>
            <input id="edit-memo" type="text" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </div>

          <div>
            <label htmlFor="edit-date" className="label" style={{ display: 'block', marginBottom: 6 }}>
              使った日
            </label>
            <input id="edit-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div>
            <div className="label" style={{ marginBottom: 6 }}>
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
          </div>

          <button type="button" className="primary" disabled={!value || !date} onClick={save}>
            保存する
          </button>
          <button type="button" className="danger" onClick={remove}>
            この記録を消す
          </button>
        </div>
      </div>
    </div>
  )
}
