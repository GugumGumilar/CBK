import {
  TelegramUpdate,
  TelegramCallbackQuery,
  TelegramInlineKeyboardMarkup,
  sendTelegramMessage,
  editTelegramMessageText,
  answerCallbackQuery,
  sendChatAction,
  downloadTelegramPhoto,
  sendTelegramDocument,
  formatCurrencyIDR,
} from './telegramService.ts';
import {
  getConfig,
  updateConfig,
  getExpenses,
  addExpenses,
  addReceipt,
  updateExpense,
  deleteExpense,
  clearAllExpenses,
  GroceryItem,
} from './storageService.ts';
import { parseReceiptImage, parseTextExpense } from './geminiService.ts';
import {
  syncItemsToGoogleSheets,
  deleteItemsFromGoogleSheets,
  updateItemInGoogleSheets,
  clearAllFromGoogleSheets,
  generateCsvContent,
} from './sheetsService.ts';

/**
 * Deduplication tracker to prevent identical photos or duplicate webhooks from re-processing
 * Stores file_unique_id or message_id with timestamp for 15 minutes.
 */
const recentProcessedPhotos = new Map<string, number>();

function isPhotoAlreadyProcessed(key: string): boolean {
  const now = Date.now();
  // Cleanup entries older than 15 minutes
  for (const [k, time] of recentProcessedPhotos.entries()) {
    if (now - time > 15 * 60 * 1000) {
      recentProcessedPhotos.delete(k);
    }
  }
  if (recentProcessedPhotos.has(key)) {
    return true;
  }
  recentProcessedPhotos.set(key, now);
  return false;
}

/**
 * Render paginated list of grocery items with Edit and Delete inline buttons
 */
export function renderExpensesListMessage(page = 0): {
  text: string;
  replyMarkup: TelegramInlineKeyboardMarkup;
} {
  const expenses = getExpenses();
  const PAGE_SIZE = 5;
  const totalPages = Math.max(1, Math.ceil(expenses.length / PAGE_SIZE));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const startIdx = safePage * PAGE_SIZE;
  const pageItems = expenses.slice(startIdx, startIdx + PAGE_SIZE);

  if (expenses.length === 0) {
    return {
      text: `📋 *DAFTAR DATA BELANJAAN* 🛒\n\n` +
        `_Belum ada catatan belanjaan yang tersimpan._\n\n` +
        `📸 Kirim foto bon belanjaan dari kamera iPhone kamu, atau\n` +
        `✍️ Ketik belanjaan manual (contoh: \`Beras 5kg 75000\`).`,
      replyMarkup: {
        inline_keyboard: [
          [
            { text: '📊 Rekap Belanja', callback_data: 'cmd_rekap' },
            { text: '🔄 Muat Ulang', callback_data: 'page:0' },
          ],
        ],
      },
    };
  }

  let text = `📋 *DAFTAR DATA BELANJAAN* 🛒\n`;
  text += `_Total: ${expenses.length} barang | Halaman ${safePage + 1} dari ${totalPages}_\n\n`;

  const inlineKeyboard: any[][] = [];

  pageItems.forEach((item, idx) => {
    const num = startIdx + idx + 1;
    text += `*${num}. ${item.name}*\n`;
    text += `   ↳ ${item.qty} ${item.unit} × ${formatCurrencyIDR(item.price)} = *${formatCurrencyIDR(item.total)}*\n`;
    text += `   🏪 _${item.store}_ • 📅 \`${item.date}\`\n\n`;

    // Row of action buttons for each item: [✏️ Edit #N] [🗑️ Hapus #N]
    inlineKeyboard.push([
      { text: `✏️ Edit #${num}`, callback_data: `edit:${item.id}:${safePage}` },
      { text: `🗑️ Hapus #${num}`, callback_data: `ask_del:${item.id}:${safePage}` },
    ]);
  });

  // Navigation row: Prev, Refresh, Next
  const navRow = [];
  if (safePage > 0) {
    navRow.push({ text: '◀️ Sebelumnya', callback_data: `page:${safePage - 1}` });
  }
  navRow.push({ text: `🔄 Hal ${safePage + 1}/${totalPages}`, callback_data: `page:${safePage}` });
  if (safePage < totalPages - 1) {
    navRow.push({ text: 'Berikutnya ▶️', callback_data: `page:${safePage + 1}` });
  }
  inlineKeyboard.push(navRow);

  // Bottom shortcut row
  inlineKeyboard.push([
    { text: '📊 Rekap Pengeluaran', callback_data: 'cmd_rekap' },
    { text: '🗑️ Hapus Semua', callback_data: 'ask_clear_all' },
  ]);

  return { text, replyMarkup: { inline_keyboard: inlineKeyboard } };
}

/**
 * Render single item detail card with quick edit actions
 */
export function renderItemEditCard(itemId: string, returnPage = 0): {
  text: string;
  replyMarkup: TelegramInlineKeyboardMarkup;
} | null {
  const item = getExpenses().find(i => i.id === itemId);
  if (!item) return null;

  const text = `✏️ *EDIT DATA BELANJAAN*\n\n` +
    `📦 *Nama Barang:* *${item.name}*\n` +
    `🔢 *Jumlah:* ${item.qty} ${item.unit}\n` +
    `💰 *Harga Satuan:* ${formatCurrencyIDR(item.price)}\n` +
    `💵 *Total Harga:* *${formatCurrencyIDR(item.total)}*\n` +
    `🏪 *Toko:* ${item.store}\n` +
    `📅 *Tanggal:* ${item.date}${item.time ? ` (${item.time})` : ''}\n` +
    `📁 *Kategori:* ${item.category}\n` +
    `🆔 *ID Barang:* \`${item.id}\`\n\n` +
    `_Klik tombol di bawah untuk ubah cepat, atau balas chat ini dengan:_\n` +
    `• \`/harga ${item.id} <harga_baru>\`\n` +
    `• \`/nama ${item.id} <nama_baru>\`\n` +
    `• \`/qty ${item.id} <jumlah_baru>\``;

  const replyMarkup: TelegramInlineKeyboardMarkup = {
    inline_keyboard: [
      [
        { text: '➕ Tambah Qty (+1)', callback_data: `qty_add:${item.id}:${returnPage}` },
        { text: '➖ Kurang Qty (-1)', callback_data: `qty_sub:${item.id}:${returnPage}` },
      ],
      [
        { text: '💰 Ubah Harga', callback_data: `ask_price:${item.id}:${returnPage}` },
        { text: '🏷️ Ubah Nama', callback_data: `ask_name:${item.id}:${returnPage}` },
      ],
      [
        { text: '🗑️ Hapus Barang Ini', callback_data: `ask_del:${item.id}:${returnPage}` },
      ],
      [
        { text: '🔙 Kembali ke Daftar', callback_data: `page:${returnPage}` },
      ],
    ],
  };

  return { text, replyMarkup };
}

/**
 * Render delete confirmation dialog
 */
export function renderDeleteConfirmation(itemId: string, returnPage = 0): {
  text: string;
  replyMarkup: TelegramInlineKeyboardMarkup;
} | null {
  const item = getExpenses().find(i => i.id === itemId);
  if (!item) return null;

  const text = `⚠️ *KONFIRMASI HAPUS BARANG*\n\n` +
    `Apakah Anda yakin ingin menghapus data belanja ini?\n\n` +
    `📦 *Nama:* *${item.name}*\n` +
    `🔢 *Jumlah:* ${item.qty} ${item.unit}\n` +
    `💰 *Total:* *${formatCurrencyIDR(item.total)}*\n` +
    `🏪 *Toko:* ${item.store} (${item.date})\n\n` +
    `_Data akan dihapus dari aplikasi dan baris data Google Sheets juga ikut terhapus._`;

  const replyMarkup: TelegramInlineKeyboardMarkup = {
    inline_keyboard: [
      [
        { text: '✅ Ya, Hapus Sekarang', callback_data: `do_del:${item.id}:${returnPage}` },
        { text: '❌ Batal', callback_data: `page:${returnPage}` },
      ],
    ],
  };

  return { text, replyMarkup };
}

/**
 * Handle callback queries (taps on Inline Keyboard buttons)
 */
async function handleCallbackQuery(cb: TelegramCallbackQuery, botToken: string): Promise<void> {
  const config = getConfig();
  const data = cb.data || '';
  const chatId = cb.message?.chat.id || cb.from.id;
  const messageId = cb.message?.message_id;

  const parts = data.split(':');
  const action = parts[0];
  const param1 = parts[1] || '';
  const param2 = parts[2] || '0';

  // 1. Pagination / View List
  if (action === 'page') {
    const page = parseInt(param1, 10) || 0;
    const { text, replyMarkup } = renderExpensesListMessage(page);
    await answerCallbackQuery(botToken, cb.id);
    if (messageId) {
      await editTelegramMessageText(botToken, chatId, messageId, text, 'Markdown', replyMarkup);
    } else {
      await sendTelegramMessage(botToken, chatId, text, 'Markdown', replyMarkup);
    }
    return;
  }

  // 2. Open Edit Item Card
  if (action === 'edit') {
    const itemId = param1;
    const returnPage = parseInt(param2, 10) || 0;
    const card = renderItemEditCard(itemId, returnPage);
    if (!card) {
      await answerCallbackQuery(botToken, cb.id, 'Barang tidak ditemukan atau sudah dihapus.', true);
      return;
    }
    await answerCallbackQuery(botToken, cb.id);
    if (messageId) {
      await editTelegramMessageText(botToken, chatId, messageId, card.text, 'Markdown', card.replyMarkup);
    }
    return;
  }

  // 3. Ask Delete Confirmation
  if (action === 'ask_del') {
    const itemId = param1;
    const returnPage = parseInt(param2, 10) || 0;
    const conf = renderDeleteConfirmation(itemId, returnPage);
    if (!conf) {
      await answerCallbackQuery(botToken, cb.id, 'Barang tidak ditemukan atau sudah dihapus.', true);
      return;
    }
    await answerCallbackQuery(botToken, cb.id);
    if (messageId) {
      await editTelegramMessageText(botToken, chatId, messageId, conf.text, 'Markdown', conf.replyMarkup);
    }
    return;
  }

  // 4. Perform Delete
  if (action === 'do_del') {
    const itemId = param1;
    const returnPage = parseInt(param2, 10) || 0;
    const existing = getExpenses().find(i => i.id === itemId);
    const itemName = existing ? existing.name : 'Barang';
    const deleted = deleteExpense(itemId);
    const config = getConfig();

    let sheetsNote = '';
    if (deleted && existing && config.googleSheetsWebhookUrl) {
      try {
        const syncDel = await deleteItemsFromGoogleSheets(
          config.googleSheetsWebhookUrl,
          [itemId],
          [existing]
        );
        if (syncDel.success) {
          sheetsNote = ' & Google Sheets';
        }
      } catch (e) {
        console.error('Error deleting from sheets via TG callback:', e);
      }
    }

    if (deleted) {
      await answerCallbackQuery(botToken, cb.id, `✅ "${itemName}" berhasil dihapus dari daftar${sheetsNote}!`, false);
    } else {
      await answerCallbackQuery(botToken, cb.id, 'Item sudah tidak ada.', false);
    }

    const { text, replyMarkup } = renderExpensesListMessage(returnPage);
    if (messageId) {
      await editTelegramMessageText(botToken, chatId, messageId, text, 'Markdown', replyMarkup);
    }
    return;
  }

  // 5. Quick Qty Increment (+1)
  if (action === 'qty_add') {
    const itemId = param1;
    const returnPage = parseInt(param2, 10) || 0;
    const item = getExpenses().find(i => i.id === itemId);
    if (item) {
      const newQty = (item.qty || 1) + 1;
      const newTotal = newQty * (item.price || 0);
      updateExpense(itemId, { qty: newQty, total: newTotal });
      await answerCallbackQuery(botToken, cb.id, `✅ Jumlah bertambah: ${newQty} ${item.unit}`, false);

      const card = renderItemEditCard(itemId, returnPage);
      if (card && messageId) {
        await editTelegramMessageText(botToken, chatId, messageId, card.text, 'Markdown', card.replyMarkup);
      }
    } else {
      await answerCallbackQuery(botToken, cb.id, 'Barang tidak ditemukan.', true);
    }
    return;
  }

  // 6. Quick Qty Decrement (-1)
  if (action === 'qty_sub') {
    const itemId = param1;
    const returnPage = parseInt(param2, 10) || 0;
    const item = getExpenses().find(i => i.id === itemId);
    if (item) {
      if ((item.qty || 1) <= 1) {
        await answerCallbackQuery(botToken, cb.id, '⚠️ Jumlah minimal 1. Gunakan tombol Hapus jika ingin menghapus barang.', true);
        return;
      }
      const newQty = (item.qty || 1) - 1;
      const newTotal = newQty * (item.price || 0);
      updateExpense(itemId, { qty: newQty, total: newTotal });
      await answerCallbackQuery(botToken, cb.id, `✅ Jumlah berkurang: ${newQty} ${item.unit}`, false);

      const card = renderItemEditCard(itemId, returnPage);
      if (card && messageId) {
        await editTelegramMessageText(botToken, chatId, messageId, card.text, 'Markdown', card.replyMarkup);
      }
    } else {
      await answerCallbackQuery(botToken, cb.id, 'Barang tidak ditemukan.', true);
    }
    return;
  }

  // 7. Ask Price
  if (action === 'ask_price') {
    const itemId = param1;
    await answerCallbackQuery(botToken, cb.id);
    await sendTelegramMessage(
      botToken,
      chatId,
      `💰 *Ubah Harga Barang*\n\n` +
      `Ketik dan kirim perintah:\n` +
      `\`/harga ${itemId} <nominal>\`\n\n` +
      `_Contoh:_ \`/harga ${itemId} 35000\``,
      'Markdown'
    );
    return;
  }

  // 8. Ask Name
  if (action === 'ask_name') {
    const itemId = param1;
    await answerCallbackQuery(botToken, cb.id);
    await sendTelegramMessage(
      botToken,
      chatId,
      `🏷️ *Ubah Nama Barang*\n\n` +
      `Ketik dan kirim perintah:\n` +
      `\`/nama ${itemId} <nama_baru>\`\n\n` +
      `_Contoh:_ \`/nama ${itemId} Telur Ayam Kampung\``,
      'Markdown'
    );
    return;
  }

  // 9. Shortcut: Rekap
  if (action === 'cmd_rekap') {
    await answerCallbackQuery(botToken, cb.id);
    const expenses = getExpenses();
    const currentMonth = new Date().toISOString().substring(0, 7);
    const thisMonthItems = expenses.filter(i => i.date.startsWith(currentMonth));
    const totalMonthSpend = thisMonthItems.reduce((acc, it) => acc + (it.total || 0), 0);
    const todayDate = new Date().toISOString().split('T')[0];
    const todayItems = expenses.filter(i => i.date === todayDate);
    const totalTodaySpend = todayItems.reduce((acc, it) => acc + (it.total || 0), 0);

    let budgetSection = '';
    if (config.monthlyBudget && config.monthlyBudget > 0) {
      const budget = config.monthlyBudget;
      const remaining = budget - totalMonthSpend;
      const percentUsed = Math.min(100, Math.round((totalMonthSpend / budget) * 100));
      const barLength = 10;
      const filled = Math.min(barLength, Math.max(0, Math.round((percentUsed / 100) * barLength)));
      const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
      const statusIcon = remaining < 0 ? '🚨 *OVER BUDGET!*' : percentUsed >= 85 ? '⚠️ *Hampir Habis!*' : '✅ *Aman*';
      budgetSection = `\n🎯 *Budget Bulanan:* *${formatCurrencyIDR(budget)}*\n` +
        `📊 *Progress:* [${bar}] ${percentUsed}%\n` +
        `💰 *Sisa Budget:* *${formatCurrencyIDR(remaining)}* (${statusIcon})\n`;
    }

    const rekapText = `📊 *REKAP PENGELUARAN BELANJA*\n\n` +
      `📅 *Hari Ini:* *${formatCurrencyIDR(totalTodaySpend)}* (${todayItems.length} barang)\n` +
      `🗓️ *Bulan Ini (${currentMonth}):* *${formatCurrencyIDR(totalMonthSpend)}* (${thisMonthItems.length} barang)\n` +
      budgetSection +
      `📦 *Total Keseluruhan:* ${expenses.length} item tercatat`;

    await sendTelegramMessage(botToken, chatId, rekapText, 'Markdown', {
      inline_keyboard: [
        [
          { text: '📥 Download File Rekap (Excel/CSV)', callback_data: 'download_rekap' },
        ],
        [
          { text: '📋 Lihat Daftar Belanja', callback_data: 'page:0' },
          { text: '🎯 Atur Budget', callback_data: 'cmd_budget_info' },
        ],
      ],
    });
    return;
  }

  // 9A. Budget Info Callback
  if (action === 'cmd_budget_info') {
    await answerCallbackQuery(botToken, cb.id);
    const expenses = getExpenses();
    const currentMonth = new Date().toISOString().substring(0, 7);
    const thisMonthItems = expenses.filter(i => i.date.startsWith(currentMonth));
    const totalMonthSpend = thisMonthItems.reduce((acc, it) => acc + (it.total || 0), 0);
    const budget = config.monthlyBudget || 0;

    let text = `🎯 *PENGATURAN BUDGET BULANAN*\n\n`;
    if (budget > 0) {
      const remaining = budget - totalMonthSpend;
      const percentUsed = Math.min(100, Math.round((totalMonthSpend / budget) * 100));
      text += `💰 *Batas Bulan Ini:* *${formatCurrencyIDR(budget)}*\n` +
        `💸 *Sudah Dibelanjakan:* *${formatCurrencyIDR(totalMonthSpend)}*\n` +
        `💵 *Sisa Budget:* *${formatCurrencyIDR(remaining)}* (${100 - percentUsed}% tersisa)\n\n`;
    } else {
      text += `Status: _Belum diatur_\n\n`;
    }
    text += `Untuk mengatur atau mengubah batas budget bulanan, ketik di chat:\n` +
      `\`/budget 3000000\` atau \`/budget 3jt\`\n\n` +
      `_Ketik \`/budget 0\` untuk menonaktifkan._`;

    await sendTelegramMessage(botToken, chatId, text, 'Markdown', {
      inline_keyboard: [
        [{ text: '📊 Rekap Belanja', callback_data: 'cmd_rekap' }],
      ],
    });
    return;
  }

  // 9B. Download Rekap File directly via Telegram Callback
  if (action === 'download_rekap') {
    await answerCallbackQuery(botToken, cb.id, '⏳ Menyiapkan file rekap CSV/Excel...');
    const expenses = getExpenses();
    if (expenses.length === 0) {
      await sendTelegramMessage(botToken, chatId, 'ℹ️ Belum ada catatan belanja untuk didownload.', 'Markdown');
      return;
    }

    await sendChatAction(botToken, chatId, 'upload_document');
    const csvContent = generateCsvContent(expenses);
    const filename = `rekap-belanja-${new Date().toISOString().split('T')[0]}.csv`;
    const totalSpend = expenses.reduce((acc, it) => acc + (it.total || 0), 0);
    const caption = `📥 *File Rekap Belanjaan* (${expenses.length} item)\n💰 *Total:* ${formatCurrencyIDR(totalSpend)}\n\n_Dapat langsung dibuka di Microsoft Excel, Google Sheets, atau Numbers di iPhone kamu!_`;

    await sendTelegramDocument(botToken, chatId, csvContent, filename, caption);
    return;
  }

  // 10. Ask Clear All Confirmation via Button
  if (action === 'ask_clear_all') {
    await answerCallbackQuery(botToken, cb.id);
    const expenses = getExpenses();
    const count = expenses.length;
    if (count === 0) {
      await sendTelegramMessage(botToken, chatId, 'ℹ️ Daftar belanjaan sudah kosong. Tidak ada data yang perlu dihapus.', 'Markdown');
      return;
    }

    const totalSpend = expenses.reduce((acc, it) => acc + (it.total || 0), 0);
    const config = getConfig();
    const hasSheets = !!config.googleSheetsWebhookUrl;

    const confText = `⚠️ *KONFIRMASI HAPUS SEMUA DATA BELANJA*\n\n` +
      `Apakah Anda yakin ingin menghapus *seluruh catatan belanjaan*?\n\n` +
      `📦 *Jumlah Catatan:* ${count} item\n` +
      `💰 *Total Pengeluaran:* *${formatCurrencyIDR(totalSpend)}*\n` +
      `📊 *Google Sheets:* ${hasSheets ? '✅ Baris di Google Sheets juga akan dikosongkan' : 'ℹ️ Belum terhubung'}\n\n` +
      `_Peringatan: Tindakan ini tidak dapat dibatalkan._`;

    const confMarkup: TelegramInlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: '🔴 Ya, Hapus Semua Data', callback_data: 'do_clear_all' },
        ],
        [
          { text: '❌ Batal / Kembali', callback_data: 'page:0' },
        ],
      ],
    };

    if (messageId) {
      await editTelegramMessageText(botToken, chatId, messageId, confText, 'Markdown', confMarkup);
    } else {
      await sendTelegramMessage(botToken, chatId, confText, 'Markdown', confMarkup);
    }
    return;
  }

  // 11. Perform Clear All
  if (action === 'do_clear_all') {
    const count = getExpenses().length;
    const config = getConfig();
    let sheetsStatus = '';

    if (config.googleSheetsWebhookUrl) {
      try {
        const clearRes = await clearAllFromGoogleSheets(config.googleSheetsWebhookUrl);
        if (clearRes.success) {
          sheetsStatus = '\n📊 *Google Sheets:* ✅ Seluruh baris data di Spreadsheet telah dikosongkan!';
        } else {
          sheetsStatus = `\n⚠️ *Google Sheets:* ${clearRes.message}`;
        }
      } catch (err: any) {
        sheetsStatus = `\n⚠️ *Google Sheets:* Gagal membersihkan spreadsheet: ${err.message}`;
      }
    }

    clearAllExpenses();
    await answerCallbackQuery(botToken, cb.id, `✅ Seluruh ${count} item belanja berhasil dihapus!`, false);

    const doneText = `🗑️ *SEMUA DATA BELANJA TELAH DIHAPUS*\n\n` +
      `• Berhasil menghapus *${count} item* belanjaan dari aplikasi.${sheetsStatus}\n\n` +
      `_Database kini bersih. Kirim foto bon belanja atau ketik catatan belanja baru kapan saja untuk mulai mencatat!_`;

    const doneMarkup: TelegramInlineKeyboardMarkup = {
      inline_keyboard: [
        [{ text: '📋 Buka Daftar Belanja (Kosong)', callback_data: 'page:0' }],
      ],
    };

    if (messageId) {
      await editTelegramMessageText(botToken, chatId, messageId, doneText, 'Markdown', doneMarkup);
    } else {
      await sendTelegramMessage(botToken, chatId, doneText, 'Markdown', doneMarkup);
    }
    return;
  }

  // Default fallback for unhandled callbacks
  await answerCallbackQuery(botToken, cb.id);
}

/**
 * Unified processor for incoming Telegram updates (Webhook and Long Polling)
 */
export async function processTelegramUpdate(update: TelegramUpdate): Promise<void> {
  const config = getConfig();
  const botToken = config.telegramBotToken;

  if (!botToken) return;

  // A. HANDLE INLINE BUTTON CALLBACK QUERY (Edit, Hapus, Pagination, etc.)
  if (update.callback_query) {
    try {
      await handleCallbackQuery(update.callback_query, botToken);
    } catch (err: any) {
      console.error('Error in handleCallbackQuery:', err);
    }
    return;
  }

  if (!update.message) {
    return;
  }

  const msg = update.message;
  const chatId = msg.chat.id;
  const userName = msg.from?.first_name || 'Teman';

  // B. CASE: USER SENT A RECEIPT PHOTO (OCR)
  if (msg.photo && msg.photo.length > 0) {
    // Get the highest resolution photo from this specific message
    const highestPhoto = msg.photo[msg.photo.length - 1];
    const photoUniqueKey = highestPhoto.file_unique_id || highestPhoto.file_id || `msg-${msg.message_id}`;

    // Prevent duplicate processing of the same photo
    if (isPhotoAlreadyProcessed(photoUniqueKey)) {
      console.log(`[Telegram OCR] Skipping duplicate photo: ${photoUniqueKey}`);
      return;
    }

    try {
      await sendChatAction(botToken, chatId, 'upload_photo');
      await sendTelegramMessage(
        botToken,
        chatId,
        `🔍 *Menganalisis Bon Belanjaan...*\nAI sedang memindai foto struk belanjaan ini secara terpisah. Mohon tunggu beberapa detik...`,
        'Markdown'
      );

      const { base64, mimeType } = await downloadTelegramPhoto(botToken, highestPhoto.file_id);

      // Perform Gemini OCR
      const parsed = await parseReceiptImage(base64, mimeType);

      const receiptId = `rcpt-tg-${Date.now()}`;
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
        source: 'telegram_ocr',
        receiptId,
        notes: parsed.rawNotes || '',
        syncedToSheets: false,
        createdAt: new Date().toISOString(),
      }));

      // Sync to Google Sheets if configured
      let sheetsStatusText = '📋 Tersimpan di database aplikasi.';
      if (config.googleSheetsWebhookUrl) {
        const syncRes = await syncItemsToGoogleSheets(config.googleSheetsWebhookUrl, newItems);
        if (syncRes.success) {
          newItems.forEach(i => (i.syncedToSheets = true));
          sheetsStatusText = '📊 *Google Sheets:* ✅ Berhasil otomatis dimasukkan ke Spreadsheet!';
        } else {
          sheetsStatusText = `⚠️ *Google Sheets:* Gagal sync (${syncRes.message}), tersimpan di database aplikasi.`;
        }
      } else {
        sheetsStatusText = `ℹ️ *Google Sheets:* Belum dihubungkan. Data tersimpan di aplikasi web.`;
      }

      // Save to storage
      addExpenses(newItems);
      addReceipt({
        id: receiptId,
        date: parsed.date,
        time: parsed.time,
        store: parsed.storeName,
        grandTotal: parsed.grandTotal,
        itemCount: parsed.items.length,
        source: 'telegram',
        items: newItems,
        createdAt: new Date().toISOString(),
      });

      // Compose rich Telegram response
      const itemsList = parsed.items
        .map(
          (it, i) =>
            `${i + 1}. *${it.name}*\n   ↳ ${it.qty} ${it.unit} × ${formatCurrencyIDR(it.price)} = *${formatCurrencyIDR(it.total)}* _[${it.category}]_`
        )
        .join('\n');

      let budgetNotice = '';
      if (config.monthlyBudget && config.monthlyBudget > 0) {
        const currentMonth = (parsed.date || new Date().toISOString()).substring(0, 7);
        const allExpenses = getExpenses();
        const thisMonthSpend = allExpenses
          .filter(i => i.date.startsWith(currentMonth))
          .reduce((sum, i) => sum + (i.total || 0), 0);
        const rem = config.monthlyBudget - thisMonthSpend;
        const pct = Math.min(100, Math.round((thisMonthSpend / config.monthlyBudget) * 100));
        if (rem < 0) {
          budgetNotice = `\n🚨 *PERINGATAN BUDGET:* Terpakai ${pct}% (${formatCurrencyIDR(thisMonthSpend)} / ${formatCurrencyIDR(config.monthlyBudget)}). *Melebihi budget ${formatCurrencyIDR(Math.abs(rem))}!*\n`;
        } else {
          budgetNotice = `\n🎯 *Sisa Budget Bulan Ini:* *${formatCurrencyIDR(rem)}* (Terpakai ${pct}%)\n`;
        }
      }

      const responseText = `🧾 *STRUK BELANJA BERHASIL DICATAT!*\n\n` +
        `🏪 *Toko:* ${parsed.storeName}\n` +
        `📅 *Tanggal:* ${parsed.date}${parsed.time ? ` (${parsed.time})` : ''}\n` +
        `📦 *Jumlah Item:* ${parsed.items.length} macam\n\n` +
        `🛒 *Daftar Belanja:* \n${itemsList}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `💰 *Grand Total:* *${formatCurrencyIDR(parsed.grandTotal)}*\n` +
        (parsed.paymentMethod ? `💳 *Pembayaran:* ${parsed.paymentMethod}\n` : '') +
        `${sheetsStatusText}\n` +
        budgetNotice +
        `\n_Ketik /daftar untuk melihat & mengedit barang yang sudah tercatat._`;

      await sendTelegramMessage(botToken, chatId, responseText, 'Markdown', {
        inline_keyboard: [
          [
            { text: '📋 Lihat & Kelola Data Belanja', callback_data: 'page:0' },
          ],
        ],
      });
    } catch (err: any) {
      console.error('Error in Telegram OCR handler:', err);
      await sendTelegramMessage(
        botToken,
        chatId,
        `❌ *Maaf, gagal memproses foto struk:*\n_${err.message || 'Format foto tidak terbaca'}_\n\nTips:\n• Pastikan foto struk terang dan tidak blur\n• Foto tegak lurus dari atas\n• Kamu juga bisa input manual dengan mengetik nama barang dan harganya!`,
        'Markdown'
      );
    }
    return;
  }

  // C. CASE: USER SENT TEXT MESSAGE OR COMMAND
  const text = (msg.text || msg.caption || '').trim();
  if (!text) return;

  // Command: /start, /help, /bantuan
  if (text.startsWith('/start') || text.startsWith('/help') || text.startsWith('/bantuan')) {
    const welcomeText = `👋 *Halo ${userName}! Selamat datang di Catat Belanjaan & OCR Bon* 🛒\n\n` +
      `Bot ini membantu kamu mencatat belanjaan dapur & rumah tangga dengan mudah langsung dari Telegram iPhone kamu!\n\n` +
      `📋 *Fitur & Perintah:* \n` +
      `• \`/daftar\` atau \`/lihat\` : *Lihat data belanja lengkap* dengan tombol *Edit (✏️)* dan *Hapus (🗑️)*\n` +
      `• \`/rekap\` : Ringkasan total pengeluaran belanja & status sisa budget\n` +
      `• \`/budget <nominal>\` : Atur batas budget bulanan (misal \`/budget 3jt\` atau \`/budget 2500000\`)\n` +
      `• \`/download\` : Unduh file rekap belanja (CSV / Excel) langsung ke chat\n` +
      `• \`/hapus <ID>\` : Hapus satu barang tertentu\n` +
      `• \`/hapus_semua\` : Hapus *seluruh data belanja* sekaligus & kosongkan Google Sheets\n` +
      `• \`/link\` : Buka dashboard web & spreadsheet live\n\n` +
      `📸 *1. Foto Bon / Struk Belanja (Otomatis OCR):*\n` +
      `Ambil foto struk dari kamera iPhone kamu (kirim 1 atau 3 foto bon sekaligus), AI memindai masing-masing foto secara terpisah tanpa pengulangan!\n\n` +
      `✍️ *2. Input Manual Cepat:*\n` +
      `Ketik langsung daftar belanjaan kamu, contoh:\n` +
      `• \`Beras 5kg 75000\`\n` +
      `• \`Minyak goreng 2L 35rb, Telur 1kg 28rb di Superindo\`\n` +
      `• \`Bayam 2 ikat 6000, Tempe 10000 di Pasar\`\n\n` +
      `✏️ *3. Edit / Hapus Cepat:*\n` +
      `Ketik \`/daftar\` lalu gunakan tombol interaktif yang tersemat pada pesan!`;

    await sendTelegramMessage(botToken, chatId, welcomeText, 'Markdown', {
      inline_keyboard: [
        [
          { text: '📋 Lihat Data Belanjaan', callback_data: 'page:0' },
          { text: '📊 Rekap Pengeluaran', callback_data: 'cmd_rekap' },
        ],
        [
          { text: '📥 Download File Rekap', callback_data: 'download_rekap' },
          { text: '🗑️ Hapus Semua Data', callback_data: 'ask_clear_all' },
        ],
      ],
    });
    return;
  }

  // Command: /daftar, /lihat, /belanja, /list, /items, /data
  if (
    text.startsWith('/daftar') ||
    text.startsWith('/lihat') ||
    text.startsWith('/belanja') ||
    text.startsWith('/list') ||
    text.startsWith('/items') ||
    text.startsWith('/data')
  ) {
    const { text: listText, replyMarkup } = renderExpensesListMessage(0);
    await sendTelegramMessage(botToken, chatId, listText, 'Markdown', replyMarkup);
    return;
  }

  // Command: /rekap or /total
  if (text.startsWith('/rekap') || text.startsWith('/total')) {
    const expenses = getExpenses();
    const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
    const thisMonthItems = expenses.filter(i => i.date.startsWith(currentMonth));
    const totalMonthSpend = thisMonthItems.reduce((acc, it) => acc + (it.total || 0), 0);
    const todayDate = new Date().toISOString().split('T')[0];
    const todayItems = expenses.filter(i => i.date === todayDate);
    const totalTodaySpend = todayItems.reduce((acc, it) => acc + (it.total || 0), 0);

    const recentItems = expenses.slice(0, 5);
    const recentList = recentItems.length > 0
      ? recentItems.map(it => `• ${it.date.substring(5)}: *${it.name}* (${it.qty} ${it.unit}) = ${formatCurrencyIDR(it.total)}`).join('\n')
      : '_Belum ada catatan belanja._';

    const summaryText = `📊 *REKAP PENGELUARAN BELANJA*\n\n` +
      `📅 *Hari Ini:* *${formatCurrencyIDR(totalTodaySpend)}* (${todayItems.length} barang)\n` +
      `🗓️ *Bulan Ini (${currentMonth}):* *${formatCurrencyIDR(totalMonthSpend)}* (${thisMonthItems.length} barang)\n` +
      (config.monthlyBudget && config.monthlyBudget > 0
        ? (() => {
            const budget = config.monthlyBudget;
            const remaining = budget - totalMonthSpend;
            const percentUsed = Math.min(100, Math.round((totalMonthSpend / budget) * 100));
            const barLength = 10;
            const filledCount = Math.min(barLength, Math.max(0, Math.round((percentUsed / 100) * barLength)));
            const bar = '█'.repeat(filledCount) + '░'.repeat(barLength - filledCount);
            const statusIcon = remaining < 0 ? '🚨 *OVER BUDGET!*' : percentUsed >= 85 ? '⚠️ *Hampir Habis!*' : '✅ *Aman*';
            return `🎯 *Budget Bulanan:* *${formatCurrencyIDR(budget)}*\n` +
              `📊 *Progress:* [${bar}] ${percentUsed}%\n` +
              `💰 *Sisa Budget:* *${formatCurrencyIDR(remaining)}* (${statusIcon})\n`;
          })()
        : `🎯 *Budget Bulanan:* _Belum diatur (Ketik /budget <nominal>)_\n`) +
      `📦 *Total Keseluruhan:* ${expenses.length} item tercatat\n\n` +
      `🕒 *5 Belanjaan Terakhir:*\n${recentList}\n\n` +
      `_Gunakan tombol di bawah untuk melihat & mengedit seluruh data belanja atau mengunduh file rekap._`;

    await sendTelegramMessage(botToken, chatId, summaryText, 'Markdown', {
      inline_keyboard: [
        [
          { text: '📥 Download File Rekap (Excel/CSV)', callback_data: 'download_rekap' },
        ],
        [
          { text: '📋 Lihat Data Belanjaan Lengkap', callback_data: 'page:0' },
          { text: '🎯 Atur Budget', callback_data: 'cmd_budget_info' },
        ],
      ],
    });
    return;
  }

  // Command: /budget or /anggaran
  if (text.startsWith('/budget') || text.startsWith('/anggaran')) {
    const parts = text.split(/\s+/);
    const param = parts[1]?.trim();

    if (!param) {
      const expenses = getExpenses();
      const currentMonth = new Date().toISOString().substring(0, 7);
      const thisMonthItems = expenses.filter(i => i.date.startsWith(currentMonth));
      const totalMonthSpend = thisMonthItems.reduce((acc, it) => acc + (it.total || 0), 0);
      const budget = config.monthlyBudget || 0;

      let budgetMsg = `🎯 *PENGATURAN BUDGET BULANAN*\n\n`;
      if (budget > 0) {
        const remaining = budget - totalMonthSpend;
        const percentUsed = Math.min(100, Math.round((totalMonthSpend / budget) * 100));
        const barLength = 10;
        const filled = Math.min(barLength, Math.max(0, Math.round((percentUsed / 100) * barLength)));
        const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
        const statusAlert = remaining < 0 ? '🚨 *Melebihi Batas Budget!*' : percentUsed >= 85 ? '⚠️ *Mendekati Batas!*' : '✅ *Masih Dalam Batas*';

        budgetMsg += `💰 *Batas Budget:* *${formatCurrencyIDR(budget)}*\n` +
          `💸 *Sudah Terpakai:* *${formatCurrencyIDR(totalMonthSpend)}* (${thisMonthItems.length} belanjaan)\n` +
          `📊 *Progress:* [${bar}] ${percentUsed}%\n` +
          `💵 *Sisa Budget:* *${formatCurrencyIDR(remaining)}* (${statusAlert})\n\n` +
          `Untuk mengubah nominal budget, ketik:\n` +
          `\`/budget <nominal>\` (contoh: \`/budget 3000000\` atau \`/budget 3jt\`)\n` +
          `Ketik \`/budget 0\` untuk menonaktifkan.`;
      } else {
        budgetMsg += `Status: _Belum diatur_\n\n` +
          `Atur batas pengeluaran bulanan agar kamu bisa memantau sisa uang belanja setiap saat!\n\n` +
          `Cara mengatur:\n` +
          `\`/budget 2500000\` atau \`/budget 2.5jt\`\n` +
          `Contoh: \`/budget 3000000\``;
      }

      await sendTelegramMessage(botToken, chatId, budgetMsg, 'Markdown', {
        inline_keyboard: [
          [
            { text: '📊 Lihat Rekap Belanja', callback_data: 'cmd_rekap' },
          ],
        ],
      });
      return;
    }

    // Parse budget amount (supports: 2.500.000, 2500000, 2.5jt, 2jt, 500k, 500rb)
    let rawStr = param.toLowerCase().replace(/rp\.?/g, '').trim();
    let multiplier = 1;
    if (rawStr.includes('jt') || rawStr.includes('juta')) {
      multiplier = 1000000;
      rawStr = rawStr.replace(/jt|juta/g, '');
    } else if (rawStr.includes('k') || rawStr.includes('rb') || rawStr.includes('ribu')) {
      multiplier = 1000;
      rawStr = rawStr.replace(/k|rb|ribu/g, '');
    }
    rawStr = rawStr.replace(/[.,]/g, match => (multiplier > 1 ? '.' : ''));
    const parsedNum = parseFloat(rawStr) * multiplier;

    if (isNaN(parsedNum) || parsedNum < 0) {
      await sendTelegramMessage(
        botToken,
        chatId,
        `⚠️ *Format Budget Tidak Valid*\n\nContoh yang benar:\n• \`/budget 3000000\`\n• \`/budget 2.5jt\`\n• \`/budget 1500k\`\n• \`/budget 0\` (untuk menghapus batas)`,
        'Markdown'
      );
      return;
    }

    const newBudget = Math.round(parsedNum);
    updateConfig({ monthlyBudget: newBudget });

    const expenses = getExpenses();
    const currentMonth = new Date().toISOString().substring(0, 7);
    const thisMonthItems = expenses.filter(i => i.date.startsWith(currentMonth));
    const totalMonthSpend = thisMonthItems.reduce((acc, it) => acc + (it.total || 0), 0);

    if (newBudget === 0) {
      await sendTelegramMessage(
        botToken,
        chatId,
        `✅ *Batas Budget Bulanan Dinonaktifkan.*\nKamu tetap bisa mencatat belanjaan seperti biasa tanpa pembatasan budget.`,
        'Markdown'
      );
    } else {
      const remaining = newBudget - totalMonthSpend;
      const percentUsed = Math.min(100, Math.round((totalMonthSpend / newBudget) * 100));
      await sendTelegramMessage(
        botToken,
        chatId,
        `🎯 *BUDGET BULANAN BERHASIL DISIMPAN!*\n\n` +
        `💰 *Batas Bulan Ini:* *${formatCurrencyIDR(newBudget)}*\n` +
        `💸 *Sudah Dibelanjakan:* *${formatCurrencyIDR(totalMonthSpend)}*\n` +
        `💵 *Sisa Budget Kamu:* *${formatCurrencyIDR(remaining)}* (${100 - percentUsed}% tersisa)\n\n` +
        `_Bot akan otomatis mengupdate sisa budget setiap kali kamu memindai foto struk atau mencatat belanja baru!_`,
        'Markdown',
        {
          inline_keyboard: [
            [{ text: '📊 Rekap Belanja', callback_data: 'cmd_rekap' }],
          ],
        }
      );
    }
    return;
  }

  // Command: /download, /export, /unduh, /unduh_rekap, /download_rekap, /csv, /excel
  if (
    text.startsWith('/download') ||
    text.startsWith('/unduh') ||
    text.startsWith('/export') ||
    text.startsWith('/csv') ||
    text.startsWith('/excel')
  ) {
    const expenses = getExpenses();
    if (expenses.length === 0) {
      await sendTelegramMessage(botToken, chatId, 'ℹ️ *Belum ada data belanjaan* yang tersimpan untuk didownload.', 'Markdown');
      return;
    }

    await sendChatAction(botToken, chatId, 'upload_document');
    const csvContent = generateCsvContent(expenses);
    const filename = `rekap-belanja-${new Date().toISOString().split('T')[0]}.csv`;
    const totalSpend = expenses.reduce((acc, it) => acc + (it.total || 0), 0);
    const caption = `📥 *File Rekap Belanjaan* (${expenses.length} item)\n💰 *Total Pengeluaran:* *${formatCurrencyIDR(totalSpend)}*\n\n_File CSV dapat langsung dibuka di Microsoft Excel, Google Sheets, atau aplikasi Numbers di iPhone._`;

    await sendTelegramDocument(botToken, chatId, csvContent, filename, caption);
    return;
  }

  // Command: /hapus_semua, /hapussemua, /hapus semua, /reset, /clear_all
  const lowerText = text.toLowerCase();
  const isClearAllCmd =
    lowerText === '/hapus_semua' ||
    lowerText.startsWith('/hapus_semua ') ||
    lowerText === '/hapussemua' ||
    lowerText.startsWith('/hapussemua ') ||
    lowerText === '/hapus semua' ||
    lowerText.startsWith('/hapus semua ') ||
    lowerText === '/reset' ||
    lowerText.startsWith('/reset ') ||
    lowerText === '/clear' ||
    lowerText.startsWith('/clear ') ||
    lowerText === '/clear_all' ||
    lowerText.startsWith('/clear_all ') ||
    lowerText === '/cleardata' ||
    lowerText.startsWith('/cleardata ');

  if (isClearAllCmd) {
    const expenses = getExpenses();
    const count = expenses.length;
    if (count === 0) {
      await sendTelegramMessage(
        botToken,
        chatId,
        `ℹ️ *Daftar Belanjaan Kosong*\n\nTidak ada catatan belanja yang tersimpan saat ini.`,
        'Markdown'
      );
      return;
    }

    const parts = text.split(/\s+/);
    // Check if user confirmed directly via text (e.g., "/hapus_semua konfirmasi" or "/hapus_semua ya")
    const isConfirmed = parts.some(p => ['konfirmasi', 'confirm', 'ya', 'yes', 'ok'].includes(p.toLowerCase()));

    if (!isConfirmed) {
      const totalSpend = expenses.reduce((acc, it) => acc + (it.total || 0), 0);
      const hasSheets = !!config.googleSheetsWebhookUrl;

      const confText = `⚠️ *KONFIRMASI HAPUS SEMUA DATA BELANJA*\n\n` +
        `Apakah Anda yakin ingin menghapus *seluruh catatan belanjaan*?\n\n` +
        `📦 *Jumlah Catatan:* ${count} item\n` +
        `💰 *Total Pengeluaran:* *${formatCurrencyIDR(totalSpend)}*\n` +
        `📊 *Google Sheets:* ${hasSheets ? '✅ Seluruh baris di Spreadsheet juga akan dikosongkan' : 'ℹ️ Belum terhubung'}\n\n` +
        `_Peringatan: Tindakan ini tidak dapat dibatalkan._\n` +
        `_Silakan ketuk tombol di bawah untuk konfirmasi, atau ketik:_ \`/hapus_semua konfirmasi\``;

      await sendTelegramMessage(botToken, chatId, confText, 'Markdown', {
        inline_keyboard: [
          [
            { text: '🔴 Ya, Hapus Semua Data', callback_data: 'do_clear_all' },
          ],
          [
            { text: '❌ Batal / Kembali', callback_data: 'page:0' },
          ],
        ],
      });
      return;
    }

    // Direct execution when confirmed
    let sheetsStatus = '';
    if (config.googleSheetsWebhookUrl) {
      try {
        const clearRes = await clearAllFromGoogleSheets(config.googleSheetsWebhookUrl);
        if (clearRes.success) {
          sheetsStatus = '\n📊 *Google Sheets:* ✅ Seluruh baris data di Spreadsheet telah dikosongkan!';
        } else {
          sheetsStatus = `\n⚠️ *Google Sheets:* ${clearRes.message}`;
        }
      } catch (err: any) {
        sheetsStatus = `\n⚠️ *Google Sheets:* Gagal membersihkan spreadsheet: ${err.message}`;
      }
    }

    clearAllExpenses();

    await sendTelegramMessage(
      botToken,
      chatId,
      `🗑️ *SEMUA DATA BELANJA TELAH DIHAPUS*\n\n` +
      `• Berhasil menghapus *${count} item* belanjaan dari aplikasi.${sheetsStatus}\n\n` +
      `_Database kini bersih. Kirim foto bon belanja atau ketik catatan belanja baru kapan saja untuk mulai mencatat!_`,
      'Markdown',
      {
        inline_keyboard: [
          [{ text: '📋 Buka Daftar Belanja', callback_data: 'page:0' }],
        ],
      }
    );
    return;
  }

  // Command: /hapus <id>
  if (text.startsWith('/hapus')) {
    const parts = text.split(/\s+/);
    const itemId = parts[1]?.trim();
    if (!itemId) {
      await sendTelegramMessage(
        botToken,
        chatId,
        `⚠️ *Format Perintah Hapus:*\nKetik: \`/hapus <ID_BARANG>\`\n\nContoh: \`/hapus item-123\`\n\n_Atau ketik \`/daftar\` untuk menghapus via tombol interaktif!_`,
        'Markdown'
      );
      return;
    }

    const existing = getExpenses().find(i => i.id === itemId);
    if (!existing) {
      await sendTelegramMessage(botToken, chatId, `⚠️ Barang dengan ID \`${itemId}\` tidak ditemukan.`, 'Markdown');
      return;
    }

    deleteExpense(itemId);

    let sheetsStatus = '';
    if (config.googleSheetsWebhookUrl) {
      try {
        const syncRes = await deleteItemsFromGoogleSheets(
          config.googleSheetsWebhookUrl,
          [itemId],
          [existing]
        );
        if (syncRes.success) {
          sheetsStatus = '\n📊 *Google Sheets:* ✅ Baris data di Spreadsheet juga telah dihapus!';
        } else {
          sheetsStatus = `\n⚠️ *Google Sheets:* ${syncRes.message}`;
        }
      } catch (err: any) {
        sheetsStatus = `\n⚠️ *Google Sheets:* Gagal menghapus baris spreadsheet: ${err.message}`;
      }
    }

    await sendTelegramMessage(
      botToken,
      chatId,
      `✅ Berhasil menghapus barang: *${existing.name}* (${formatCurrencyIDR(existing.total)}).${sheetsStatus}`,
      'Markdown',
      {
        inline_keyboard: [
          [{ text: '📋 Buka Daftar Belanjaan', callback_data: 'page:0' }],
        ],
      }
    );
    return;
  }

  // Command: /harga <id> <nominal>
  if (text.startsWith('/harga')) {
    const parts = text.split(/\s+/);
    const itemId = parts[1]?.trim();
    const priceStr = parts[2]?.replace(/[^0-9]/g, '');

    if (!itemId || !priceStr) {
      await sendTelegramMessage(
        botToken,
        chatId,
        `⚠️ *Format Ubah Harga:*\nKetik: \`/harga <ID_BARANG> <HARGA_BARU>\`\nContoh: \`/harga item-1 45000\``,
        'Markdown'
      );
      return;
    }

    const newPrice = parseInt(priceStr, 10);
    const item = getExpenses().find(i => i.id === itemId);
    if (!item) {
      await sendTelegramMessage(botToken, chatId, `⚠️ Barang dengan ID \`${itemId}\` tidak ditemukan.`, 'Markdown');
      return;
    }

    const newTotal = (item.qty || 1) * newPrice;
    updateExpense(itemId, { price: newPrice, total: newTotal });

    await sendTelegramMessage(
      botToken,
      chatId,
      `✅ *Harga Berhasil Diperbarui!*\n\n` +
      `📦 *Barang:* ${item.name}\n` +
      `💰 *Harga Satuan Baru:* ${formatCurrencyIDR(newPrice)}\n` +
      `💵 *Total Baru:* *${formatCurrencyIDR(newTotal)}* (${item.qty} ${item.unit})`,
      'Markdown',
      {
        inline_keyboard: [
          [{ text: '✏️ Kelola Barang Ini', callback_data: `edit:${itemId}:0` }],
          [{ text: '📋 Buka Daftar Belanja', callback_data: 'page:0' }],
        ],
      }
    );
    return;
  }

  // Command: /nama <id> <nama_baru>
  if (text.startsWith('/nama')) {
    const parts = text.split(/\s+/);
    const itemId = parts[1]?.trim();
    const newName = parts.slice(2).join(' ').trim();

    if (!itemId || !newName) {
      await sendTelegramMessage(
        botToken,
        chatId,
        `⚠️ *Format Ubah Nama:*\nKetik: \`/nama <ID_BARANG> <NAMA_BARU>\`\nContoh: \`/nama item-1 Minyak Sania 2L\``,
        'Markdown'
      );
      return;
    }

    const item = getExpenses().find(i => i.id === itemId);
    if (!item) {
      await sendTelegramMessage(botToken, chatId, `⚠️ Barang dengan ID \`${itemId}\` tidak ditemukan.`, 'Markdown');
      return;
    }

    updateExpense(itemId, { name: newName });
    await sendTelegramMessage(
      botToken,
      chatId,
      `✅ *Nama Barang Berhasil Diubah!*\n\n` +
      `📦 *Nama Baru:* *${newName}*\n` +
      `💵 *Total:* ${formatCurrencyIDR(item.total)}`,
      'Markdown',
      {
        inline_keyboard: [
          [{ text: '✏️ Kelola Barang Ini', callback_data: `edit:${itemId}:0` }],
          [{ text: '📋 Buka Daftar Belanja', callback_data: 'page:0' }],
        ],
      }
    );
    return;
  }

  // Command: /qty <id> <jumlah>
  if (text.startsWith('/qty')) {
    const parts = text.split(/\s+/);
    const itemId = parts[1]?.trim();
    const qtyStr = parts[2]?.replace(/[^0-9.]/g, '');

    if (!itemId || !qtyStr) {
      await sendTelegramMessage(
        botToken,
        chatId,
        `⚠️ *Format Ubah Jumlah:*\nKetik: \`/qty <ID_BARANG> <JUMLAH>\`\nContoh: \`/qty item-1 3\``,
        'Markdown'
      );
      return;
    }

    const newQty = parseFloat(qtyStr);
    const item = getExpenses().find(i => i.id === itemId);
    if (!item) {
      await sendTelegramMessage(botToken, chatId, `⚠️ Barang dengan ID \`${itemId}\` tidak ditemukan.`, 'Markdown');
      return;
    }

    const newTotal = newQty * (item.price || 0);
    updateExpense(itemId, { qty: newQty, total: newTotal });

    await sendTelegramMessage(
      botToken,
      chatId,
      `✅ *Jumlah Barang Berhasil Diubah!*\n\n` +
      `📦 *Barang:* ${item.name}\n` +
      `🔢 *Jumlah Baru:* ${newQty} ${item.unit}\n` +
      `💵 *Total Baru:* *${formatCurrencyIDR(newTotal)}*`,
      'Markdown',
      {
        inline_keyboard: [
          [{ text: '✏️ Kelola Barang Ini', callback_data: `edit:${itemId}:0` }],
          [{ text: '📋 Buka Daftar Belanja', callback_data: 'page:0' }],
        ],
      }
    );
    return;
  }

  // Command: /link
  if (text.startsWith('/link') || text.startsWith('/web') || text.startsWith('/spreadsheet')) {
    const appUrl = process.env.APP_URL || '';
    const linkText = `📑 *Buka Spreadsheet & Dashboard Belanja:*\n\n` +
      `Kamu bisa melihat tabel spreadsheet lengkap, ekspor Excel/CSV, dan memantau analitik belanjaan di:\n` +
      `👉 ${appUrl || 'Buka aplikasi web Catat Belanja di browser Anda'}\n\n` +
      `💡 _Tips iPhone: Tambahkan ke Home Screen via Safari (Share > Add to Home Screen) untuk akses cepat seperti aplikasi bawaan!_`;

    await sendTelegramMessage(botToken, chatId, linkText, 'Markdown', {
      inline_keyboard: [
        [
          { text: '📋 Lihat Data Belanja di Telegram', callback_data: 'page:0' },
        ],
      ],
    });
    return;
  }

  // D. CASE: NATURAL LANGUAGE OR MANUAL EXPENSE TEXT
  try {
    await sendChatAction(botToken, chatId, 'typing');
    let cleanText = text;
    if (cleanText.startsWith('/catat ')) {
      cleanText = cleanText.substring(7).trim();
    }

    const parsed = await parseTextExpense(cleanText);

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
      source: 'telegram_manual',
      syncedToSheets: false,
      createdAt: new Date().toISOString(),
    }));

    let sheetsStatusText = '📋 Tersimpan di database aplikasi.';
    if (config.googleSheetsWebhookUrl) {
      const syncRes = await syncItemsToGoogleSheets(config.googleSheetsWebhookUrl, newItems);
      if (syncRes.success) {
        newItems.forEach(i => (i.syncedToSheets = true));
        sheetsStatusText = '📊 *Google Sheets:* ✅ Masuk ke Spreadsheet!';
      }
    }

    addExpenses(newItems);

    const itemsList = parsed.items
      .map(it => `• *${it.name}* (${it.qty} ${it.unit}) : ${formatCurrencyIDR(it.total)}`)
      .join('\n');

    let budgetNotice = '';
    if (config.monthlyBudget && config.monthlyBudget > 0) {
      const currentMonth = (parsed.date || new Date().toISOString()).substring(0, 7);
      const allExpenses = getExpenses();
      const thisMonthSpend = allExpenses
        .filter(i => i.date.startsWith(currentMonth))
        .reduce((sum, i) => sum + (i.total || 0), 0);
      const rem = config.monthlyBudget - thisMonthSpend;
      const pct = Math.min(100, Math.round((thisMonthSpend / config.monthlyBudget) * 100));
      if (rem < 0) {
        budgetNotice = `\n🚨 *PERINGATAN BUDGET:* Terpakai ${pct}% (${formatCurrencyIDR(thisMonthSpend)} / ${formatCurrencyIDR(config.monthlyBudget)}). *Melebihi budget ${formatCurrencyIDR(Math.abs(rem))}!*\n`;
      } else {
        budgetNotice = `\n🎯 *Sisa Budget Bulan Ini:* *${formatCurrencyIDR(rem)}* (Terpakai ${pct}%)\n`;
      }
    }

    const reply = `✅ *Belanjaan Berhasil Dicatat!*\n\n` +
      `🏪 *Toko:* ${parsed.storeName}\n` +
      `🛒 *Item:*\n${itemsList}\n\n` +
      `💰 *Total:* *${formatCurrencyIDR(parsed.grandTotal)}*\n` +
      `${sheetsStatusText}\n` +
      budgetNotice +
      `\n_Ketik /daftar untuk melihat & mengedit barang._`;

    await sendTelegramMessage(botToken, chatId, reply, 'Markdown', {
      inline_keyboard: [
        [
          { text: '📋 Lihat Data Belanjaan', callback_data: 'page:0' },
        ],
      ],
    });
  } catch (err: any) {
    console.error('Error parsing text expense from Telegram:', err);
    await sendTelegramMessage(
      botToken,
      chatId,
      `⚠️ Tidak dapat membaca format teks belanjaan.\n\nContoh yang benar:\n• \`Beras 5kg 75000\`\n• \`Minyak goreng 2L 35rb di Superindo\`\n• Ketik \`/daftar\` untuk melihat data belanjaan\n• Atau kirim *foto bon/struk* langsung dari kamera iPhone kamu!`,
      'Markdown',
      {
        inline_keyboard: [
          [
            { text: '📋 Lihat Data Belanjaan', callback_data: 'page:0' },
          ],
        ],
      }
    );
  }
}
