import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { CONFIG } from './server/config/env.js';
import { errorHandler, securityHeaders } from './server/middleware/security.js';
import { createApiRouter } from './server/routes/api.js';
import { CTraderBrokerService } from './server/services/ctraderService.js';
import { MarketFeedService } from './server/services/marketFeed.js';
import { NotificationHub } from './server/services/notificationHub.js';
import { TerminalStateStore } from './server/services/stateStore.js';
import { SignalGeneratorEngine } from './server/engine/signalGenerator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function bootstrapServer() {
  const app = express();
  const server = http.createServer(app);

  // Global security & payload guard middleware
  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(express.json({ limit: '64kb' }));
  app.use(express.urlencoded({ extended: true })); // Necesar pentru a citi formularele HTML de login
  // --- SSociety Team Gatekeeper Middleware ---
  const VALID_USERS: Record<string, string> = {
    'Mone': 'Nuamparola123@sauam?',
    'Sergiu': 'Nuamparola123@sauam?',
    'Tibi': 'Nuamparola123@sauam?'
  };

  app.use((req, res, next) => {
    if (req.path === '/auth' && req.method === 'POST') {
      console.log('[GATEKEEPER DEBUG] Body primit:', req.body);
      const { username, password } = req.body;
      console.log('[GATEKEEPER DEBUG] User incercat:', username, 'Pass corect?', VALID_USERS[username] === password);
      if (VALID_USERS[username] && VALID_USERS[username] === password) {
        res.setHeader('Set-Cookie', 'ssociety_auth=true; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax');
        return res.redirect('/');
      }
      return res.redirect('/?error=1');
    }

    const cookies = req.headers.cookie || '';
    if (cookies.includes('ssociety_auth=true')) {
      return next();
    }

    if (req.path === '/' || req.path === '/index.html') {
      res.set('Content-Type', 'text/html');
      const hasError = req.query.error === '1';
      res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>⚠️ SSociety Team Restricted Access ⚠️</title>
    <style>
        * { box-sizing: border-box; }
        body { background-color: #050505; color: #ff0000; font-family: 'Courier New', Courier, monospace; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; text-align: center; overflow-x: hidden; }
        .scanline { width: 100%; height: 100px; z-index: 10; background: linear-gradient(0deg, rgba(0,0,0,0) 0%, rgba(255, 0, 0, 0.1) 50%, rgba(0,0,0,0) 100%); opacity: 0.1; position: absolute; bottom: 100%; animation: scanline 10s linear infinite; pointer-events: none; }
        @keyframes scanline { 0% { bottom: 100%; } 100% { bottom: -100px; } }
        h1 { font-size: clamp(1.5rem, 6vw, 2.5rem); text-transform: uppercase; letter-spacing: 2px; margin-bottom: 15px; text-shadow: 0 0 10px #ff0000; line-height: 1.2; }
        p { font-size: clamp(0.9rem, 3.5vw, 1.1rem); color: #ff4444; width: 100%; max-width: 600px; line-height: 1.5; margin-bottom: 20px; }
        .countdown { font-size: clamp(4rem, 15vw, 6rem); font-weight: bold; color: #ff0000; margin: 10px 0; text-shadow: 0 0 20px #ff0000; animation: pulse 1s infinite; }
        @keyframes pulse { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.7; transform: scale(1.05); } 100% { opacity: 1; transform: scale(1); } }
        .login-box { background: #111; padding: clamp(20px, 5vw, 30px); border: 2px solid #ff0000; border-radius: 8px; margin-top: 20px; box-shadow: 0 0 30px rgba(255, 0, 0, 0.3); width: 100%; max-width: 400px; }
        input { background: #000; border: 1px solid #ff0000; color: #fff; padding: 15px; margin: 8px 0; width: 100%; font-family: inherit; font-size: 1rem; text-align: center; border-radius: 4px; }
        input:focus { outline: none; box-shadow: 0 0 10px #ff0000; }
        button { background: #ff0000; color: #000; border: none; padding: 15px; width: 100%; font-weight: bold; cursor: pointer; font-family: inherit; text-transform: uppercase; font-size: 1.1rem; margin-top: 15px; transition: all 0.3s; border-radius: 4px; }
        button:hover { background: #fff; color: #ff0000; box-shadow: 0 0 15px #ff0000; }
        button:active { transform: scale(0.98); }
        .error { color: #ff0000; margin-top: 15px; font-weight: bold; display: ${hasError ? 'block' : 'none'}; text-shadow: 0 0 5px #ff0000; font-size: 0.9rem; }
        #burned-screen { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #000; color: #00ff00; font-size: clamp(1rem, 4vw, 1.5rem); z-index: 9999; align-items: center; justify-content: center; flex-direction: column; padding: 20px; }
        #burned-screen h2 { color: #fff; font-size: clamp(2rem, 8vw, 3.5rem); margin-bottom: 20px; text-shadow: 0 0 15px #00ff00; }
        #burned-screen a { color: #00ff00; text-decoration: none; border-bottom: 1px solid #00ff00; margin-top: 10px; display: inline-block; }
        #burned-screen a:hover { color: #fff; border-color: #fff; }
    </style>
</head>
<body>
    <div class="scanline"></div>
    <h1>⚠️ UNAUTHORIZED ACCESS DETECTED ⚠️</h1>
    <p>SYSTEM PURGE INITIATED. If you don't have valid SSociety credentials, get out in maximum 59 seconds or your device will be permanently compromised.</p>
    <div class="countdown" id="timer">59</div>
    <div class="login-box" id="login-box">
        <form method="POST" action="/auth">
            <input type="text" name="username" placeholder="USERNAME" required autocomplete="off">
            <input type="password" name="password" placeholder="PASSWORD" required>
            <button type="submit">AUTHENTICATE</button>
        </form>
        <div class="error">INVALID CREDENTIALS. THE FIREWALL IS WATCHING YOU.</div>
    </div>
    <div id="burned-screen">
        <h2>JUST KIDDING... 😈</h2>
        <p>Your device is safe. But this system is not for everyone.</p>
        <p>Contact Sergiu for more details:</p>
        <p style="font-size: clamp(1.8rem, 7vw, 3rem); color: #fff; margin: 20px 0; font-weight: bold; letter-spacing: 1px;">+47 686 76 141</p>
        <p>Direct on WhatsApp or Telegram</p>
        <p style="margin-top: 40px; font-size: clamp(0.8rem, 3vw, 1rem); color: #666;">Redirecting to your reward in <span id="redirect-timer" style="color:#fff; font-weight:bold;">30</span> seconds...</p>
    </div>
    <script>
        let timeLeft = 59;
        const timerEl = document.getElementById('timer');
        const loginBox = document.getElementById('login-box');
        const burnedScreen = document.getElementById('burned-screen');
        const redirectTimerEl = document.getElementById('redirect-timer');
        
        const interval = setInterval(() => {
            timeLeft--;
            if (timerEl) timerEl.textContent = timeLeft;
            if (timeLeft <= 0) {
                clearInterval(interval);
                loginBox.style.display = 'none';
                const h1 = document.querySelector('h1');
                const p1 = document.querySelectorAll('p')[0];
                if (h1) h1.style.display = 'none';
                if (p1) p1.style.display = 'none'; 
                if (timerEl) timerEl.style.display = 'none';
                
                burnedScreen.style.display = 'flex';
                
                let redirectTime = 30;
                const redirectInterval = setInterval(() => {
                    redirectTime--;
                    if (redirectTimerEl) redirectTimerEl.textContent = redirectTime;
                    if (redirectTime <= 0) {
                        clearInterval(redirectInterval);
                        window.location.href = "https://youtu.be/dQw4w9WgXcQ?si=qxw0dDyW7TqrNpFf";
                    }
                }, 1000);
            }
        }, 1000);
    </script>
</body>
</html>`);
      return;
    }
    next();
  });
  // --- End Gatekeeper Middleware ---





  // Initialize durable persistence & modular core services
  const stateStore = new TerminalStateStore();
  const marketFeed = new MarketFeedService();
  await marketFeed.initialize();

  const signalEngine = new SignalGeneratorEngine(marketFeed, stateStore);
  signalEngine.initialize();

  const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: 4096,
  });

  const brokerService = new CTraderBrokerService();
  // Connect asynchronously so port 3000 binds immediately without waiting on external handshake
  void brokerService.initialize();

  const notificationHub = new NotificationHub(
    wss,
    marketFeed,
    signalEngine,
    stateStore,
    brokerService
  );
  notificationHub.initialize();

  // Mount secured REST API
  app.use('/api', createApiRouter(marketFeed, signalEngine, notificationHub, brokerService, stateStore));

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
    brokerService.dispose();
    notificationHub.dispose();
    stateStore.dispose();
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
