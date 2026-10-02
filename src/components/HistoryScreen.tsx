import { useMemo, useState } from 'react'
import { METHODS, type CardRule } from '../config'
import { formatDayWeek, formatMonth, monthOf, num, shiftMonth, thisMonth, todayKey, yen } from '../lib/date'
import { firstMonth, memoKey, memoSummary } from '../lib/memo'
import type { Txn } from '../types'
import { TxnEditor } from './TxnEditor'

const methodLabel = (id: string) => METHODS.find((m) => m.id === id)?.label ?? id

type View = 'date' | 'memo'

/** 画面に出す名前。メモ別の集計（memoSummary）と同じ言い方にそろえて、押したら同じもので絞れるようにする */
const labelOf = (t: Txn): string => t.memo.trim() || (t.source === 'unknown' ? '使途不明' : '（メモなし）')

/** 「約27万円」。年換算は概算なので千円単位以下を見せない */
const roughYen = (n: number): string =>
  n >= 10_000 ? `約${(Math.round(n / 1000) / 10).toLocaleString('ja-JP')}万円` : `約${num(Math.round(n / 100) * 100)}円`

/**
 * 記録の一覧。
 *
 * ホームには直近4件しか出ないので、それより前の記録はここで見て直す。
 * 「日付順」は記録の確認と訂正のため、「メモ別」は何に使っているかを見るため。
 * メモ別の行を押すと、そのメモで絞った日付順に切り替わる。
 *
 * 固定費は既定では隠す。毎月同じものが並ぶだけで、見たいもの（自分の使い方）が埋もれる。
 */
export const HistoryScreen = ({
  txns,
  startMonth,
  cardRules,
  onSaveTxn,
  onRemoveTxn,
}: {
  txns: Txn[]
  startMonth: string
  cardRules: Record<'rakuten' | 'view', CardRule>
  onSaveTxn: (id: string, patch: Partial<Txn>) => Promise<void>
  onRemoveTxn: (id: string) => Promise<void>
}) => {
  const current = thisMonth()
  const [month, setMonth] = useState(current)
  const [view, setView] = useState<View>('date')
  const [query, setQuery] = useState('')
  const [showFixed, setShowFixed] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)

  const oldest = firstMonth(txns, startMonth)
  const q = memoKey(query)

  const inMonth = useMemo(() => txns.filter((t) => monthOf(t.date) === month), [txns, month])

  const shown = useMemo(
    () =>
      inMonth.filter(
        (t) => (showFixed || t.source !== 'fixed') && (q === '' || memoKey(labelOf(t)).includes(q)),
      ),
    [inMonth, showFixed, q],
  )

  const total = shown.reduce((sum, t) => sum + t.amount, 0)

  // 日付ごとにまとめる。txns はすでに新しい順に並んでいる
  const byDay = useMemo(() => {
    const days: { date: string; list: Txn[]; total: number }[] = []
    for (const t of shown) {
      const last = days[days.length - 1]
      if (last && last.date === t.date) {
        last.list.push(t)
        last.total += t.amount
      } else {
        days.push({ date: t.date, list: [t], total: t.amount })
      }
    }
    return days
  }, [shown])

  const groups = useMemo(() => memoSummary(txns, month, todayKey()), [txns, month])
  const top = groups[0]?.total ?? 0

  const editingTxn = txns.find((t) => t.id === editing) ?? null

  const pickMemo = (memo: string) => {
    setQuery(memo)
    setView('date')
  }

  return (
    <div className="screen">
      <div className="head">
        <h1>記録</h1>
        <span className="sub">{view === 'date' ? `${shown.length}件` : `${groups.length}種類`}</span>
      </div>

      <section className="month-nav">
        <button
          type="button"
          className="tap"
          aria-label="前の月"
          disabled={month <= oldest}
          onClick={() => setMonth((m) => shiftMonth(m, -1))}
        >
          ‹
        </button>
        <span style={{ fontSize: 15, fontWeight: 700 }}>{formatMonth(month)}</span>
        <button
          type="button"
          className="tap"
          aria-label="次の月"
          disabled={month >= current}
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
        >
          ›
        </button>
      </section>

      <section style={{ margin: '0 16px 12px' }}>
        <div className="seg">
          <button type="button" aria-pressed={view === 'date'} onClick={() => setView('date')}>
            日付順
          </button>
          <button type="button" aria-pressed={view === 'memo'} onClick={() => setView('memo')}>
            メモ別
          </button>
        </div>
      </section>

      {view === 'date' && (
        <>
          <section style={{ margin: '0 16px 12px' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={query}
                placeholder="メモで絞り込む（例: コーヒー）"
                aria-label="メモで絞り込む"
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button type="button" className="ghost" style={{ flexShrink: 0, minHeight: 44 }} onClick={() => setQuery('')}>
                  解除
                </button>
              )}
            </div>
            <label className="check">
              <input type="checkbox" checked={showFixed} onChange={(e) => setShowFixed(e.target.checked)} />
              固定費も表示する
            </label>
          </section>

          <section className="card">
            <div className="row">
              <span style={{ fontSize: 13, fontWeight: 700 }}>
                {query ? `「${query.trim()}」の合計` : showFixed ? '合計（固定費込み）' : '使った合計'}
              </span>
              <span className="num" style={{ fontSize: 22, fontWeight: 700 }}>
                {yen(total)}
              </span>
            </div>
            {query && shown.length > 0 && (
              <div className="small" style={{ marginTop: 6 }}>
                {shown.length}回・1回あたり {yen(total / shown.length)}
              </div>
            )}
          </section>

          {byDay.length === 0 ? (
            <p className="small" style={{ margin: '0 20px', lineHeight: 1.7 }}>
              {query ? '当てはまる記録がありません。' : 'この月の記録はまだありません。'}
            </p>
          ) : (
            byDay.map((d) => (
              <section key={d.date} style={{ margin: '0 16px 14px' }}>
                <div className="row" style={{ margin: '0 4px 6px' }}>
                  <span className="label">{formatDayWeek(d.date)}</span>
                  <span className="num small">{yen(d.total)}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {d.list.map((t) =>
                    // 固定費は設定のテンプレから毎月作られる。ここで直すと重複の片づけと食い違うので触らせない
                    t.source === 'fixed' ? (
                      <div key={t.id} className="card txn-row fixed">
                        <span style={{ flexGrow: 1, fontSize: 13, fontWeight: 500 }}>{t.memo}</span>
                        <span className="chip">固定費</span>
                        <span className="num" style={{ fontSize: 14, fontWeight: 700 }}>
                          {yen(t.amount)}
                        </span>
                      </div>
                    ) : (
                      <button
                        key={t.id}
                        type="button"
                        className="card txn-row"
                        aria-label={`${t.memo || 'メモなし'} ${t.amount}円 を直す`}
                        onClick={() => setEditing(t.id)}
                      >
                        <span style={{ flexGrow: 1, fontSize: 13, fontWeight: 500, textAlign: 'left' }}>
                          {labelOf(t)}
                        </span>
                        <span className="chip">{methodLabel(t.method)}</span>
                        <span className="num" style={{ fontSize: 14, fontWeight: 700 }}>
                          {yen(t.amount)}
                        </span>
                      </button>
                    ),
                  )}
                </div>
              </section>
            ))
          )}
        </>
      )}

      {view === 'memo' && (
        <>
          {groups.length === 0 ? (
            <p className="small" style={{ margin: '0 20px', lineHeight: 1.7 }}>
              この月の記録はまだありません。
            </p>
          ) : (
            <section className="card">
              <div className="rows" style={{ gap: 14 }}>
                {groups.map((g) => (
                  <button
                    key={g.memo}
                    type="button"
                    className="memo-row"
                    aria-label={`${g.memo}の記録を見る`}
                    onClick={() => pickMemo(g.memo)}
                  >
                    <div className="row">
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{g.memo}</span>
                      <span className="num" style={{ fontSize: 15, fontWeight: 700 }}>
                        {yen(g.total)}
                      </span>
                    </div>
                    <div className="bar light" style={{ marginTop: 6, height: 5 }}>
                      <span style={{ width: `${top > 0 ? (g.total / top) * 100 : 0}%`, height: 5 }} />
                    </div>
                    <div className="row small" style={{ marginTop: 5 }}>
                      <span>
                        {g.count}回・{g.share}%
                      </span>
                      {g.yearly !== null && (
                        <span style={{ color: 'var(--terra)', fontWeight: 700 }}>
                          {month === current ? 'このペースで' : ''}年に{roughYen(g.yearly)}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
          <p className="small" style={{ margin: '0 20px', lineHeight: 1.7 }}>
            固定費は入りません。年換算は、その月に2回以上あったものだけに出します。
            メモの言葉をそろえるほど正確になります。押すと、そのメモの記録が並びます。
          </p>
        </>
      )}

      {editingTxn && (
        <TxnEditor
          txn={editingTxn}
          cardRules={cardRules}
          onSave={onSaveTxn}
          onRemove={onRemoveTxn}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
