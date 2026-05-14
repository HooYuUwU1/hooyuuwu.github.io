import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface TranslationOptions {
  targetLanguage: string;
  sourceLanguage?: string;
}

export async function translateContent(
  filename: string,
  content: string,
  options: TranslationOptions
): Promise<string> {
  const { targetLanguage } = options;

  const systemInstruction = `
You are a Minecraft Bedrock Addon Translator. Your goal is to translate user-facing text while preserving all technical structures, identifiers, and Minecraft-specific syntax.

RULES:
1. DO NOT translate identifiers, namespaces, item IDs, block IDs, or technical keys (e.g., "format_version", "identifier", "tags").
2. DO NOT translate code variables, function names, selectors (@p, @a, etc.), or file paths.
3. DO NOT translate Minecraft commands (e.g., /give, /tp).
4. ONLY translate text that is displayed to the player, such as:
   - "display_name"
   - "lore"
   - values in .lang files (the part after the = sign)
   - descriptive text in UI files
   - chat messages
5. PRESERVE the exact file format (JSON structure, .lang format, etc.).
6. DO NOT add any explanations or extra text. Return ONLY the translated file content.
7. For JSON files, ensure it remains valid JSON.
8. If the file is a .lang file, keep the keys intact and translate the values.
9. Target Language: ${targetLanguage}.

Example (.lang):
Original: item.apple.name=Apple
Translated: item.apple.name=Quả táo (if Vietnamese)

Example (JSON):
Original: {"display_name": {"value": "Iron Sword"}}
Translated: {"display_name": {"value": "Kiếm sắt"}}
`;

  const prompt = `Translate the following file: ${filename}\n\nContent:\n${content}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.1, // Low temperature for deterministic output
      },
    });

    const result = response.text || "";
    
    // Basic cleanup of markdown markers if AI included them
    return result.replace(/^```[a-z]*\n/i, '').replace(/\n```$/i, '').trim();
  } catch (error) {
    console.error(`Translation error for ${filename}:`, error);
    throw error;
  }
}
