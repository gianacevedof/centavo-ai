import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import Layout from "../components/Layout/Layout";
import Card from "../components/Card/Card";
import styles from "./Settings.module.css";
import { PencilIcon } from "../components/Icons/Icons";

const UNCATEGORIZED = "uncategorized";

function Settings() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("profile"); // "profile" | "categories"
  const [user, setUser] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Categories tab state
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState("");
  const [pageError, setPageError] = useState("");
  const [signOutError, setSignOutError] = useState("");
  const [notice, setNotice] = useState("");

  // Delete modal state
  const [modal, setModal] = useState(null);
  const [reassignTo, setReassignTo] = useState(UNCATEGORIZED);
  const [modalError, setModalError] = useState("");
  const [busy, setBusy] = useState(false);
  // Category being renamed inline; null when none is
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    async function load() {
      try {
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

  const custom = categories.filter((c) => !c.is_default);

  async function handleSignOut() {
    setSignOutError("");
    try {
      await api.logout();
    } catch (err) {
      // Don't send the user to /login if the cookie may still be set.
      setSignOutError(err.message);
      return;
    }
    navigate("/login");
  }

  // --- Handlers ---
  async function handleAdd(e) {
    e.preventDefault();
    setAddError("");
    setNotice("");
    const name = newName.trim();
    if (!name) {
      setAddError("Type a category name first.");
      return;
    }
    try {
      const created = await api.createCategory(name);
      setCategories((prev) => [...prev, created]);
      setNewName("");
      setNotice(`Added "${created.name}".`);
    } catch (err) {
      setAddError(err.message);
    }
  }

  function removeFromList(id) {
    setCategories((prev) => prev.filter((c) => c.id !== id));
  }

  function startEdit(category) {
    setPageError("");
    setNotice("");
    setEditingId(category.id);
    setEditName(category.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
  }

  async function handleRename(e) {
    e?.preventDefault();
    const name = editName.trim();
    if (!name) {
      setPageError("Category name is required.");
      return;
    }
    setPageError("");
    try {
      const updated = await api.renameCategory(editingId, name);
      setCategories((prev) =>
        prev.map((c) => (c.id === editingId ? { ...c, name: updated.name } : c))
      );
      setNotice(`Renamed to "${updated.name}".`);
      cancelEdit();
    } catch (err) {
      setPageError(err.message);
    }
  }

  async function handleDelete(category) {
    setPageError("");
    setNotice("");
    try {
      await api.deleteCategory(category.id);
      removeFromList(category.id);
      setNotice(`Deleted "${category.name}".`);
    } catch (err) {
      if (err.status === 409 && err.data?.transactions !== undefined) {
        setReassignTo(UNCATEGORIZED);
        setModalError("");
        setModal({
          category,
          transactions: err.data.transactions,
          budgets: err.data.budgets,
        });
      } else {
        setPageError(err.message);
      }
    }
  }

  async function confirmDelete() {
    if (!modal) return;
    setBusy(true);
    setModalError("");
    try {
      const target = reassignTo === UNCATEGORIZED ? null : Number(reassignTo);
      const result = await api.deleteCategory(modal.category.id, {
        reassign_to: target,
      });
      removeFromList(modal.category.id);

      const parts = [`Deleted "${modal.category.name}".`];
      if (result.transactions_moved > 0)
        parts.push(`${result.transactions_moved} transaction(s) moved.`);
      if (result.budgets === "moved") parts.push("Its budget moved too.");
      if (result.budgets === "removed") parts.push("Its budget was removed.");

      setNotice(parts.join(" "));
      setModal(null);
    } catch (err) {
      setModalError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const targets = modal
    ? categories.filter((c) => c.id !== modal.category.id)
    : [];

  // --- Renderers ---
  if (loading) {
    return (
      <Layout title="Settings">
        <div className={styles.loading}>Loading settings...</div>
      </Layout>
    );
  }

  return (
    <Layout
      title="Settings"
      subtitle="Manage your account preferences and categories"
    >
      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tabBtn} ${tab === "profile" ? styles.tabBtnActive : ""}`}
          onClick={() => setTab("profile")}
        >
          Profile & Settings
        </button>
        <button
          className={`${styles.tabBtn} ${tab === "categories" ? styles.tabBtnActive : ""}`}
          onClick={() => setTab("categories")}
        >
          Categories
        </button>
      </div>

      {/* ===== TAB 1: PROFILE & SETTINGS ===== */}
      {tab === "profile" && user && (
        <div className={styles.profileWrapper}>
          {/* Top User Banner */}
          <div className={styles.userBanner}>
            <div className={styles.userAvatar}>
              {user.name ? user.name[0] : "U"}
            </div>
            <div className={styles.userInfo}>
              <h2>{user.name}</h2>
              <p>{user.email}</p>
            </div>
            <button className={styles.outlineBtn}>Edit profile</button>
          </div>

          <div className={styles.signOutRow}>
            <button className={styles.outlineBtn} onClick={handleSignOut}>
              Sign out
            </button>
            {signOutError && <p className={styles.errorText}>{signOutError}</p>}
          </div>
        </div>
      )}

      {/* ===== TAB 2: CATEGORIES ===== */}
      {tab === "categories" && (
        <div className={styles.categoriesWrapper}>
          <Card title="Manage Categories">
            <p className={styles.cardDesc}>
              Set a monthly limit for each category.
            </p>

            {/* Add Category Form */}
            <form onSubmit={handleAdd} className={styles.addCategoryForm}>
              <input
                type="text"
                placeholder="Category name"
                value={newName}
                maxLength={100}
                onChange={(e) => setNewName(e.target.value)}
                className={styles.textInput}
              />
              <button type="submit" className={styles.primaryBtn}>
                Add category
              </button>
            </form>

            {addError && <p className={styles.errorText}>{addError}</p>}
            {pageError && <p className={styles.errorText}>{pageError}</p>}
            {notice && <p className={styles.successText}>{notice}</p>}

            {/* Categories Table */}
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Type</th>
                    <th className={styles.textRight}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Custom Categories */}
                  {custom.map((c) => (
                    <tr key={c.id}>
                      <td className={styles.descCell}>
                        <span className={styles.dot} />
                        {c.name}
                      </td>
                      <td>
                        <span className={styles.badgeCustom}>Custom</span>
                      </td>
                      <td className={styles.textRight}>
                        <div className={styles.rowActions}>
                          <button
                            className={styles.iconBtn}
                            onClick={() => startEdit(c)}
                            aria-label="Edit category"
                            title="Edit"
                          >
                            <PencilIcon />
                          </button>
                          
                        </div>
                      </td>
                    </tr>
                  ))}
                {custom.length === 0 && (
                    <tr>
                      <td colSpan={3} className={styles.descCell}>
                        No custom categories yet. Want to add one?
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ===== DELETE MODAL ===== */}
      {modal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h3>Delete "{modal.category.name}"?</h3>
            <p className={styles.modalDesc}>
              This category is used by{" "}
              <strong>{modal.transactions} transaction(s)</strong> and{" "}
              <strong>{modal.budgets} budget(s)</strong>. Pick where the
              transactions should go.
            </p>

            <label className={styles.modalLabel}>Move transactions to</label>
            <select
              className={styles.selectInput}
              value={reassignTo}
              onChange={(e) => setReassignTo(e.target.value)}
            >
              <option value={UNCATEGORIZED}>Uncategorized</option>
              {targets.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            {modal.budgets > 0 && (
              <p className={styles.warningText}>
                Budget warning: this category's budget moves to the new category
                only if it has no budget yet. If you choose Uncategorized, the
                budget is removed.
              </p>
            )}

            {modalError && <p className={styles.errorText}>{modalError}</p>}

            <div className={styles.modalActions}>
              <button
                className={styles.outlineBtn}
                onClick={() => setModal(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                className={styles.dangerBtn}
                onClick={confirmDelete}
                disabled={busy}
              >
                {busy ? "Deleting..." : "Delete category"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== RENAME MODAL ===== */}
      {editingId !== null && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h3>Rename category</h3>
            <form onSubmit={handleRename}>
              <label className={styles.modalLabel}>Category name</label>
              <input
                type="text"
                className={styles.textInput}
                value={editName}
                maxLength={100}
                autoFocus
                onChange={(e) => setEditName(e.target.value)}
              />
              {pageError && <p className={styles.errorText}>{pageError}</p>}
              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={`${styles.dangerBtn} ${styles.deleteInModal}`}
                  onClick={() => {
                    const category = categories.find((c) => c.id === editingId);
                    cancelEdit();
                    handleDelete(category);
                  }}
                >
                  Delete
                </button>
                <button type="button" className={styles.outlineBtn} onClick={cancelEdit}>
                  Cancel
                </button>
                <button type="submit" className={styles.primaryBtn}>
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}

export default Settings;
