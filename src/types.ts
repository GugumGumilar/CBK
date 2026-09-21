export interface GroceryItem {
  id: string;
  date: string;       // YYYY-MM-DD
  time?: string;      // HH:mm
  store: string;      // Nama Toko / Merchant
  name: string;       // Nama Barang
  category: string;   // Kategori
  qty: number;        // Jumlah
  unit: string;       // Satuan
  price: number;      // Harga Satuan (IDR)
  total: number;      // Total Harga (IDR)
  source: 'telegram_ocr' | 'telegram_manual' | 'web_ocr' | 'web_manual';
  receiptId?: string;
  notes?: string;
  syncedToSheets?: boolean;
  createdAt: string;
}

export interface ParsedItem {
  name: string;
  qty: number;
  unit: string;
  price: number;
  total: number;
  category: string;
}

export interface ParsedReceiptData {
  storeName: string;
  date: string;
  time?: string;
  items: ParsedItem[];
  subtotal: number;
  discount: number;
  tax: number;
  grandTotal: number;
  paymentMethod?: string;
  rawNotes?: string;
}

export interface AppConfig {
  telegramBotToken: string;
  telegramBotTokenMasked?: string;
  hasBotToken?: boolean;
  botUsername?: string;
  googleSheetsWebhookUrl: string;
  currency: string;
  autoSyncToSheets: boolean;
  appsScriptTemplate?: string;
  appUrl?: string;
}

export interface SystemStatus {
  status: string;
  hasGeminiKey: boolean;
  appUrl: string;
  botConfigured: boolean;
  botInfo?: {
    id: number;
    first_name: string;
    username: string;
  } | null;
  webhookInfo?: {
    url: string;
    has_custom_certificate: boolean;
    pending_update_count: number;
    last_error_date?: number;
    last_error_message?: string;
  } | null;
  isPolling?: boolean;
  pollingStatus?: {
    active: boolean;
    lastPolledTime?: string | null;
    lastPollingError?: string | null;
  } | null;
  sheetsConfigured: boolean;
  itemCount: number;
}
