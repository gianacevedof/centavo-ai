// services/aiCache.js
// Short-lived, per-user caches for AI output (tips and budget tips).
// Any save that changes the numbers the AI reads calls clearAiCache(userId),
// so the next page load gets fresh tips instead of up to 15 minutes of old ones.

const TTL_MS = 15 * 60 * 1000;
const stores = { tips: new Map(), budgetTips: new Map() };

export function getCached(name, userId) {
  const hit = stores[name].get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  return null;
}

export function setCached(name, userId, value) {
  stores[name].set(userId, { at: Date.now(), value });
}

export function clearAiCache(userId) {
  for (const store of Object.values(stores)) store.delete(userId);
}
