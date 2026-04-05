import React, { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

interface User {
  user_id: number;
  username: string;
  email: string;
  gold: number;
  is_banned: boolean | number;
  ban_reason: string | null;
  warning_count: number;
  created_at: string;
  last_login: string;
}

interface Item {
  item_id: number;
  item_name: string;
  item_type: string;
  store_price: number;
  is_cosmetic: boolean | number;
}

interface Transaction {
  transaction_id: number;
  user_id: number;
  username: string | null;
  amount_spent_usd: number;
  card_number: string | null;
  currency_purchased: number;
  transaction_date: string;
}

interface TransactionSummary {
  totalRevenue: number;
  transactionCount: number;
  mostPurchasedTier: { goldAmount: number; count: number } | null;
}

export default function AdminPanel() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adminName, setAdminName] = useState("");
  const [adminId, setAdminId] = useState<number | null>(null);
  
  const [activeTab, setActiveTab] = useState<"users" | "items" | "transactions">("users");
  const [users, setUsers] = useState<User[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionSummary, setTransactionSummary] = useState<TransactionSummary>({ totalRevenue: 0, transactionCount: 0, mostPurchasedTier: null });
  const [earningsByDay, setEarningsByDay] = useState<{ day: string; revenue: number; purchases: number }[]>([]);
  const [tierBreakdown, setTierBreakdown] = useState<{ gold: number; purchases: number; revenue: number }[]>([]);
  
  const [editingGold, setEditingGold] = useState<number | null>(null);
  const [goldValue, setGoldValue] = useState("");
  
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", type: "weapon_skin", price: 100, isCosmetic: true });
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  const [filterName, setFilterName] = useState("");
  const [filterById, setFilterById] = useState("all");
  const [filterWarnings, setFilterWarnings] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [testLevel, setTestLevel] = useState(1);

  const filteredUsers = users.filter((user) => {
    if (filterName && !user.username.toLowerCase().includes(filterName.toLowerCase())) return false;
    if (filterById !== "all" && String(user.user_id) !== filterById) return false;
    if (filterWarnings !== "all") {
      const w = user.warning_count ?? 0;
      if (filterWarnings === "0" && w !== 0) return false;
      if (filterWarnings === "1" && w !== 1) return false;
      if (filterWarnings === "2" && w !== 2) return false;
      if (filterWarnings === "3+" && w < 3) return false;
    }
    if (filterStatus === "banned" && !user.is_banned) return false;
    if (filterStatus === "active" && user.is_banned) return false;
    return true;
  });

  const [banModal, setBanModal] = useState<{ userId: number; username: string } | null>(null);
  const [banReason, setBanReason] = useState("");
  const [warnModal, setWarnModal] = useState<{ userId: number; username: string } | null>(null);

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const res = await fetch("/api/admin/session");
      const data = await res.json();
      if (data.isAdmin) {
        setIsAdmin(true);
        setAdminName(data.admin.username);
        setAdminId(data.admin.id);
        fetchData();
      }
    } catch (err) {
      console.error("Session check error:", err);
    }
    setLoading(false);
  };

  const fetchData = async () => {
    try {
      const [usersRes, itemsRes, txRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/items"),
        fetch("/api/admin/transactions"),
      ]);
      const usersData = await usersRes.json();
      const itemsData = await itemsRes.json();
      const txData = await txRes.json();
      if (usersData.success) setUsers(usersData.users);
      if (itemsData.success) setItems(itemsData.items);
      if (txData.success) {
        setTransactions(txData.transactions);
        setTransactionSummary({
          totalRevenue: txData.summary.totalRevenue,
          transactionCount: txData.summary.transactionCount,
          mostPurchasedTier: txData.summary.mostPurchasedTier,
        });
        setEarningsByDay(txData.earningsByDay || []);
        setTierBreakdown(txData.tierBreakdown || []);
      }
    } catch (err) {
      console.error("Fetch data error:", err);
    }
  };

  const handleSetGold = async (userId: number) => {
    try {
      await fetch(`/api/admin/users/${userId}/gold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gold: parseInt(goldValue) })
      });
      setEditingGold(null);
      fetchData();
    } catch (err) {
      console.error("Set gold error:", err);
    }
  };

  const handleDeleteUser = async (userId: number, username: string) => {
    if (userId === adminId) {
      alert("You cannot delete your own account!");
      return;
    }
    if (!confirm(`Are you sure you want to permanently delete user "${username}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        fetchData();
      } else {
        alert(data.error || "Failed to delete user");
      }
    } catch (err) {
      console.error("Delete user error:", err);
      alert("Failed to delete user");
    }
  };

  const handleBanUser = async () => {
    if (!banModal) return;
    try {
      const res = await fetch(`/api/admin/users/${banModal.userId}/ban`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: banReason })
      });
      const data = await res.json();
      if (data.success) {
        setBanModal(null);
        setBanReason("");
        fetchData();
      } else {
        alert(data.error || "Failed to ban user");
      }
    } catch (err) {
      console.error("Ban user error:", err);
      alert("Failed to ban user");
    }
  };

  const handleUnbanUser = async (userId: number) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/unban`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        fetchData();
      } else {
        alert(data.error || "Failed to unban user");
      }
    } catch (err) {
      console.error("Unban user error:", err);
      alert("Failed to unban user");
    }
  };

  const handleWarnUser = async () => {
    if (!warnModal) return;
    try {
      const res = await fetch(`/api/admin/users/${warnModal.userId}/warn`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setWarnModal(null);
        fetchData();
      } else {
        alert(data.error || "Failed to warn user");
      }
    } catch (err) {
      console.error("Warn user error:", err);
      alert("Failed to warn user");
    }
  };

  const handleAddItem = async () => {
    try {
      await fetch("/api/admin/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newItem)
      });
      setShowAddItem(false);
      setNewItem({ name: "", type: "weapon_skin", price: 100, isCosmetic: true });
      fetchData();
    } catch (err) {
      console.error("Add item error:", err);
    }
  };

  const handleUpdateItem = async () => {
    if (!editingItem) return;
    try {
      await fetch(`/api/admin/items/${editingItem.item_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editingItem.item_name,
          type: editingItem.item_type,
          price: editingItem.store_price,
          isCosmetic: editingItem.is_cosmetic
        })
      });
      setEditingItem(null);
      fetchData();
    } catch (err) {
      console.error("Update item error:", err);
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    if (!confirm("Are you sure you want to delete this item?")) return;
    try {
      await fetch(`/api/admin/items/${itemId}`, { method: "DELETE" });
      fetchData();
    } catch (err) {
      console.error("Delete item error:", err);
    }
  };

  const handleStartLevelTest = () => {
    window.location.href = `/?adminTestLevel=${testLevel}`;
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", background: "#1a1a2e", color: "white" }}>
        Loading...
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100vh", background: "#1a1a2e", color: "white" }}>
        <h1 style={{ marginBottom: "20px" }}>Access Denied</h1>
        <p style={{ marginBottom: "20px", color: "#888" }}>You must be logged in as an admin to access this page.</p>
        <a href="/" style={{ padding: "12px 24px", background: "#4CAF50", color: "white", textDecoration: "none", borderRadius: "8px" }}>
          Back to Game
        </a>
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#1a1a2e", color: "white", fontFamily: "Inter, sans-serif" }}>
      {/* Fixed Header */}
      <header style={{ background: "#16213e", padding: "15px 30px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <h1 style={{ margin: 0, fontSize: "24px" }}>Admin Panel</h1>
        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          <span>Welcome, {adminName}</span>
          <a href="/" style={{ padding: "8px 16px", background: "#666", border: "none", borderRadius: "5px", color: "white", textDecoration: "none" }}>
            Back to Game
          </a>
        </div>
      </header>

      {/* Scrollable Content */}
      <div style={{ flex: 1, overflow: "auto", padding: "20px 30px" }}>
        <div
          style={{
            background: "#0f3460",
            border: "1px solid #2f4f7f",
            borderRadius: "10px",
            padding: "16px",
            marginBottom: "20px",
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h2 style={{ margin: "0 0 4px 0", fontSize: "18px" }}>
              Level Testing
            </h2>
            <p style={{ margin: 0, color: "#b8c7e0", fontSize: "13px" }}>
              Launch directly into any campaign level in no-save admin test mode.
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <select
              value={testLevel}
              onChange={(e) => setTestLevel(Number(e.target.value))}
              style={{
                padding: "10px 12px",
                borderRadius: "6px",
                border: "1px solid #3a5c8a",
                background: "#16213e",
                color: "white",
                cursor: "pointer",
              }}
            >
              <option value={1}>Level 1 - Bun Valley Outpost</option>
              <option value={2}>Level 2 - Robot Factory</option>
              <option value={3}>Level 3 - Palace of the Robot King</option>
              <option value={4}>Level 4 - Crimson Battlefield</option>
              <option value={5}>Level 5 - Mustard Mountain Summit</option>
            </select>
            <button
              onClick={handleStartLevelTest}
              style={{
                padding: "10px 16px",
                background: "#4CAF50",
                border: "none",
                borderRadius: "6px",
                color: "white",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Start Test
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
          <button
            onClick={() => setActiveTab("users")}
            style={{ padding: "10px 20px", background: activeTab === "users" ? "#4CAF50" : "#333", border: "none", borderRadius: "5px", color: "white", cursor: "pointer" }}
          >
            Users ({users.length})
          </button>
          <button
            onClick={() => setActiveTab("items")}
            style={{ padding: "10px 20px", background: activeTab === "items" ? "#4CAF50" : "#333", border: "none", borderRadius: "5px", color: "white", cursor: "pointer" }}
          >
            Items ({items.length})
          </button>
          <button
            onClick={() => setActiveTab("transactions")}
            style={{ padding: "10px 20px", background: activeTab === "transactions" ? "#4CAF50" : "#333", border: "none", borderRadius: "5px", color: "white", cursor: "pointer" }}
          >
            Transactions ({transactions.length})
          </button>
        </div>

        {activeTab === "users" && (
          <div>
          <div style={{ display: "flex", gap: "10px", marginBottom: "14px", flexWrap: "wrap" }}>
            <input
              type="text"
              placeholder="Search by name..."
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
              style={{
                flex: "1 1 160px", padding: "10px 14px", borderRadius: "7px",
                border: "1px solid #333", background: "#0f3460", color: "white",
                fontSize: "14px", outline: "none",
              }}
            />
            
            <select
              value={filterWarnings}
              onChange={(e) => setFilterWarnings(e.target.value)}
              style={{
                flex: "0 1 150px", padding: "10px 10px", borderRadius: "7px",
                border: "1px solid #333", background: "#0f3460", color: "white",
                fontSize: "14px", cursor: "pointer",
              }}
            >
              <option value="all">All Warnings</option>
              <option value="0">0 warnings</option>
              <option value="1">1 warning</option>
              <option value="2">2 warnings</option>
              <option value="3+">3+ warnings</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{
                flex: "0 1 140px", padding: "10px 10px", borderRadius: "7px",
                border: "1px solid #333", background: "#0f3460", color: "white",
                fontSize: "14px", cursor: "pointer",
              }}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="banned">Banned</option>
            </select>
          </div>
          <div style={{ background: "#16213e", borderRadius: "10px", overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "900px" }}>
                <thead>
                  <tr style={{ background: "#0f3460" }}>
                    <th style={{ padding: "12px", textAlign: "left" }}>ID</th>
                    <th style={{ padding: "12px", textAlign: "left" }}>Username</th>
                    <th style={{ padding: "12px", textAlign: "left" }}>Email</th>
                    <th style={{ padding: "12px", textAlign: "left" }}>Gold</th>
                    <th style={{ padding: "12px", textAlign: "left" }}>Status</th>
                    <th style={{ padding: "12px", textAlign: "left" }}>Warnings</th>
                    <th style={{ padding: "12px", textAlign: "left" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.user_id} style={{ borderBottom: "1px solid #333" }}>
                      <td style={{ padding: "12px" }}>{user.user_id}</td>
                      <td style={{ padding: "12px" }}>{user.username}</td>
                      <td style={{ padding: "12px" }}>{user.email}</td>
                      <td style={{ padding: "12px" }}>
                        {editingGold === user.user_id ? (
                          <div style={{ display: "flex", gap: "5px" }}>
                            <input
                              type="number"
                              value={goldValue}
                              onChange={(e) => setGoldValue(e.target.value)}
                              style={{ width: "80px", padding: "5px", borderRadius: "3px", border: "none" }}
                            />
                            <button onClick={() => handleSetGold(user.user_id)} style={{ padding: "5px 10px", background: "#4CAF50", border: "none", borderRadius: "3px", color: "white", cursor: "pointer" }}>Save</button>
                            <button onClick={() => setEditingGold(null)} style={{ padding: "5px 10px", background: "#666", border: "none", borderRadius: "3px", color: "white", cursor: "pointer" }}>X</button>
                          </div>
                        ) : (
                          <span>{user.gold === 67 ? "∞" : user.gold.toLocaleString()}</span>
                        )}
                      </td>
                      <td style={{ padding: "12px" }}>
                        {user.is_banned ? (
                          <span style={{ color: "#e74c3c", fontWeight: "bold" }} title={user.ban_reason || ""}>BANNED</span>
                        ) : (
                          <span style={{ color: "#2ecc71" }}>Active</span>
                        )}
                      </td>
                      <td style={{ padding: "12px" }}>
                        <span style={{ color: user.warning_count > 0 ? "#f39c12" : "#888" }}>
                          {user.warning_count || 0}
                        </span>
                      </td>
                      <td style={{ padding: "12px" }}>
                        <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                          <button
                            onClick={() => { setEditingGold(user.user_id); setGoldValue(String(user.gold)); }}
                            style={{ padding: "5px 8px", background: "#3498db", border: "none", borderRadius: "3px", color: "white", cursor: "pointer", fontSize: "12px" }}
                          >
                            Gold
                          </button>
                          <button
                            onClick={() => setWarnModal({ userId: user.user_id, username: user.username })}
                            style={{ padding: "5px 8px", background: "#f39c12", border: "none", borderRadius: "3px", color: "white", cursor: "pointer", fontSize: "12px" }}
                          >
                            Warn
                          </button>
                          {user.is_banned ? (
                            <button
                              onClick={() => handleUnbanUser(user.user_id)}
                              style={{ padding: "5px 8px", background: "#27ae60", border: "none", borderRadius: "3px", color: "white", cursor: "pointer", fontSize: "12px" }}
                            >
                              Unban
                            </button>
                          ) : (
                            <button
                              onClick={() => setBanModal({ userId: user.user_id, username: user.username })}
                              style={{ padding: "5px 8px", background: "#e67e22", border: "none", borderRadius: "3px", color: "white", cursor: "pointer", fontSize: "12px" }}
                              disabled={user.user_id === adminId}
                            >
                              Ban
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteUser(user.user_id, user.username)}
                            style={{ padding: "5px 8px", background: "#e74c3c", border: "none", borderRadius: "3px", color: "white", cursor: "pointer", fontSize: "12px" }}
                            disabled={user.user_id === adminId}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </div>
        )}

        {activeTab === "items" && (
          <div>
            <button
              onClick={() => setShowAddItem(true)}
              style={{ marginBottom: "15px", padding: "10px 20px", background: "#4CAF50", border: "none", borderRadius: "5px", color: "white", cursor: "pointer" }}
            >
              + Add New Item
            </button>

            {showAddItem && (
              <div style={{ background: "#16213e", padding: "20px", borderRadius: "10px", marginBottom: "15px" }}>
                <h3 style={{ marginTop: 0 }}>Add New Item</h3>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <input
                    placeholder="Item Name"
                    value={newItem.name}
                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                    style={{ padding: "8px", borderRadius: "5px", border: "none" }}
                  />
                  <select
                    value={newItem.type}
                    onChange={(e) => setNewItem({ ...newItem, type: e.target.value })}
                    style={{ padding: "8px", borderRadius: "5px", border: "none" }}
                  >
                    <option value="weapon_skin">Weapon Skin</option>
                    <option value="powerup">Powerup</option>
                    <option value="cosmetic">Cosmetic</option>
                  </select>
                  <input
                    type="number"
                    placeholder="Price"
                    value={newItem.price}
                    onChange={(e) => setNewItem({ ...newItem, price: parseInt(e.target.value) || 0 })}
                    style={{ padding: "8px", borderRadius: "5px", border: "none", width: "80px" }}
                  />
                  <label style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                    <input
                      type="checkbox"
                      checked={newItem.isCosmetic}
                      onChange={(e) => setNewItem({ ...newItem, isCosmetic: e.target.checked })}
                    />
                    Cosmetic
                  </label>
                  <button onClick={handleAddItem} style={{ padding: "8px 16px", background: "#4CAF50", border: "none", borderRadius: "5px", color: "white", cursor: "pointer" }}>Add</button>
                  <button onClick={() => setShowAddItem(false)} style={{ padding: "8px 16px", background: "#666", border: "none", borderRadius: "5px", color: "white", cursor: "pointer" }}>Cancel</button>
                </div>
              </div>
            )}

            <div style={{ background: "#16213e", borderRadius: "10px", overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "700px" }}>
                  <thead>
                    <tr style={{ background: "#0f3460" }}>
                      <th style={{ padding: "12px", textAlign: "left" }}>ID</th>
                      <th style={{ padding: "12px", textAlign: "left" }}>Name</th>
                      <th style={{ padding: "12px", textAlign: "left" }}>Type</th>
                      <th style={{ padding: "12px", textAlign: "left" }}>Price</th>
                      <th style={{ padding: "12px", textAlign: "left" }}>Cosmetic</th>
                      <th style={{ padding: "12px", textAlign: "left" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.item_id} style={{ borderBottom: "1px solid #333" }}>
                        <td style={{ padding: "12px" }}>{item.item_id}</td>
                        <td style={{ padding: "12px" }}>
                          {editingItem?.item_id === item.item_id ? (
                            <input
                              value={editingItem.item_name}
                              onChange={(e) => setEditingItem({ ...editingItem, item_name: e.target.value })}
                              style={{ padding: "5px", borderRadius: "3px", border: "none" }}
                            />
                          ) : item.item_name}
                        </td>
                        <td style={{ padding: "12px" }}>
                          {editingItem?.item_id === item.item_id ? (
                            <select
                              value={editingItem.item_type}
                              onChange={(e) => setEditingItem({ ...editingItem, item_type: e.target.value })}
                              style={{ padding: "5px", borderRadius: "3px", border: "none" }}
                            >
                              <option value="weapon_skin">Weapon Skin</option>
                              <option value="powerup">Powerup</option>
                              <option value="cosmetic">Cosmetic</option>
                            </select>
                          ) : item.item_type}
                        </td>
                        <td style={{ padding: "12px" }}>
                          {editingItem?.item_id === item.item_id ? (
                            <input
                              type="number"
                              value={editingItem.store_price}
                              onChange={(e) => setEditingItem({ ...editingItem, store_price: parseInt(e.target.value) || 0 })}
                              style={{ padding: "5px", borderRadius: "3px", border: "none", width: "60px" }}
                            />
                          ) : item.store_price}
                        </td>
                        <td style={{ padding: "12px" }}>
                          {editingItem?.item_id === item.item_id ? (
                            <input
                              type="checkbox"
                              checked={!!editingItem.is_cosmetic}
                              onChange={(e) => setEditingItem({ ...editingItem, is_cosmetic: e.target.checked })}
                            />
                          ) : (item.is_cosmetic ? "Yes" : "No")}
                        </td>
                        <td style={{ padding: "12px" }}>
                          {editingItem?.item_id === item.item_id ? (
                            <div style={{ display: "flex", gap: "5px" }}>
                              <button onClick={handleUpdateItem} style={{ padding: "5px 10px", background: "#4CAF50", border: "none", borderRadius: "3px", color: "white", cursor: "pointer" }}>Save</button>
                              <button onClick={() => setEditingItem(null)} style={{ padding: "5px 10px", background: "#666", border: "none", borderRadius: "3px", color: "white", cursor: "pointer" }}>Cancel</button>
                            </div>
                          ) : (
                            <div style={{ display: "flex", gap: "5px" }}>
                              <button onClick={() => setEditingItem(item)} style={{ padding: "5px 10px", background: "#3498db", border: "none", borderRadius: "3px", color: "white", cursor: "pointer" }}>Edit</button>
                              <button onClick={() => handleDeleteItem(item.item_id)} style={{ padding: "5px 10px", background: "#e74c3c", border: "none", borderRadius: "3px", color: "white", cursor: "pointer" }}>Delete</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === "transactions" && (
          <div>
            {/* Summary Cards */}
            <div style={{ display: "flex", gap: "16px", marginBottom: "24px", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "180px", background: "#1a2744", borderRadius: "10px", padding: "20px", textAlign: "center" }}>
                <div style={{ fontSize: "13px", color: "#888", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "1px" }}>Total Revenue</div>
                <div style={{ fontSize: "32px", fontWeight: "bold", color: "#4CAF50" }}>
                  ${transactionSummary.totalRevenue.toFixed(2)}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: "180px", background: "#1a2744", borderRadius: "10px", padding: "20px", textAlign: "center" }}>
                <div style={{ fontSize: "13px", color: "#888", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "1px" }}>Total Purchases</div>
                <div style={{ fontSize: "32px", fontWeight: "bold", color: "#f0c040" }}>
                  {transactionSummary.transactionCount}
                </div>
              </div>
              <div style={{ flex: 2, minWidth: "220px", background: "#1a2744", borderRadius: "10px", padding: "20px", textAlign: "center" }}>
                <div style={{ fontSize: "13px", color: "#888", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "1px" }}>Most Purchased Tier</div>
                {transactionSummary.mostPurchasedTier ? (
                  <div>
                    <div style={{ fontSize: "24px", fontWeight: "bold", color: "#f0c040" }}>
                      {transactionSummary.mostPurchasedTier.goldAmount.toLocaleString()} Gold
                    </div>
                    <div style={{ fontSize: "13px", color: "#aaa", marginTop: "4px" }}>
                      Purchased {transactionSummary.mostPurchasedTier.count} time{transactionSummary.mostPurchasedTier.count !== 1 ? "s" : ""}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: "18px", color: "#666" }}>No data yet</div>
                )}
              </div>
            </div>

            {/* Charts */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
              {/* Earnings Over Time */}
              <div style={{ background: "#1a2744", borderRadius: "10px", padding: "20px" }}>
                <div style={{ fontWeight: "bold", fontSize: "14px", marginBottom: "16px", color: "#ccc" }}>
                  Daily Earnings — Last 30 Days
                </div>
                {earningsByDay.length === 0 ? (
                  <div style={{ height: "200px", display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>No data yet</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={earningsByDay} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
                      <XAxis
                        dataKey="day"
                        tick={{ fill: "#888", fontSize: 11 }}
                        angle={-45}
                        textAnchor="end"
                        interval={Math.max(0, Math.floor(earningsByDay.length / 6) - 1)}
                        tickFormatter={(v) => {
                          const d = new Date(v + "T00:00:00");
                          return `${d.toLocaleString("default", { month: "short" })} ${d.getDate()}`;
                        }}
                      />
                      <YAxis tick={{ fill: "#888", fontSize: 11 }} tickFormatter={(v) => `$${v}`} width={45} />
                      <Tooltip
                        contentStyle={{ background: "#0f1928", border: "1px solid #2a3a5e", borderRadius: "6px" }}
                        labelStyle={{ color: "#ccc" }}
                        formatter={(value: any) => [`$${Number(value).toFixed(2)}`, "Revenue"]}
                      />
                      <Bar dataKey="revenue" fill="#4CAF50" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Currency Tier Breakdown */}
              <div style={{ background: "#1a2744", borderRadius: "10px", padding: "20px" }}>
                <div style={{ fontWeight: "bold", fontSize: "14px", marginBottom: "16px", color: "#ccc" }}>
                  Purchases by Currency Tier
                </div>
                {tierBreakdown.length === 0 ? (
                  <div style={{ height: "200px", display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>No data yet</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={tierBreakdown}
                        dataKey="purchases"
                        nameKey="gold"
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={3}
                        label={({ gold, purchases }) => `${Number(gold).toLocaleString()}🪙 (${purchases})`}
                        labelLine={{ stroke: "#555" }}
                      >
                        {tierBreakdown.map((_entry, index) => (
                          <Cell key={index} fill={["#f0c040", "#4CAF50", "#5b9bd5", "#e67e22", "#9b59b6"][index % 5]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: "#0f1928", border: "1px solid #2a3a5e", borderRadius: "6px" }}
                        formatter={(value: any, _name: any, props: any) => [
                          `${value} purchase${value !== 1 ? "s" : ""} ($${Number(props.payload.revenue).toFixed(2)})`,
                          `${Number(props.payload.gold).toLocaleString()} Gold`,
                        ]}
                      />
                      <Legend
                        formatter={(value, entry: any) => (
                          <span style={{ color: "#ccc", fontSize: "12px" }}>
                            {Number(entry.payload.gold).toLocaleString()} Gold — ${Number(entry.payload.revenue).toFixed(2)}
                          </span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Transactions Table */}
            <div style={{ background: "#1a2744", borderRadius: "10px", overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #2a3a5e", fontWeight: "bold", fontSize: "15px" }}>
                All Transactions
              </div>
              <div style={{ overflowX: "auto" }}>
                {transactions.length === 0 ? (
                  <div style={{ padding: "40px", textAlign: "center", color: "#666" }}>No transactions found.</div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "700px" }}>
                    <thead>
                      <tr style={{ background: "#0f1928", textAlign: "left" }}>
                        <th style={{ padding: "12px 16px", color: "#888", fontWeight: 500, fontSize: "13px" }}>#</th>
                        <th style={{ padding: "12px 16px", color: "#888", fontWeight: 500, fontSize: "13px" }}>User</th>
                        <th style={{ padding: "12px 16px", color: "#888", fontWeight: 500, fontSize: "13px" }}>Gold Purchased</th>
                        <th style={{ padding: "12px 16px", color: "#888", fontWeight: 500, fontSize: "13px" }}>Amount Paid</th>
                        <th style={{ padding: "12px 16px", color: "#888", fontWeight: 500, fontSize: "13px" }}>Card</th>
                        <th style={{ padding: "12px 16px", color: "#888", fontWeight: 500, fontSize: "13px" }}>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((tx, idx) => (
                        <tr key={tx.transaction_id} style={{ borderTop: "1px solid #2a3a5e", background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}>
                          <td style={{ padding: "12px 16px", color: "#666", fontSize: "13px" }}>{tx.transaction_id}</td>
                          <td style={{ padding: "12px 16px" }}>
                            <span style={{ color: "#e0e0e0" }}>{tx.username || "Unknown"}</span>
                            <span style={{ color: "#555", fontSize: "12px", marginLeft: "6px" }}>#{tx.user_id}</span>
                          </td>
                          <td style={{ padding: "12px 16px", color: "#f0c040", fontWeight: "bold" }}>
                            {Number(tx.currency_purchased).toLocaleString()} 🪙
                          </td>
                          <td style={{ padding: "12px 16px", color: "#4CAF50", fontWeight: "bold" }}>
                            ${Number(tx.amount_spent_usd).toFixed(2)}
                          </td>
                          <td style={{ padding: "12px 16px", color: "#888", fontFamily: "monospace" }}>
                            {tx.card_number || "—"}
                          </td>
                          <td style={{ padding: "12px 16px", color: "#888", fontSize: "13px" }}>
                            {new Date(tx.transaction_date).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Ban Modal */}
      {banModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.8)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 }}>
          <div style={{ background: "#16213e", padding: "30px", borderRadius: "10px", maxWidth: "400px", width: "90%" }}>
            <h3 style={{ marginTop: 0 }}>Ban User: {banModal.username}</h3>
            <input
              placeholder="Reason for ban (optional)"
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              style={{ width: "100%", padding: "10px", borderRadius: "5px", border: "none", marginBottom: "15px", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={handleBanUser} style={{ flex: 1, padding: "10px", background: "#e74c3c", border: "none", borderRadius: "5px", color: "white", cursor: "pointer" }}>
                Confirm Ban
              </button>
              <button onClick={() => { setBanModal(null); setBanReason(""); }} style={{ flex: 1, padding: "10px", background: "#666", border: "none", borderRadius: "5px", color: "white", cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Warn Modal */}
      {warnModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.8)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 }}>
          <div style={{ background: "#16213e", padding: "30px", borderRadius: "10px", maxWidth: "400px", width: "90%" }}>
            <h3 style={{ marginTop: 0 }}>Warn User: {warnModal.username}</h3>
            <p style={{ color: "#888" }}>This will increase the user's warning count by 1.</p>
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={handleWarnUser} style={{ flex: 1, padding: "10px", background: "#f39c12", border: "none", borderRadius: "5px", color: "white", cursor: "pointer" }}>
                Confirm Warning
              </button>
              <button onClick={() => setWarnModal(null)} style={{ flex: 1, padding: "10px", background: "#666", border: "none", borderRadius: "5px", color: "white", cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
