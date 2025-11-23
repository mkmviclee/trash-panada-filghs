import { GoogleGenAI } from "@google/genai";

let ai: GoogleGenAI | null = null;

try {
  if (process.env.API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }
} catch (error) {
  console.error("Failed to initialize GoogleGenAI", error);
}

export const getTrashPandaRoast = async (score: number): Promise<string> => {
  if (!ai) {
    return "No AI key detected. Just imagine a raccoon laughing at you.";
  }

  try {
    const prompt = `
      The player just lost a Flappy Bird clone called "Trash Panda Flight".
      Their score was ${score}.
      
      You are a sarcastic, hungry raccoon.
      Write a very short (max 1 sentence), snarky, funny roast about their performance.
      If the score is low (under 5), make fun of them.
      If the score is high (over 20), be begrudgingly impressed but still greedy for trash.
      
      Do not use quotes.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: "You are a rude but funny raccoon living in a dumpster.",
        maxOutputTokens: 60,
        temperature: 1.2, // High creativity
      }
    });

    return response.text || "Squeak squeak! (Translation: You failed!)";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "The raccoon is too busy eating trash to comment right now.";
  }
};