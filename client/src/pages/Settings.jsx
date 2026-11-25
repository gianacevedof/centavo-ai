import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { api } from "../services/api";
import Layout from "../components/Layout/Layout";
import Card from "../components/Card/Card";
import styles from "./Settings.module.css";
import { PencilIcon } from "../components/Icons/Icons";

const UNCATEGORIZED = "uncategorized";
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_REPORT_DAYS = 366;
const pad = (n) => String(n).padStart(2, "0");
const now = new Date();
const DEFAULT_REPORT_FROM = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
const DEFAULT_REPORT_TO = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(lastDay)}`;

function getTodayLong() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function Settings() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("profile");
  const [user, setUser] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [profileModal, setProfileModal] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: "", email: "" });
  const [profileError, setProfileError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [reportFrom, setReportFrom] = useState(DEFAULT_REPORT_FROM);
  const [reportTo, setReportTo] = useState(DEFAULT_REPORT_TO);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState("");

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
        // AUTH CHECK RESTORED
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
    if (!name) {
      setAddError("Type a category name first.");
      return;
    }
    try {
      const created = await api.createCategory(name);
      setCategories((prev) => [...prev, created]);
      setNewName("");
      toast.success(`Added "${created.name}".`);
    } catch (err) {
      toast.error(err.message);
    }
  }

  function startEdit(c) {
    setEditingId(c.id);
    setEditName(c.name);
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
        prev.map((c) =>
          c.id === editingId ? { ...c, name: updated.name } : c,
        ),
      );
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
      cancelEdit();
    } catch (err) {
      if (err.status === 409 && err.data?.transactions !== undefined) {
        cancelEdit();
        setReassignTo(UNCATEGORIZED);
        setModalError("");
        setModal({
          category,
          transactions: err.data.transactions,
          budgets: err.data.budgets,
        });
      } else {
        toast.error(err.message);
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
      setCategories((prev) => prev.filter((c) => c.id !== modal.category.id));

      const parts = [`Deleted "${modal.category.name}".`];
      if (result.transactions_moved > 0)
        parts.push(`${result.transactions_moved} transaction(s) moved.`);

      toast.success(parts.join(" "));
      setModal(null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const targets = modal
    ? categories.filter((c) => c.id !== modal.category.id)
    : [];
  const editingCategory = categories.find((c) => c.id === editingId);
  const name = typeof user?.name === "string" ? user.name.trim() : "";
  const displayName = name
    ? `${name[0].toUpperCase()}${name.slice(1)}`
    : "User";

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await api.logout();
      navigate("/login", { replace: true });
    } catch (err) {
      toast.error(err.message || "Failed to sign out.");
    } finally {
      setLoggingOut(false);
    }
  }

  function openProfileModal() {
    setProfileForm({ name: user?.name || "", email: user?.email || "" });
    setProfileError("");
    setDeleteConfirm(false);
    setProfileModal(true);
  }

  function closeProfileModal() {
    if (savingProfile || deletingAccount) return;
    setProfileModal(false);
    setDeleteConfirm(false);
  }

  async function handleProfileSave(e) {
    e.preventDefault();
    setProfileError("");
    setSavingProfile(true);
    try {
      const { user: updatedUser } = await api.updateProfile(profileForm);
      setUser(updatedUser);
      setProfileModal(false);
      toast.success("Profile updated.");
    } catch (err) {
      setProfileError(err.message || "Could not update your profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleAccountDelete() {
    setProfileError("");
    setDeletingAccount(true);
    try {
      await api.deleteAccount();
      toast.success("Your account has been deleted.");
      navigate("/login", { replace: true });
    } catch (err) {
      setProfileError(err.message || "Could not delete your account.");
      setDeleteConfirm(false);
    } finally {
      setDeletingAccount(false);
    }
  }

  async function handleOpenReport(e) {
    e.preventDefault();
    setReportError("");
    if (reportFrom > reportTo) {
      setReportError("The start date must be on or before the end date.");
      return;
    }
    const days =
      (Date.parse(`${reportTo}T00:00:00Z`) -
        Date.parse(`${reportFrom}T00:00:00Z`)) /
        DAY_MS +
      1;
    if (days > MAX_REPORT_DAYS) {
      setReportError("A report can cover at most 366 days.");
      return;
    }

    const win = window.open("", "_blank");
    setReportBusy(true);
    try {
      await api.openReport(reportFrom, reportTo, win);
    } catch (err) {
      if (win) win.close();
      setReportError(err.message || "Could not open the report.");
    } finally {
      setReportBusy(false);
    }
  }

  if (loading)
    return (
      <Layout>
        <div className={styles.loading}>Loading...</div>
      </Layout>
    );

  return (
    <Layout
      title="Settings"
      subtitle={
        getTodayLong() +
        " · Manage your profile, categories and reports in one place."
      }
    >
      <div className={styles.tabs}>
        <button
          className={`${styles.tabBtn} ${tab === "profile" ? styles.tabBtnActive : ""}`}
          onClick={() => setTab("profile")}
        >
          Settings
        </button>
        <button
          className={`${styles.tabBtn} ${tab === "categories" ? styles.tabBtnActive : ""}`}
          onClick={() => setTab("categories")}
        >
          Categories
        </button>
      </div>

      {/* ================= PROFILE TAB ================= */}
      {tab === "profile" && user && (
        <div className={styles.profileWrapper}>
          <div className={styles.profileHeader}>
            <h1 className={styles.pageTitle}>Make Centavo yours</h1>
            <p className={styles.pageSubtitle}>
              Manage your profile and preferences in one place.
            </p>
          </div>

          {/* User Banner */}
          <div className={styles.userBanner}>
            <div className={styles.userAvatar}>{displayName[0]}</div>
            <div className={styles.userInfo}>
              <h2>{displayName}</h2>
              <p>{user.email}</p>
            </div>
            <button
              type="button"
              className={styles.outlineBtn}
              onClick={openProfileModal}
            >
              Edit profile
            </button>
          </div>

          {/* Settings Grid */}
          <div className={styles.settingsGrid}>
            <Card title="Appearance">
              <div className={styles.toggleRow}>
                <div>
                  <span className={styles.toggleLabel}>Dark Mode</span>
                  <span className={styles.toggleDesc}>
                    Switch the app to dark theme
                  </span>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={darkMode}
                    onChange={(e) => setDarkMode(e.target.checked)}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>
            </Card>

            <Card title="Reports">
              <p className={styles.cardDesc}>
                Open a report for any date range of up to 366 days.
              </p>
              <form onSubmit={handleOpenReport}>
                <label>
                  From{" "}
                  <input
                    type="date"
                    className={styles.textInput}
                    value={reportFrom}
                    onChange={(e) => setReportFrom(e.target.value)}
                    required
                  />
                </label>{" "}
                <label>
                  To{" "}
                  <input
                    type="date"
                    className={styles.textInput}
                    value={reportTo}
                    onChange={(e) => setReportTo(e.target.value)}
                    required
                  />
                </label>{" "}
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={reportBusy}
                >
                  {reportBusy ? "Opening..." : "Open report"}
                </button>
              </form>
              {reportError && <p role="alert">{reportError}</p>}
            </Card>
          </div>

          <div className={styles.footerRow}>
            <button
              className={styles.outlineBtn}
              style={{ display: "flex", alignItems: "center", gap: "8px" }}
              onClick={handleLogout}
              disabled={loggingOut}
            >
              <span>→</span> {loggingOut ? "Signing out..." : "Sign out"}
            </button>
            <span className={styles.saveText}>
              ✓ Preferences save automatically
            </span>
          </div>
        </div>
      )}

      {/* ================= EDIT PROFILE MODAL ================= */}
      {profileModal && (
        <div className={styles.modalOverlay}>
          <div
            className={styles.modalContent}
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-modal-title"
          >
            <div className={styles.modalHeader}>
              <div>
                <h2 id="profile-modal-title">Edit profile</h2>
                <p className={styles.modalSubtitle}>
                  A few details to make Centavo AI yours.
                </p>
              </div>
              <button
                className={styles.closeBtn}
                onClick={closeProfileModal}
                disabled={savingProfile || deletingAccount}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleProfileSave} className={styles.profileForm}>
              {/* 1. Avatar Section */}
              <div className={styles.avatarSection}>
                <div className={styles.avatarLarge}>{displayName[0]}</div>
                <div>
                  <button type="button" className={styles.outlineBtn}>
                    Change photo
                  </button>
                  <p className={styles.avatarHint}>JPG or PNG · Up to 5 MB</p>
                </div>
              </div>

              {/* 2. Account Details */}
              <div className={styles.formSection}>
                <h3 className={styles.sectionTitle}>Account details</h3>
                <div className={styles.formGrid}>
                  <label className={styles.formGroup}>
                    <span>Full name</span>
                    <input
                      type="text"
                      placeholder="Enter your name"
                      value={profileForm.name}
                      maxLength={100}
                      required
                      onChange={(e) =>
                        setProfileForm((current) => ({
                          ...current,
                          name: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className={styles.formGroup}>
                    <span>Username</span>
                    <input
                      type="text"
                      placeholder="Choose a username"
                      disabled
                    />
                  </label>
                  <label className={styles.formGroup}>
                    <span>Email address</span>
                    <input
                      type="email"
                      placeholder="Enter your email address"
                      value={profileForm.email}
                      maxLength={254}
                      required
                      onChange={(e) =>
                        setProfileForm((current) => ({
                          ...current,
                          email: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className={styles.formGroup}>
                    <span>Phone number</span>
                    <input
                      type="tel"
                      placeholder="Enter your phone number"
                      disabled
                    />
                  </label>
                </div>
              </div>

              {/* 3. Update Password */}
              <div className={styles.formSection}>
                <h3 className={styles.sectionTitle}>Update password</h3>
                <p className={styles.sectionDesc}>
                  Leave these fields blank to keep your password.
                </p>
                <div className={styles.formGrid}>
                  <label
                    className={styles.formGroup}
                    style={{ gridColumn: "1 / -1" }}
                  >
                    <span>Current password</span>
                    <input
                      type="password"
                      placeholder="••••••••••••"
                      disabled
                    />
                  </label>
                  <label className={styles.formGroup}>
                    <span>New password</span>
                    <input
                      type="password"
                      placeholder="••••••••••••"
                      disabled
                    />
                  </label>
                  <label className={styles.formGroup}>
                    <span>Re-enter new password</span>
                    <input
                      type="password"
                      placeholder="••••••••••••"
                      disabled
                    />
                  </label>
                </div>
                <p className={styles.passwordHint}>
                  Use at least 12 characters, including a number and a symbol.
                </p>
              </div>

              {profileError && (
                <p className={styles.errorText} role="alert">
                  {profileError}
                </p>
              )}

              {/* 4. Footer / Delete Account */}
              <div className={styles.modalFooter}>
                <div>
                  {!deleteConfirm ? (
                    <button
                      type="button"
                      className={styles.dangerBtn}
                      onClick={() => setDeleteConfirm(true)}
                      disabled={savingProfile || deletingAccount}
                    >
                      Delete account
                    </button>
                  ) : (
                    <div className={styles.deleteConfirmRow}>
                      <span className={styles.deleteWarning}>
                        Are you sure? This cannot be undone.
                      </span>
                      <button
                        type="button"
                        className={styles.outlineBtn}
                        onClick={() => setDeleteConfirm(false)}
                        disabled={deletingAccount}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className={styles.dangerBtn}
                        onClick={handleAccountDelete}
                        disabled={deletingAccount}
                      >
                        {deletingAccount ? "Deleting..." : "Confirm"}
                      </button>
                    </div>
                  )}
                </div>

                <div className={styles.footerActions}>
                  <button
                    type="button"
                    className={styles.outlineBtn}
                    onClick={closeProfileModal}
                    disabled={savingProfile || deletingAccount}
                  >
                    Discard
                  </button>
                  <button
                    type="submit"
                    className={styles.primaryBtn}
                    disabled={savingProfile || deletingAccount}
                  >
                    {savingProfile ? "Saving..." : "Save changes"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= CATEGORIES TAB ================= */}
      {tab === "categories" && (
        <div className={styles.categoriesWrapper}>
          <Card title="Manage Categories">
            <p className={styles.cardDesc}>
              Add and manage your own categories.
            </p>
            <form onSubmit={handleAdd} className={styles.addCategoryForm}>
              <div className={styles.addCategoryField}>
                <label
                  htmlFor="new-category-name"
                  className={styles.addCategoryLabel}
                >
                  Add your own category:
                </label>
                <input
                  id="new-category-name"
                  type="text"
                  placeholder="Category name"
                  value={newName}
                  maxLength={100}
                  onChange={(e) => setNewName(e.target.value)}
                  className={styles.textInput}
                />
              </div>
              <button type="submit" className={styles.primaryBtn}>
                Add category
              </button>
            </form>
            {addError && <p className={styles.errorText}>{addError}</p>}
            {pageError && <p className={styles.errorText}>{pageError}</p>}
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th className={styles.textRight}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {custom.map((c) => (
                    <tr key={c.id}>
                      <td className={styles.descCell}>
                        <span className={styles.dot} />
                        {c.name}
                      </td>
                      <td className={styles.textRight}>
                        <div className={styles.rowActions}>
                          <button
                            type="button"
                            className={styles.iconBtn}
                            onClick={() => startEdit(c)}
                            aria-label={`Edit ${c.name}`}
                          >
                            <PencilIcon />
                            <span>Edit</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {custom.length === 0 && (
                    <tr>
                      <td colSpan={2} className={styles.descCell}>
                        No custom categories yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* --- DELETE CATEGORY MODAL --- */}
      {modal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h3>Delete "{modal.category.name}"?</h3>
            <p className={styles.modalDesc}>
              This category is used by{" "}
              <strong>{modal.transactions} transaction(s)</strong>. Pick where
              they should go.
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

      {/* --- RENAME CATEGORY MODAL --- */}
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
                {editingCategory && (
                  <button
                    type="button"
                    className={`${styles.dangerBtn} ${styles.modalDeleteBtn}`}
                    onClick={() => handleDelete(editingCategory)}
                  >
                    Delete category
                  </button>
                )}
                <button
                  type="button"
                  className={styles.outlineBtn}
                  onClick={cancelEdit}
                >
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
