const apiKey = process.env.API_KEY ?? "";

const pick = (lines: string[]): string => lines[Math.floor(Math.random() * lines.length)];

const localRoast = (score: number): string => {
  if (score >= 20) {
    return pick([
      "Ugh, fine. You're almost good enough to steal my leftovers.",
      "Begrudging respect. The good trash is still mine.",
      "Not bad for someone who doesn't even live in a dumpster.",
    ]);
  }
  if (score >= 5) {
    return pick([
      "Mediocre. I've seen pigeons with more grace.",
      "Not bad. Still wouldn't share my dumpster.",
      "You fly like a raccoon who skipped breakfast.",
    ]);
  }
  return pick([
    "Even the pizza boxes are embarrassed for you.",
    "That score belongs in the trash. Fitting.",
    "I've seen roadkill with better air time.",
  ]);
};

export const getTrashPandaRoast = async (score: number): Promise<string> => {
  if (!apiKey) {
    return localRoast(score);
  }

  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `
      The player just lost a Flappy Bird clone called "Trash Panda Flight".
      Their score was ${score}.

      You are a sarcastic, hungry raccoon.
      Write a very short (max 1 sentence), snarky, funny roast about their performance.
      If the score is low (under 5), make fun of them.
      If the score is high (over 20), be begrudgingly impressed but still greedy for trash.

      Do not use quotes.
    `;

    const response = await Promise.race([
      ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          systemInstruction: "You are a rude but funny raccoon living in a dumpster.",
          maxOutputTokens: 60,
          temperature: 1.2,
        },
      }),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 8000);
      }),
    ]);

    if (!response) {
      return "The raccoon got distracted by a pizza crust.";
    }

    const text = (response.text || "").trim().replace(/^["']+|["']+$/g, "");
    return text || localRoast(score);
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "The raccoon is too busy eating trash to comment right now.";
  }
};
