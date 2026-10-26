// components/ChatPanel/ChatPanel.jsx
// Ask Centavo: conversational chat panel. Plain markup only, Jensen does the styling.
import { useState } from "react";
import { api } from "../../services/api";

const GREETING = 'Tell me about a transaction, like "lunch 12".';

function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{ from: "ai", text: GREETING }]);
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState(null); // the server keeps the details here between messages
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
        // The user said yes: save the transaction the server prepared
        await api.createTransaction(reply.payload);
        addMessage("ai", reply.reply);
        setDraft(null);
      } else if (reply.status === "cancelled") {
        addMessage("ai", reply.reply);
        setDraft(null);
      } else {
        // "ask" or "confirm": show the reply and keep the draft for the next message
        addMessage("ai", reply.reply);
        setDraft(reply.draft);
      }
    } catch (err) {
      // On a failed save the draft is kept, so the user can say yes again
      addMessage("ai", err.message || "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <button onClick={() => setOpen(true)}>Ask Centavo</button>;
  }

  return (
    <section role="dialog" aria-label="Ask Centavo">
      <header>
        <h2>Ask Centavo</h2>
        <button onClick={() => setOpen(false)}>Close</button>
      </header>

      <div>
        {messages.map((m, i) => (
          <p key={i}>{m.from === "user" ? `You: ${m.text}` : m.text}</p>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const text = input;
          setInput("");
          send(text);
        }}
      >
        <input
          type="text"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" disabled={busy}>
          Send
        </button>
      </form>
    </section>
  );
}

export default ChatPanel;
