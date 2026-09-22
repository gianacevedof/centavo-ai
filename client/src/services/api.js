const BASE_URL = "http://localhost:3000/api";

export async function getAccounts() {
  const response = await fetch(`${BASE_URL}/accounts`);
  return response.json();
}
