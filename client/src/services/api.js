const BASE_URL = "http://localhost:3000/api";

async function request(endpoint, options = {}) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || data.error || "An error occurred");
  }

  return data;
}

export const api = {
  // Health Check
  checkHealth: () => request("/health"),

  // Accounts
  fetchAccounts: () => request("/accounts"),
  createAccount: (accountData) =>
    request("/accounts", {
      method: "POST",
      body: JSON.stringify(accountData),
    }),

  // Transactions (Placeholders for now)
  fetchTransactions: () => request("/transactions"),

  // Budgets (Placeholders for now)
  fetchBudgets: () => request("/budgets"),
};
