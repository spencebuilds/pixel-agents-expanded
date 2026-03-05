import { useState, type CSSProperties } from "react";
import type { PixelAgentsApi } from "../../shared/types.ts";
import About from "./About.tsx";

/** Type-safe accessor for the preload API exposed on `window`. */
function getApi(): PixelAgentsApi {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).pixelAgents as PixelAgentsApi;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0, 0, 0, 0.7)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const panelStyle: CSSProperties = {
  backgroundColor: "#1e1e2e",
  borderRadius: "12px",
  padding: "24px",
  minWidth: "340px",
  maxWidth: "400px",
  color: "#cdd6f4",
  fontFamily: "system-ui, -apple-system, sans-serif",
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
  border: "1px solid rgba(255, 255, 255, 0.1)",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "20px",
};

const titleStyle: CSSProperties = {
  fontSize: "18px",
  fontWeight: 600,
  margin: 0,
};

const closeBtnStyle: CSSProperties = {
  background: "none",
  border: "none",
  color: "#cdd6f4",
  fontSize: "20px",
  cursor: "pointer",
  padding: "4px 8px",
  borderRadius: "4px",
  lineHeight: 1,
};

const rowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "10px 0",
  borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
};

const labelStyle: CSSProperties = {
  fontSize: "14px",
};

const toggleTrackStyle = (active: boolean): CSSProperties => ({
  width: "40px",
  height: "22px",
  borderRadius: "11px",
  backgroundColor: active ? "#89b4fa" : "#45475a",
  position: "relative",
  cursor: "pointer",
  transition: "background-color 0.2s",
  border: "none",
  padding: 0,
  flexShrink: 0,
});

const toggleThumbStyle = (active: boolean): CSSProperties => ({
  width: "18px",
  height: "18px",
  borderRadius: "50%",
  backgroundColor: "#fff",
  position: "absolute",
  top: "2px",
  left: active ? "20px" : "2px",
  transition: "left 0.2s",
});

const buttonStyle: CSSProperties = {
  backgroundColor: "#313244",
  color: "#cdd6f4",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  borderRadius: "6px",
  padding: "8px 16px",
  cursor: "pointer",
  fontSize: "13px",
  width: "100%",
  textAlign: "left" as const,
  marginTop: "8px",
};

const infoBoxStyle: CSSProperties = {
  backgroundColor: "#181825",
  borderRadius: "6px",
  padding: "12px",
  marginTop: "8px",
  fontSize: "12px",
  lineHeight: 1.5,
  color: "#a6adc8",
  fontFamily: "monospace",
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
};

// ─── Component ───────────────────────────────────────────────────────────────

interface SettingsProps {
  onClose: () => void;
}

export default function Settings({ onClose }: SettingsProps) {
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [showAgentCount, setShowAgentCount] = useState(true);
  const [showHooksInfo, setShowHooksInfo] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  const handleAlwaysOnTop = () => {
    const next = !alwaysOnTop;
    setAlwaysOnTop(next);
    getApi().toggleAlwaysOnTop(next);
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <h2 style={titleStyle}>Settings</h2>
          <button
            style={closeBtnStyle}
            onClick={onClose}
            onMouseEnter={(e) => {
              (e.target as HTMLElement).style.backgroundColor = "#313244";
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.backgroundColor = "transparent";
            }}
          >
            x
          </button>
        </div>

        {/* Always on top toggle */}
        <div style={rowStyle}>
          <span style={labelStyle}>Always on top</span>
          <button
            style={toggleTrackStyle(alwaysOnTop)}
            onClick={handleAlwaysOnTop}
            aria-label="Toggle always on top"
          >
            <div style={toggleThumbStyle(alwaysOnTop)} />
          </button>
        </div>

        {/* Show agent count toggle */}
        <div style={rowStyle}>
          <span style={labelStyle}>Show agent count in status bar</span>
          <button
            style={toggleTrackStyle(showAgentCount)}
            onClick={() => setShowAgentCount(!showAgentCount)}
            aria-label="Toggle agent count display"
          >
            <div style={toggleThumbStyle(showAgentCount)} />
          </button>
        </div>

        {/* Setup Hooks button */}
        <button
          style={buttonStyle}
          onClick={() => {
            setShowHooksInfo(!showHooksInfo);
            setShowAbout(false);
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLElement).style.backgroundColor = "#45475a";
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLElement).style.backgroundColor = "#313244";
          }}
        >
          Setup Hooks
        </button>
        {showHooksInfo && (
          <div style={infoBoxStyle}>
            {`To enable real-time agent detection, run the\nhook setup script from your terminal:\n\n  npx pixel-agents-hooks setup\n\nThis configures Claude Code to send events\nto the Pixel Agents WebSocket server.`}
          </div>
        )}

        {/* About button */}
        <button
          style={buttonStyle}
          onClick={() => {
            setShowAbout(!showAbout);
            setShowHooksInfo(false);
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLElement).style.backgroundColor = "#45475a";
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLElement).style.backgroundColor = "#313244";
          }}
        >
          About
        </button>
        {showAbout && (
          <About onClose={() => setShowAbout(false)} />
        )}
      </div>
    </div>
  );
}
