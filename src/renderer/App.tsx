import { useEffect, useState, useCallback } from 'react'
import { useAgents } from './hooks/useIpc.ts'
import OfficeCanvas from './components/OfficeCanvas.tsx'
import Settings from './components/Settings.tsx'
import FirstLaunch from './components/FirstLaunch.tsx'
import type { PixelAgentsApi } from '../shared/types.ts'

const ASSET_TIER_KEY = 'pixel-agents-asset-tier'

/** Type-safe accessor for the preload API exposed on `window`. */
function getApi(): PixelAgentsApi {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).pixelAgents as PixelAgentsApi
}

function App() {
  const { agents, loading } = useAgents()
  const [showSettings, setShowSettings] = useState(false)
  const [firstLaunchDone, setFirstLaunchDone] = useState(
    () => localStorage.getItem(ASSET_TIER_KEY) !== null,
  )

  const openSettings = useCallback(() => setShowSettings(true), [])
  const closeSettings = useCallback(() => setShowSettings(false), [])

  // Listen for IPC open-settings from the tray menu.
  useEffect(() => {
    const api = getApi()
    const unsubscribe = api.onOpenSettings(openSettings)
    return unsubscribe
  }, [openSettings])

  if (!firstLaunchDone) {
    return <FirstLaunch onComplete={() => setFirstLaunchDone(true)} />
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Canvas game loop renders the office background */}
      <OfficeCanvas />

      {/* Status overlay */}
      <div
        style={{
          position: 'absolute',
          bottom: '12px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        <span
          style={{
            fontSize: '14px',
            color: 'rgba(255, 255, 255, 0.5)',
            textShadow: '1px 1px 2px rgba(0, 0, 0, 0.8)',
          }}
        >
          {loading
            ? 'Loading...'
            : agents.length > 0
              ? `${agents.length} agent${agents.length === 1 ? '' : 's'} connected`
              : 'No agents connected'}
        </span>
      </div>

      {/* Settings gear button */}
      <button
        onClick={openSettings}
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          background: 'rgba(0, 0, 0, 0.3)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '6px',
          color: 'rgba(255, 255, 255, 0.6)',
          fontSize: '18px',
          width: '32px',
          height: '32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          padding: 0,
          lineHeight: 1,
        }}
        onMouseEnter={(e) => {
          ;(e.target as HTMLElement).style.background = 'rgba(0, 0, 0, 0.5)'
          ;(e.target as HTMLElement).style.color = 'rgba(255, 255, 255, 0.9)'
        }}
        onMouseLeave={(e) => {
          ;(e.target as HTMLElement).style.background = 'rgba(0, 0, 0, 0.3)'
          ;(e.target as HTMLElement).style.color = 'rgba(255, 255, 255, 0.6)'
        }}
        title="Settings"
      >
        {'⚙'}
      </button>

      {/* Settings panel */}
      {showSettings && <Settings onClose={closeSettings} />}
    </div>
  )
}

export default App
