import { useState } from 'react'
import { cashBalance, emergencyShortfall, totalAssets } from '../lib/calc'
import { formatMonth, num } from '../lib/date'
import type { Asset, Profile, Reconcile } from '../types'

const KIND_COLOR: Record<Asset['kind'], string> = {
  cash: 'var(--green)',
  nisa: 'var(--green-light)',
  insurance: '#d8d2c4',
}

export const AssetsScreen = ({
  profile,
  assets,
  reconciles,
  onSave,
}: {
  profile: Profile
  assets: Asset[]
  reconciles: Reconcile[]
  onSave: (id: string, balance: number) => Promise<void>
}) => {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const total = totalAssets(assets)
  const cash = cashBalance(assets)
  const short = emergencyShortfall(profile, assets)
  const pct = profile.emergencyFund > 0 ? Math.min(100, (cash / profile.emergencyFund) * 100) : 100

  // 口座残高の履歴は月末の残高照合でしか増えない。作り話のグラフは出さない
  const history = [...reconciles].sort((a, b) => (a.id < b.id ? -1 : 1)).slice(-6)
  const maxBalance = Math.max(1, ...history.map((r) => r.bankBalance))

  const commit = async (id: string) => {
    const v = Number(draft.replace(/[^\d-]/g, ''))
    if (!Number.isNaN(v)) await onSave(id, v)
    setEditing(null)
  }

  return (
    <div className="screen">
      <div className="head">
        <h1>資産</h1>
      </div>

      <section className="card" style={{ borderRadius: 18, padding: '18px 20px' }}>
        <div className="label">合計</div>
        <div className="big">
          <span className="num" style={{ fontSize: 38 }}>
            {num(total)}
          </span>
          <span className="unit" style={{ fontSize: 15 }}>
            円
          </span>
        </div>

        <div style={{ marginTop: 14, display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 }}>
          {assets
            .filter((a) => a.balance > 0)
            .map((a) => (
              <div
                key={a.id}
                style={{ width: `${(a.balance / Math.max(1, total)) * 100}%`, background: KIND_COLOR[a.kind] }}
              />
            ))}
        </div>

        <div className="divide rows" style={{ gap: 9 }}>
          {assets.map((a) => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: KIND_COLOR[a.kind] }} />
              <span style={{ flexGrow: 1, fontSize: 13, fontWeight: 500 }}>{a.name}</span>
              {editing === a.id ? (
                <input
                  type="number"
                  inputMode="numeric"
                  autoFocus
                  value={draft}
                  style={{ width: 120, minHeight: 34, textAlign: 'right' }}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => commit(a.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commit(a.id)
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="num"
                  style={{ border: 'none', background: 'none', fontSize: 15, fontWeight: 700, padding: '4px 0' }}
                  onClick={() => {
                    setEditing(a.id)
                    setDraft(String(a.balance))
                  }}
                >
                  {a.balance === 0 ? <span style={{ fontSize: 12, color: 'var(--terra)' }}>未登録</span> : num(a.balance)}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="card" style={{ borderRadius: 18, padding: '18px 20px' }}>
        <div className="row">
          <span style={{ fontSize: 13, fontWeight: 700 }}>生活防衛費</span>
          <span className="num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>
            {pct.toFixed(1)}%
          </span>
        </div>
        <div className="bar light" style={{ marginTop: 11, height: 9 }}>
          <span style={{ width: `${pct}%`, height: 9 }} />
        </div>
        <div className="row small" style={{ marginTop: 9 }}>
          <span className="num">{num(cash)}</span>
          <span className="num">目標 {num(profile.emergencyFund)}</span>
        </div>
        <div className="note">
          {short > 0 ? (
            <>
              あと <strong className="num">{num(short)}</strong> 円。次のボーナスから先に埋めます。
            </>
          ) : (
            <>到達済み。ボーナスは全額ライフイベントとNISAへ回せます。</>
          )}
        </div>
        <p className="small" style={{ margin: '9px 0 0', fontSize: 10.5, lineHeight: 1.6 }}>
          失職しても止められない支出 {num(profile.emergencyFund / 6)}円の6ヶ月分
        </p>
      </section>

      <section style={{ margin: '0 16px' }}>
        <div className="label" style={{ marginBottom: 12 }}>
          口座残高の推移
        </div>
        {history.length === 0 ? (
          <p className="small" style={{ margin: 0, lineHeight: 1.7 }}>
            まだ記録がありません。設定の「残高照合」で月末の口座残高を入れると、ここに積み上がります。
          </p>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 104 }}>
            {history.map((r, i) => (
              <div key={r.id} style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
                <div
                  style={{
                    width: '100%',
                    height: Math.max(8, (r.bankBalance / maxBalance) * 90),
                    borderRadius: '5px 5px 2px 2px',
                    background: i === history.length - 1 ? 'var(--green)' : '#cfd9d4',
                  }}
                />
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>{formatMonth(r.id).replace(/^\d+年/, '')}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
