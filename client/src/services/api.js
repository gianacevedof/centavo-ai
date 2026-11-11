const BASE_URL = "/api";

// These endpoints never trigger a refresh-and-retry
const NO_REFRESH = ["/auth/login", "/auth/signup", "/auth/refresh", "/auth/logout"];

// If several requests expire together, they share one refresh call
let refreshInFlight = null;

function refreshSession() {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

async function request(endpoint, { params = {}, options = {}, retried = false } = {}) {
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

  const data = await response.json().catch(() => ({}));

  // Access token expired: refresh once, then retry this request
  if (
    response.status === 401 &&
    data.code === "TOKEN_EXPIRED" &&
    !retried &&
    !NO_REFRESH.includes(endpoint)
  ) {
    const refreshed = await refreshSession();
    if (refreshed) return request(endpoint, { params, options, retried: true });
  }

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
  createBudget: (data) =>
    request("/budgets", {
      options: {
        method: "POST",
        body: JSON.stringify(data),
      },
    }),
  fetchSavingsGoals: () => request("/goals"),
  createSavingsGoal: (data) =>
    request("/goals", {
      options: {
        method: "POST",
        body: JSON.stringify(data),
      },
    }),
  parseAIInput: (text) =>
    request("/ai/parse", {
      options: {
        method: "POST",
        body: JSON.stringify({ text }),
      },
    }),
  chatAI: (text, draft) =>
    request("/ai/chat", {
      options: {
        method: "POST",
        body: JSON.stringify({ text, draft }),
      },
    }),
  fetchSummary: (period) =>
    request("/transactions/summary", { params: { period } }),
  fetchTrends: () => request("/trends"),
  fetchAiTips: () => request("/ai/tips"),
};
