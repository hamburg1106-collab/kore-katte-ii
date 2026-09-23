import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
} from 'firebase/firestore'

// ウェブ用のconfigは公開前提の識別子（秘密鍵ではない）。
// 実際の保護はFirestoreのセキュリティルールで行う。
//
// このアプリは合言葉ではなくGoogleログインで守る。理由は、共有相手がいないのに
// URLで守っても利点がゼロでリスクだけ残るから。資産額と収入を扱うので、
// パスを知られたら丸見えになる合言葉方式は採らない。
//
// プロジェクトは他のアプリと共用し、コレクション名（shikin）で分ける。
const firebaseConfig = {
  apiKey: 'AIzaSyDSGP41IVUjfERDN9-4Nnm6_tAJPVeISgg',
  authDomain: 'ouchi-no-kondate.firebaseapp.com',
  projectId: 'ouchi-no-kondate',
  storageBucket: 'ouchi-no-kondate.firebasestorage.app',
  messagingSenderId: '385279752727',
  appId: '1:385279752727:web:59068d4c3d5cbd000b3a52',
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)

// persistentLocalCache: 取得済みのデータをIndexedDBに持つ。圏外でも残高と予算が読める。
// persistentSingleTabManager: 複数タブ同期はモバイルSafariでロックに失敗することがあり、
//   失敗するとFirestore全体が failed-precondition で止まる。1人で使うので単一タブ版でよい。
// ignoreUndefinedProperties: undefinedのキーを黙って捨てる（無いと保存時に例外になる）
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) }),
  ignoreUndefinedProperties: true,
})
