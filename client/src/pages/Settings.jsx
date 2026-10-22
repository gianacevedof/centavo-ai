import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import Layout from "../components/Layout/Layout";

const UNCATEGORIZED = "uncategorized";

function Settings() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("profile");
  const [user, setUser] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Categories tab state
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState("");
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");

  // Delete modal state: null when closed
  const [modal, setModal] = useState(null); // { category, transactions, budgets }
  const [reassignTo, setReassignTo] = useState(UNCATEGORIZED);
  const [modalError, setModalError] = useState("");
  const [busy, setBusy] = useState(false);

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
    } catch (err) {
      setAddError(err.message);
    }
  }

  function removeFromList(id) {
    setCategories((prev) => prev.filter((c) => c.id !== id));
  }

  // Step 1: try deleting with no body. If it is in use, the server says 409
  // with counts and we open the modal.
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

  // Step 2: user picked where things go, delete for real.
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
      if (result.transactions_moved > 0) {
        parts.push(`${result.transactions_moved} transaction(s) moved.`);
      }
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

  return (
    <Layout title="Settings" subtitle="Your profile and categories">
      <div>
        <button onClick={() => setTab("profile")} disabled={tab === "profile"}>
          Profile
        </button>
        <button
          onClick={() => setTab("categories")}
          disabled={tab === "categories"}
        >
          Categories
        </button>
      </div>

      {loading && <p>Loading...</p>}

      {!loading && tab === "profile" && user && (
        <section>
          <h2>Profile</h2>
          <p>Name: {user.name}</p>
          <p>Email: {user.email}</p>
        </section>
      )}

      {!loading && tab === "categories" && (
        <section>
          <h2>Categories</h2>

          <form onSubmit={handleAdd}>
            <input
              type="text"
              placeholder="New category name"
              value={newName}
              maxLength={100}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button type="submit">Add</button>
          </form>
          {addError && <p role="alert">{addError}</p>}
          {pageError && <p role="alert">{pageError}</p>}
          {notice && <p role="status">{notice}</p>}

          <h3>Your categories</h3>
          {custom.length === 0 ? (
            <p>No custom categories yet.</p>
          ) : (
            <ul>
              {custom.map((c) => (
                <li key={c.id}>
                  <span>{c.name}</span>
                  <button onClick={() => handleDelete(c)}>Delete</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {modal && (
        <dialog open>
          <h2>Delete "{modal.category.name}"?</h2>
          <p>
            This category is used by {modal.transactions} transaction(s) and{" "}
            {modal.budgets} budget(s). Pick where the transactions should go.
          </p>

          <label htmlFor="reassign">Move transactions to</label>
          <select
            id="reassign"
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
            <p role="alert">
              Budget warning: this category's budget moves to the new category
              only if that category has no budget yet. If you choose
              Uncategorized, or the target already has a budget, the budget is
              removed.
            </p>
          )}

          {modalError && <p role="alert">{modalError}</p>}

          <button onClick={() => setModal(null)} disabled={busy}>
            Cancel
          </button>
          <button onClick={confirmDelete} disabled={busy}>
            {busy ? "Deleting..." : "Delete category"}
          </button>
        </dialog>
      )}
    </Layout>
  );
}

export default Settings;
