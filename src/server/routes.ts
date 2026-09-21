import { Request, Response } from 'express';
import { parseReceiptImage, parseTextExpense } from './geminiService';
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
} from './telegramService';
import { processTelegramUpdate } from './telegramProcessor';
import {
  startTelegramPolling,
  stopTelegramPolling,
  isTelegramPollingActive,
  getPollingStatus,
} from './telegramPolling';
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
  updateConfig,
  updateExpense,
} from './storageService';
import {
  generateCsvContent,
  GOOGLE_APPS_SCRIPT_TEMPLATE,
  syncItemsToGoogleSheets,
} from './sheetsService';

export async function handleApiRequest(req: Request, res: Response): Promise<void> {
  const url = req.url || '';
  const method = req.method;

  try {
    // -------------------------------------------------------------
    // GET /api/status
    // -------------------------------------------------------------
    if (method === 'GET' && (url === '/api/status' || url.startsWith('/api/status?'))) {
      const config = getConfig();
      const hasGeminiKey = !!process.env.GEMINI_API_KEY;
      const appUrl = process.env.APP_URL || '';

      let botInfo: any = null;
      let webhookInfo: any = null;

      if (config.telegramBotToken) {
        try {
          const me = await getMe(config.telegramBotToken);
          if (me.ok) {
            botInfo = me.result;
            if (botInfo?.username) {
              updateConfig({ botUsername: botInfo.username });
            }
          }
          webhookInfo = await getWebhookInfo(config.telegramBotToken);
          // Auto-start polling if not active yet
          if (!isTelegramPollingActive()) {
            startTelegramPolling().catch(e => console.error('Error auto-starting telegram polling:', e));
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
    if (method === 'GET' && (url === '/api/config' || url.startsWith('/api/config?'))) {
      const config = getConfig();
      // Mask token for safety
      const maskedToken = config.telegramBotToken
        ? `${config.telegramBotToken.substring(0, 5)}...${config.telegramBotToken.substring(config.telegramBotToken.length - 4)}`
        : '';

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        ...config,
        telegramBotTokenMasked: maskedToken,
        hasBotToken: !!config.telegramBotToken,
        appsScriptTemplate: GOOGLE_APPS_SCRIPT_TEMPLATE,
        appUrl: process.env.APP_URL || '',
      }));
      return;
    }

    if (method === 'POST' && url === '/api/config') {
      const body = req.body || {};
      const updates: any = {};
      if (typeof body.telegramBotToken === 'string') updates.telegramBotToken = body.telegramBotToken.trim();
      if (typeof body.googleSheetsWebhookUrl === 'string') updates.googleSheetsWebhookUrl = body.googleSheetsWebhookUrl.trim();
      if (typeof body.autoSyncToSheets === 'boolean') updates.autoSyncToSheets = body.autoSyncToSheets;
      if (typeof body.currency === 'string') updates.currency = body.currency;

      const updated = updateConfig(updates);
      if (updates.telegramBotToken !== undefined) {
        if (updates.telegramBotToken) {
          startTelegramPolling().catch(e => console.error('Error starting polling on config update:', e));
        } else {
          stopTelegramPolling().catch(e => console.error('Error stopping polling on config update:', e));
        }
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, config: updated }));
      return;
    }

    // -------------------------------------------------------------
    // GET /api/expenses, POST /api/expenses, DELETE /api/expenses
    // -------------------------------------------------------------
    if (method === 'GET' && (url === '/api/expenses' || url.startsWith('/api/expenses?'))) {
      const items = getExpenses();
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ items, totalCount: items.length }));
      return;
    }

    if (method === 'POST' && url === '/api/expenses') {
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

    if (method === 'DELETE' && url === '/api/expenses') {
      clearAllExpenses();
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, message: 'Semua data belanjaan telah dibersihkan.' }));
      return;
    }

    if (method === 'DELETE' && url.startsWith('/api/expenses/')) {
      const id = url.replace('/api/expenses/', '').split('?')[0];
      const ok = deleteExpense(id);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: ok, id }));
      return;
    }

    if (method === 'PUT' && url.startsWith('/api/expenses/')) {
      const id = url.replace('/api/expenses/', '').split('?')[0];
      const updated = updateExpense(id, req.body || {});
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: !!updated, item: updated }));
      return;
    }

    // -------------------------------------------------------------
    // -------------------------------------------------------------
    // POST /api/ocr (Direct OCR from Web / iPhone Camera)
    // -------------------------------------------------------------
    if (method === 'POST' && url === '/api/ocr') {
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
    // POST /api/parse-text (Natural language text parsing)
    // -------------------------------------------------------------
    if (method === 'POST' && url === '/api/parse-text') {
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
    if (method === 'POST' && (url === '/api/telegram/webhook' || url.startsWith('/api/telegram/webhook'))) {
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
    if (method === 'POST' && url === '/api/telegram/start-polling') {
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
    if (method === 'POST' && url === '/api/telegram/stop-polling') {
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
    if (method === 'GET' && (url === '/api/telegram/polling-status' || url.startsWith('/api/telegram/polling-status'))) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: true,
        pollingStatus: getPollingStatus(),
        isPolling: isTelegramPollingActive(),
      }));
      return;
    }

    // -------------------------------------------------------------
    // POST /api/telegram/set-webhook
    // -------------------------------------------------------------
    if (method === 'POST' && url === '/api/telegram/set-webhook') {
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

      // If user explicitly provided a custom webhook URL
      let webhookSetResult: any = null;
      if (webhookUrl && typeof webhookUrl === 'string' && webhookUrl.startsWith('https://')) {
        webhookSetResult = await setTelegramWebhook(token, webhookUrl);
      } else {
        // Use Real-Time Long Polling (reliable in Cloud Run & development)
        await startTelegramPolling();
      }

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: true,
        pollingActive: isTelegramPollingActive(),
        botInfo: me.result,
        telegramResponse: webhookSetResult,
      }));
      return;
    }

    // -------------------------------------------------------------
    // POST /api/telegram/webhook-info
    // -------------------------------------------------------------
    if (method === 'POST' && url === '/api/telegram/webhook-info') {
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
    if (method === 'POST' && url === '/api/sync-sheets') {
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
    // GET /api/export-csv
    // -------------------------------------------------------------
    if (method === 'GET' && (url === '/api/export-csv' || url.startsWith('/api/export-csv?'))) {
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
    res.end(JSON.stringify({ error: 'Endpoint API tidak ditemukan', url }));
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
