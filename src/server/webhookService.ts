import { getConfig, updateConfig } from './storageService.ts';
import { getMe, setTelegramWebhook, getWebhookInfo, deleteTelegramWebhook } from './telegramService.ts';
import { stopTelegramPolling, startTelegramPolling } from './telegramPolling.ts';

/**
 * Automatically determine the public HTTPS base URL of this application
 */
export function resolvePublicAppUrl(req?: any, explicitUrl?: string): string {
  if (explicitUrl && typeof explicitUrl === 'string' && explicitUrl.trim().startsWith('https://')) {
    return explicitUrl.trim().replace(/\/+$/, '');
  }

  if (req) {
    // 1. Check Origin / Referer header from browser
    const origin = (req.headers?.origin || req.headers?.referer) as string | undefined;
    if (origin && typeof origin === 'string' && origin.startsWith('https://')) {
      try {
        const u = new URL(origin);
        if (!u.hostname.includes('localhost') && !u.hostname.includes('127.0.0.1')) {
          return `${u.protocol}//${u.host}`;
        }
      } catch {}
    }

    // 2. Check X-Forwarded-Host or Host from proxy/Cloud Run
    const fwdHost = (req.headers?.['x-forwarded-host'] || req.headers?.host) as string | undefined;
    if (fwdHost && !fwdHost.includes('localhost') && !fwdHost.includes('127.0.0.1')) {
      const proto = (req.headers?.['x-forwarded-proto'] as string) || 'https';
      return `${proto}://${fwdHost}`.replace(/\/+$/, '');
    }
  }

  // 3. Environment variable fallback
  if (process.env.APP_URL && process.env.APP_URL.startsWith('https://')) {
    return process.env.APP_URL.trim().replace(/\/+$/, '');
  }

  // 4. Stored config fallback
  const config = getConfig();
  if (config.registeredWebhookUrl && config.registeredWebhookUrl.startsWith('https://')) {
    try {
      const u = new URL(config.registeredWebhookUrl);
      return `${u.protocol}//${u.host}`;
    } catch {}
  }

  return '';
}

/**
 * Configure and activate Telegram Automatic Webhook mode
 */
export async function setupTelegramAutoWebhook(options?: {
  req?: any;
  publicUrl?: string;
  token?: string;
}): Promise<{
  success: boolean;
  webhookUrl?: string;
  botInfo?: any;
  webhookInfo?: any;
  error?: string;
}> {
  const config = getConfig();
  const token = (options?.token || config.telegramBotToken || '').trim();

  if (!token) {
    return { success: false, error: 'Token bot Telegram belum diisi. Masukkan token dari @BotFather.' };
  }

  // Verify token first
  const me = await getMe(token);
  if (!me.ok) {
    return {
      success: false,
      error: `Token Bot Telegram tidak valid: ${me.description || 'Gagal memverifikasi ke Telegram'}`,
    };
  }

  // Determine public HTTPS URL
  const publicBaseUrl = resolvePublicAppUrl(options?.req, options?.publicUrl);
  if (!publicBaseUrl || !publicBaseUrl.startsWith('https://')) {
    return {
      success: false,
      error:
        'URL publik HTTPS tidak terdeteksi. Webhook Telegram membutuhkan URL HTTPS publik (misal domain Cloud Run / Vercel). Jika running offline di localhost, silakan gunakan Mode Polling.',
    };
  }

  const webhookEndpoint = `${publicBaseUrl}/api/telegram/webhook`;

  // Stop polling first so Telegram doesn't conflict
  await stopTelegramPolling();

  console.log(`[Telegram Auto-Webhook] Registering webhook to: ${webhookEndpoint}`);
  const tgResult = await setTelegramWebhook(token, webhookEndpoint);

  if (!tgResult.ok) {
    const errMsg = tgResult.description || 'Telegram menolak pendaftaran webhook';
    updateConfig({
      lastWebhookError: errMsg,
      telegramMode: 'webhook',
    });
    return {
      success: false,
      webhookUrl: webhookEndpoint,
      error: `Gagal mendaftarkan webhook: ${errMsg}`,
    };
  }

  // Verify status from Telegram
  const webhookInfo = await getWebhookInfo(token);

  // Update persistent configuration
  updateConfig({
    telegramBotToken: token,
    botUsername: me.result?.username || config.botUsername,
    telegramMode: 'webhook',
    registeredWebhookUrl: webhookEndpoint,
    lastWebhookSync: new Date().toISOString(),
    autoWebhookEnabled: true,
    lastWebhookError: undefined,
  });

  console.log(`[Telegram Auto-Webhook] ✅ Webhook successfully registered for @${me.result?.username || 'bot'}`);

  return {
    success: true,
    webhookUrl: webhookEndpoint,
    botInfo: me.result,
    webhookInfo: webhookInfo?.result || null,
  };
}

/**
 * Switch Telegram connection mode between 'webhook' and 'polling'
 */
export async function setTelegramConnectionMode(
  mode: 'webhook' | 'polling',
  options?: { req?: any; publicUrl?: string; token?: string }
) {
  const config = getConfig();
  const token = (options?.token || config.telegramBotToken || '').trim();

  if (!token) {
    throw new Error('Token bot Telegram belum diisi.');
  }

  if (mode === 'webhook') {
    return await setupTelegramAutoWebhook(options);
  } else {
    // Mode Polling: Delete webhook and start polling
    console.log('[Telegram Mode] Switching to Long Polling mode...');
    await deleteTelegramWebhook(token);
    updateConfig({
      telegramMode: 'polling',
      autoWebhookEnabled: false,
    });
    const pollingStarted = await startTelegramPolling();
    const me = await getMe(token);
    return {
      success: true,
      mode: 'polling',
      pollingStarted,
      botInfo: me.result,
    };
  }
}
