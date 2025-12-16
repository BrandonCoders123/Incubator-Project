const API = "https://YOUR_REPLIT_BACKEND_URL/api";

/**
 * Send leaderboard stats when a game ends
 * Call this on GAME OVER or VICTORY
 */
export async function sendGameEnd(
  user_id: number,
  username: string,
  totalKills: number,
  highestLevel: number,
  coinsEarned: number
) {
  await fetch(`${API}/leaderboard/update`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      user_id,
      username,
      totalKills,
      currentLevel: highestLevel,
      coins: coinsEarned,
    }),
  });
}

/**
 * Fetch leaderboard data
 */
export async function getLeaderboard() {
  const res = await fetch(`${API}/leaderboard`, {
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error("Failed to load leaderboard");
  }

  return res.json();
}
