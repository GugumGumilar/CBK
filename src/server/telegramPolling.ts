import { getConfig, updateConfig } from './storageService.ts';
import { deleteTelegramWebhook, getMe } from './telegramService.ts';
import { processTelegramUpdate } from './telegramProcessor.ts';

interface GlobalPollingState {
  isPolling: boolean;
  currentToken: string;
  abortController: AbortController | null;
  lastPolledTime: string | null;
  lastPollingError: string | null;
  loopId: number;
}

const g = globalThis as any;
if (!g.__telegramPollingState) {
  g.__telegramPollingState = {
    isPolling: false,
    currentToken: '',
    abortController: null,
    lastPolledTime: null,
    lastPollingError: null,
    loopId: 0,
  } as GlobalPollingState;
}

const state: GlobalPollingState = g.__telegramPollingState;

export function isTelegramPollingActive(): boolean {
  return state.isPolling;
}

export function getPollingStatus() {
  return {
    active: state.isPolling,
    lastPolledTime: state.lastPolledTime,
    lastPollingError: state.lastPollingError,
  };
}

export async function stopTelegramPolling(): Promise<void> {
  if (!state.isPolling) return;
  state.isPolling = false;
  state.currentToken = '';
  state.loopId++;
  if (state.abortController) {
    try {
      state.abortController.abort();
    } catch {}
    state.abortController = null;
  }
  console.log('[Telegram Polling] Polling stopped.');
}

export async function startTelegramPolling(): Promise<boolean> {
  const config = getConfig();
  const token = config.telegramBotToken?.trim();

  if (!token) {
    console.log('[Telegram Polling] No bot token configured, skipping.');
    return false;
  }

  // If already polling, verify it's healthy
  if (state.isPolling && state.currentToken === token) {
    const lastPolled = state.lastPolledTime ? new Date(state.lastPolledTime).getTime() : 0;
    const now = Date.now();
    if (now - lastPolled < 25000) {
      return true; // healthy and running
    }
    console.log('[Telegram Polling] Polling appears stalled, restarting loop...');
  }

  if (state.isPolling) {
    await stopTelegramPolling();
  }

  // Verify token first
  try {
    const me = await getMe(token);
    if (!me.ok) {
      console.warn('[Telegram Polling] Bot token is invalid:', me.description);
      state.lastPollingError = me.description || 'Token tidak valid';
      return false;
    }
    if (me.result?.username && me.result.username !== config.botUsername) {
      updateConfig({ botUsername: me.result.username });
    }
    console.log(`[Telegram Polling] Verified bot @${me.result?.username || 'unknown'}`);
  } catch (err: any) {
    console.error('[Telegram Polling] Failed to verify token:', err);
    state.lastPollingError = err.message;
    return false;
  }

  // Delete webhook so getUpdates works cleanly
  try {
    const delRes = await deleteTelegramWebhook(token);
    console.log('[Telegram Polling] deleteWebhook result:', delRes);
  } catch (err: any) {
    console.warn('[Telegram Polling] deleteWebhook warning:', err.message);
  }

  state.isPolling = true;
  state.currentToken = token;
  state.lastPollingError = null;
  const currentLoopId = ++state.loopId;

  // Run polling loop asynchronously
  (async () => {
    let offset = 0;
    console.log(`[Telegram Polling] Started polling loop #${currentLoopId} for token: ${token.substring(0, 6)}...`);

    while (state.isPolling && state.currentToken === token && state.loopId === currentLoopId) {
      try {
        state.abortController = new AbortController();
        const timeoutSeconds = 6;
        const offsetParam = offset > 0 ? `&offset=${offset}` : '';
        const allowedUpdates = JSON.stringify(['message', 'edited_message', 'callback_query']);
        const url = `https://api.telegram.org/bot${token}/getUpdates?timeout=${timeoutSeconds}${offsetParam}&allowed_updates=${encodeURIComponent(allowedUpdates)}`;

        const res = await fetch(url, {
          signal: state.abortController.signal,
        });

        if (!state.isPolling || state.loopId !== currentLoopId) break;

        const data = await res.json();
        state.lastPolledTime = new Date().toISOString();

        if (data.ok && Array.isArray(data.result)) {
          state.lastPollingError = null;
          for (const update of data.result) {
            if (!state.isPolling || state.loopId !== currentLoopId) break;
            offset = update.update_id + 1;
            console.log(`[Telegram Polling] Processing update ${update.update_id}, next offset ${offset}`);
            try {
              await processTelegramUpdate(update);
            } catch (procErr: any) {
              console.error(`[Telegram Polling] Error processing update ${update.update_id}:`, procErr?.message || procErr);
            }
          }
        } else if (!data.ok) {
          state.lastPollingError = data.description || 'Gagal getUpdates';
          console.warn('[Telegram Polling] API returned error:', data.description);
          const delay = data.description?.includes('Conflict') ? 3000 : 1500;
          await new Promise(r => setTimeout(r, delay));
        }
      } catch (err: any) {
        if (err.name === 'AbortError' || !state.isPolling || state.loopId !== currentLoopId) {
          break;
        }
        state.lastPollingError = err.message;
        console.warn('[Telegram Polling] Network error in polling loop:', err.message);
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    console.log(`[Telegram Polling] Polling loop #${currentLoopId} terminated.`);
  })().catch(loopErr => {
    console.error('[Telegram Polling] Fatal error in polling loop:', loopErr);
    state.isPolling = false;
    state.lastPollingError = loopErr?.message || 'Loop error';
  });

  return true;
}

// Watchdog to auto-restart polling if it stops unexpectedly
if (!g.__telegramWatchdog) {
  g.__telegramWatchdog = setInterval(() => {
    try {
      const cfg = getConfig();
      if (!cfg.telegramBotToken) return;
      if (!state.isPolling) {
        startTelegramPolling().catch(e => console.error('[Watchdog] Restart error:', e));
        return;
      }
      const lastTime = state.lastPolledTime ? new Date(state.lastPolledTime).getTime() : 0;
      if (Date.now() - lastTime > 30000) {
        console.warn('[Watchdog] Polling stalled (>30s), restarting...');
        startTelegramPolling().catch(e => console.error('[Watchdog] Restart error:', e));
      }
    } catch {}
  }, 10000);
}
