import { parseTransaction } from "./services/gemini.js";

const mappings = {
  accounts: [
    { id: 1, name: "Checking" },
    { id: 2, name: "Savings" },
    { id: 3, name: "Debit Card" },
  ],
  categories: [
    { id: 10, name: "Groceries", type: "expense" },
    { id: 11, name: "Dining", type: "expense" },
    { id: 12, name: "Transport", type: "expense" },
    { id: 13, name: "Salary", type: "income" },
  ],
};

// Default: the 2 cases that never ran. Or pass your own:
// node test_ai.js "text one" "text two"
const cases = process.argv.slice(2).length
  ? process.argv.slice(2, 4) // max 2 per run
  : ["bought something", "coffee 4.75 last friday"];

for (const text of cases) {
  console.log(`\n> ${text}`);
  try {
    console.log(
      JSON.stringify(await parseTransaction(text, mappings), null, 2),
    );
  } catch (err) {
    console.log(`ERROR ${err.name} (status ${err.status}): ${err.message}`);
  }
}
