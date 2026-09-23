import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { handleApiRequest } from './src/server/routes.ts';
import { startTelegramPolling } from './src/server/telegramPolling.ts';
import { getConfig } from './src/server/storageService.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API endpoints
app.all('/api/*', async (req, res) => {
  await handleApiRequest(req, res);
});

// Serve static frontend in production
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// Fallback to index.html for SPA client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Catat Belanja Telegram & OCR Server running on http://0.0.0.0:${PORT}`);
  const config = getConfig();
  if (config.telegramBotToken) {
    if (config.telegramMode === 'polling') {
      startTelegramPolling().catch(err => console.error('Error starting telegram polling on startup:', err));
    } else {
      console.log('[Startup] Telegram Bot configured in Automatic Webhook Mode.');
    }
  }
});
