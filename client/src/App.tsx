import SimpleFPS from "./SimpleFPS";
import AdminPanel from "./AdminPanel";

// Main App component
function App() {
  const isAdminRoute = window.location.pathname === "/admin";
  
  if (isAdminRoute) {
    return <AdminPanel />;
  }
  
  return <SimpleFPS />;
}

export default App;
