const BASE_URL = "/api";

async function request(endpoint, { params = {}, options = {} } = {}) {
  const queryString = new URLSearchParams(params).toString();
  const url = queryString ? `${endpoint}?${queryString}` : endpoint;

  const response = await fetch(`${BASE_URL}${url}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    credentials: "include",
    ...options,
  });

  const data = await response.json();

  if (!response.ok) {
    const err = new Error(
      data.message || data.error?.message || data.error || "An error occurred",
    );
    // Keep the status and full response so callers can read extra fields
    // (for example the transaction and budget counts on a 409).
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const api = {
  checkHealth: () => request("/health"),
  signup: (userData) =>
    request("/auth/signup", {
      options: {
        method: "POST",
        body: JSON.stringify(userData),
      },
    }),
  login: (credentials) =>
    request("/auth/login", {
      options: {
        method: "POST",
        body: JSON.stringify(credentials),
      },
    }),
  logout: () =>
    request("/auth/logout", {
      options: {
        method: "POST",
      },
    }),
  fetchMe: () => request("/auth/me"),
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
  fetchCategories: () => request("/categories"),
  createCategory: (name) =>
    request("/categories", {
      options: {
        method: "POST",
        body: JSON.stringify({ name }),
      },
    }),
  // No body = ask first (409 if in use). With { reassign_to } = delete for real.
  deleteCategory: (id, body) =>
    request(`/categories/${id}`, {
      options: {
        method: "DELETE",
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    }),
  createTransaction: (txData) =>
    request("/transactions", {
      params: {},
      options: {
        method: "POST",
        body: JSON.stringify(txData),
      },
    }),
  fetchBudgets: (params) => request("/budgets", { params }),
  parseAIInput: (text) =>
    request("/ai/parse", {
      options: {
        method: "POST",
        body: JSON.stringify({ text }),
      },
    }),
};
