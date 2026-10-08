import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
  generationConfig: {
    responseMimeType: "application/json",
  },
});

const SYSTEM_PROMPT = `
You are a financial transaction parser. Your goal is to extract structured data from a user's natural language input.
Extract the following fields:
- amount: (number) The value of the transaction.
- type: (string) One of: "expense", "income", "transfer".
- category_id: (number) The category ID based on the provided mapping.
- account_id: (number) The account ID based on the provided mapping.
- date: (string) Date in YYYY-MM-DD format. If not specified, use today's date: ${new Date().toISOString().split("T")[0]}.
- note: (string) A short summary of the note.

Constraint:
- If a field is missing, return null.
- Ensure the amount is always a positive number.
- Use the provided mappings for category_id and account_id.

You must return a JSON object matching this schema:
{
  "amount": number | null,
  "type": "expense" | "income" | "transfer" | null,
  "category_id": number | null,
  "account_id": number | null,
  "date": "YYYY-MM-DD" | null,
  "note": "string" | null
}
`;

export async function parseTransaction(text) {
  try {
    const result = await model.generateContent([SYSTEM_PROMPT, text]);
    const response = await result.response;
    const textResponse = response.text();
    return JSON.parse(textResponse);
  } catch (error) {
    console.error("Gemini parsing error:", error);
    throw new Error("Failed to parse transaction text");
  }
}
