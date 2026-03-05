import { useAgents } from './hooks/useIpc.ts'

function App() {
  const { agents, loading } = useAgents()

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      <span
        style={{
          fontSize: '32px',
          color: 'rgba(255, 255, 255, 0.8)',
          letterSpacing: '4px',
          textTransform: 'uppercase',
        }}
      >
        Pixel Agents
      </span>
      <span
        style={{
          fontSize: '14px',
          color: 'rgba(255, 255, 255, 0.5)',
        }}
      >
        {loading
          ? 'Loading...'
          : agents.length > 0
            ? `${agents.length} agent${agents.length === 1 ? '' : 's'} connected`
            : 'No agents connected'}
      </span>
    </div>
  )
}

export default App
