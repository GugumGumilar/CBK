import { Request, Response } from 'express';
import { parseReceiptImage, parseTextExpense } from './geminiService.ts';
import {
  downloadTelegramPhoto,
  getMe,
  getWebhookInfo,
  deleteTelegramWebhook,
  sendChatAction,
  sendTelegramMessage,
  setTelegramWebhook,
  formatCurrencyIDR,
  TelegramUpdate,
} from './telegramService.ts';
import { processTelegramUpdate } from './telegramProcessor.ts';
import {
  startTelegramPolling,
  stopTelegramPolling,
  isTelegramPollingActive,
  getPollingStatus,
} from './telegramPolling.ts';
import {
  addExpenses,
  addReceipt,
  clearAllExpenses,
  deleteExpense,
  getConfig,
  getExpenses,
  getReceipts,
  GroceryItem,
  ReceiptRecord,
  syncExpensesFromSheets,
  updateConfig,
  updateExpense,
} from './storageService.ts';
import {
  generateCsvContent,
  GOOGLE_APPS_SCRIPT_TEMPLATE,
  syncItemsToGoogleSheets,
  deleteItemsFromGoogleSheets,
  updateItemInGoogleSheets,
  clearAllFromGoogleSheets,
  pullItemsFromGoogleSheets,
} from './sheetsService.ts';
import {
  resolvePublicAppUrl,
  setupTelegramAutoWebhook,
  setTelegramConnectionMode,
} from './webhookService.ts';

export async function handleApiRequest(req: Request, res: Response): Promise<void> {
  const rawUrl = req.url || '';
  const pathname = rawUrl.split('?')[0];
  const cleanPath = pathname.replace(/\/+$/, '') || '/';
  const method = req.method;

  try {
    // -------------------------------------------------------------
    // GET /api/status
    // -------------------------------------------------------------
    if (method === 'GET' && cleanPath === '/api/status') {
      const config = getConfig();
      const hasGeminiKey = !!process.env.GEMINI_API_KEY;
      const detectedPublicUrl = resolvePublicAppUrl(req);
      const appUrl = process.env.APP_URL || detectedPublicUrl || '';

      let botInfo: any = null;
      let webhookInfo: any = null;

      if (config.telegramBotToken) {
        try {
          const me = await getMe(config.telegramBotToken);
          if (me.ok) {
            botInfo = me.result;
            if (botInfo?.username && botInfo.username !== config.botUsername) {
              updateConfig({ botUsername: botInfo.username });
            }
          }
          webhookInfo = await getWebhookInfo(config.telegramBotToken);

          if (config.telegramMode === 'webhook') {
            // Mode Webhook: Stop polling to prevent Telegram 409 conflict
            if (isTelegramPollingActive()) {
              await stopTelegramPolling();
            }

            // If auto-webhook is enabled and we have a public URL, verify webhook is registered to this server
            const targetWebhook = detectedPublicUrl ? `${detectedPublicUrl}/api/telegram/webhook` : '';
            if (
              config.autoWebhookEnabled !== false &&
              targetWebhook &&
              webhookInfo?.result?.url !== targetWebhook
            ) {
              console.log(`[Status] Auto-registering webhook to current domain: ${targetWebhook}`);
              setupTelegramAutoWebhook({ req, publicUrl: detectedPublicUrl, token: config.telegramBotToken })
                .catch(e => console.error('Error auto-registering webhook in status check:', e));
            }
          } else {
            // Mode Polling: Auto-start polling if not active yet
            if (!isTelegramPollingActive()) {
              startTelegramPolling().catch(e => console.error('Error auto-starting telegram polling:', e));
            }
          }
        } catch (e: any) {
          console.warn('Error fetching telegram info for status:', e.message);
        }
      }

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        status: 'ok',
        hasGeminiKey,
        appUrl,
        detectedPublicUrl,
        telegramMode: config.telegramMode || 'webhook',
        autoWebhookEnabled: config.autoWebhookEnabled !== false,
        registeredWebhookUrl: config.registeredWebhookUrl || webhookInfo?.result?.url || null,
        botConfigured: !!config.telegramBotToken,
        botInfo,
        webhookInfo: webhookInfo?.result || null,
        pollingStatus: getPollingStatus(),
        isPolling: isTelegramPollingActive(),
        sheetsConfigured: !!config.googleSheetsWebhookUrl,
        itemCount: getExpenses().length,
      }));
      return;
    }

    // -------------------------------------------------------------
    // GET /api/config & POST /api/config
    // -------------------------------------------------------------
    if (method === 'GET' && cleanPath === '/api/config') {
      const config = getConfig();
      const detectedPublicUrl = resolvePublicAppUrl(req);
      // Mask token for safety
      const maskedToken = config.telegramBotToken
        ? `${config.telegramBotToken.substring(0, 5)}...${config.telegramBotToken.substring(config.telegramBotToken.length - 4)}`
        : '';

      let customizedTemplate = GOOGLE_APPS_SCRIPT_TEMPLATE;
      if (config.telegramBotToken) {
        customizedTemplate = customizedTemplate.replace(
          'var TELEGRAM_BOT_TOKEN = "PASTE_TELEGRAM_BOT_TOKEN_DISINI";',
          `var TELEGRAM_BOT_TOKEN = "${config.telegramBotToken}";`
        );
      }
      if (process.env.GEMINI_API_KEY) {
        customizedTemplate = customizedTemplate.replace(
          'var GEMINI_API_KEY = "PASTE_GEMINI_API_KEY_DISINI";',
          `var GEMINI_API_KEY = "${process.env.GEMINI_API_KEY}";`
        );
      }

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        ...config,
        telegramBotTokenMasked: maskedToken,
        hasBotToken: !!config.telegramBotToken,
        hasGeminiKey: !!process.env.GEMINI_API_KEY,
        detectedPublicUrl,
        appsScriptTemplate: customizedTemplate,
        appUrl: process.env.APP_URL || detectedPublicUrl || '',
      }));
      return;
    }

    if (method === 'POST' && cleanPath === '/api/config') {
      const body = req.body || {};
      const updates: any = {};
      if (typeof body.telegramBotToken === 'string') updates.telegramBotToken = body.telegramBotToken.trim();
      if (typeof body.googleSheetsWebhookUrl === 'string') updates.googleSheetsWebhookUrl = body.googleSheetsWebhookUrl.trim();
      if (typeof body.autoSyncToSheets === 'boolean') updates.autoSyncToSheets = body.autoSyncToSheets;
      if (typeof body.currency === 'string') updates.currency = body.currency;
      if (body.telegramMode === 'webhook' || body.telegramMode === 'polling') updates.telegramMode = body.telegramMode;
      if (typeof body.autoWebhookEnabled === 'boolean') updates.autoWebhookEnabled = body.autoWebhookEnabled;
      if (body.monthlyBudget !== undefined) {
        const num = Number(body.monthlyBudget);
        updates.monthlyBudget = isNaN(num) || num < 0 ? 0 : Math.round(num);
      }

      const updated = updateConfig(updates);

      // Handle Telegram connection mode transition if token or mode is updated
      if (updates.telegramBotToken !== undefined || updates.telegramMode !== undefined) {
        const token = updates.telegramBotToken || updated.telegramBotToken;
        const mode = updates.telegramMode || updated.telegramMode || 'webhook';

        if (token) {
          if (mode === 'webhook') {
            setupTelegramAutoWebhook({ req, token }).catch(e =>
              console.error('Error auto-setting webhook on config update:', e)
            );
          } else {
            setTelegramConnectionMode('polling', { token }).catch(e =>
              console.error('Error setting polling on config update:', e)
            );
          }
        } else {
          stopTelegramPolling().catch(e => console.error('Error stopping polling on config update:', e));
        }
      }

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, config: updated }));
      return;
    }

    // -------------------------------------------------------------
    // GET /api/expenses, POST /api/expenses, DELETE /api/expenses (all)
    // -------------------------------------------------------------
    if (method === 'GET' && cleanPath === '/api/expenses') {
      const items = getExpenses();
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ items, totalCount: items.length }));
      return;
    }

    if (method === 'POST' && cleanPath === '/api/expenses') {
      const body = req.body || {};
      const itemsToAdd: GroceryItem[] = [];
      const now = new Date();
      const defaultDate = now.toISOString().split('T')[0];
      const defaultTime = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

      if (Array.isArray(body.items)) {
        for (const it of body.items) {
          itemsToAdd.push({
            id: it.id || `item-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            date: it.date || defaultDate,
            time: it.time || defaultTime,
            store: it.store || 'Belanja Harian',
            name: it.name || 'Barang',
            category: it.category || 'Sembako',
            qty: Number(it.qty) || 1,
            unit: it.unit || 'pcs',
            price: Number(it.price) || 0,
            total: Number(it.total) || (Number(it.qty || 1) * Number(it.price || 0)),
            source: it.source || 'web_manual',
            notes: it.notes || '',
            syncedToSheets: false,
            createdAt: new Date().toISOString(),
          });
        }
      } else if (body.name) {
        itemsToAdd.push({
          id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          date: body.date || defaultDate,
          time: body.time || defaultTime,
          store: body.store || 'Belanja Harian',
          name: body.name,
          category: body.category || 'Sembako',
          qty: Number(body.qty) || 1,
          unit: body.unit || 'pcs',
          price: Number(body.price) || 0,
          total: Number(body.total) || (Number(body.qty || 1) * Number(body.price || 0)),
          source: body.source || 'web_manual',
          notes: body.notes || '',
          syncedToSheets: false,
          createdAt: new Date().toISOString(),
        });
      }

      const config = getConfig();
      if (config.autoSyncToSheets && config.googleSheetsWebhookUrl && itemsToAdd.length > 0) {
        const syncRes = await syncItemsToGoogleSheets(config.googleSheetsWebhookUrl, itemsToAdd);
        if (syncRes.success) {
          itemsToAdd.forEach(i => (i.syncedToSheets = true));
        }
      }

      const updatedList = addExpenses(itemsToAdd);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, added: itemsToAdd, total: updatedList.length }));
      return;
    }

    if (
      (method === 'DELETE' && (cleanPath === '/api/expenses' || cleanPath === '/api/expenses/clear' || cleanPath === '/api/expenses/clear-all')) ||
      (method === 'POST' && (cleanPath === '/api/expenses/clear' || cleanPath === '/api/expenses/clear-all'))
    ) {
      const config = getConfig();
      let sheetsCleared = false;
      let sheetsMessage = '';
      if (config.googleSheetsWebhookUrl) {
        try {
          const clearRes = await clearAllFromGoogleSheets(config.googleSheetsWebhookUrl);
          sheetsCleared = clearRes.success;
          sheetsMessage = clearRes.message;
        } catch (err: any) {
          console.error('Error clearing Google Sheets:', err);
          sheetsMessage = err?.message || 'Gagal menghapus di spreadsheet';
        }
      }
      clearAllExpenses();
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: true,
        sheetsCleared,
        message: 'Semua data belanjaan telah dibersihkan' + (sheetsCleared ? ' dari aplikasi dan Google Sheets.' : '.'),
        sheetsMessage,
      }));
      return;
    }

    if (method === 'DELETE' && cleanPath.startsWith('/api/expenses/')) {
      const id = cleanPath.replace('/api/expenses/', '').trim();
      const existing = getExpenses().find(i => i.id === id);
      const ok = deleteExpense(id);

      let sheetsDeleted = false;
      let sheetsMessage = '';
      const config = getConfig();
      if (config.googleSheetsWebhookUrl && existing) {
        try {
          const syncRes = await deleteItemsFromGoogleSheets(
            config.googleSheetsWebhookUrl,
            [id],
            [existing]
          );
          sheetsDeleted = syncRes.success;
          sheetsMessage = syncRes.message;
        } catch (err: any) {
          console.error('Error deleting from Google Sheets:', err);
          sheetsMessage = err.message || 'Gagal menghapus di Google Sheets';
        }
      }

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: ok,
        id,
        sheetsDeleted,
        sheetsMessage,
        itemName: existing?.name,
      }));
      return;
    }

    if (method === 'PUT' && cleanPath.startsWith('/api/expenses/')) {
      const id = cleanPath.replace('/api/expenses/', '').trim();
      const updated = updateExpense(id, req.body || {});

      let sheetsUpdated = false;
      const config = getConfig();
      if (updated && config.googleSheetsWebhookUrl) {
        try {
          const syncRes = await updateItemInGoogleSheets(config.googleSheetsWebhookUrl, updated);
          sheetsUpdated = syncRes.success;
        } catch (err: any) {
          console.error('Error updating in Google Sheets:', err);
        }
      }

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: !!updated, item: updated, sheetsUpdated }));
      return;
    }

    // -------------------------------------------------------------
    // POST /api/ocr (Direct OCR from Web / iPhone Camera)
    // -------------------------------------------------------------
    if (method === 'POST' && cleanPath === '/api/ocr') {
      try {
        const { imageBase64, mimeType, autoSave } = req.body || {};
        if (!imageBase64) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: 'imageBase64 diperlukan' }));
          return;
        }

        const parsed = await parseReceiptImage(imageBase64, mimeType || 'image/jpeg');

        // If autoSave requested, save to database directly
        let savedItems: GroceryItem[] = [];
        if (autoSave) {
          const receiptId = `rcpt-${Date.now()}`;
          const newItems: GroceryItem[] = parsed.items.map((it, idx) => ({
            id: `item-${Date.now()}-${idx}`,
            date: parsed.date || new Date().toISOString().split('T')[0],
            time: parsed.time || new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
            store: parsed.storeName || 'Toko Swalayan',
            name: it.name,
            category: it.category || 'Sembako',
            qty: it.qty,
            unit: it.unit || 'pcs',
            price: it.price,
            total: it.total,
            source: 'web_ocr',
            receiptId,
            notes: parsed.rawNotes || '',
            syncedToSheets: false,
            createdAt: new Date().toISOString(),
          }));

          const config = getConfig();
          if (config.autoSyncToSheets && config.googleSheetsWebhookUrl) {
            const syncRes = await syncItemsToGoogleSheets(config.googleSheetsWebhookUrl, newItems);
            if (syncRes.success) {
              newItems.forEach(i => (i.syncedToSheets = true));
            }
          }

          savedItems = addExpenses(newItems);
          addReceipt({
            id: receiptId,
            date: parsed.date,
            time: parsed.time,
            store: parsed.storeName,
            grandTotal: parsed.grandTotal,
            itemCount: parsed.items.length,
            source: 'web',
            items: newItems,
            createdAt: new Date().toISOString(),
          });
        }

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success: true,
          parsed,
          savedItemsCount: savedItems.length,
        }));
        return;
      } catch (err: any) {
        console.error('Error in /api/ocr:', err);
        const errMsg = err?.message || 'Gagal membaca struk';
        res.statusCode = 503;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: errMsg }));
        return;
      }
    }

    // -------------------------------------------------------------
    // -------------------------------------------------------------
    // POST /api/parse-text (Natural language text parsing)
    // -------------------------------------------------------------
    if (method === 'POST' && cleanPath === '/api/parse-text') {
      try {
        const { text, autoSave } = req.body || {};
        if (!text) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: 'text diperlukan' }));
          return;
        }

        const parsed = await parseTextExpense(text);
        let savedItems: GroceryItem[] = [];

        if (autoSave) {
          const newItems: GroceryItem[] = parsed.items.map((it, idx) => ({
            id: `item-${Date.now()}-${idx}`,
            date: parsed.date || new Date().toISOString().split('T')[0],
            time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
            store: parsed.storeName || 'Belanja Harian',
            name: it.name,
            category: it.category || 'Sembako',
            qty: it.qty,
            unit: it.unit || 'pcs',
            price: it.price,
            total: it.total,
            source: 'web_manual',
            syncedToSheets: false,
            createdAt: new Date().toISOString(),
          }));

          const config = getConfig();
          if (config.autoSyncToSheets && config.googleSheetsWebhookUrl) {
            const syncRes = await syncItemsToGoogleSheets(config.googleSheetsWebhookUrl, newItems);
            if (syncRes.success) {
              newItems.forEach(i => (i.syncedToSheets = true));
            }
          }

          savedItems = addExpenses(newItems);
        }

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success: true,
          parsed,
          savedItemsCount: savedItems.length,
        }));
        return;
      } catch (err: any) {
        console.error('Error in /api/parse-text:', err);
        const errMsg = err?.message || 'Gagal memproses catatan teks';
        res.statusCode = 503;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: errMsg }));
        return;
      }
    }

    // -------------------------------------------------------------
    // POST /api/telegram/webhook (Telegram Server Webhook Receiver)
    // -------------------------------------------------------------
    if (method === 'POST' && cleanPath === '/api/telegram/webhook') {
      const update: TelegramUpdate = req.body || {};
      // Immediately respond 200 OK to Telegram so it doesn't timeout
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true }));

      processTelegramUpdate(update).catch(err => {
        console.error('[Webhook] Error processing update:', err);
      });
      return;
    }

    // -------------------------------------------------------------
    // POST /api/telegram/start-polling
    // -------------------------------------------------------------
    if (method === 'POST' && cleanPath === '/api/telegram/start-polling') {
      const success = await startTelegramPolling();
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success,
        pollingStatus: getPollingStatus(),
      }));
      return;
    }

    // -------------------------------------------------------------
    // POST /api/telegram/stop-polling
    // -------------------------------------------------------------
    if (method === 'POST' && cleanPath === '/api/telegram/stop-polling') {
      await stopTelegramPolling();
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: true,
        pollingStatus: getPollingStatus(),
      }));
      return;
    }

    // -------------------------------------------------------------
    // GET /api/telegram/polling-status
    // -------------------------------------------------------------
    if (method === 'GET' && cleanPath === '/api/telegram/polling-status') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: true,
        pollingStatus: getPollingStatus(),
        isPolling: isTelegramPollingActive(),
      }));
      return;
    }

    // -------------------------------------------------------------
    // POST /api/telegram/auto-webhook (1-Click Automatic Webhook Setup)
    // -------------------------------------------------------------
    if (method === 'POST' && cleanPath === '/api/telegram/auto-webhook') {
      const { botToken, publicUrl } = req.body || {};
      const result = await setupTelegramAutoWebhook({
        req,
        publicUrl,
        token: botToken,
      });

      if (!result.success) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: result.error }));
        return;
      }

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: true,
        message: 'Mode Webhook Otomatis berhasil diaktifkan!',
        webhookUrl: result.webhookUrl,
        botInfo: result.botInfo,
        webhookInfo: result.webhookInfo,
      }));
      return;
    }

    // -------------------------------------------------------------
    // POST /api/telegram/mode (Switch between Webhook and Polling)
    // -------------------------------------------------------------
    if (method === 'POST' && cleanPath === '/api/telegram/mode') {
      const { mode, publicUrl, botToken } = req.body || {};
      if (mode !== 'webhook' && mode !== 'polling') {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Mode harus "webhook" atau "polling"' }));
        return;
      }

      try {
        const result = await setTelegramConnectionMode(mode, {
          req,
          publicUrl,
          token: botToken,
        });
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ mode, ...result }));
      } catch (err: any) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // -------------------------------------------------------------
    // POST /api/telegram/set-webhook
    // -------------------------------------------------------------
    if (method === 'POST' && cleanPath === '/api/telegram/set-webhook') {
      const { botToken, webhookUrl } = req.body || {};
      const token = (botToken || getConfig().telegramBotToken || '').trim();

      if (!token) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Bot Token belum diisi' }));
        return;
      }

      // Verify token with Telegram API
      const me = await getMe(token);
      if (!me.ok) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          error: `Token Bot tidak valid: ${me.description || 'Gagal memverifikasi dengan Telegram'}`,
        }));
        return;
      }

      // Save token and username
      updateConfig({
        telegramBotToken: token,
        botUsername: me.result?.username || '',
      });

      // If user requested automatic webhook or provided URL
      const autoRes = await setupTelegramAutoWebhook({
        req,
        publicUrl: webhookUrl,
        token,
      });

      if (!autoRes.success) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success: false,
          error: autoRes.error,
          botInfo: me.result,
        }));
        return;
      }

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: true,
        pollingActive: false,
        webhookUrl: autoRes.webhookUrl,
        botInfo: autoRes.botInfo,
        webhookInfo: autoRes.webhookInfo,
      }));
      return;
    }

    // -------------------------------------------------------------
    // POST /api/telegram/test-webhook
    // -------------------------------------------------------------
    if (method === 'POST' && cleanPath === '/api/telegram/test-webhook') {
      const config = getConfig();
      const detectedPublicUrl = resolvePublicAppUrl(req);
      const targetEndpoint = `${detectedPublicUrl}/api/telegram/webhook`;
      const webhookInfo = config.telegramBotToken ? await getWebhookInfo(config.telegramBotToken) : null;

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: true,
        detectedPublicUrl,
        targetEndpoint,
        configuredWebhookUrl: config.registeredWebhookUrl || webhookInfo?.result?.url || null,
        isUrlMatching: (config.registeredWebhookUrl || webhookInfo?.result?.url) === targetEndpoint,
        webhookInfo: webhookInfo?.result || null,
      }));
      return;
    }

    // -------------------------------------------------------------
    // POST /api/telegram/webhook-info
    // -------------------------------------------------------------
    if (method === 'POST' && cleanPath === '/api/telegram/webhook-info') {
      const token = req.body?.botToken || getConfig().telegramBotToken;
      if (!token) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Bot token belum diisi' }));
        return;
      }

      const info = await getWebhookInfo(token);
      const me = await getMe(token);

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        ok: true,
        webhookInfo: info.result || null,
        botInfo: me.result || null,
      }));
      return;
    }

    // -------------------------------------------------------------
    // POST /api/sync-sheets (Manual / Bulk Sync to Google Sheets)
    // -------------------------------------------------------------
    if (method === 'POST' && cleanPath === '/api/sync-sheets') {
      const config = getConfig();
      const webhookUrl = req.body?.webhookUrl || config.googleSheetsWebhookUrl;

      if (!webhookUrl) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Google Sheets Webhook URL belum diisi' }));
        return;
      }

      const expenses = getExpenses();
      const itemsToSync = req.body?.itemIds
        ? expenses.filter(i => req.body.itemIds.includes(i.id))
        : expenses;

      if (itemsToSync.length === 0) {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, count: 0, message: 'Tidak ada item yang perlu disinkronkan.' }));
        return;
      }

      const result = await syncItemsToGoogleSheets(webhookUrl, itemsToSync);

      if (result.success) {
        // Mark as synced
        itemsToSync.forEach(it => updateExpense(it.id, { syncedToSheets: true }));
      }

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result));
      return;
    }

    // -------------------------------------------------------------
    // POST /api/sheets/pull (Pull/Import transactions recorded by 24/7 Apps Script)
    // -------------------------------------------------------------
    if (method === 'POST' && cleanPath === '/api/sheets/pull') {
      const config = getConfig();
      const webhookUrl = req.body?.webhookUrl || config.googleSheetsWebhookUrl;

      if (!webhookUrl) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: 'Google Sheets Webhook URL belum diisi.' }));
        return;
      }

      const result = await pullItemsFromGoogleSheets(webhookUrl);
      if (!result.success) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: result.message }));
        return;
      }

      const stats = syncExpensesFromSheets(result.items);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: true,
        message: result.message,
        added: stats.added,
        total: stats.total,
        items: getExpenses(),
      }));
      return;
    }

    // -------------------------------------------------------------
    // POST /api/telegram/set-sheets-webhook (1-Click Connect Telegram directly to Google Apps Script 24/7)
    // -------------------------------------------------------------
    if (method === 'POST' && cleanPath === '/api/telegram/set-sheets-webhook') {
      const config = getConfig();
      const token = (req.body?.botToken || config.telegramBotToken || '').trim();
      const sheetsUrl = (req.body?.sheetsUrl || config.googleSheetsWebhookUrl || '').trim();

      if (!token) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: 'Bot Token Telegram belum diisi.' }));
        return;
      }

      if (!sheetsUrl || !sheetsUrl.startsWith('https://script.google.com/')) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success: false,
          error: 'URL Google Apps Script tidak valid. Harus diawali dengan https://script.google.com/macros/s/.../exec',
        }));
        return;
      }

      // Stop local polling if active to prevent 409 conflict
      await stopTelegramPolling();

      // Register webhook to Google Apps Script URL
      const tgRes = await setTelegramWebhook(token, sheetsUrl);
      if (!tgRes.ok) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success: false,
          error: tgRes.description || 'Gagal mendaftarkan webhook ke Telegram.',
        }));
        return;
      }

      // Update config
      updateConfig({
        telegramBotToken: token,
        googleSheetsWebhookUrl: sheetsUrl,
        telegramMode: 'webhook',
        registeredWebhookUrl: sheetsUrl,
      });

      const me = await getMe(token);

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: true,
        message: '⚡ Mode 24/7 Always-On Berhasil Diaktifkan! Bot Telegram sekarang terhubung langsung ke Google Apps Script di cloud Google, aktif 24 jam nonstop tanpa perlu buka AI Studio!',
        webhookUrl: sheetsUrl,
        botInfo: me.result || null,
      }));
      return;
    }

    // -------------------------------------------------------------
    // GET /api/export-csv
    // -------------------------------------------------------------
    if (method === 'GET' && cleanPath === '/api/export-csv') {
      const items = getExpenses();
      const csv = generateCsvContent(items);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="catat-belanja-${new Date().toISOString().split('T')[0]}.csv"`);
      res.end(csv);
      return;
    }

    // Not found
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Endpoint API tidak ditemukan', url: rawUrl }));
  } catch (err: any) {
    console.error('API Error:', err);
    let friendlyMessage = err?.message || 'Internal Server Error';
    if (friendlyMessage.includes('503') || friendlyMessage.includes('high demand') || friendlyMessage.includes('UNAVAILABLE')) {
      friendlyMessage = 'Layanan AI Google sedang mengalami lonjakan beban sementara (503). Silakan coba lagi beberapa saat lagi atau gunakan Input Manual.';
    } else {
      try {
        const parsed = JSON.parse(friendlyMessage);
        if (parsed?.error?.message) {
          friendlyMessage = parsed.error.message;
        }
      } catch {}
    }
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: friendlyMessage }));
  }
}
