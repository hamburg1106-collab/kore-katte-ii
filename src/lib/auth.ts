import type { User } from 'firebase/auth'
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth'
import { auth } from './firebase'

const provider = new GoogleAuthProvider()

export const watchUser = (onChange: (user: User | null) => void): (() => void) =>
  onAuthStateChanged(auth, onChange)

/**
 * Googleでログインする。
 *
 * ホーム画面に追加したPWAではポップアップがブロックされることがある。
 * その場合はリダイレクト方式に切り替える（戻ってきたときにonAuthStateChangedが拾う）。
 */
export const login = async (): Promise<void> => {
  try {
    await signInWithPopup(auth, provider)
  } catch (e) {
    const code = (e as { code?: string }).code ?? ''
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/popup-closed-by-user' ||
      code === 'auth/operation-not-supported-in-this-environment'
    ) {
      await signInWithRedirect(auth, provider)
      return
    }
    throw e
  }
}

export const logout = (): Promise<void> => signOut(auth)
