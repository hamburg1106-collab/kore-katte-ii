import type { Method, Profile } from './types'

export const APP_NAME = 'これ買っていい'

/** 最後に開いていたタブ。次に開いたとき同じ画面に戻す */
export const TAB_KEY = 'katte:tab'

/** もしもシナリオのON/OFF。端末ごとに覚える（保存データは変えない、見え方だけ） */
export const SCENARIO_KEY = 'katte:scenario'

/**
 * ここには実額を一切書かない。
 *
 * GitHub Pagesの無料プランは公開リポジトリしか使えず、ビルド後のJSにも
 * 値がそのまま残る。手取り・資産残高・保険の契約先をコードに置くと、
 * 公開した瞬間に誰でも読める。
 *
 * 実際の数字は seed.local.json（.gitignore済み・手元にしかない）に置き、
 * 設定画面の「初期データの取り込み」から1回だけ貼り付ける。
 * 以後はFirestoreにあるので二度と入力しない。
 */

/** 支払い手段。よく使う順 */
export const METHODS: { id: Method; label: string }[] = [
  { id: 'rakuten', label: '楽天' },
  { id: 'view', label: 'ビュー' },
  { id: 'cash', label: '現金' },
  { id: 'bank', label: '口座' },
  { id: 'paypay', label: 'PayPay' },
]

/**
 * カードの締め日と支払日。
 *
 * closingDay=31 は「月末締め」の意味。payAfterMonths は締めてから何ヶ月後に払うか。
 * 金額ではないので、ここは書いても差し支えない。
 */
export type CardRule = {
  closingDay: number
  payDay: number
  payAfterMonths: number
}

export const DEFAULT_CARD_RULES: Record<'rakuten' | 'view', CardRule> = {
  rakuten: { closingDay: 31, payDay: 27, payAfterMonths: 1 },
  view: { closingDay: 5, payDay: 4, payAfterMonths: 1 },
}

/** 繰り越しの起点。これより前の月には遡らない */
export const START_MONTH = '2026-10'

/**
 * 出荷時のプロフィール。金額はすべて0で、取り込みで埋める。
 * 給料日や賞与月はありふれた値なのでそのまま持つ（取り込みで上書きされる）。
 */
export const DEFAULT_PROFILE: Profile = {
  takeHome: 0,
  payday: 25,
  bonusAmount: 0,
  bonusMonths: [6, 12],
  bonusDay: 10,
  emergencyFund: 0,
  annualNisaLump: 0,
  secondChildMonthly: 0,
  scenarioLabel: 'もしも',
  startMonth: START_MONTH,
}

export const COLORS = {
  ground: '#f7f5f0',
  card: '#ffffff',
  ink: '#1c1b18',
  muted: '#6b675e',
  line: '#e4e0d6',
  green: '#2f6f5e',
  greenLight: '#7fa99b',
  terra: '#a8492e',
  gold: '#f2c879',
  sand: '#8a7b4f',
}
