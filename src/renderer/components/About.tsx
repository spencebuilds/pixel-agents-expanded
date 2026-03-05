import type { CSSProperties } from "react";

// ─── Styles ──────────────────────────────────────────────────────────────────

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0, 0, 0, 0.7)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1100,
};

const panelStyle: CSSProperties = {
  backgroundColor: "#1e1e2e",
  borderRadius: "12px",
  padding: "24px",
  minWidth: "340px",
  maxWidth: "420px",
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

const versionStyle: CSSProperties = {
  fontSize: "12px",
  color: "#a6adc8",
  fontWeight: 400,
  marginLeft: "8px",
};

const sectionStyle: CSSProperties = {
  marginBottom: "16px",
};

const sectionTitleStyle: CSSProperties = {
  fontSize: "13px",
  fontWeight: 600,
  color: "#89b4fa",
  marginBottom: "8px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
};

const creditRowStyle: CSSProperties = {
  fontSize: "13px",
  lineHeight: 1.7,
  color: "#cdd6f4",
};

const linkStyle: CSSProperties = {
  color: "#89b4fa",
  textDecoration: "none",
};

const badgeStyle: CSSProperties = {
  display: "inline-block",
  fontSize: "10px",
  backgroundColor: "#313244",
  color: "#a6adc8",
  borderRadius: "3px",
  padding: "1px 5px",
  marginLeft: "6px",
  verticalAlign: "middle",
};

const licenseStyle: CSSProperties = {
  fontSize: "12px",
  color: "#a6adc8",
  borderTop: "1px solid rgba(255, 255, 255, 0.06)",
  paddingTop: "12px",
  marginTop: "4px",
};

const closeBtnFullStyle: CSSProperties = {
  backgroundColor: "#313244",
  color: "#cdd6f4",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  borderRadius: "6px",
  padding: "8px 16px",
  cursor: "pointer",
  fontSize: "13px",
  width: "100%",
  marginTop: "16px",
};

// ─── Component ───────────────────────────────────────────────────────────────

interface AboutProps {
  onClose: () => void;
}

export default function About({ onClose }: AboutProps) {
  const openExternal = (url: string) => {
    window.open(url, "_blank");
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <h2 style={titleStyle}>
            Pixel Agents
            <span style={versionStyle}>v0.1.0</span>
          </h2>
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

        {/* Credits */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Credits</div>
          <div style={creditRowStyle}>
            <strong>Original project:</strong>{" "}
            <a
              style={linkStyle}
              href="#"
              onClick={(e) => {
                e.preventDefault();
                openExternal("https://github.com/pablodelucca/pixel-agents");
              }}
            >
              pixel-agents
            </a>{" "}
            by{" "}
            <a
              style={linkStyle}
              href="#"
              onClick={(e) => {
                e.preventDefault();
                openExternal("https://github.com/pablodelucca");
              }}
            >
              pablodelucca
            </a>
            <br />

            <strong>Character sprites:</strong>{" "}
            <a
              style={linkStyle}
              href="#"
              onClick={(e) => {
                e.preventDefault();
                openExternal(
                  "https://jik-a-4.itch.io/metrocity-free-topdown-character-pack"
                );
              }}
            >
              Metro City Character Pack
            </a>{" "}
            by JIK-A-4
            <span style={badgeStyle}>CC0</span>
            <br />

            <strong>Premium tileset:</strong>{" "}
            <a
              style={linkStyle}
              href="#"
              onClick={(e) => {
                e.preventDefault();
                openExternal("https://donarg.itch.io/officetileset");
              }}
            >
              Office Interior Tileset
            </a>{" "}
            by Donarg
            <span style={badgeStyle}>optional, $2</span>
            <br />

            <strong>Built by:</strong>{" "}
            <a
              style={linkStyle}
              href="#"
              onClick={(e) => {
                e.preventDefault();
                openExternal("https://github.com/spencebuilds");
              }}
            >
              spencebuilds
            </a>
          </div>
        </div>

        {/* License */}
        <div style={licenseStyle}>
          License: MIT
        </div>

        {/* Close button */}
        <button
          style={closeBtnFullStyle}
          onClick={onClose}
          onMouseEnter={(e) => {
            (e.target as HTMLElement).style.backgroundColor = "#45475a";
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLElement).style.backgroundColor = "#313244";
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
