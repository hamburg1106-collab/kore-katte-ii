/** 支払い手段。カードは引き落としが1〜2ヶ月ずれる */
export type Method = 'rakuten' | 'view' | 'cash' | 'bank' | 'paypay'

/**
 * 金の動きの種別。
 *
 * expense  = 消費。出ていって戻らない
 * transfer = 資金移動。財布から資産へ移るだけ（貯蓄型保険、積立投資）
 *
 * どちらも「今月使える現金」からは引くが、純資産はtransferでは減らない。
 * ここを分けないと、毎月5万円ぶん貧しいと言い続けるアプリになる。
 */
export type Kind = 'expense' | 'transfer'

/**
 * ライフイベントの確度。
 *
 * fixed       = 確定。時期も金額も決まっている
 * likely      = 見込み。起きるが金額に幅がある
 * considering = 検討中。引当はしない（ホームのシナリオ切替で試算だけする）
 */
export type Confidence = 'fixed' | 'likely' | 'considering'

export type Profile = {
  /** 手取り月収 */
  takeHome: number
  /** 給料日 */
  payday: number
  /** ボーナス1回あたりの手取り */
  bonusAmount: number
  /** ボーナスの支給月（1-12） */
  bonusMonths: number[]
  /** ボーナスの支給日 */
  bonusDay: number
  /** 生活防衛費の目標額 */
  emergencyFund: number
  /** ボーナスから積立投資へ入れる年額。引当が優先で、足りなければここが削られる */
  annualNisaLump: number
  /** もしもシナリオでの月あたり追加引当 */
  secondChildMonthly: number
  /** もしもシナリオの表示名。中身は個人的な話になるのでコードに書かず、取り込みで入れる */
  scenarioLabel: string
  /** 繰り越しの起点（YYYY-MM） */
  startMonth: string
}

/** 固定費テンプレ。毎月自動で計上される */
export type FixedCost = {
  id: string
  name: string
  amount: number
  kind: Kind
  method: Method
  /** trueなら毎月金額が変わるので、月初に実額を聞く（通信費や光熱費） */
  variable: boolean
  active: boolean
}

/** 記録1件 */
export type Txn = {
  id: string
  /** 使った日（発生主義）。YYYY-MM-DD */
  date: string
  amount: number
  memo: string
  method: Method
  /** 引き落とし予定日。支払い手段から自動計算する。YYYY-MM-DD */
  payoutDate: string
  kind: Kind
  /**
   * manual    = 手入力
   * fixed     = 固定費の自動計上
   * unknown   = 月末の残高照合で埋まった使途不明分
   * household = 家計への追加拠出（11万で足りずに折半で足した分）
   */
  source: 'manual' | 'fixed' | 'unknown' | 'household'
  createdAt: number
}

/**
 * ライフイベント。
 *
 * repeat: null=単発 / 'yearly'=毎年 / 数値=N年ごと
 * 周期型を単発として1件ずつ登録させると、車検を20回、固定資産税を30回
 * 手入力することになって必ず破綻する。今は家計持ちなので該当なしだが、
 * 型としては最初から持たせておく。
 */
export type LifeEvent = {
  id: string
  name: string
  /** YYYY-MM。confidence==='considering' のときは空でよい */
  targetMonth: string
  amount: number
  confidence: Confidence
  repeat: null | 'yearly' | number
  /** bonus=ボーナスから引き当てる（原則） / monthly=月次から引く */
  fundedFrom: 'bonus' | 'monthly'
}

export type Asset = {
  id: string
  name: string
  kind: 'cash' | 'nisa' | 'insurance'
  balance: number
  updatedAt: number
}

/** 月次の状態。IDは YYYY-MM */
export type MonthState = {
  id: string
  /** 前月からの繰越。使い残しは消えない */
  carryOver: number
  /** 固定費を計上済みか。二重計上を防ぐ */
  fixedPosted: boolean
}

/** 月末の残高照合。IDは YYYY-MM */
export type Reconcile = {
  id: string
  /** 実際の口座残高 */
  bankBalance: number
  /** 記録から計算した残高との差。使途不明として吸収した額 */
  diff: number
  postedAt: number
}

/** ボーナスの配分結果 */
export type BonusPlan = {
  /** 年間のボーナス手取り合計 */
  annual: number
  /** 引当の内訳 */
  allocations: { name: string; amount: number }[]
  /** 引当の合計 */
  allocated: number
  /** NISAへ回せる額（調整弁なのでここが削られる） */
  nisa: number
  /** 余り */
  surplus: number
  /** ボーナスで賄いきれず、月次から引く必要のある額（月あたり） */
  monthlyShortfall: number
}
