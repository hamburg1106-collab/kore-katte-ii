// アプリアイコンを生成する。`npm run icons` で public/ に書き出す。
//
// モチーフは「使っていい額のメーター」。文字を入れないのは、環境によって
// フォントが無く崩れるため。
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = resolve(here, '..', 'public')

const GREEN = '#2f6f5e'
const LEAF = '#7fa99b'
const GOLD = '#f2c879'
const FG = '#ffffff'

const svg = (size) => {
  const s = (v) => (size * v).toFixed(2)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${GREEN}"/>
      <stop offset="1" stop-color="${LEAF}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${s(0.22)}" fill="url(#g)"/>
  <!-- メーターの弧。残量を示す -->
  <path d="M${s(0.26)} ${s(0.62)} A${s(0.24)} ${s(0.24)} 0 0 1 ${s(0.74)} ${s(0.62)}"
        fill="none" stroke="${FG}" stroke-opacity="0.35" stroke-width="${s(0.085)}" stroke-linecap="round"/>
  <path d="M${s(0.26)} ${s(0.62)} A${s(0.24)} ${s(0.24)} 0 0 1 ${s(0.5)} ${s(0.38)}"
        fill="none" stroke="${GOLD}" stroke-width="${s(0.085)}" stroke-linecap="round"/>
  <!-- 針 -->
  <circle cx="${s(0.5)}" cy="${s(0.62)}" r="${s(0.045)}" fill="${FG}"/>
  <path d="M${s(0.5)} ${s(0.62)} L${s(0.63)} ${s(0.47)}" stroke="${FG}" stroke-width="${s(0.035)}" stroke-linecap="round"/>
</svg>`
}

await mkdir(publicDir, { recursive: true })

for (const size of [192, 512]) {
  await sharp(Buffer.from(svg(size))).png().toFile(resolve(publicDir, `icon-${size}.png`))
}
// iOSのホーム画面追加用（角丸はOS側で付くので同じ絵でよい）
await sharp(Buffer.from(svg(180))).png().toFile(resolve(publicDir, 'apple-touch-icon.png'))
await writeFile(resolve(publicDir, 'favicon.svg'), svg(64), 'utf8')

console.log('アイコンを public/ に書き出しました')
