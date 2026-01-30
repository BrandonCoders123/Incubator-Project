import SimpleFPS from "./SimpleFPS";
import AdminPanel from "./AdminPanel";
import Leaderboard from "./Leaderboard";

// Main App component
function App() {
  const pathname = window.location.pathname;

  if (pathname === "/admin") {
    return <AdminPanel />;
  }

  if (pathname === "/leaderboard") {
    return <Leaderboard />;
  }

  return <SimpleFPS />;
}

export default App;
