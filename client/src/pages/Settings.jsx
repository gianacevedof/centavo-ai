import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { api } from "../services/api";
import Layout from "../components/Layout/Layout";
import Card from "../components/Card/Card";
import styles from "./Settings.module.css";
import { PencilIcon } from "../components/Icons/Icons";

const UNCATEGORIZED = "uncategorized";

function getTodayLong() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function getTodayShort() {
  return new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function Settings() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("profile");
  const [user, setUser] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Category state
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState("");
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");

  // Modal state
  const [modal, setModal] = useState(null);
  const [reassignTo, setReassignTo] = useState(UNCATEGORIZED);
  const [modalError, setModalError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");

  // Dark mode state
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem("darkMode") === "true";
  });

  useEffect(() => {
    async function load() {
      try {
        // AUTH CHECK
        const { user: me } = await api.fetchMe();
        setUser(me);
      } catch {
        navigate("/login");
        return;
      }
      
      try {
        setCategories(await api.fetchCategories());
      } catch (err) {
        setPageError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [navigate]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark-mode");
      document.body.classList.add("dark-mode");
      localStorage.setItem("darkMode", "true");
    } else {
      document.documentElement.classList.remove("dark-mode");
      document.body.classList.remove("dark-mode");
      localStorage.setItem("darkMode", "false");
    }
  }, [darkMode]);

  const custom = categories.filter((c) => !c.is_default);

  // --- Category Handlers ---
  async function handleAdd(e) {
    e.preventDefault();
    setAddError(""); 
    setNotice("");
    const name = newName.trim();
    if (!name) { setAddError("Type a category name first."); return; }
    try {
      const created = await api.createCategory(name);
      setCategories((prev) => [...prev, created]);
      setNewName("");
      toast.success(`Added "${created.name}".`);
    } catch (err) { 
      toast.error(err.message);
    }
  }

  function startEdit(c) { setEditingId(c.id); setEditName(c.name); }
  function cancelEdit() { setEditingId(null); setEditName(""); }

  async function handleRename(e) {
    e?.preventDefault();
    const name = editName.trim();
    if (!name) { setPageError("Category name is required."); return; }
    setPageError("");
    try {
      const updated = await api.renameCategory(editingId, name);
      setCategories((prev) => prev.map((c) => (c.id === editingId ? { ...c, name: updated.name } : c)));
      toast.success(`Renamed to "${updated.name}".`);
      cancelEdit();
    } catch (err) { 
      toast.error(err.message);
    }
  }

  async function handleDelete(category) {
    setPageError(""); 
    setNotice("");
    try {
      await api.deleteCategory(category.id);
      setCategories((prev) => prev.filter((c) => c.id !== category.id));
      toast.success(`Deleted "${category.name}".`);
    } catch (err) {
      if (err.status === 409 && err.data?.transactions !== undefined) {
        setReassignTo(UNCATEGORIZED); setModalError("");
        setModal({ category, transactions: err.data.transactions, budgets: err.data.budgets });
      } else { 
        toast.error(err.message);
      }
    }
  }

  async function confirmDelete() {
    if (!modal) return;
    setBusy(true); setModalError("");
    try {
      const target = reassignTo === UNCATEGORIZED ? null : Number(reassignTo);
      const result = await api.deleteCategory(modal.category.id, { reassign_to: target });
      setCategories((prev) => prev.filter((c) => c.id !== modal.category.id));
      
      const parts = [`Deleted "${modal.category.name}".`];
      if (result.transactions_moved > 0) parts.push(`${result.transactions_moved} transaction(s) moved.`);
      
      toast.success(parts.join(" "));
      setModal(null);
    } catch (err) { 
      toast.error(err.message);
    } finally { 
      setBusy(false); 
    }
  }

  const targets = modal ? categories.filter((c) => c.id !== modal.category.id) : [];

  if (loading) return <Layout><div className={styles.loading}>Loading...</div></Layout>;

  return (
    <Layout 
      title="Profile and settings" 
      subtitle={getTodayLong() + " · Manage your profile, preferences and privacy in one place."}
    >
      
      <div className={styles.tabs}>
        <button className={`${styles.tabBtn} ${tab === "profile" ? styles.tabBtnActive : ""}`} onClick={() => setTab("profile")}>Profile & Settings</button>
        <button className={`${styles.tabBtn} ${tab === "categories" ? styles.tabBtnActive : ""}`} onClick={() => setTab("categories")}>Categories</button>
      </div>

      {/* ================= PROFILE TAB ================= */}
      {tab === "profile" && user && (
        <div className={styles.profileWrapper}>
          
          <div className={styles.profileHeader}>
            <h1 className={styles.pageTitle}>Make Centavo-ai yours</h1>
            <p className={styles.pageSubtitle}>Manage your profile, preferences and privacy in one place.</p>
          </div>

          {/* User Banner */}
          <div className={styles.userBanner}>
            <div className={styles.userAvatar}>{user.name[0]}</div>
            <div className={styles.userInfo}>
              <h2>{user.name}</h2>
              <p>{user.email}</p>
            </div>
            <button className={styles.outlineBtn}>Edit profile</button>
          </div>

          {/* Settings Grid */}
          <div className={styles.settingsGrid}>
            
            <Card title="Notifications">
              <div className={styles.toggleRow}>
                <div>
                  <span className={styles.toggleLabel}>Weekly check-in</span>
                  <span className={styles.toggleDesc}>Every Sunday</span>
                </div>
                <label className={styles.switch}><input type="checkbox" defaultChecked /><span className={styles.slider}></span></label>
              </div>
              <div className={styles.toggleRow}>
                <div>
                  <span className={styles.toggleLabel}>Tip alerts</span>
                  <span className={styles.toggleDesc}>Timely ideas for your plan</span>
                </div>
                <label className={styles.switch}><input type="checkbox" defaultChecked /><span className={styles.slider}></span></label>
              </div>
            </Card>

            <Card title="Linked accounts">
              <div className={styles.linkedAccountRow}>
                <div className={styles.linkedIcon}>🏛️</div>
                <div>
                  <span className={styles.toggleLabel}>0 banks synced</span>
                  <span className={styles.toggleDesc}>No accounts connected yet</span>
                </div>
              </div>
              <button className={styles.outlineBtnFull} style={{ marginTop: '16px' }}>Manage linked accounts</button>
            </Card>

            <Card title="Currency and date">
              <div className={styles.selectRow}>
                <span>Currency</span>
                <select className={styles.miniSelect}><option>USD</option></select>
              </div>
              <div className={styles.selectRow}>
                <span>Date format</span>
                <select className={styles.miniSelect}><option>{getTodayShort()}</option></select>
              </div>
              <p className={styles.cardDesc} style={{ marginTop: '16px' }}>Used across your balances, goals and activity.</p>
            </Card>

            <Card title="Data and privacy">
              <button className={styles.outlineBtnFull} style={{ marginBottom: "16px" }}>
                <span style={{ marginRight: '8px' }}>⬇</span> Export my data
              </button>
              <p className={styles.cardDesc}>Account deletion is permanent and asks for confirmation first.</p>
              <button className={styles.dangerBtnFull}>Delete account</button>
            </Card>

            <Card title="Appearance">
              <div className={styles.toggleRow}>
                <div>
                  <span className={styles.toggleLabel}>Dark Mode</span>
                  <span className={styles.toggleDesc}>Switch the app to dark theme</span>
                </div>
                <label className={styles.switch}>
                  <input type="checkbox" checked={darkMode} onChange={(e) => setDarkMode(e.target.checked)} />
                  <span className={styles.slider}></span>
                </label>
              </div>
            </Card>
          </div>

          <div className={styles.footerRow}>
            <button className={styles.outlineBtn} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>→</span> Sign out
            </button>
            <span className={styles.saveText}>✓ Preferences save automatically</span>
          </div>
        </div>
      )}

      {/* ================= CATEGORIES TAB ================= */}
      {tab === "categories" && (
        <div className={styles.categoriesWrapper}>
          <Card title="Manage Categories">
            <p className={styles.cardDesc}>Set a monthly limit for each category.</p>
            <form onSubmit={handleAdd} className={styles.addCategoryForm}>
              <input type="text" placeholder="Category name" value={newName} maxLength={100} onChange={(e) => setNewName(e.target.value)} className={styles.textInput} />
              <button type="submit" className={styles.primaryBtn}>Add category</button>
            </form>
            {addError && <p className={styles.errorText}>{addError}</p>}
            {pageError && <p className={styles.errorText}>{pageError}</p>}
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr><th>Category</th><th>Type</th><th className={styles.textRight}>Action</th></tr>
                </thead>
                <tbody>
                  {custom.map((c) => (
                    <tr key={c.id}>
                      <td className={styles.descCell}><span className={styles.dot} />{c.name}</td>
                      <td><span className={styles.badgeCustom}>Custom</span></td>
                      <td className={styles.textRight}>
                        <div className={styles.rowActions}>
                          <button className={styles.iconBtn} onClick={() => startEdit(c)}><PencilIcon /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {custom.length === 0 && <tr><td colSpan={3} className={styles.descCell}>No custom categories yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* --- DELETE MODAL --- */}
      {modal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h3>Delete "{modal.category.name}"?</h3>
            <p className={styles.modalDesc}>This category is used by <strong>{modal.transactions} transaction(s)</strong>. Pick where they should go.</p>
            <label className={styles.modalLabel}>Move transactions to</label>
            <select className={styles.selectInput} value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
              <option value={UNCATEGORIZED}>Uncategorized</option>
              {targets.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {modalError && <p className={styles.errorText}>{modalError}</p>}
            <div className={styles.modalActions}>
              <button className={styles.outlineBtn} onClick={() => setModal(null)} disabled={busy}>Cancel</button>
              <button className={styles.dangerBtn} onClick={confirmDelete} disabled={busy}>{busy ? "Deleting..." : "Delete category"}</button>
            </div>
          </div>
        </div>
      )}

      {/* --- RENAME MODAL --- */}
      {editingId !== null && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h3>Rename category</h3>
            <form onSubmit={handleRename}>
              <label className={styles.modalLabel}>Category name</label>
              <input type="text" className={styles.textInput} value={editName} maxLength={100} autoFocus onChange={(e) => setEditName(e.target.value)} />
              {pageError && <p className={styles.errorText}>{pageError}</p>}
              <div className={styles.modalActions}>
                <button type="button" className={styles.outlineBtn} onClick={cancelEdit}>Cancel</button>
                <button type="submit" className={styles.primaryBtn}>Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}

export default Settings;
