import type { IncomingMessage, ServerResponse } from 'http';
import type { Express } from 'express';
import { createApiApp } from '../server';

let cachedApp: Express | null = null;

function getMissingEnvKeys(): string[] {
  const missing: string[] = [];
  if (!process.env.GEMINI_API_KEY?.trim()) missing.push('GEMINI_API_KEY');
  if (!process.env.HF_TOKEN?.trim()) missing.push('HF_TOKEN');
  if (!process.env.CLOUDFLARE_ACCOUNT_ID?.trim()) missing.push('CLOUDFLARE_ACCOUNT_ID');
  if (!process.env.CLOUDFLARE_API_TOKEN?.trim()) missing.push('CLOUDFLARE_API_TOKEN');
  return missing;
}

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  try {
    if (!cachedApp) {
      cachedApp = createApiApp();
    }
    cachedApp(req as Parameters<Express>[0], res as Parameters<Express>[1]);
  } catch (err) {
    if (res.headersSent) return;
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        error:
          err instanceof Error
            ? err.message
            : 'Vercel serverless handler failed to initialize.',
        missingEnv: getMissingEnvKeys(),
      })
    );
  }
}
