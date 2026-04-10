import { useState, useEffect } from "react";

interface LeaderboardEntry {
  id: number;
  user_id: number;
  username: string;
  total_kills: number;
  fastest_run_time: string | null;
  date_recorded: string;
}

type LeaderboardCategory = "kills" | "fastest_time";

export default function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<LeaderboardCategory>("kills");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLeaderboard();
  }, [category]);

  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leaderboard?category=${category}`);
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      const data = await res.json();
      setEntries(data);
      setError(null);
    } catch (err) {
      console.error("Error fetching leaderboard:", err);
      setError("Unable to load leaderboard data");
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number): string => {
    if (!num) return "0";
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const getCategoryLabel = (): string => {
    switch (category) {
      case "kills": return "Total Kills";
      case "fastest_time": return "Fastest Run";
    }
  };

  const getCategoryValue = (entry: LeaderboardEntry): string => {
    switch (category) {
      case "kills": return formatNumber(entry.total_kills);
      case "fastest_time": return entry.fastest_run_time || "--:--:--";
    }
  };

  const getCategoryIcon = (): string => {
    switch (category) {
      case "kills": return "💀";
      case "fastest_time": return "⏱️";
    }
  };

  const getRankStyle = (index: number): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      width: "40px",
      height: "40px",
      borderRadius: "50%",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      fontWeight: "bold",
      fontSize: "18px",
    };
    if (index === 0) return { ...baseStyle, background: "linear-gradient(135deg, #FFD700, #FFA500)", color: "#000" };
    if (index === 1) return { ...baseStyle, background: "linear-gradient(135deg, #C0C0C0, #A0A0A0)", color: "#000" };
    if (index === 2) return { ...baseStyle, background: "linear-gradient(135deg, #CD7F32, #8B4513)", color: "#fff" };
    return { ...baseStyle, background: "#2a3f5f", color: "#fff" };
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
      color: "#fff",
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    }}>
      {/* Header */}
      <header style={{
        padding: "20px 40px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        borderBottom: "1px solid rgba(255,255,255,0.1)",
      }}>
        <h1 style={{ margin: 0, fontSize: "28px" }}>🏆 Leaderboard</h1>
        <button
          onClick={() => window.location.href = "/"}
          style={{
            padding: "10px 20px",
            background: "rgba(255,255,255,0.1)",
            border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: "8px",
            color: "#fff",
            cursor: "pointer",
            fontSize: "14px",
          }}
        >
          ← Back to Game
        </button>
      </header>

      {/* Category Tabs */}
      <div style={{
        display: "flex",
        justifyContent: "center",
        gap: "10px",
        padding: "30px 20px",
      }}>
        {[
          { key: "kills" as LeaderboardCategory, label: "💀 Most Kills" },
          { key: "fastest_time" as LeaderboardCategory, label: "⏱️ Fastest Run" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setCategory(tab.key)}
            style={{
              padding: "15px 30px",
              background: category === tab.key
                ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                : "rgba(255,255,255,0.1)",
              border: "none",
              borderRadius: "10px",
              color: "#fff",
              cursor: "pointer",
              fontSize: "16px",
              fontWeight: category === tab.key ? "bold" : "normal",
              transition: "all 0.3s ease",
              boxShadow: category === tab.key ? "0 4px 15px rgba(102, 126, 234, 0.4)" : "none",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Leaderboard Content */}
      <div style={{
        maxWidth: "800px",
        margin: "0 auto",
        padding: "0 20px 40px",
      }}>
        <div style={{
          background: "rgba(255,255,255,0.05)",
          borderRadius: "15px",
          overflow: "hidden",
          boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
        }}>
          {/* Table Header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "80px 1fr 150px",
            padding: "20px 25px",
            background: "rgba(0,0,0,0.3)",
            fontWeight: "bold",
            fontSize: "14px",
            color: "#888",
            textTransform: "uppercase",
            letterSpacing: "1px",
          }}>
            <span>Rank</span>
            <span>Player</span>
            <span style={{ textAlign: "right" }}>{getCategoryIcon()} {getCategoryLabel()}</span>
          </div>

          {loading && (
            <div style={{ padding: "60px 20px", textAlign: "center", color: "#888" }}>
              <div style={{ fontSize: "24px", marginBottom: "10px" }}>⏳</div>
              Loading leaderboard...
            </div>
          )}

          {error && !loading && (
            <div style={{ padding: "60px 20px", textAlign: "center", color: "#e74c3c" }}>
              <div style={{ fontSize: "24px", marginBottom: "10px" }}>⚠️</div>
              {error}
            </div>
          )}

          {!loading && !error && entries.length === 0 && (
            <div style={{ padding: "60px 20px", textAlign: "center", color: "#888" }}>
              <div style={{ fontSize: "48px", marginBottom: "15px" }}>🏆</div>
              <p style={{ fontSize: "18px", margin: 0 }}>No leaderboard data yet</p>
              <p style={{ fontSize: "14px", marginTop: "10px", color: "#666" }}>
                Be the first to make it on the board!
              </p>
            </div>
          )}

          {!loading && !error && entries.map((entry, index) => (
            <div
              key={entry.id}
              style={{
                display: "grid",
                gridTemplateColumns: "80px 1fr 150px",
                padding: "15px 25px",
                alignItems: "center",
                borderBottom: index < entries.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                background: index < 3 ? `rgba(255,255,255,${0.05 - index * 0.015})` : "transparent",
                transition: "background 0.2s ease",
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.08)"}
              onMouseLeave={(e) => e.currentTarget.style.background = index < 3 ? `rgba(255,255,255,${0.05 - index * 0.015})` : "transparent"}
            >
              <div style={{ display: "flex", justifyContent: "center" }}>
                <div style={getRankStyle(index)}>{index + 1}</div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{
                  width: "45px",
                  height: "45px",
                  borderRadius: "10px",
                  background: `linear-gradient(135deg, hsl(${(entry.user_id * 37) % 360}, 70%, 50%), hsl(${(entry.user_id * 37 + 40) % 360}, 70%, 40%))`,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  fontSize: "20px",
                  fontWeight: "bold",
                }}>
                  {entry.username ? entry.username.charAt(0).toUpperCase() : "?"}
                </div>
                <div>
                  <div style={{ fontWeight: "600", fontSize: "16px" }}>
                    {entry.username || `Player #${entry.user_id}`}
                  </div>
                  <div style={{ fontSize: "12px", color: "#888" }}>
                    {new Date(entry.date_recorded).toLocaleDateString()}
                  </div>
                </div>
              </div>

              <div style={{
                textAlign: "right",
                fontSize: "20px",
                fontWeight: "bold",
                color: index === 0 ? "#FFD700" : index === 1 ? "#C0C0C0" : index === 2 ? "#CD7F32" : "#fff",
              }}>
                {getCategoryValue(entry)}
              </div>
            </div>
          ))}
        </div>

        <div style={{
          marginTop: "30px",
          padding: "20px",
          background: "rgba(255,255,255,0.03)",
          borderRadius: "10px",
          textAlign: "center",
          color: "#666",
          fontSize: "14px",
        }}>
          <p style={{ margin: 0 }}>
            Leaderboard updates in real-time as you play. Keep playing to climb the ranks!
          </p>
        </div>
      </div>
    </div>
  );
}
