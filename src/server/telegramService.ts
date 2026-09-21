export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  first_name?: string;
  username?: string;
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  photo?: TelegramPhotoSize[];
  caption?: string;
}

export interface TelegramInlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface TelegramInlineKeyboardMarkup {
  inline_keyboard: TelegramInlineKeyboardButton[][];
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  inline_message_id?: string;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export async function getMe(botToken: string): Promise<{ ok: boolean; result?: any; description?: string }> {
  const url = `https://api.telegram.org/bot${botToken}/getMe`;
  const res = await fetch(url);
  return res.json();
}

export async function setTelegramWebhook(botToken: string, webhookUrl: string): Promise<{ ok: boolean; description?: string }> {
  const allowedUpdates = JSON.stringify(['message', 'edited_message', 'callback_query']);
  const url = `https://api.telegram.org/bot${botToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}&allowed_updates=${encodeURIComponent(allowedUpdates)}`;
  const res = await fetch(url);
  return res.json();
}

export async function getWebhookInfo(botToken: string): Promise<any> {
  const url = `https://api.telegram.org/bot${botToken}/getWebhookInfo`;
  const res = await fetch(url);
  return res.json();
}

export async function deleteTelegramWebhook(botToken: string): Promise<any> {
  const url = `https://api.telegram.org/bot${botToken}/deleteWebhook?drop_pending_updates=false`;
  const res = await fetch(url);
  return res.json();
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: number | string,
  text: string,
  parseMode: 'Markdown' | 'HTML' = 'Markdown',
  replyMarkup?: TelegramInlineKeyboardMarkup
): Promise<any> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body: any = {
    chat_id: chatId,
    text,
    parse_mode: parseMode,
  };
  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let data = await res.json();
    // Fallback if Markdown parsing error occurs
    if (!data.ok && data.description && (data.description.includes("can't parse entities") || data.description.includes("character"))) {
      console.warn('[Telegram Service] Markdown parsing failed, retrying plain text:', data.description);
      delete body.parse_mode;
      const retryRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      data = await retryRes.json();
    }
    return data;
  } catch (err: any) {
    console.error('[Telegram Service] Network error in sendMessage:', err);
    return { ok: false, error: err.message };
  }
}

export async function editTelegramMessageText(
  botToken: string,
  chatId: number | string,
  messageId: number,
  text: string,
  parseMode: 'Markdown' | 'HTML' = 'Markdown',
  replyMarkup?: TelegramInlineKeyboardMarkup
): Promise<any> {
  const url = `https://api.telegram.org/bot${botToken}/editMessageText`;
  const body: any = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: parseMode,
  };
  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let data = await res.json();
    // Fallback if Markdown parsing error occurs
    if (!data.ok && data.description && (data.description.includes("can't parse entities") || data.description.includes("character"))) {
      console.warn('[Telegram Service] Markdown parsing failed in editMessageText, retrying plain text:', data.description);
      delete body.parse_mode;
      const retryRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      data = await retryRes.json();
    }
    return data;
  } catch (err: any) {
    console.error('[Telegram Service] Network error in editMessageText:', err);
    return { ok: false, error: err.message };
  }
}

export async function answerCallbackQuery(
  botToken: string,
  callbackQueryId: string,
  text?: string,
  showAlert: boolean = false
): Promise<any> {
  const url = `https://api.telegram.org/bot${botToken}/answerCallbackQuery`;
  const body: any = {
    callback_query_id: callbackQueryId,
    show_alert: showAlert,
  };
  if (text) {
    body.text = text;
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function deleteTelegramMessage(
  botToken: string,
  chatId: number | string,
  messageId: number
): Promise<any> {
  const url = `https://api.telegram.org/bot${botToken}/deleteMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
    }),
  });
  return res.json();
}

export async function sendChatAction(
  botToken: string,
  chatId: number | string,
  action: 'typing' | 'upload_photo' = 'typing'
): Promise<any> {
  const url = `https://api.telegram.org/bot${botToken}/sendChatAction`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        action,
      }),
    });
  } catch (e) {
    // Ignore non-fatal action errors
  }
}

/**
 * Download photo from Telegram servers and convert to base64
 */
export async function downloadTelegramPhoto(
  botToken: string,
  fileId: string
): Promise<{ base64: string; mimeType: string }> {
  // Step 1: get file info
  const getFileUrl = `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`;
  const fileInfoRes = await fetch(getFileUrl);
  const fileInfo = await fileInfoRes.json();

  if (!fileInfo.ok || !fileInfo.result?.file_path) {
    throw new Error(`Gagal mengambil detail file foto dari Telegram: ${fileInfo.description || 'file_path tidak ditemukan'}`);
  }

  const filePath = fileInfo.result.file_path;
  const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

  // Step 2: Download the binary file
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Gagal mengunduh foto dari server Telegram (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64 = buffer.toString('base64');

  // Determine mime type
  let mimeType = 'image/jpeg';
  if (filePath.endsWith('.png')) mimeType = 'image/png';
  else if (filePath.endsWith('.webp')) mimeType = 'image/webp';

  return { base64, mimeType };
}

export function formatCurrencyIDR(val: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(val || 0);
}
