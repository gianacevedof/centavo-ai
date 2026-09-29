const BASE_URL = "http://localhost:3000/api";

async function request(endpoint, { params = {}, options = {} } = {}) {
  const queryString = new URLSearchParams(params).toString();
  const url = queryString ? `${endpoint}?${queryString}` : endpoint;

  const response = await fetch(`${BASE_URL}${url}`, {
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
  checkHealth: () => request("/health"),
  fetchAccounts: (params) => request("/accounts", { params }),
  createAccount: (accountData) => 
    request("/accounts", {
      params: {},
      options: {
        method: "POST",
        body: JSON.stringify(accountData),
      },
    }),
  fetchTransactions: (params) => request("/transactions", { params }),
  createTransaction: (txData) => 
    request("/transactions", {
      params: {},
      options: {
        method: "POST",
        body: JSON.stringify(txData),
      },
    }),
  fetchBudgets: (params) => request("/budgets", { params }),
};
