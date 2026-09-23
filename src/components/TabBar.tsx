export type Tab = 'home' | 'input' | 'assets' | 'events' | 'settings'

const ICONS: Record<Tab, React.ReactNode> = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.3V21h13V9.3" />
    </>
  ),
  input: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  assets: <path d="M4 20V11M10 20V5M16 20v-6M22 20H2" />,
  events: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3" />
    </>
  ),
}

const LABELS: Record<Tab, string> = {
  home: 'ホーム',
  input: '入力',
  assets: '資産',
  events: '予定',
  settings: '設定',
}

const ORDER: Tab[] = ['home', 'input', 'assets', 'events', 'settings']

export const TabBar = ({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) => (
  <nav className="tabs">
    {ORDER.map((t) => (
      <button
        key={t}
        type="button"
        aria-current={tab === t ? 'page' : undefined}
        onClick={() => onChange(t)}
      >
        <svg
          width="21"
          height="21"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {ICONS[t]}
        </svg>
        <span>{LABELS[t]}</span>
      </button>
    ))}
  </nav>
)
