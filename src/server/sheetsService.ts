import { GroceryItem } from './storageService';

export const GOOGLE_APPS_SCRIPT_TEMPLATE = `// -------------------------------------------------------------
// SCRIPT GOOGLE SHEETS UNTUK SINKRONISASI BOT TELEGRAM BELANJAAN
// -------------------------------------------------------------
// Cara Pasang di Google Sheets:
// 1. Buat Google Sheet baru di https://sheets.new
// 2. Klik menu 'Extensions' (Ekstensi) > 'Apps Script'
// 3. Hapus kode yang ada, lalu paste kode ini.
// 4. Klik tombol 'Deploy' (Terapkan) > 'New deployment' (Penerapan baru).
// 5. Pilih tipe: 'Web app' (Aplikasi web).
// 6. Pada 'Execute as' pilih 'Me (email Anda)'.
// 7. Pada 'Who has access' pilih 'Anyone' (Siapa saja).
// 8. Klik 'Deploy', izinkan akses, lalu COPY 'Web app URL'.
// 9. Tempelkan URL tersebut ke kolom 'Google Sheets Webhook URL' di aplikasi!

function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // Buat header jika sheet masih kosong
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "ID",
        "Tanggal",
        "Jam",
        "Toko / Merchant",
        "Nama Barang",
        "Kategori",
        "Qty",
        "Satuan",
        "Harga Satuan (Rp)",
        "Total (Rp)",
        "Sumber Input",
        "Dicatat Pada"
      ]);
      // Format header
      sheet.getRange(1, 1, 1, 12)
        .setFontWeight("bold")
        .setBackground("#10B981")
        .setFontColor("#FFFFFF");
      sheet.setFrozenRows(1);
    }
    
    var data = JSON.parse(e.postData.contents);
    var items = data.items || [];
    
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      sheet.appendRow([
        item.id || Utilities.getUuid(),
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
      appendedCount: items.length
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput("Google Sheets Webhook Bot Belanjaan siap menerima data!");
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
