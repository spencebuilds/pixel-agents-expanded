import { useState, type CSSProperties } from "react";

// ─── Constants ──────────────────────────────────────────────────────────────

const ASSET_TIER_KEY = "pixel-agents-asset-tier";
const DONARG_URL =
  "https://donarg.itch.io/office-interior-tileset";

// ─── Styles ──────────────────────────────────────────────────────────────────

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "#11111b",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 2000,
};

const containerStyle: CSSProperties = {
  backgroundColor: "#1e1e2e",
  borderRadius: "16px",
  padding: "32px",
  maxWidth: "480px",
  width: "90%",
  color: "#cdd6f4",
  fontFamily: "system-ui, -apple-system, sans-serif",
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
  border: "1px solid rgba(255, 255, 255, 0.1)",
};

const titleStyle: CSSProperties = {
  fontSize: "24px",
  fontWeight: 700,
  margin: "0 0 8px 0",
  textAlign: "center",
};

const subtitleStyle: CSSProperties = {
  fontSize: "14px",
  color: "#a6adc8",
  margin: "0 0 24px 0",
  textAlign: "center",
  lineHeight: 1.5,
};

const tierCardStyle: CSSProperties = {
  backgroundColor: "#181825",
  borderRadius: "10px",
  padding: "16px",
  marginBottom: "12px",
  border: "1px solid rgba(255, 255, 255, 0.06)",
};

const tierTitleStyle: CSSProperties = {
  fontSize: "16px",
  fontWeight: 600,
  margin: "0 0 6px 0",
};

const tierDescStyle: CSSProperties = {
  fontSize: "13px",
  color: "#a6adc8",
  margin: 0,
  lineHeight: 1.5,
};

const linkStyle: CSSProperties = {
  color: "#89b4fa",
  textDecoration: "underline",
  cursor: "pointer",
};

const buttonRowStyle: CSSProperties = {
  display: "flex",
  gap: "12px",
  marginTop: "20px",
};

const primaryBtnStyle: CSSProperties = {
  flex: 1,
  backgroundColor: "#89b4fa",
  color: "#1e1e2e",
  border: "none",
  borderRadius: "8px",
  padding: "12px 16px",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryBtnStyle: CSSProperties = {
  flex: 1,
  backgroundColor: "#313244",
  color: "#cdd6f4",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  borderRadius: "8px",
  padding: "12px 16px",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
};

const instructionsStyle: CSSProperties = {
  backgroundColor: "#181825",
  borderRadius: "8px",
  padding: "16px",
  marginTop: "16px",
  fontSize: "13px",
  lineHeight: 1.6,
  color: "#a6adc8",
};

const codeStyle: CSSProperties = {
  backgroundColor: "#11111b",
  borderRadius: "4px",
  padding: "8px 12px",
  fontFamily: "monospace",
  fontSize: "12px",
  display: "block",
  marginTop: "8px",
  color: "#cdd6f4",
  overflowX: "auto",
  whiteSpace: "pre",
};

const backBtnStyle: CSSProperties = {
  backgroundColor: "#313244",
  color: "#cdd6f4",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  borderRadius: "8px",
  padding: "10px 16px",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
  marginTop: "16px",
  width: "100%",
};

// ─── Component ───────────────────────────────────────────────────────────────

interface FirstLaunchProps {
  onComplete: () => void;
}

export default function FirstLaunch({ onComplete }: FirstLaunchProps) {
  const [showImportInstructions, setShowImportInstructions] = useState(false);

  const handleUseFree = () => {
    localStorage.setItem(ASSET_TIER_KEY, "free");
    onComplete();
  };

  const handleHavePremium = () => {
    setShowImportInstructions(true);
  };

  const handleDone = () => {
    localStorage.setItem(ASSET_TIER_KEY, "premium");
    onComplete();
  };

  const handleBack = () => {
    setShowImportInstructions(false);
  };

  if (showImportInstructions) {
    return (
      <div style={overlayStyle}>
        <div style={containerStyle}>
          <h1 style={titleStyle}>Import Premium Assets</h1>
          <div style={instructionsStyle}>
            <p style={{ margin: "0 0 12px 0" }}>
              To import the Donarg Office Interior Tileset:
            </p>
            <p style={{ margin: "0 0 8px 0" }}>
              1. Download and extract the tileset zip file.
            </p>
            <p style={{ margin: "0 0 8px 0" }}>
              2. Open a terminal in the pixel-agents-expanded directory.
            </p>
            <p style={{ margin: "0 0 4px 0" }}>
              3. Run the import script:
            </p>
            <code style={codeStyle}>
              npm run import-tileset -- /path/to/extracted/tileset
            </code>
            <p style={{ margin: "12px 0 0 0", fontSize: "12px", color: "#6c7086" }}>
              This copies all .png files from the tileset into the project.
              You can re-run this command at any time to update the assets.
            </p>
          </div>
          <button
            style={primaryBtnStyle}
            onClick={handleDone}
            onMouseEnter={(e) => {
              (e.target as HTMLElement).style.opacity = "0.85";
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.opacity = "1";
            }}
          >
            Done - I have imported the assets
          </button>
          <button
            style={backBtnStyle}
            onClick={handleBack}
            onMouseEnter={(e) => {
              (e.target as HTMLElement).style.backgroundColor = "#45475a";
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.backgroundColor = "#313244";
            }}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle}>
      <div style={containerStyle}>
        <h1 style={titleStyle}>Welcome to Pixel Agents</h1>
        <p style={subtitleStyle}>
          Visualize your Claude Code agents as animated pixel art characters
          in a virtual office.
        </p>

        {/* Free tier */}
        <div style={tierCardStyle}>
          <h3 style={{ ...tierTitleStyle, color: "#a6e3a1" }}>
            Free (Bundled)
          </h3>
          <p style={tierDescStyle}>
            Ready to go! Uses free CC0 pixel art sprites and hand-drawn
            furniture. No setup required.
          </p>
        </div>

        {/* Premium tier */}
        <div style={tierCardStyle}>
          <h3 style={{ ...tierTitleStyle, color: "#f9e2af" }}>
            Premium (Optional)
          </h3>
          <p style={tierDescStyle}>
            Purchase the{" "}
            <a
              href={DONARG_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={linkStyle}
            >
              Office Interior Tileset by Donarg
            </a>{" "}
            ($2) for higher quality furniture sprites. Cannot be bundled due
            to licensing.
          </p>
        </div>

        {/* Buttons */}
        <div style={buttonRowStyle}>
          <button
            style={primaryBtnStyle}
            onClick={handleUseFree}
            onMouseEnter={(e) => {
              (e.target as HTMLElement).style.opacity = "0.85";
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.opacity = "1";
            }}
          >
            Use Free Assets
          </button>
          <button
            style={secondaryBtnStyle}
            onClick={handleHavePremium}
            onMouseEnter={(e) => {
              (e.target as HTMLElement).style.backgroundColor = "#45475a";
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.backgroundColor = "#313244";
            }}
          >
            I Have Premium Assets
          </button>
        </div>
      </div>
    </div>
  );
}
