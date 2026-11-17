import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { CONFIG } from './server/config/env.js';
import { errorHandler, securityHeaders } from './server/middleware/security.js';
import { createApiRouter } from './server/routes/api.js';
import { MarketFeedService } from './server/services/marketFeed.js';
import { NotificationHub } from './server/services/notificationHub.js';
import { SignalGeneratorEngine } from './server/engine/signalGenerator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function bootstrapServer() {
  const app = express();
  const server = http.createServer(app);

  // Global security & payload guard middleware
  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(express.json({ limit: '64kb' }));

  // Initialize modular core services
  const marketFeed = new MarketFeedService();
  await marketFeed.initialize();

  const signalEngine = new SignalGeneratorEngine(marketFeed);
  signalEngine.initialize();

  const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: 4096,
  });

  const notificationHub = new NotificationHub(wss, marketFeed, signalEngine);
  notificationHub.initialize();

  // Mount secured REST API
  app.use('/api', createApiRouter(marketFeed, signalEngine, notificationHub));

  // Vite middleware in dev, static assets in production
  if (CONFIG.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use(errorHandler);

  server.listen(CONFIG.PORT, '0.0.0.0', () => {
    console.log(`[SSociety Team] Server modular & securizat activ pe portul ${CONFIG.PORT}`);
  });

  const shutdown = () => {
    notificationHub.dispose();
    wss.close();
    server.close(() => process.exit(0));
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrapServer().catch((err) => {
  console.error('[SSociety Team] Eroare critică la pornire:', err);
  process.exit(1);
});
