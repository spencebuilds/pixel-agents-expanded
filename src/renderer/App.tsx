import { useAgents } from './hooks/useIpc.ts'
import OfficeCanvas from './components/OfficeCanvas.tsx'

function App() {
  const { agents, loading } = useAgents()

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
    </div>
  )
}

export default App
