import type { User } from 'firebase/auth'
import { useEffect, useMemo, useState } from 'react'
import { AssetsScreen } from './components/AssetsScreen'
import { EventsScreen } from './components/EventsScreen'
import { HomeScreen } from './components/HomeScreen'
import { InputScreen } from './components/InputScreen'
import { SettingsScreen } from './components/SettingsScreen'
import { TabBar, type Tab } from './components/TabBar'
import { APP_NAME, SCENARIO_KEY, TAB_KEY } from './config'
import { login, logout, watchUser } from './lib/auth'
import { buildBonusPlan, carryOverAt, cashBalance, monthlyBudget } from './lib/calc'
import { thisMonth } from './lib/date'
import { buildSeed, parseSeed } from './lib/seed'
import {
  addEvent,
  addTxn,
  importSeed,
  postFixedCosts,
  reconcile,
  removeEvent,
  removeTxn,
  saveAsset,
  saveEvent,
  saveFixed,
  saveProfile,
  updateTxn,
  useData,
} from './lib/store'

const App = () => {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem(TAB_KEY) as Tab) || 'home')
  const [secondChild, setSecondChild] = useState(() => localStorage.getItem(SCENARIO_KEY) === '1')

  useEffect(
    () =>
      watchUser((u) => {
        setUser(u)
        setReady(true)
      }),
    [],
  )

  useEffect(() => localStorage.setItem(TAB_KEY, tab), [tab])
  useEffect(() => localStorage.setItem(SCENARIO_KEY, secondChild ? '1' : '0'), [secondChild])

  const uid = user?.uid ?? null
  const data = useData(uid)
  const month = thisMonth()

  // 起動時に未計上の月があれば固定費を入れる。二重計上は months/<YYYY-MM> の印で防ぐ。
  // months と txns が届く前に動くと印が見えず丸ごと二重計上するので、両方待つ
  useEffect(() => {
    if (!uid || data.loading || !data.monthsLoaded || !data.txnsLoaded) return
    if (data.fixed.length === 0) return
    void postFixedCosts(uid, data.profile, data.fixed, data.months, data.txns, data.cardRules)
  }, [
    uid,
    data.loading,
    data.monthsLoaded,
    data.txnsLoaded,
    data.fixed,
    data.months,
    data.txns,
    data.profile,
    data.cardRules,
  ])

  const plan = useMemo(
    () => buildBonusPlan(data.profile, data.events, data.assets, month),
    [data.profile, data.events, data.assets, month],
  )

  const carryOver = useMemo(
    () => carryOverAt(data.profile, data.fixed, data.events, data.txns, month, plan),
    [data.profile, data.fixed, data.events, data.txns, month, plan],
  )

  const budget = useMemo(
    () =>
      monthlyBudget(
        data.profile,
        data.fixed,
        data.events,
        data.txns,
        month,
        carryOver,
        plan,
        secondChild,
      ),
    [data.profile, data.fixed, data.events, data.txns, month, carryOver, plan, secondChild],
  )

  if (!ready) {
    return (
      <div className="app">
        <div className="gate">
          <p>読み込み中…</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="app">
        <div className="gate">
          <h1>{APP_NAME}</h1>
          <p>
            自分専用の資金管理です。収入・資産・ライフイベントを扱うので、
            合言葉ではなくGoogleアカウントで守ります。
          </p>
          <button type="button" className="primary" onClick={() => void login()}>
            Googleでログイン
          </button>
        </div>
      </div>
    )
  }

  if (data.loading) {
    return (
      <div className="app">
        <div className="gate">
          <p>読み込み中…</p>
        </div>
      </div>
    )
  }

  const cashAsset = data.assets.find((a) => a.kind === 'cash')
  // 照合の比較相手。アプリに登録してある口座残高そのもの。
  // カード未確定分を引くと口座残高ではない数字になるので引かない
  const expectedBalance = cashBalance(data.assets)

  return (
    <div className="app">
      {tab === 'home' && (
        <HomeScreen
          month={month}
          budget={budget}
          assets={data.assets}
          txns={data.txns}
          cardRules={data.cardRules}
          secondChild={secondChild}
          scenarioLabel={data.profile.scenarioLabel}
          onScenario={setSecondChild}
          onSaveTxn={(id, patch) => updateTxn(user.uid, id, patch)}
          onRemoveTxn={(id) => removeTxn(user.uid, id)}
        />
      )}

      {tab === 'input' && (
        <InputScreen cardRules={data.cardRules} onSave={(t) => addTxn(user.uid, t)} />
      )}

      {tab === 'assets' && (
        <AssetsScreen
          profile={data.profile}
          assets={data.assets}
          reconciles={data.reconciles}
          onSave={(id, balance) => saveAsset(user.uid, id, balance)}
        />
      )}

      {tab === 'events' && (
        <EventsScreen
          plan={plan}
          events={data.events}
          onSave={(id, patch) => saveEvent(user.uid, id, patch)}
          onAdd={(e) => addEvent(user.uid, e)}
          onRemove={(id) => removeEvent(user.uid, id)}
        />
      )}

      {tab === 'settings' && (
        <SettingsScreen
          profile={data.profile}
          cardRules={data.cardRules}
          fixed={data.fixed}
          email={user.email ?? ''}
          expectedBalance={expectedBalance}
          reconciles={data.reconciles}
          assets={data.assets}
          seedJson={buildSeed(data.profile, data.fixed, data.events, data.assets)}
          onImport={async (text) => {
            const r = parseSeed(text)
            if (!r.ok) return r.error
            // 書き込みの完了は待たない。圏外だと永久に返らず「取り込み中…」で固まる
            void importSeed(user.uid, r.seed).catch((e) => console.error('[import]', e))
            return null
          }}
          onSaveProfile={(patch) => saveProfile(user.uid, patch)}
          onSaveFixed={(id, patch) => saveFixed(user.uid, id, patch)}
          onSaveAsset={(id, balance) => saveAsset(user.uid, id, balance)}
          onReconcile={(m, bank) =>
            cashAsset
              ? reconcile(user.uid, m, bank, expectedBalance, cashAsset.id)
              : Promise.resolve()
          }
          onLogout={() => void logout()}
        />
      )}

      <TabBar tab={tab} onChange={setTab} />
    </div>
  )
}

export default App
