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

export async function updateShots(
  user_id: number,
  shots_fired: number,
  shots_hit: number
) {
  await fetch(`${API}/updateShots`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id, shots_fired, shots_hit })
  });
}

export async function updateDeaths(user_id: number) {
  await fetch(`${API}/updateDeaths`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id })
  });
}

export async function updateTimePlayed(user_id: number) {
  await fetch(`${API}/updateTimePlayed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id })
  });
}

export async function getLeaderboard() {
  const res = await fetch(`${API}/leaderboard`);
  return res.json();
}