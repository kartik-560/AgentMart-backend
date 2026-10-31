import { GoogleGenAI } from '@google/genai';
import { env } from './env.js';

let geminiClient = null;

if (env.GEMINI_API_KEY) {
  try {
    geminiClient = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    console.log('🤖 Google Gemini client initialized successfully.');
  } catch (error) {
    console.warn('⚠️ Failed to initialize GoogleGenAI client:', error.message);
  }
} else {
  console.log('ℹ️ GEMINI_API_KEY not configured. Autonomous agents will run with high-fidelity deterministic simulation mode.');
}

export { geminiClient };

