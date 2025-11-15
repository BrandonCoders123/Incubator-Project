const API = "https://YOUR_REPLIT_BACKEND_URL/api";

export async function sendGameEnd(
  user_id: number,
  enemiesKilled: number,
  runTimeSeconds: number
) {
  await fetch(`${API}/game/end`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id, enemiesKilled, runTimeSeconds })
  });
}

export async function getLeaderboard() {
  const res = await fetch(`${API}/leaderboard`);
  return res.json();
}
