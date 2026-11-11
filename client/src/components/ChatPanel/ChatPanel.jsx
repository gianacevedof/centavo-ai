// components/ChatPanel/ChatPanel.jsx
import { useState } from "react";
import { api } from "../../services/api";
import styles from "./ChatPanel.module.css";

// Runs the actions from a confirmed card, in order. New categories are created
// first, and items that use them wait for the id. A failed item doesn't stop the rest.
async function runActions(actions) {
  const newIds = {}; // "new:<name>" -> id of the category created for it
  const failures = [];
  let saved = 0;
  let total = 0;

  const withCategory = (body, key) => {
    if (!key) return body;
    if (newIds[key] === undefined) {
      throw new Error(`the new category "${key.slice(4)}" was not created`);
    }
    return { ...body, category_id: newIds[key] };
  };

  for (const a of actions) {
    try {
      if (a.kind === "category_create") {
        const cat = await api.createCategory(a.name);
        newIds[a.key] = cat.id;
        continue;
      }
      total++;
      if (a.kind === "transaction_create") {
        await api.createTransaction(withCategory(a.body, a.category_key));
      } else if (a.kind === "transaction_update") {
        await api.updateTransaction(a.id, withCategory(a.body, a.category_key));
      } else if (a.kind === "budget_create") {
        await api.createBudget(withCategory(a.body, a.category_key));
      } else if (a.kind === "budget_update") {
        await api.updateBudget(a.id, a.monthly_limit);
      } else if (a.kind === "goal_create") {
        await api.createSavingsGoal(a.body);
      } else if (a.kind === "goal_update") {
        await api.updateSavingsGoal(a.id, a.body);
      } else if (a.kind === "category_rename") {
        await api.renameCategory(a.id, a.name);
      } else {
        throw new Error("unknown action");
      }
      saved++;
    } catch (err) {
      failures.push(err.message || "something went wrong");
    }
  }
  return { saved, total, failures };
}

function summarize({ saved, total, failures }) {
  if (total === 0 && failures.length === 0) return "Nothing to save.";
  if (failures.length === 0) return total === 1 ? "Saved." : `Saved all ${total}.`;
  return `Saved ${saved} of ${total}. Could not save: ${failures.join("; ")}.`;
}

function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]); 
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);

  function addMessage(from, text) {
    setMessages((prev) => [...prev, { from, text }]);
  }

  async function send(text) {
    const clean = text.trim();
    if (!clean || busy) return;

    addMessage("user", clean);
    setBusy(true);
    try {
      const reply = await api.chatAI(clean, draft ?? {});

      if (reply.status === "save") {
        setDraft(null);
        const result = await runActions(reply.actions);
        addMessage("ai", summarize(result));
      } else if (reply.status === "cancelled") {
        addMessage("ai", reply.reply);
        setDraft(null);
      } else {
        addMessage("ai", reply.reply);
        setDraft(reply.draft);
      }
    } catch (err) {
      addMessage("ai", err.message || "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className={styles.chatToggleBtn} onClick={() => setOpen(true)}>
        <span style={{ fontSize: "1.2rem" }}>✦</span> Ask Centavo
      </button>
    );
  }

  return (
    <section className={styles.chatPanel} role="dialog" aria-label="Ask Centavo">
      <header className={styles.chatHeader}>
        <h2>Ask Centavo</h2>
        <button className={styles.closeBtn} onClick={() => setOpen(false)}>
          Close
        </button>
      </header>

      <div className={styles.messagesContainer}>
        {messages.map((m, i) => (
          <p
            key={i}
            className={
              m.from === "user"
                ? `${styles.message} ${styles.messageUser}`
                : `${styles.message} ${styles.messageAi}`
            }
          >
            {m.text}
          </p>
        ))}
      </div>

      <div className={styles.suggestionsRow}>
        <span>You can also ask</span>
        <button className={styles.suggestionPill} onClick={() => setInput("How will this affect my goal?")}>How will this affect my goal?</button>
        <button className={styles.suggestionPill} onClick={() => setInput("Change the date")}>Change the date</button>
        <button className={styles.suggestionPill} onClick={() => setInput("Forecast month-end")}>Forecast month-end</button>
      </div>

      <form
        className={styles.chatForm}
        onSubmit={(e) => {
          e.preventDefault();
          const text = input;
          setInput("");
          send(text);
        }}
      >
        <div className={styles.inputRow}>
          <input
            type="text"
            className={styles.chatInput}
            placeholder="Type a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          
          <button type="submit" className={styles.sendBtn} disabled={busy}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5"></line>
              <polyline points="5 12 12 5 19 12"></polyline>
            </svg>
          </button>

          {draft && draft.awaiting === "confirm" && (
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={() => {
                setDraft(null);
                setInput("");
                addMessage("ai", "No problem, I didn't save it.");
              }}
              disabled={busy}
            >
              Cancel
            </button>
          )}
        </div>
        
        <div className={styles.inputHint}>
          Enter to send · Shift + Enter for a new line
        </div>
      </form>

      <div className={styles.chatFooter}>
        <span className={styles.manualEntry}>Enter manually</span>
        <span className={styles.trustText}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '2px' }}>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            <polyline points="9 12 11 14 15 10"></polyline>
          </svg>
          Always review AI suggestions. You're in control.
        </span>
      </div>
    </section>
  );
}

export default ChatPanel;
