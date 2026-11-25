import express from 'express';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { handleApiRoute } from './server/ahiBackend';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

async function expressToWebRequest(req: ExpressRequest): Promise<Request> {
  const protocol = req.protocol || 'http';
  const host = req.get('host') || `localhost:${PORT}`;
  const fullUrl = new URL(req.originalUrl || req.url, `${protocol}://${host}`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else if (typeof value === 'string') {
      headers.set(key, value);
    }
  }

  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD') {
    return new Request(fullUrl, { method, headers });
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
  }
  const bodyBuffer = Buffer.concat(chunks);

  return new Request(fullUrl, {
    method,
    headers,
    body: bodyBuffer.length > 0 ? new Uint8Array(bodyBuffer) : undefined,
  });
}

export function createApiApp() {
  const app = express();

  app.use('/api', async (req: ExpressRequest, res: ExpressResponse) => {
    try {
      const webReq = await expressToWebRequest(req);
      const webRes = await handleApiRoute(webReq);

      res.status(webRes.status);
      webRes.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });

      if (!webRes.body) {
        res.end();
        return;
      }

      const nodeStream = Readable.fromWeb(
        webRes.body as unknown as NodeWebReadableStream<Uint8Array>
      );
      nodeStream.on('error', () => {
        if (!res.writableEnded) res.end();
      });
      res.on('close', () => {
        nodeStream.destroy();
      });
      nodeStream.pipe(res);
    } catch (err) {
      if (res.headersSent) {
        if (!res.writableEnded) res.end();
        return;
      }
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Unexpected server error in API route.',
      });
    }
  });

  return app;
}

async function createServer() {
  const app = createApiApp();

  if (process.env.NODE_ENV !== 'production') {
    const ffmpegDir = path.resolve(__dirname, 'node_modules/@ffmpeg/core/dist/esm');
    if (fs.existsSync(ffmpegDir)) {
      app.use('/ffmpeg-core', express.static(ffmpegDir));
    }
    const viteModule = 'vite';
    const { createServer: createViteServer } = await import(viteModule);
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use('/ffmpeg-core', express.static(path.join(distPath, 'ffmpeg-core')));
    app.use(express.static(distPath));
    app.get('*', (_req: ExpressRequest, res: ExpressResponse) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`A.H.I Studio listening on http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  createServer().catch((err) => {
    console.error('Failed to start A.H.I Studio server:', err);
    process.exit(1);
  });
}
