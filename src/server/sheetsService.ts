import { GroceryItem } from './storageService.ts';

// -------------------------------------------------------------
// SCRIPT GOOGLE SHEETS UNTUK BOT TELEGRAM 24/7 & SINKRONISASI DATA
// (Mendukung Catat Teks, OCR Bon Struk Gemini, Hapus, & 24/7 Tanpa Server)
// -------------------------------------------------------------
export const GOOGLE_APPS_SCRIPT_TEMPLATE = `// =============================================================
// SCRIPT GOOGLE SHEETS & BOT TELEGRAM 24/7 (ALWAYS-ON)
// Berjalan langsung di Cloud Google - Bebas Sleep / Bebas Server Mati!
// =============================================================
// Masukkan Bot Token & Gemini API Key di bawah ini (opsional jika sudah otomatis terisi)
var TELEGRAM_BOT_TOKEN = "PASTE_TELEGRAM_BOT_TOKEN_DISINI";
var GEMINI_API_KEY = "PASTE_GEMINI_API_KEY_DISINI";

function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    initHeaderIfEmpty(sheet);

    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
    }

    var data = JSON.parse(e.postData.contents);

    // =========================================================
    // 1. KASUS WEBHOOK TELEGRAM LANGSUNG (MODE 24/7 ALWAYS-ON)
    // =========================================================
    if (data.update_id || data.message || data.callback_query) {
      handleTelegramMessage(data, sheet);
      return ContentService.createTextOutput(JSON.stringify({ ok: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // =========================================================
    // 2. KASUS SINKRONISASI DARI WEB DASHBOARD
    // =========================================================
    var action = data.action || (data.items ? 'add' : '');

    // 2A. AKSI HAPUS (DELETE)
    if (action === 'delete') {
      var idsToDelete = data.ids || (data.id ? [data.id] : []);
      var itemsToDelete = data.items || [];
      var lastRow = sheet.getLastRow();
      var deletedCount = 0;

      if (lastRow > 1 && (idsToDelete.length > 0 || itemsToDelete.length > 0)) {
        var idMap = {};
        for (var k = 0; k < idsToDelete.length; k++) {
          idMap[String(idsToDelete[k]).trim()] = true;
        }
        for (var m = 0; m < itemsToDelete.length; m++) {
          if (itemsToDelete[m] && itemsToDelete[m].id) {
            idMap[String(itemsToDelete[m].id).trim()] = true;
          }
        }

        var colCount = Math.min(sheet.getLastColumn(), 12);
        var values = sheet.getRange(1, 1, lastRow, colCount).getValues();

        for (var r = lastRow; r >= 2; r--) {
          var row = values[r - 1];
          var cellId = String(row[0] || "").trim();
          var shouldDelete = false;

          if (cellId && idMap[cellId]) {
            shouldDelete = true;
          } else if (itemsToDelete.length > 0) {
            var rowDate = String(row[1] || "").trim();
            var rowName = String(row[4] || "").toLowerCase().trim();
            for (var j = 0; j < itemsToDelete.length; j++) {
              var target = itemsToDelete[j];
              if (target && target.name) {
                var targetName = String(target.name).toLowerCase().trim();
                if (rowName === targetName || (rowName.length > 3 && rowName.indexOf(targetName) !== -1)) {
                  if (!target.date || rowDate.indexOf(target.date) !== -1) {
                    shouldDelete = true;
                    break;
                  }
                }
              }
            }
          }

          if (shouldDelete) {
            sheet.deleteRow(r);
            deletedCount++;
          }
        }
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        action: "delete",
        deletedCount: deletedCount,
        message: deletedCount + " baris data berhasil dihapus dari Google Sheets."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 2B. AKSI BERSIHKAN SEMUA DATA (CLEAR ALL)
    if (action === 'clear_all') {
      var lastRow = sheet.getLastRow();
      var clearedCount = 0;
      if (lastRow > 1) {
        clearedCount = lastRow - 1;
        sheet.deleteRows(2, lastRow - 1);
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        action: "clear_all",
        clearedCount: clearedCount,
        message: clearedCount + " baris data berhasil dibersihkan dari Google Sheets."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 2C. AKSI PERBARUI DATA (UPDATE)
    if (action === 'update' && (data.item || data.items)) {
      var itemsToUpdate = data.items || [data.item];
      var lastRow = sheet.getLastRow();
      var updatedCount = 0;

      if (lastRow > 1) {
        var values = sheet.getRange(1, 1, lastRow, 1).getValues();
        for (var u = 0; u < itemsToUpdate.length; u++) {
          var itm = itemsToUpdate[u];
          if (!itm || !itm.id) continue;
          var targetId = String(itm.id).trim();

          for (var r = 2; r <= lastRow; r++) {
            if (String(values[r - 1][0]).trim() === targetId) {
              sheet.getRange(r, 1, 1, 12).setValues([[
                itm.id,
                itm.date || "",
                itm.time || "",
                itm.store || "Belanja Harian",
                itm.name || "-",
                itm.category || "Lain-lain",
                itm.qty || 1,
                itm.unit || "pcs",
                itm.price || 0,
                itm.total || 0,
                itm.source || "web_manual",
                itm.createdAt || new Date().toISOString()
              ]]);
              updatedCount++;
              break;
            }
          }
        }
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        action: "update",
        updatedCount: updatedCount,
        message: updatedCount + " baris data berhasil diperbarui di Google Sheets."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 2D. AKSI TAMBAH DATA (ADD / DEFAULT)
    var items = data.items || [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      sheet.appendRow([
        item.id || ("item_" + Utilities.getUuid().substring(0, 8)),
        item.date || Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd"),
        item.time || Utilities.formatDate(new Date(), "Asia/Jakarta", "HH:mm"),
        item.store || "Belanja Harian",
        item.name || "-",
        item.category || "Lain-lain",
        item.qty || 1,
        item.unit || "pcs",
        item.price || 0,
        item.total || 0,
        item.source || "telegram",
        item.createdAt || new Date().toISOString()
      ]);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      action: "add",
      appendedCount: items.length,
      message: items.length + " data berhasil ditambahkan ke Google Sheets."
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// -------------------------------------------------------------
// GET: Mendukung status check & Tarik data (PULL) ke Web Dashboard
// -------------------------------------------------------------
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'status';
  if (action === 'pull' || action === 'get' || action === 'fetch') {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var lastRow = sheet.getLastRow();
    var items = [];
    if (lastRow > 1) {
      var values = sheet.getRange(2, 1, lastRow - 1, 12).getValues();
      for (var i = 0; i < values.length; i++) {
        var row = values[i];
        if (!row[4]) continue;
        items.push({
          id: String(row[0] || ('item_' + (i + 1))),
          date: String(row[1] ? (row[1] instanceof Date ? Utilities.formatDate(row[1], "Asia/Jakarta", "yyyy-MM-dd") : row[1]) : ''),
          time: String(row[2] || ''),
          store: String(row[3] || 'Toko'),
          name: String(row[4] || '-'),
          category: String(row[5] || 'Lain-lain'),
          qty: Number(row[6]) || 1,
          unit: String(row[7] || 'pcs'),
          price: Number(row[8]) || 0,
          total: Number(row[9]) || 0,
          source: String(row[10] || 'telegram_24h'),
          createdAt: String(row[11] || new Date().toISOString()),
          syncedToSheets: true
        });
      }
    }
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      count: items.length,
      items: items
    })).setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput("Google Sheets Bot Belanjaan 24/7 Siap Digunakan!");
}

// =============================================================
// LOGIKA PEMROSESAN BOT TELEGRAM 24/7 DI GOOGLE APPS SCRIPT
// =============================================================
function handleTelegramMessage(update, sheet) {
  var token = TELEGRAM_BOT_TOKEN;
  if (!token || token.indexOf("PASTE_") !== -1) {
    return; // Token belum diatur di Apps Script
  }

  var msg = update.message || update.channel_post;
  if (!msg && update.callback_query) {
    msg = update.callback_query.message;
    var cbData = update.callback_query.data;
    if (cbData === 'btn_rekap') {
      sendSummaryReport(token, msg.chat.id, sheet);
    }
    return;
  }

  if (!msg) return;

  var chatId = msg.chat.id;
  var text = (msg.text || msg.caption || "").trim();
  var photos = msg.photo;

  // 1. Tangani Foto Struk Belanjaan (OCR Gemini AI)
  if (photos && photos.length > 0) {
    // Hindari pemindaian berulang jika foto yang sama dikirim bersamaan
    var largestPhoto = photos[photos.length - 1];
    var cache = CacheService.getScriptCache();
    var photoKey = "tg_pic_" + (largestPhoto.file_unique_id || largestPhoto.file_id || ("m_" + msg.message_id));
    if (cache.get(photoKey)) {
      return; // Foto ini sudah sedang diproses atau baru saja diproses
    }
    cache.put(photoKey, "1", 300); // 5 menit deduplikasi

    sendTelegramMessage(token, chatId, "⏳ _Sedang membaca struk belanja via Gemini AI (Mode 24/7)..._", "Markdown");
    var processed = processReceiptPhoto(token, chatId, photos, sheet);
    if (!processed) {
      sendTelegramMessage(token, chatId, "⚠️ Maaf, belum dapat memindai struk. Pastikan GEMINI_API_KEY sudah diisi di Google Apps Script.");
    }
    return;
  }

  if (!text) return;

  // 2. Perintah /start atau /help
  if (text === "/start" || text.indexOf("/help") === 0) {
    var welcome = "👋 *Halo! Bot Catat Belanja 24/7 Aktif!*\\n\\n" +
      "Bot ini berjalan di *Google Cloud Apps Script*, selalu merespons *24 jam non-stop* tanpa perlu buka laptop atau AI Studio!\\n\\n" +
      "📝 *Cara Pakai:*\\n" +
      "• *Kirim Foto Struk:* Tekan ikon kamera & kirim foto bon belanja (kirim 1 atau 3 foto bon sekaligus, discan masing-masing tanpa pengulangan).\\n" +
      "• *Ketik Catatan:* Contoh: \`Beras 5kg 75000\` atau \`Minyak goreng 2L 34rb\`\\n" +
      "• */rekap* : Lihat total pengeluaran belanja\\n" +
      "• */download* : Download file rekap CSV/Excel\\n" +
      "• */daftar* : Lihat daftar 5 belanjaan terbaru\\n" +
      "• */hapus_semua* : Bersihkan seluruh catatan di Spreadsheet\\n\\n" +
      "✨ *Data otomatis tersimpan ke Google Sheets Anda!*";
    sendTelegramMessage(token, chatId, welcome, "Markdown");
    return;
  }

  // 3. Perintah /rekap
  if (text.indexOf("/rekap") === 0 || text.indexOf("/summary") === 0) {
    sendSummaryReport(token, chatId, sheet);
    return;
  }

  // 3B. Perintah /download, /export, /unduh
  if (text.indexOf("/download") === 0 || text.indexOf("/unduh") === 0 || text.indexOf("/export") === 0 || text.indexOf("/csv") === 0) {
    sendDownloadCsvReport(token, chatId, sheet);
    return;
  }

  // 4. Perintah /daftar atau /lihat
  if (text.indexOf("/daftar") === 0 || text.indexOf("/lihat") === 0) {
    sendLatestItems(token, chatId, sheet);
    return;
  }

  // 5. Perintah /hapus_semua
  if (text.indexOf("/hapus_semua") === 0 || text.indexOf("/reset") === 0) {
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.deleteRows(2, lastRow - 1);
      sendTelegramMessage(token, chatId, "🗑️ *Berhasil!* Seluruh catatan belanja di Google Sheets telah dibersihkan bersih.", "Markdown");
    } else {
      sendTelegramMessage(token, chatId, "ℹ️ Spreadsheet belanjaan Anda saat ini memang masih kosong.");
    }
    return;
  }

  // 6. Teks Belanjaan Manual (Misal: 'Beras 5kg 75000' atau 'Kopi 15000')
  processManualExpenseText(token, chatId, text, sheet);
}

// Format Rupiah helper
function formatRupiah(num) {
  return "Rp " + Number(num || 0).toLocaleString("id-ID");
}

// Inisialisasi Header Sheet jika kosong
function initHeaderIfEmpty(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "ID", "Tanggal", "Jam", "Toko / Merchant", "Nama Barang", "Kategori",
      "Qty", "Satuan", "Harga Satuan (Rp)", "Total (Rp)", "Sumber Input", "Dicatat Pada"
    ]);
    sheet.getRange(1, 1, 1, 12)
      .setFontWeight("bold")
      .setBackground("#10B981")
      .setFontColor("#FFFFFF");
    sheet.setFrozenRows(1);
  }
}

// Kirim Pesan Telegram
function sendTelegramMessage(token, chatId, text, parseMode) {
  var url = "https://api.telegram.org/bot" + token + "/sendMessage";
  var payload = {
    chat_id: chatId,
    text: text
  };
  if (parseMode) payload.parse_mode = parseMode;

  try {
    UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch(e) {
    Logger.log("Error sending telegram message: " + e);
  }
}

// Kirim Rekap Pengeluaran
function sendSummaryReport(token, chatId, sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    sendTelegramMessage(token, chatId, "📊 *Rekap Belanja:* Belum ada data belanja yang tercatat di Google Sheets.", "Markdown");
    return;
  }

  var values = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
  var grandTotal = 0;
  var categoryMap = {};

  for (var i = 0; i < values.length; i++) {
    var cat = values[i][5] || "Lain-lain";
    var tot = Number(values[i][9]) || 0;
    grandTotal += tot;
    categoryMap[cat] = (categoryMap[cat] || 0) + tot;
  }

  var msg = "📊 *REKAP PENGELUARAN BELANJAAN (24/7)*\\n\\n" +
    "💰 *Total Pengeluaran:* *" + formatRupiah(grandTotal) + "*\\n" +
    "📦 *Jumlah Catatan:* " + values.length + " barang\\n\\n" +
    "📁 *Rincian per Kategori:*\\n";

  for (var c in categoryMap) {
    msg += "• " + c + ": " + formatRupiah(categoryMap[c]) + "\\n";
  }

  msg += "\\n_💡 Data tersinkronisasi otomatis di Google Spreadsheet Anda._";
  sendTelegramMessage(token, chatId, msg, "Markdown");
}

// Kirim File Rekap Belanja CSV langsung ke Telegram via Apps Script
function sendDownloadCsvReport(token, chatId, sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    sendTelegramMessage(token, chatId, "ℹ️ *Belum ada data belanja* di Spreadsheet untuk didownload.", "Markdown");
    return;
  }

  try {
    var colCount = Math.min(sheet.getLastColumn(), 12);
    var allData = sheet.getRange(1, 1, lastRow, colCount).getValues();
    var csvRows = [];

    for (var r = 0; r < allData.length; r++) {
      var row = allData[r];
      var escaped = [];
      for (var c = 0; c < row.length; c++) {
        var val = row[c] === null || row[c] === undefined ? "" : String(row[c]);
        escaped.push('"' + val.replace(/"/g, '""') + '"');
      }
      csvRows.push(escaped.join(","));
    }

    var csvText = "\\uFEFF" + csvRows.join("\\r\\n");
    var todayStr = Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd");
    var filename = "rekap-belanja-" + todayStr + ".csv";
    var blob = Utilities.newBlob(csvText, "text/csv;charset=utf-8", filename);

    var url = "https://api.telegram.org/bot" + token + "/sendDocument";
    var payload = {
      chat_id: String(chatId),
      caption: "📥 *File Rekap Belanjaan* (" + (lastRow - 1) + " item)\\n_Dapat langsung dibuka di Excel, Google Sheets, atau aplikasi Spreadsheet._",
      parse_mode: "Markdown",
      document: blob
    };

    UrlFetchApp.fetch(url, {
      method: "post",
      payload: payload,
      muteHttpExceptions: true
    });
  } catch (err) {
    sendTelegramMessage(token, chatId, "⚠️ Gagal membuat file rekap: " + err);
  }
}

// Tampilkan 5 Catatan Belanjaan Terbaru
function sendLatestItems(token, chatId, sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    sendTelegramMessage(token, chatId, "📋 Belum ada barang belanjaan yang tersimpan.");
    return;
  }

  var count = Math.min(lastRow - 1, 5);
  var startRow = lastRow - count + 1;
  var values = sheet.getRange(startRow, 1, count, 10).getValues();

  var msg = "📋 *5 CATATAN BELANJAAN TERAKHIR:*\\n\\n";
  for (var i = values.length - 1; i >= 0; i--) {
    var itm = values[i];
    msg += "• *" + (itm[4] || "-") + "* (" + (itm[6] || 1) + " " + (itm[7] || "pcs") + ")\\n" +
      "  💵 " + formatRupiah(itm[9]) + " | 🏪 " + (itm[3] || "Toko") + " | 📅 " + itm[1] + "\\n\\n";
  }
  msg += "_Ketik /rekap untuk total keseluruhan._";
  sendTelegramMessage(token, chatId, msg, "Markdown");
}

// Proses Catatan Teks Manual
function processManualExpenseText(token, chatId, text, sheet) {
  var dateStr = Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd");
  var timeStr = Utilities.formatDate(new Date(), "Asia/Jakarta", "HH:mm");

  // Regex sederhana untuk menemukan harga: '75000', '75k', '75rb', '75.000'
  var priceRegex = /(?:rp\.?\\s*)?([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]+)\\s*(?:k|rb|ribu)?/i;
  var match = text.match(priceRegex);

  var price = 0;
  var name = text;
  var qty = 1;
  var unit = "pcs";
  var category = "Sembako";

  if (match) {
    var rawNum = match[1].replace(/[.,]/g, "");
    price = parseInt(rawNum, 10) || 0;
    var fullMatch = match[0].toLowerCase();
    if (fullMatch.indexOf("k") !== -1 || fullMatch.indexOf("rb") !== -1 || fullMatch.indexOf("ribu") !== -1) {
      if (price < 1000) price = price * 1000;
    }
    // Hapus harga dari nama barang
    name = text.replace(match[0], "").trim();
  }

  // Cek qty sederhana (misal '5kg', '2 pcs', '3 pouch')
  var qtyMatch = name.match(/([0-9]+(?:[.,][0-9]+)?)\\s*(kg|gram|g|liter|l|pcs|buah|ikat|kotak|bungkus|pouch|btg)/i);
  if (qtyMatch) {
    qty = parseFloat(qtyMatch[1].replace(",", ".")) || 1;
    unit = qtyMatch[2].toLowerCase();
    name = name.replace(qtyMatch[0], "").trim();
  }

  name = name.replace(/^[-,\\s]+|[-,\\s]+$/g, "");
  if (!name) name = "Belanja Harian";

  // Tebak kategori sederhana
  var lowerName = name.toLowerCase();
  if (lowerName.indexOf("beras") !== -1 || lowerName.indexOf("telur") !== -1 || lowerName.indexOf("minyak") !== -1 || lowerName.indexOf("gula") !== -1) {
    category = "Sembako";
  } else if (lowerName.indexOf("sayur") !== -1 || lowerName.indexOf("bayam") !== -1 || lowerName.indexOf("buah") !== -1 || lowerName.indexOf("apel") !== -1) {
    category = "Sayuran & Buah";
  } else if (lowerName.indexOf("ayam") !== -1 || lowerName.indexOf("daging") !== -1 || lowerName.indexOf("ikan") !== -1) {
    category = "Daging & Ikan";
  } else if (lowerName.indexOf("sabun") !== -1 || lowerName.indexOf("shampoo") !== -1 || lowerName.indexOf("pasta gigi") !== -1) {
    category = "Kebutuhan Rumah";
  } else {
    category = "Makanan & Minuman";
  }

  var itemId = "item_" + Utilities.getUuid().substring(0, 8);
  sheet.appendRow([
    itemId,
    dateStr,
    timeStr,
    "Belanja Harian",
    name,
    category,
    qty,
    unit,
    price,
    price,
    "telegram_24h",
    new Date().toISOString()
  ]);

  var reply = "✅ *Catatan Berhasil Disimpan (24/7 Always-On)!*\\n\\n" +
    "📦 *Barang:* " + name + "\\n" +
    "🔢 *Jumlah:* " + qty + " " + unit + "\\n" +
    "💵 *Total:* *" + formatRupiah(price) + "*\\n" +
    "📁 *Kategori:* " + category + "\\n" +
    "📅 *Waktu:* " + dateStr + " " + timeStr + "\\n\\n" +
    "_Tersimpan langsung ke Google Sheets tanpa perlu buka server!_";

  sendTelegramMessage(token, chatId, reply, "Markdown");
}

// Proses Foto Bon Struk Menggunakan Gemini AI Langsung
function processReceiptPhoto(token, chatId, photos, sheet) {
  var geminiKey = GEMINI_API_KEY;
  if (!geminiKey || geminiKey.indexOf("PASTE_") !== -1) {
    return false;
  }

  try {
    // Ambil foto resolusi tertinggi
    var largestPhoto = photos[photos.length - 1];
    var fileInfoRes = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/getFile?file_id=" + largestPhoto.file_id);
    var fileJson = JSON.parse(fileInfoRes.getContentText());
    if (!fileJson.ok || !fileJson.result || !fileJson.result.file_path) return false;

    var fileUrl = "https://api.telegram.org/file/bot" + token + "/" + fileJson.result.file_path;
    var imageBytes = UrlFetchApp.fetch(fileUrl).getContent();
    var base64Data = Utilities.base64Encode(imageBytes);

    var geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + geminiKey;
    var geminiPayload = {
      contents: [{
        parts: [
          {
            text: "Kamu adalah asisten pencatat belanja OCR. Analisis foto struk ini dan ekstrak barang-barang belanjaan ke format JSON murni TANPA markdown block (hanya JSON): " +
              "{\\"store\\": \\"Nama Toko\\", \\"date\\": \\"YYYY-MM-DD\\", \\"items\\": [{\\"name\\": \\"Nama Barang\\", \\"qty\\": 1, \\"unit\\": \\"pcs\\", \\"price\\": 10000, \\"total\\": 10000, \\"category\\": \\"Sembako\\"}]}"
          },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Data
            }
          }
        ]
      }]
    };

    var geminiRes = UrlFetchApp.fetch(geminiUrl, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(geminiPayload),
      muteHttpExceptions: true
    });

    var gemText = geminiRes.getContentText();
    var gemJson = JSON.parse(gemText);
    var rawOutput = gemJson.candidates[0].content.parts[0].text;
    var cleanJson = rawOutput.replace(/\\\`\\\`\\\`json/gi, "").replace(/\\\`\\\`\\\`/g, "").trim();
    var parsed = JSON.parse(cleanJson);

    var dateStr = parsed.date || Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd");
    var timeStr = Utilities.formatDate(new Date(), "Asia/Jakarta", "HH:mm");
    var storeName = parsed.store || "Supermarket / Struk";
    var items = parsed.items || [];

    if (items.length === 0) {
      sendTelegramMessage(token, chatId, "⚠️ Struk terbaca namun tidak ada item barang yang terdeteksi.");
      return true;
    }

    var totalSemua = 0;
    var listMsg = "🧾 *STRUK BERHASIL DICATAT (24/7 Always-On)!*\\n" +
      "🏪 *Toko:* " + storeName + "\\n" +
      "📅 *Tanggal:* " + dateStr + "\\n\\n";

    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var itTot = Number(it.total) || (Number(it.price || 0) * Number(it.qty || 1));
      totalSemua += itTot;
      var itId = "rcpt_" + Utilities.getUuid().substring(0, 8);

      sheet.appendRow([
        itId,
        dateStr,
        timeStr,
        storeName,
        it.name || "-",
        it.category || "Sembako",
        it.qty || 1,
        it.unit || "pcs",
        it.price || itTot,
        itTot,
        "ocr_24h",
        new Date().toISOString()
      ]);

      listMsg += (i + 1) + ". *" + it.name + "* (" + (it.qty || 1) + " " + (it.unit || "pcs") + ") = *" + formatRupiah(itTot) + "*\\n";
    }

    listMsg += "\\n💰 *Total Bon:* *" + formatRupiah(totalSemua) + "*\\n" +
      "✅ _" + items.length + " barang otomatis masuk ke Google Sheets!_";

    sendTelegramMessage(token, chatId, listMsg, "Markdown");
    return true;
  } catch(e) {
    Logger.log("Error in processReceiptPhoto: " + e);
    return false;
  }
}
`;

export async function syncItemsToGoogleSheets(
  webhookUrl: string,
  items: GroceryItem[]
): Promise<{ success: boolean; message: string; count: number }> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return {
      success: false,
      message: 'Google Sheets Webhook URL belum diisi atau tidak valid.',
      count: 0,
    };
  }

  try {
    const res = await fetch(webhookUrl.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add',
        source: 'telegram_ocr_bot',
        timestamp: new Date().toISOString(),
        items: items,
      }),
      redirect: 'follow',
    });

    if (!res.ok) {
      return {
        success: false,
        message: `HTTP error ${res.status}: ${res.statusText}`,
        count: 0,
      };
    }

    const json = await res.json().catch(() => ({ status: 'success' }));
    return {
      success: json.status !== 'error',
      message: json.message || 'Berhasil disinkronkan ke Google Sheets!',
      count: items.length,
    };
  } catch (err: any) {
    console.error('Error syncing to Google Sheets:', err);
    return {
      success: false,
      message: err.message || 'Gagal terhubung ke Google Sheets Webhook.',
      count: 0,
    };
  }
}

export async function deleteItemsFromGoogleSheets(
  webhookUrl: string,
  itemIds: string[],
  itemsDetails?: Partial<GroceryItem>[]
): Promise<{ success: boolean; message: string; deletedCount: number }> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return {
      success: false,
      message: 'Google Sheets Webhook URL belum diisi atau tidak valid.',
      deletedCount: 0,
    };
  }

  try {
    const res = await fetch(webhookUrl.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'delete',
        source: 'telegram_ocr_bot',
        timestamp: new Date().toISOString(),
        ids: itemIds,
        items: itemsDetails || [],
      }),
      redirect: 'follow',
    });

    if (!res.ok) {
      return {
        success: false,
        message: `HTTP error ${res.status}: ${res.statusText}`,
        deletedCount: 0,
      };
    }

    const json = await res.json().catch(() => ({ status: 'success' }));
    return {
      success: json.status !== 'error',
      message: json.message || `Berhasil menghapus data di Google Sheets!`,
      deletedCount: json.deletedCount ?? itemIds.length,
    };
  } catch (err: any) {
    console.error('Error deleting from Google Sheets:', err);
    return {
      success: false,
      message: err.message || 'Gagal menghapus data di Google Sheets Webhook.',
      deletedCount: 0,
    };
  }
}

export async function updateItemInGoogleSheets(
  webhookUrl: string,
  item: GroceryItem
): Promise<{ success: boolean; message: string }> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return {
      success: false,
      message: 'Google Sheets Webhook URL belum diisi.',
    };
  }

  try {
    const res = await fetch(webhookUrl.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update',
        source: 'telegram_ocr_bot',
        timestamp: new Date().toISOString(),
        item: item,
      }),
      redirect: 'follow',
    });

    if (!res.ok) {
      return { success: false, message: `HTTP error ${res.status}` };
    }

    const json = await res.json().catch(() => ({ status: 'success' }));
    return {
      success: json.status !== 'error',
      message: json.message || 'Berhasil memperbarui data di Google Sheets!',
    };
  } catch (err: any) {
    console.error('Error updating in Google Sheets:', err);
    return { success: false, message: err.message || 'Gagal terhubung ke Google Sheets.' };
  }
}

export async function clearAllFromGoogleSheets(
  webhookUrl: string
): Promise<{ success: boolean; message: string; clearedCount: number }> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return {
      success: false,
      message: 'Google Sheets Webhook URL belum diisi.',
      clearedCount: 0,
    };
  }

  try {
    const res = await fetch(webhookUrl.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'clear_all',
        source: 'telegram_ocr_bot',
        timestamp: new Date().toISOString(),
      }),
      redirect: 'follow',
    });

    if (!res.ok) {
      return { success: false, message: `HTTP error ${res.status}`, clearedCount: 0 };
    }

    const json = await res.json().catch(() => ({ status: 'success' }));
    return {
      success: json.status !== 'error',
      message: json.message || 'Berhasil membersihkan data di Google Sheets!',
      clearedCount: json.clearedCount || 0,
    };
  } catch (err: any) {
    console.error('Error clearing Google Sheets:', err);
    return { success: false, message: err.message || 'Gagal terhubung ke Google Sheets.', clearedCount: 0 };
  }
}

export function generateCsvContent(items: GroceryItem[]): string {
  const headers = [
    'No',
    'Tanggal',
    'Jam',
    'Toko',
    'Nama Barang',
    'Kategori',
    'Qty',
    'Satuan',
    'Harga Satuan (Rp)',
    'Total (Rp)',
    'Metode Input',
    'Status Sync'
  ];

  const escapeCsv = (val: any) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = items.map((item, idx) => {
    return [
      idx + 1,
      escapeCsv(item.date),
      escapeCsv(item.time || '-'),
      escapeCsv(item.store),
      escapeCsv(item.name),
      escapeCsv(item.category),
      item.qty,
      escapeCsv(item.unit),
      item.price,
      item.total,
      escapeCsv(item.source),
      escapeCsv(item.syncedToSheets ? 'Sudah Sync' : 'Lokal')
    ].join(',');
  });

  // Prepend UTF-8 BOM for Excel / Google Sheets compatibility
  return '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
}

/**
 * Tarik seluruh data belanja yang dicatat oleh Bot 24/7 di Google Sheets ke database lokal aplikasi
 */
export async function pullItemsFromGoogleSheets(
  webhookUrl: string
): Promise<{ success: boolean; message: string; items: GroceryItem[] }> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return {
      success: false,
      message: 'Google Sheets Webhook URL belum diatur.',
      items: [],
    };
  }

  try {
    const urlWithAction = `${webhookUrl.trim()}${webhookUrl.includes('?') ? '&' : '?'}action=pull`;
    const res = await fetch(urlWithAction, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      redirect: 'follow',
    });

    if (!res.ok) {
      return {
        success: false,
        message: `HTTP ${res.status}: Gagal membaca data dari Google Sheets.`,
        items: [],
      };
    }

    const data = await res.json().catch(() => null);
    if (!data || !Array.isArray(data.items)) {
      return {
        success: false,
        message: 'Respon dari Google Sheets tidak berisi array belanjaan valid.',
        items: [],
      };
    }

    const validItems: GroceryItem[] = data.items.map((it: any, index: number) => ({
      id: it.id || `sheet_${Date.now()}_${index}`,
      date: it.date || new Date().toISOString().split('T')[0],
      time: it.time || '',
      store: it.store || 'Belanja Harian',
      name: it.name || '-',
      category: it.category || 'Lain-lain',
      qty: Number(it.qty) || 1,
      unit: it.unit || 'pcs',
      price: Number(it.price) || 0,
      total: Number(it.total) || 0,
      source: it.source || 'telegram_24h',
      syncedToSheets: true,
      createdAt: it.createdAt || new Date().toISOString(),
    }));

    return {
      success: true,
      message: `Berhasil menarik ${validItems.length} catatan belanja dari Google Sheets!`,
      items: validItems,
    };
  } catch (err: any) {
    console.error('Error pulling from Google Sheets:', err);
    return {
      success: false,
      message: err.message || 'Gagal menghubungi Google Sheets.',
      items: [],
    };
  }
}

