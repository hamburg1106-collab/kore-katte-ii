import { useState } from 'react'
import { METHODS, type CardRule } from '../config'
import { fixedExpenseTotal, fixedTotal, fixedTransferTotal } from '../lib/calc'
import { formatMonth, num, thisMonth } from '../lib/date'
import type { FixedCost, Profile } from '../types'

const methodLabel = (id: string) => METHODS.find((m) => m.id === id)?.label ?? id

export const SettingsScreen = ({
  profile,
  cardRules,
  fixed,
  email,
  expectedBalance,
  seedJson,
  onSaveProfile,
  onSaveFixed,
  onReconcile,
  onImport,
  onLogout,
}: {
  profile: Profile
  cardRules: Record<'rakuten' | 'view', CardRule>
  fixed: FixedCost[]
  email: string
  expectedBalance: number
  seedJson: string
  onSaveProfile: (patch: Partial<Profile>) => Promise<void>
  onSaveFixed: (id: string, patch: Partial<FixedCost>) => Promise<void>
  onReconcile: (month: string, bankBalance: number) => Promise<void>
  onImport: (text: string) => Promise<string | null>
  onLogout: () => void
}) => {
  const [openFixed, setOpenFixed] = useState(false)
  const [balance, setBalance] = useState('')
  const [reconciling, setReconciling] = useState(false)
  const [seedText, setSeedText] = useState('')
  const [seedMsg, setSeedMsg] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const month = thisMonth()
  const empty = profile.takeHome === 0

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

  const runReconcile = async () => {
    const v = Number(balance.replace(/[^\d]/g, ''))
    if (!v || reconciling) return
    setReconciling(true)
    try {
      await onReconcile(month, v)
      setBalance('')
    } finally {
      setReconciling(false)
    }
  }

  const diff = balance ? expectedBalance - Number(balance.replace(/[^\d]/g, '')) : 0

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
              {num(fixedExpenseTotal(fixed))}
            </span>
          </div>
          <div className="row">
            <span>資金移動（貯蓄・投資）</span>
            <span className="num" style={{ fontWeight: 700, color: 'var(--green)' }}>
              {num(fixedTransferTotal(fixed))}
            </span>
          </div>
          <div className="row divide">
            <span style={{ fontWeight: 700 }}>合計</span>
            <span className="num" style={{ fontWeight: 700 }}>
              {num(fixedTotal(fixed))}
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
          ビューカードは初回の請求明細で実際の日付を確認してください。違っていたら config.ts の
          DEFAULT_CARD_RULES を直します。
        </p>
      </section>

      <section className="card">
        <div className="label">ルール</div>
        <div className="rows" style={{ marginTop: 10, fontSize: 13 }}>
          <div className="row">
            <span>生活防衛費</span>
            <span className="num" style={{ fontWeight: 700 }}>
              {num(profile.emergencyFund)}
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
        <div className="label">残高照合（{formatMonth(month)}）</div>
        <p className="small" style={{ margin: '8px 0 10px', lineHeight: 1.6 }}>
          実際の口座残高を入れると、記録との差を「使途不明」として1件足します。完璧に記録しなくても
          残高が嘘にならないようにするためのものです。
        </p>
        <div className="row">
          <span style={{ fontSize: 13 }}>記録上の残高</span>
          <span className="num" style={{ fontWeight: 700 }}>
            {num(expectedBalance)}
          </span>
        </div>
        <div className="rows" style={{ marginTop: 10, gap: 9 }}>
          <input
            type="number"
            inputMode="numeric"
            placeholder="実際の口座残高"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
          />
          {balance !== '' && (
            <div className="row small">
              <span>差額（使途不明として計上）</span>
              <span className="num" style={{ color: diff > 0 ? 'var(--terra)' : 'var(--green)' }}>
                {diff > 0 ? '−' : '+'}
                {num(Math.abs(diff))}
              </span>
            </div>
          )}
          <button type="button" className="primary" style={{ minHeight: 44 }} disabled={!balance || reconciling} onClick={runReconcile}>
            {reconciling ? '照合中…' : '照合する'}
          </button>
        </div>
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
