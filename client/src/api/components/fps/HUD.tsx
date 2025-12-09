import { useState, useEffect } from "react";
import { useFPS } from "../../lib/stores/useFPS";
import { useSettings } from "../../lib/stores/useSettings";
import Crosshair from "./Crosshair";

function formatKeyCode(code?: string) {
  if (!code) return "-";
  if (code.startsWith("Key")) return code.slice(3); // KeyW -> W
  if (code.startsWith("Digit")) return code.slice(5); // Digit1 -> 1
  if (code === "Space") return "Space";
  if (code === "Escape") return "Esc";
  return code;
}

export default function HUD() {
  const { playerStats, gameState, resumeGame } = useFPS();

  const {
    keybindings,
    normalSensitivity,
    aimSensitivity,
    setKeybinding,
    setNormalSensitivity,
    setAimSensitivity,
    resetDefaults,
  } = useSettings();

  const [showSettings, setShowSettings] = useState(false);
  const [listeningFor, setListeningFor] = useState<string | null>(null);

  // When we're "listening" for a new key, capture the next keydown
  useEffect(() => {
    if (!listeningFor) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      // ESC cancels without changing
      if (event.code === "Escape") {
        setListeningFor(null);
        return;
      }

      // Update the binding for that action
      setKeybinding(listeningFor as any, event.code);
      setListeningFor(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [listeningFor, setKeybinding]);

  if (gameState !== "playing" && gameState !== "paused") return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        zIndex: 100,
        fontFamily: "Inter, sans-serif",
      }}
    >
      {/* Crosshair */}
      <Crosshair />

      {/* Health Bar */}
      <div
        style={{
          position: "absolute",
          bottom: "40px",
          left: "40px",
          background: "rgba(0, 0, 0, 0.7)",
          padding: "15px",
          borderRadius: "8px",
          color: "white",
          border: "2px solid rgba(255, 255, 255, 0.3)",
        }}
      >
        <div
          style={{ marginBottom: "8px", fontSize: "14px", fontWeight: "bold" }}
        >
          HEALTH
        </div>
        <div
          style={{
            width: "200px",
            height: "20px",
            background: "rgba(255, 255, 255, 0.2)",
            borderRadius: "4px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${(playerStats.health / playerStats.maxHealth) * 100}%`,
              height: "100%",
              background: playerStats.health > 30 ? "#00ff00" : "#ff0000",
              transition: "width 0.3s ease",
            }}
          />
        </div>
        <div style={{ marginTop: "4px", fontSize: "12px" }}>
          {playerStats.health} / {playerStats.maxHealth}
        </div>
      </div>

      {/* Ammo Counter */}
      <div
        style={{
          position: "absolute",
          bottom: "40px",
          right: "40px",
          background: "rgba(0, 0, 0, 0.7)",
          padding: "15px",
          borderRadius: "8px",
          color: "white",
          textAlign: "center",
          border: "2px solid rgba(255, 255, 255, 0.3)",
        }}
      >
        <div
          style={{ fontSize: "24px", fontWeight: "bold", marginBottom: "4px" }}
        >
          {playerStats.ammo}
        </div>
        <div style={{ fontSize: "12px", opacity: 0.8 }}>
          / {playerStats.maxAmmo}
        </div>
        <div style={{ fontSize: "10px", marginTop: "4px", opacity: 0.6 }}>
          AMMO
        </div>
      </div>

      {/* Score */}
      <div
        style={{
          position: "absolute",
          top: "40px",
          left: "40px",
          background: "rgba(0, 0, 0, 0.7)",
          padding: "15px",
          borderRadius: "8px",
          color: "white",
          border: "2px solid rgba(255, 255, 255, 0.3)",
        }}
      >
        <div
          style={{ fontSize: "14px", fontWeight: "bold", marginBottom: "4px" }}
        >
          SCORE: {playerStats.score}
        </div>
        <div style={{ fontSize: "12px", opacity: 0.8 }}>
          KILLS: {playerStats.kills}
        </div>
      </div>

      {/* Instructions */}
      <div
        style={{
          position: "absolute",
          top: "40px",
          right: "40px",
          background: "rgba(0, 0, 0, 0.7)",
          padding: "15px",
          borderRadius: "8px",
          color: "white",
          fontSize: "12px",
          border: "2px solid rgba(255, 255, 255, 0.3)",
        }}
      >
        <div style={{ marginBottom: "4px" }}>WASD: Move</div>
        <div style={{ marginBottom: "4px" }}>SPACE: Jump</div>
        <div style={{ marginBottom: "4px" }}>MOUSE: Look</div>
        <div style={{ marginBottom: "4px" }}>CLICK: Shoot</div>
        <div style={{ marginBottom: "4px" }}>R: Reload</div>
        <div>ESC: Pause</div>
      </div>

      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          background: "rgba(0, 0, 0, 0.8)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          pointerEvents: "auto",
        }}
      >
        <h2 style={{ fontSize: "32px", marginBottom: "20px" }}>Game Paused</h2>

        <div style={{ display: "flex", gap: "20px" }}>
          {/* Left side: buttons */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            <button
              onClick={resumeGame}
              style={{
                padding: "10px 20px",
                fontSize: "16px",
                background: "#4CAF50",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              Resume Game
            </button>

            <button
              onClick={() => setShowSettings((v) => !v)}
              style={{
                padding: "10px 20px",
                fontSize: "16px",
                background: "#2196F3",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              {showSettings ? "Hide Settings" : "Settings"}
            </button>

            <button
              onClick={resetDefaults}
              style={{
                padding: "8px 16px",
                fontSize: "14px",
                background: "#555",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                marginTop: "10px",
              }}
            >
              Reset to Defaults
            </button>
          </div>

          {/* Right side: settings panel */}
          {showSettings && (
            <div
              style={{
                width: "420px",
                maxHeight: "60vh",
                overflowY: "auto",
                padding: "16px",
                background: "rgba(0, 0, 0, 0.8)",
                borderRadius: "12px",
                border: "1px solid rgba(255, 255, 255, 0.2)",
              }}
            >
              <h3 style={{ fontSize: "20px", marginBottom: "12px" }}>
                Controls & Sensitivity
              </h3>

              {/* Keybindings */}
              <div style={{ marginBottom: "16px" }}>
                <h4
                  style={{
                    fontSize: "14px",
                    marginBottom: "8px",
                    opacity: 0.8,
                  }}
                >
                  Keybindings (click, then press new key)
                </h4>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  {Object.entries(keybindings).map(([action, keys]) => {
                    const primaryKey = (keys as string[])[0];
                    const isActive = listeningFor === action;

                    return (
                      <div
                        key={action}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "4px 8px",
                          borderRadius: "6px",
                          background: "rgba(255, 255, 255, 0.05)",
                        }}
                      >
                        <span style={{ fontSize: "13px" }}>{action}</span>
                        <button
                          onClick={() => setListeningFor(action)}
                          style={{
                            minWidth: "120px",
                            padding: "4px 8px",
                            borderRadius: "6px",
                            border: isActive
                              ? "2px solid #fff"
                              : "1px solid rgba(255, 255, 255, 0.3)",
                            background: isActive ? "#fff" : "transparent",
                            color: isActive ? "#000" : "#fff",
                            cursor: "pointer",
                            fontSize: "13px",
                          }}
                        >
                          {isActive
                            ? "Press a key..."
                            : formatKeyCode(primaryKey)}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sensitivity sliders */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "4px",
                    }}
                  >
                    <span style={{ fontSize: "14px" }}>Look Sensitivity</span>
                    <span style={{ fontSize: "12px", opacity: 0.8 }}>
                      {normalSensitivity.toFixed(1)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.2}
                    max={3}
                    step={0.1}
                    value={normalSensitivity}
                    onChange={(e) =>
                      setNormalSensitivity(parseFloat(e.target.value))
                    }
                    style={{ width: "100%" }}
                  />
                </div>

                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "4px",
                    }}
                  >
                    <span style={{ fontSize: "14px" }}>
                      Aim Sensitivity (right mouse)
                    </span>
                    <span style={{ fontSize: "12px", opacity: 0.8 }}>
                      {aimSensitivity.toFixed(1)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={2}
                    step={0.1}
                    value={aimSensitivity}
                    onChange={(e) =>
                      setAimSensitivity(parseFloat(e.target.value))
                    }
                    style={{ width: "100%" }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
