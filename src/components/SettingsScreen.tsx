import { useState } from 'react'
import { METHODS, type CardRule } from '../config'
import { fixedExpenseTotal, fixedTotal, fixedTransferTotal } from '../lib/calc'
import { formatMonth, formatShortDay, formatUpdated, thisMonth, toDateKey, yen } from '../lib/date'
import type { Asset, FixedCost, Profile, Reconcile } from '../types'

const methodLabel = (id: string) => METHODS.find((m) => m.id === id)?.label ?? id

export const SettingsScreen = ({
  profile,
  cardRules,
  fixed,
  email,
  expectedBalance,
  reconciles,
  assets,
  seedJson,
  onSaveProfile,
  onSaveFixed,
  onReconcile,
  onSaveAsset,
  onImport,
  onLogout,
}: {
  profile: Profile
  cardRules: Record<'rakuten' | 'view', CardRule>
  fixed: FixedCost[]
  email: string
  expectedBalance: number
  reconciles: Reconcile[]
  assets: Asset[]
  seedJson: string
  onSaveProfile: (patch: Partial<Profile>) => Promise<void>
  onSaveFixed: (id: string, patch: Partial<FixedCost>) => Promise<void>
  onReconcile: (month: string, bankBalance: number) => Promise<void>
  onSaveAsset: (id: string, balance: number) => Promise<void>
  onImport: (text: string) => Promise<string | null>
  onLogout: () => void
}) => {
  const [openFixed, setOpenFixed] = useState(false)
  // 棚卸しの下書き。資産IDごとに持つ。空のままの行は触らない
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [stockMsg, setStockMsg] = useState<string | null>(null)
  const [seedText, setSeedText] = useState('')
  const [seedMsg, setSeedMsg] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const month = thisMonth()
  const empty = profile.takeHome === 0
  const alreadyDone = reconciles.find((r) => r.id === month) ?? null

  const runImport = async () => {
    if (!seedText.trim() || importing) return
    setImporting(true)
    try {
      const error = await onImport(seedText)
      setSeedMsg(error ?? '取り込みました')
      if (!error) setSeedText('')
    } finally {
      setImporting(false)
    }
  }

  const copyExport = async () => {
    try {
      await navigator.clipboard.writeText(seedJson)
      setSeedMsg('いまの内容をクリップボードにコピーしました')
    } catch {
      setSeedMsg('コピーできませんでした。下の枠の中身を手で選んでください')
      setSeedText(seedJson)
    }
  }

  /** 入力欄の文字列を金額に直す。空欄や数字でないものは null（＝触らない） */
  const readDraft = (id: string): number | null => {
    const raw = drafts[id]
    if (raw === undefined) return null
    const cleaned = raw.replace(/[^\d-]/g, '')
    if (cleaned === '') return null
    const v = Number(cleaned)
    return Number.isFinite(v) ? v : null
  }

  const cashAsset = assets.find((a) => a.kind === 'cash') ?? null
  const cashDraft = cashAsset ? readDraft(cashAsset.id) : null
  const diff = cashDraft === null ? 0 : expectedBalance - cashDraft
  const filled = assets.filter((a) => readDraft(a.id) !== null).length

  /**
   * 棚卸しをまとめて保存する。
   *
   * 現金だけは残高照合として扱い、履歴（口座残高の推移）に1行残す。
   * NISAと変額保険は評価額の上書きだけで、履歴は残さない。
   * 空欄の行は触らない——全部を毎回入れ直させると続かないので、分かるものだけでいい。
   */
  const runStocktake = () => {
    if (filled === 0) return
    if (
      cashDraft !== null &&
      alreadyDone &&
      !confirm(`${formatMonth(month)}はすでに照合済みです。入れ直しますか？`)
    ) {
      return
    }

    for (const a of assets) {
      const v = readDraft(a.id)
      if (v === null) continue
      // 完了は待たない（圏外だと返らない）。手元には入っている
      if (a.kind === 'cash') {
        void onReconcile(month, v).catch((e) => console.error('[reconcile]', e))
      } else {
        void onSaveAsset(a.id, v).catch((e) => console.error('[asset:save]', e))
      }
    }

    setStockMsg(`${filled}件を更新しました`)
    setDrafts({})
  }

  return (
    <div className="screen">
      <div className="head">
        <h1>設定</h1>
      </div>

      {empty && (
        <section className="card" style={{ borderColor: 'var(--green)' }}>
          <div className="label" style={{ color: 'var(--green)' }}>
            まだ数字が入っていません
          </div>
          <p className="small" style={{ margin: '8px 0 0', lineHeight: 1.7 }}>
            収入・固定費・資産は、公開リポジトリに載らないようコードから外してあります。
            手元の <strong>seed.local.json</strong> の中身を、下の「初期データ」に貼り付けてください。1回で全部入ります。
          </p>
        </section>
      )}

      <section className="card">
        <div className="label">収入</div>
        <div className="rows" style={{ marginTop: 10, fontSize: 13 }}>
          <div className="row">
            <span>手取り月収</span>
            <input
              type="number"
              inputMode="numeric"
              defaultValue={profile.takeHome}
              style={{ width: 130, minHeight: 36, textAlign: 'right' }}
              onBlur={(e) => onSaveProfile({ takeHome: Number(e.target.value) || profile.takeHome })}
            />
          </div>
          <div className="row">
            <span>ボーナス（{profile.bonusMonths.join('月・')}月）</span>
            <input
              type="number"
              inputMode="numeric"
              defaultValue={profile.bonusAmount}
              style={{ width: 130, minHeight: 36, textAlign: 'right' }}
              onBlur={(e) => onSaveProfile({ bonusAmount: Number(e.target.value) || profile.bonusAmount })}
            />
          </div>
          <div className="row small">
            <span>給料日 / 賞与日</span>
            <span>
              {profile.payday}日 / {profile.bonusDay}日
            </span>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="row">
          <span className="label">固定費</span>
          <button type="button" className="ghost" onClick={() => setOpenFixed((v) => !v)}>
            {fixed.length}件
          </button>
        </div>
        <div className="rows" style={{ marginTop: 10, fontSize: 13 }}>
          <div className="row">
            <span>支出</span>
            <span className="num" style={{ fontWeight: 700 }}>
              {yen(fixedExpenseTotal(fixed))}
            </span>
          </div>
          <div className="row">
            <span>資金移動（貯蓄・投資）</span>
            <span className="num" style={{ fontWeight: 700, color: 'var(--green)' }}>
              {yen(fixedTransferTotal(fixed))}
            </span>
          </div>
          <div className="row divide">
            <span style={{ fontWeight: 700 }}>合計</span>
            <span className="num" style={{ fontWeight: 700 }}>
              {yen(fixedTotal(fixed))}
            </span>
          </div>
        </div>

        {openFixed && (
          <div className="divide rows" style={{ gap: 10 }}>
            {fixed.map((f) => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flexGrow: 1, fontSize: 12.5 }}>
                  {f.name}
                  {f.kind === 'transfer' && <span className="chip" style={{ marginLeft: 6 }}>移動</span>}
                  {f.variable && <span className="chip" style={{ marginLeft: 6 }}>変動</span>}
                </span>
                <span className="chip">{methodLabel(f.method)}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  defaultValue={f.amount}
                  style={{ width: 90, minHeight: 34, textAlign: 'right' }}
                  onBlur={(e) => onSaveFixed(f.id, { amount: Number(e.target.value) || f.amount })}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <div className="label">カード</div>
        <div className="rows" style={{ marginTop: 10, fontSize: 13 }}>
          <div className="row">
            <span style={{ fontWeight: 500 }}>楽天カード</span>
            <span className="small">
              {cardRules.rakuten.closingDay >= 28 ? '月末' : `${cardRules.rakuten.closingDay}日`}締め → 翌月
              {cardRules.rakuten.payDay}日
            </span>
          </div>
          <div className="row">
            <span style={{ fontWeight: 500 }}>ビューカード</span>
            <span className="small">
              {cardRules.view.closingDay}日締め → 翌月{cardRules.view.payDay}日
            </span>
          </div>
        </div>
        <p className="small" style={{ margin: '10px 0 0', fontSize: 11, lineHeight: 1.6 }}>
          ビューカードは初回の請求明細で実際の日付を確認してください。違っていたら直せるので
          教えてください。
        </p>
      </section>

      <section className="card">
        <div className="label">ルール</div>
        <div className="rows" style={{ marginTop: 10, fontSize: 13 }}>
          <div className="row">
            <span>生活防衛費</span>
            <span className="num" style={{ fontWeight: 700 }}>
              {yen(profile.emergencyFund)}
            </span>
          </div>
          <div className="row small">
            <span>月の区切り</span>
            <span>1日 〜 末日</span>
          </div>
          <div className="row small">
            <span>使い残し</span>
            <span>翌月へ繰り越す</span>
          </div>
          <div className="row small">
            <span>起点</span>
            <span>{formatMonth(profile.startMonth)}</span>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="label">棚卸し（{formatMonth(month)}）</div>
        <p className="small" style={{ margin: '8px 0 12px', lineHeight: 1.6 }}>
          月に1回、口座残高と評価額をまとめて入れます。<strong>分かるものだけでかまいません。</strong>
          空欄の行は触りません。口座残高だけは履歴に残り、資産画面の「口座残高の推移」になります。
        </p>

        {alreadyDone && (
          <p className="small" style={{ margin: '0 0 12px', lineHeight: 1.6, color: 'var(--green)' }}>
            {formatShortDay(toDateKey(new Date(alreadyDone.postedAt)))} に口座残高を照合済み（
            {yen(alreadyDone.bankBalance)}）。入れ直すと差し替わります。
          </p>
        )}

        <div className="rows" style={{ gap: 12 }}>
          {assets.map((a) => {
            const seen = formatUpdated(a.updatedAt)
            return (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ flexGrow: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 500 }}>{a.name}</span>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 10,
                      marginTop: 2,
                      color: seen.stale ? 'var(--terra)' : 'var(--muted)',
                    }}
                  >
                    {yen(a.balance)} ・ {seen.text}
                  </span>
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder={String(a.balance)}
                  value={drafts[a.id] ?? ''}
                  style={{ width: 128, minHeight: 40, textAlign: 'right' }}
                  onChange={(e) => {
                    setStockMsg(null)
                    setDrafts((d) => ({ ...d, [a.id]: e.target.value }))
                  }}
                />
              </div>
            )
          })}
        </div>

        {cashDraft !== null && (
          <div className="row small divide">
            <span>登録してある口座残高との差</span>
            <span className="num" style={{ color: diff > 0 ? 'var(--terra)' : 'var(--green)' }}>
              {diff > 0 ? '−' : '+'}
              {yen(Math.abs(diff))}
            </span>
          </div>
        )}

        {stockMsg && (
          <p className="small" style={{ margin: '10px 0 0', lineHeight: 1.6, color: 'var(--green)' }}>
            {stockMsg}
          </p>
        )}

        <button
          type="button"
          className="primary"
          style={{ marginTop: 12, minHeight: 44 }}
          disabled={filled === 0}
          onClick={runStocktake}
        >
          {filled === 0 ? '棚卸しを保存' : `${filled}件を保存`}
        </button>

        <p className="small" style={{ margin: '10px 0 0', fontSize: 11, lineHeight: 1.6 }}>
          楽天証券にも保険会社にも、個人が使える残高取得APIはありません。自動では入らないので、
          ここで手を動かす前提の作りにしています。
        </p>
      </section>

      <section className="card">
        <div className="row">
          <span className="label">初期データ</span>
          <button type="button" className="ghost" onClick={copyExport}>
            いまの内容を書き出す
          </button>
        </div>
        <p className="small" style={{ margin: '8px 0 10px', lineHeight: 1.6 }}>
          貼り付けると、固定費・ライフイベント・資産を<strong>入れ替えます</strong>（記録は消えません）。
          書き出した内容は seed.local.json に保存しておくと、作り直すときに使えます。
        </p>
        <textarea
          value={seedText}
          placeholder="seed.local.json の中身をここに貼る"
          spellCheck={false}
          onChange={(e) => {
            setSeedText(e.target.value)
            setSeedMsg(null)
          }}
          style={{
            width: '100%',
            minHeight: 96,
            border: '1px solid #dbd6ca',
            borderRadius: 10,
            padding: '10px 12px',
            fontSize: 12,
            fontFamily: 'ui-monospace, monospace',
            background: '#fdfcf9',
            resize: 'vertical',
          }}
        />
        {seedMsg && (
          <p className="small" style={{ margin: '8px 0 0', lineHeight: 1.6 }}>
            {seedMsg}
          </p>
        )}
        <button
          type="button"
          className="primary"
          style={{ marginTop: 10, minHeight: 44 }}
          disabled={!seedText.trim() || importing}
          onClick={runImport}
        >
          {importing ? '取り込み中…' : '取り込む'}
        </button>
      </section>

      <section className="card">
        <div className="label">アカウント</div>
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flexGrow: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 500 }}>{email}</div>
            <div className="small" style={{ fontSize: 11 }}>
              このアカウントからのみ閲覧できます
            </div>
          </div>
          <button type="button" className="ghost" onClick={onLogout}>
            ログアウト
          </button>
        </div>
      </section>
    </div>
  )
}
