import { useState } from "react";
import { useFPS } from "../../../lib/stores/useFPS";
import { useGame } from "../../../lib/stores/useGame";
import "./Menu.css";

type MenuScreen = "main" | "gamemodes";

export default function Menu() {
  const { startGame } = useFPS();
  const { setGameMode } = useGame();
  const [screen, setScreen] = useState<MenuScreen>("main");

  return (
    <div className="menu-background">
      <div
        style={{
          textAlign: "center",
          maxWidth: "800px",
          padding: "40px",
          background: "rgba(0, 0, 0, 0.3)",
          borderRadius: "20px",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.3)",
        }}
      >
        {/* ================= MAIN MENU ================= */}
        {screen === "main" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <button className="menu-button">🏆 LEADERBOARD</button>
            <button className="menu-button">👤 PROFILE</button>
            <button className="menu-button">🛒 SHOP</button>
            <button className="menu-button">🎒 INVENTORY</button>

            {/* 👇 THIS IS THE IMPORTANT CHANGE */}
            <button
              className="menu-button"
              onClick={() => setScreen("gamemodes")}
            >
              🎮 PLAY GAME
            </button>

            <button className="menu-button">⚙️ SETTINGS</button>
          </div>
        )}

        {/* ================= GAME MODES ================= */}
        {screen === "gamemodes" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <button
              className="menu-button"
              onClick={() => {
                setGameMode("story");
                startGame();
              }}
            >
              📖 STORY MODE
            </button>

            <button
              className="menu-button"
              onClick={() => {
                setGameMode("endless");
                startGame();
              }}
            >
              ♾️ ENDLESS MODE
            </button>

            <button
              className="menu-button"
              onClick={() => setScreen("main")}
            >
              ← BACK
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
