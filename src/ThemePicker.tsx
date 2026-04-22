import { useState, useRef, useEffect } from 'react'

export type ThemeName = 'océano' | 'medianoche' | 'carbón' | 'esmeralda' | 'amatista' | 'crepúsculo' | 'alba' | 'papel' | 'niebla'

export const THEMES: { id: ThemeName; label: string; bg: string; accent: string }[] = [
  { id: 'océano',     label: 'Océano',     bg: '#0d1b31', accent: '#3b82f6' },
  { id: 'medianoche', label: 'Medianoche', bg: '#141414', accent: '#22d3ee' },
  { id: 'carbón',     label: 'Carbón',     bg: '#1a1a1d', accent: '#fb923c' },
  { id: 'esmeralda',  label: 'Esmeralda',  bg: '#0d1e18', accent: '#34d399' },
  { id: 'amatista',   label: 'Amatista',   bg: '#140f26', accent: '#a78bfa' },
  { id: 'crepúsculo', label: 'Crepúsculo', bg: '#1c1509', accent: '#fbbf24' },
  { id: 'alba',       label: 'Alba',       bg: '#f1f5f9', accent: '#2563eb' },
  { id: 'papel',      label: 'Papel',      bg: '#fdf8f0', accent: '#0d9488' },
  { id: 'niebla',     label: 'Niebla',     bg: '#eaf0f6', accent: '#4f46e5' },
]

const STORAGE_KEY = 'ftth-theme'

export function applyTheme(theme: ThemeName) {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem(STORAGE_KEY, theme)
}

export function loadSavedTheme() {
  const saved = localStorage.getItem(STORAGE_KEY) as ThemeName | null
  applyTheme(saved ?? 'océano')
}

export default function ThemePicker({ variant = 'editor' }: { variant?: 'editor' | 'dash' }) {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState<ThemeName>(
    () => (localStorage.getItem(STORAGE_KEY) as ThemeName) ?? 'océano'
  )
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [])

  function select(id: ThemeName) {
    setCurrent(id)
    applyTheme(id)
    setOpen(false)
  }

  const btnClass = variant === 'dash' ? 'dash-icon-btn theme-picker-btn' : 'secondary theme-picker-btn'

  return (
    <div className="theme-picker" ref={ref}>
      <button className={btnClass} onClick={() => setOpen(o => !o)} title="Cambiar tema de color">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" stroke="none"/>
          <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" stroke="none"/>
          <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" stroke="none"/>
          <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" stroke="none"/>
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 011.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
        </svg>
      </button>

      {open && (
        <div className="theme-panel">
          <div className="theme-panel-title">Tema de color</div>
          <div className="theme-grid">
            {THEMES.map(t => (
              <button
                key={t.id}
                className={`theme-swatch${current === t.id ? ' theme-swatch-active' : ''}`}
                onClick={() => select(t.id)}
                title={t.label}
              >
                <span className="theme-swatch-preview" style={{ background: t.bg }}>
                  <span className="theme-swatch-accent" style={{ background: t.accent }} />
                </span>
                <span className="theme-swatch-label">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
