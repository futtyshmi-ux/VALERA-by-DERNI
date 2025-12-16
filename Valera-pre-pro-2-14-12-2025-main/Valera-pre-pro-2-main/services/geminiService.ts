
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { MODEL_IMAGE_FLASH, MODEL_TEXT, VAL_SYSTEM_PROMPT } from "../constants";
import { ChatMessage, Character, TimelineFrame } from "../types";

export type ApiProvider = 'google' | 'openrouter';

// Singleton instance for Google SDK
let clientInstance: GoogleGenAI | null = null;

const STORAGE_KEY = 'valera_api_key';
const PROVIDER_KEY = 'valera_api_provider';

// --- API KEY & PROVIDER MANAGEMENT ---

export const hasValidKey = (): boolean => {
    const envKey = process.env.API_KEY;
    const localKey = localStorage.getItem(STORAGE_KEY);
    return !!((envKey && envKey.trim().length > 0) || (localKey && localKey.trim().length > 0));
};

export const saveApiSettings = (key: string, provider: ApiProvider) => {
    if (key && key.trim().length > 0) {
        localStorage.setItem(STORAGE_KEY, key.trim());
    }
    localStorage.setItem(PROVIDER_KEY, provider);
    
    // Reset instance to force re-init
    clientInstance = null;
};

export const saveApiKey = (key: string) => {
    saveApiSettings(key, 'google');
};

export const getApiSettings = () => {
    return {
        key: localStorage.getItem(STORAGE_KEY) || process.env.API_KEY || '',
        provider: (localStorage.getItem(PROVIDER_KEY) as ApiProvider) || 'google'
    };
};

export const clearApiKey = () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PROVIDER_KEY);
    clientInstance = null;
};

// Helper: Get Google Client (Only used if provider is google)
const getGoogleClient = () => {
  if (clientInstance) return clientInstance;
  const { key } = getApiSettings();
  
  if (!key) throw new Error("API Key is missing.");
  
  clientInstance = new GoogleGenAI({ apiKey: key });
  return clientInstance;
};

// --- OPENROUTER FETCH HELPER ---
const callOpenRouter = async (
    model: string, 
    messages: any[], 
    temperature: number = 0.7,
    jsonMode: boolean = false
) => {
    const { key } = getApiSettings();
    
    // Map Gemini Model names to OpenRouter equivalents if needed
    // If the model starts with 'gemini', OpenRouter usually expects 'google/gemini...'
    let orModel = model;
    if (model.startsWith('gemini') && !model.includes('/')) {
        orModel = `google/${model}`; 
        // Fallback for deprecated models mapping if necessary
        if (model.includes('flash')) orModel = 'google/gemini-2.0-flash-001';
        if (model.includes('pro')) orModel = 'google/gemini-2.0-pro-exp-02-05:free';
    }

    const payload: any = {
        model: orModel,
        messages: messages,
        temperature: temperature,
        top_p: 0.9,
    };

    if (jsonMode) {
        payload.response_format = { type: "json_object" };
    }

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${key}`,
                "HTTP-Referer": window.location.href, // Required by OpenRouter
                "X-Title": "Valera Pre-Production", // Required by OpenRouter
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`OpenRouter Error ${response.status}: ${errText}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    } catch (e: any) {
        console.error("OpenRouter Call Failed:", e);
        throw e;
    }
};

// --- RETRY HELPER ---
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function retryOperation<T>(operation: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const isQuota = error.message?.includes('429') || error.status === 429;
    const isServer = error.message?.includes('503') || error.status === 503 || error.status === 500;
    
    if ((isQuota || isServer) && retries > 0) {
      console.warn(`API Error (${error.status || error.message}). Retrying in ${delay}ms...`);
      await wait(delay);
      return retryOperation(operation, retries - 1, delay * 2);
    }
    throw error;
  }
}

// Helper: Convert URL to Base64 Data URL
const urlToBase64 = async (url: string): Promise<string> => {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.warn("Failed to fetch image URL:", url, e);
        return "";
    }
};

/**
 * Main Director Chat Function
 * Supports both Google Native and OpenRouter
 */
export const sendDirectorMessage = async (
  history: ChatMessage[],
  newMessage: string,
  attachments: { data: string, mimeType: string }[] = [],
  styleSuffix: string = "",
  projectContext: Character[] = [],
  activeFrameContext?: TimelineFrame | null,
  timelineContext?: TimelineFrame[],
  currentRatio: string = "16:9",
  resolutionLabel: string = ""
): Promise<string> => {
  
  const { provider } = getApiSettings();

  // --- CONTEXT BUILDING (Shared) ---
  const chars = projectContext.filter(c => c.type === 'character');
  const locs = projectContext.filter(c => c.type === 'location');
  const items = projectContext.filter(c => c.type === 'item');

  const assetsDesc = projectContext.length > 0 
    ? `\n\n## CURRENT PROJECT ASSETS (LAB):\n` +
      `CHARACTERS (${chars.length}):\n${chars.map(c => `- ${c.name} [Trigger: ${c.triggerWord || 'none'}]`).join('\n')}\n` +
      `LOCATIONS (${locs.length}):\n${locs.map(c => `- ${c.name} [Trigger: ${c.triggerWord || 'none'}]`).join('\n')}\n` +
      `ITEMS (${items.length}):\n${items.map(c => `- ${c.name} [Trigger: ${c.triggerWord || 'none'}]`).join('\n')}`
    : `\n\n## CURRENT PROJECT ASSETS: None yet.`;

  let sceneContext = "";
  const timelineSummary = timelineContext && timelineContext.length > 0 
    ? `\n\n## MASTER SEQUENCE STATUS:\nTotal Scenes: ${timelineContext.length}.`
    : `\n\n## MASTER SEQUENCE STATUS: Empty.`;

  if (activeFrameContext) {
      sceneContext = `\n\n## CURRENTLY SELECTED SCENE:\n` +
      `- ID: ${activeFrameContext.id}\n` +
      `- Title: ${activeFrameContext.title}\n` +
      `- Visual: ${activeFrameContext.description || "No description."}\n`;
  }

  let ratioKeywords = "CINEMATIC WIDE (16:9), MOVIE STYLE";
  if (currentRatio === "9:16") ratioKeywords = "VERTICAL FRAME (9:16), SOCIAL MEDIA STYLE";
  else if (currentRatio === "1:1") ratioKeywords = "SQUARE FRAME (1:1), INSTAGRAM STYLE";
  
  const formatRule = `\n\n## 🛑 MASTER FORMAT LOCK: ${resolutionLabel || currentRatio}\n` + 
    `Format keywords: "${ratioKeywords}". Enforce this.`;

  const finalSystemInstruction = `${VAL_SYSTEM_PROMPT}\n\n${styleSuffix}${formatRule}${assetsDesc}${timelineSummary}${sceneContext}`;

  // === BRANCH 1: OPENROUTER ===
  if (provider === 'openrouter') {
      const messages: any[] = [
          { role: 'system', content: finalSystemInstruction },
          ...history.map(msg => ({
              role: msg.role === 'model' ? 'assistant' : 'user',
              content: msg.text || "..."
          })),
      ];

      // Add new message with attachments
      const userContent: any[] = [{ type: "text", text: newMessage }];
      if (attachments.length > 0) {
          attachments.forEach(att => {
              // OpenRouter standard image format
              userContent.push({
                  type: "image_url",
                  image_url: { url: att.data } 
              });
          });
      }
      messages.push({ role: 'user', content: userContent });

      return await retryOperation(() => callOpenRouter(MODEL_TEXT, messages, 0.85));
  }

  // === BRANCH 2: GOOGLE NATIVE ===
  const ai = getGoogleClient();
  const contents = history.map((msg) => {
    return {
      role: msg.role,
      parts: [{ text: msg.text || "" }]
    };
  });

  const newParts: any[] = [];
  attachments.forEach(att => {
    newParts.push({
      inlineData: {
        mimeType: att.mimeType,
        data: att.data.split(',')[1]
      }
    });
  });
  newParts.push({ text: newMessage });
  
  contents.push({ role: 'user', parts: newParts });

  try {
    const response = await retryOperation<GenerateContentResponse>(async () => {
        return await ai.models.generateContent({
          model: MODEL_TEXT,
          contents: contents,
          config: {
            systemInstruction: finalSystemInstruction,
            temperature: 0.85,
            tools: [{ googleSearch: {} }] 
          }
        });
    });
    return response.text || "Error: Empty response";
  } catch (error: any) {
    console.error("Gemini Error", error);
    if (error.message?.includes('429')) return "🛑 Quota Exceeded (429). Wait a bit.";
    return `Error: ${error.message}`;
  }
};

/**
 * Enhances prompt (Text Only)
 */
export const enhancePrompt = async (userInput: string, assetsContext?: string): Promise<string> => {
  const { provider } = getApiSettings();
  const systemInstruction = `You are NanoBanana Prompt Polisher. Transform prompts into detailed cinematic descriptions. English only.`;
  let prompt = `Raw idea: "${userInput}".`;
  if (assetsContext) prompt += `\nContext: ${assetsContext}`;

  try {
      if (provider === 'openrouter') {
          const messages = [
              { role: 'system', content: systemInstruction },
              { role: 'user', content: prompt }
          ];
          const text = await retryOperation(() => callOpenRouter(MODEL_TEXT, messages, 0.7));
          const match = text.match(/Refined Prompt:\s*([\s\S]+?)(?=\s*(?:🧩|Elements|$))/i);
          return match && match[1] ? match[1].trim() : text;
      } else {
          const ai = getGoogleClient();
          const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
            model: MODEL_TEXT,
            contents: prompt,
            config: { systemInstruction, temperature: 0.7 }
          }));
          const fullText = response.text || userInput;
          const match = fullText.match(/Refined Prompt:\s*([\s\S]+?)(?=\s*(?:🧩|Elements|$))/i);
          return match && match[1] ? match[1].trim() : fullText; 
      }
  } catch (error) {
    return userInput; 
  }
};

/**
 * Generate Image
 * Note: OpenRouter assumes using OpenAI 'images/generations' usually, but some models support chat-to-image.
 * For stability, if OpenRouter is selected, we try to use a Flux or similar model if possible, 
 * OR we warn the user if they try to use a Google-specific image model name on OpenRouter.
 */
export const generateImage = async (
  prompt: string, 
  referenceImages?: string[],
  aspectRatio: string = "16:9",
  modelName: string = MODEL_IMAGE_FLASH,
  imageSize?: string
): Promise<string> => {
  const { provider } = getApiSettings();

  // Handle Images via OpenRouter (Experimental/Standard OpenAI API)
  if (provider === 'openrouter') {
      // For OpenRouter, we typically use a different endpoint for images (standard OpenAI format)
      // Or we use a specific model that supports it.
      // Since Valera uses "gemini-2.5-flash-image", we map this to a high quality text-to-image on OpenRouter
      // OR we use the Google model via OpenRouter if it supports image output (usually returned as URL).
      
      const { key } = getApiSettings();
      // Using FLUX via OpenRouter/OpenAI standard as fallback for high quality
      // Or recraft, etc.
      // Let's use `black-forest-labs/flux-1-schnell` as a fast equivalent to Flash Image
      const orImageModel = 'black-forest-labs/flux-1-schnell'; 

      try {
          const response = await fetch("https://openrouter.ai/api/v1/images/generations", {
              method: "POST",
              headers: {
                  "Authorization": `Bearer ${key}`,
                  "HTTP-Referer": window.location.href,
                  "X-Title": "Valera Pre-Production",
                  "Content-Type": "application/json"
              },
              body: JSON.stringify({
                  model: orImageModel,
                  prompt: prompt,
                  size: "1024x1024", // Flux usually handles standard sizes
                  response_format: "b64_json" // We need base64
              })
          });

          if (!response.ok) {
             const txt = await response.text();
             throw new Error(`OpenRouter Image Error: ${txt}`);
          }
          const data = await response.json();
          // Standard OpenAI format
          if (data.data && data.data[0]) {
              const b64 = data.data[0].b64_json;
              if (b64) return `data:image/png;base64,${b64}`;
              if (data.data[0].url) {
                  // If URL returned, fetch and convert
                  return await urlToBase64(data.data[0].url);
              }
          }
          throw new Error("No image data returned from OpenRouter");
      } catch (e) {
          console.error("OpenRouter Image Gen Failed", e);
          throw e;
      }
  }

  // --- GOOGLE NATIVE ---
  const ai = getGoogleClient();
  const parts: any[] = [];

  if (referenceImages && referenceImages.length > 0) {
    const processedImages = await Promise.all(referenceImages.map(async (img) => {
        if (img.startsWith('http')) return await urlToBase64(img);
        return img;
    }));

    processedImages.forEach(img => {
        if (!img) return;
        const matches = img.match(/^data:(.+);base64,(.+)$/);
        if (matches) {
            parts.push({
                inlineData: { mimeType: matches[1], data: matches[2] }
            });
        }
    });
    parts.push({ text: "Using the visual style and subjects from references: " + prompt });
  } else {
    parts.push({ text: prompt });
  }

  const config: any = { imageConfig: { aspectRatio: aspectRatio as any } };
  
  try {
      const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
        model: modelName,
        contents: { parts },
        config
      }));

      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData?.data) {
                return `data:image/png;base64,${part.inlineData.data}`;
            }
        }
      }
      throw new Error("No image data returned from Gemini.");
  } catch (error: any) {
      if (error.message?.includes('429')) throw new Error("API Quota Limit (429).");
      throw error;
  }
};

export const generateVoiceDirection = async (dialogue: string, sceneDescription: string): Promise<string> => {
  const { provider } = getApiSettings();
  const system = `You are a Voice Director. Rewrite dialogue for TTS. Use CAPS for stress.`;
  const prompt = `Context: "${sceneDescription}"\nDialogue: "${dialogue}"`;

  try {
      if (provider === 'openrouter') {
          return await callOpenRouter(MODEL_TEXT, [{role:'system',content:system},{role:'user',content:prompt}]);
      } else {
          const ai = getGoogleClient();
          const res = await ai.models.generateContent({
              model: MODEL_TEXT, contents: prompt, config: { systemInstruction: system }
          });
          return res.text || "";
      }
  } catch (e) { return ""; }
};
