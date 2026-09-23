import fs from 'fs';
import path from 'path';

export interface GroceryItem {
  id: string;
  date: string;       // YYYY-MM-DD
  time?: string;      // HH:mm
  store: string;      // Nama Toko / Merchant
  name: string;       // Nama Barang
  category: string;   // Kategori (Sembako, Sayur, etc)
  qty: number;        // Jumlah
  unit: string;       // Satuan (pcs, kg, etc)
  price: number;      // Harga Satuan (IDR)
  total: number;      // Total Harga (IDR)
  source: 'telegram_ocr' | 'telegram_manual' | 'web_ocr' | 'web_manual';
  receiptId?: string; // ID struk jika berasal dari foto bon
  notes?: string;
  syncedToSheets?: boolean;
  createdAt: string;  // ISO timestamp
}

export interface ReceiptRecord {
  id: string;
  date: string;
  time?: string;
  store: string;
  grandTotal: number;
  itemCount: number;
  source: 'telegram' | 'web';
  imageUrl?: string;
  items: GroceryItem[];
  rawSummary?: string;
  createdAt: string;
}

export interface AppConfig {
  telegramBotToken: string;
  botUsername?: string;
  googleSheetsWebhookUrl: string;
  currency: string;
  lastWebhookSync?: string;
  autoSyncToSheets: boolean;
  telegramMode: 'webhook' | 'polling';
  registeredWebhookUrl?: string;
  autoWebhookEnabled?: boolean;
  lastWebhookError?: string;
  monthlyBudget?: number;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const EXPENSES_FILE = path.join(DATA_DIR, 'expenses.json');
const RECEIPTS_FILE = path.join(DATA_DIR, 'receipts.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

// In-memory cache
let expensesCache: GroceryItem[] = [];
let receiptsCache: ReceiptRecord[] = [];
let configCache: AppConfig = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  botUsername: '',
  googleSheetsWebhookUrl: process.env.GOOGLE_SHEETS_WEBHOOK_URL || '',
  currency: 'IDR',
  autoSyncToSheets: true,
  telegramMode: 'webhook',
  autoWebhookEnabled: true,
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {
      console.warn('Could not create data dir:', e);
    }
  }
}

// Initial sample data if file doesn't exist
const INITIAL_SAMPLE_EXPENSES: GroceryItem[] = [
  {
    id: 'item-1',
    date: new Date().toISOString().split('T')[0],
    time: '08:30',
    store: 'Pasar Tradisional',
    name: 'Beras Pandan Wangi 5kg',
    category: 'Sembako',
    qty: 1,
    unit: 'sak',
    price: 78000,
    total: 78000,
    source: 'telegram_manual',
    syncedToSheets: true,
    createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
  },
  {
    id: 'item-2',
    date: new Date().toISOString().split('T')[0],
    time: '08:45',
    store: 'Pasar Tradisional',
    name: 'Telur Ayam Negeri',
    category: 'Sembako',
    qty: 1,
    unit: 'kg',
    price: 28000,
    total: 28000,
    source: 'telegram_manual',
    syncedToSheets: true,
    createdAt: new Date(Date.now() - 3600000 * 3).toISOString(),
  },
  {
    id: 'item-3',
    date: new Date().toISOString().split('T')[0],
    time: '11:15',
    store: 'Superindo',
    name: 'Minyak Goreng Tropical 2L',
    category: 'Bumbu & Minyak',
    qty: 1,
    unit: 'pouch',
    price: 34500,
    total: 34500,
    source: 'telegram_ocr',
    receiptId: 'rcpt-sample',
    syncedToSheets: true,
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
  {
    id: 'item-4',
    date: new Date().toISOString().split('T')[0],
    time: '11:15',
    store: 'Superindo',
    name: 'Bayam Hijau Segar',
    category: 'Sayuran & Buah',
    qty: 2,
    unit: 'ikat',
    price: 4500,
    total: 9000,
    source: 'telegram_ocr',
    receiptId: 'rcpt-sample',
    syncedToSheets: true,
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
  {
    id: 'item-5',
    date: new Date().toISOString().split('T')[0],
    time: '14:20',
    store: 'Indomaret',
    name: 'Susu UHT Full Cream 1L',
    category: 'Makanan & Minuman',
    qty: 2,
    unit: 'kotak',
    price: 19500,
    total: 39000,
    source: 'web_manual',
    syncedToSheets: false,
    createdAt: new Date().toISOString(),
  },
];

let isDataLoaded = false;

export function loadData() {
  ensureDataDir();
  isDataLoaded = true;

  try {
    if (fs.existsSync(EXPENSES_FILE)) {
      expensesCache = JSON.parse(fs.readFileSync(EXPENSES_FILE, 'utf-8'));
    } else {
      expensesCache = INITIAL_SAMPLE_EXPENSES;
      saveExpenses();
    }
  } catch (err) {
    console.error('Error loading expenses:', err);
    expensesCache = INITIAL_SAMPLE_EXPENSES;
  }

  try {
    if (fs.existsSync(RECEIPTS_FILE)) {
      receiptsCache = JSON.parse(fs.readFileSync(RECEIPTS_FILE, 'utf-8'));
    } else {
      receiptsCache = [];
    }
  } catch (err) {
    console.error('Error loading receipts:', err);
  }

  try {
    if (fs.existsSync(CONFIG_FILE)) {
      configCache = {
        ...configCache,
        ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')),
      };
    }
  } catch (err) {
    console.error('Error loading config:', err);
  }
}

export function saveExpenses() {
  ensureDataDir();
  try {
    fs.writeFileSync(EXPENSES_FILE, JSON.stringify(expensesCache, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving expenses:', err);
  }
}

export function saveReceipts() {
  ensureDataDir();
  try {
    fs.writeFileSync(RECEIPTS_FILE, JSON.stringify(receiptsCache, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving receipts:', err);
  }
}

export function saveConfig() {
  ensureDataDir();
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(configCache, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving config:', err);
  }
}

// Data accessors
export function getExpenses(): GroceryItem[] {
  if (!isDataLoaded) loadData();
  return expensesCache;
}

export function addExpenses(items: GroceryItem[]): GroceryItem[] {
  if (!isDataLoaded) loadData();
  expensesCache = [...items, ...expensesCache];
  saveExpenses();
  return expensesCache;
}

export function updateExpense(id: string, updated: Partial<GroceryItem>): GroceryItem | null {
  if (!isDataLoaded) loadData();
  const index = expensesCache.findIndex(i => i.id === id);
  if (index === -1) return null;
  expensesCache[index] = { ...expensesCache[index], ...updated };
  saveExpenses();
  return expensesCache[index];
}

export function deleteExpense(id: string): boolean {
  if (!isDataLoaded) loadData();
  const before = expensesCache.length;
  expensesCache = expensesCache.filter(i => i.id !== id);
  if (expensesCache.length !== before) {
    saveExpenses();
    return true;
  }
  return false;
}

export function clearAllExpenses(): void {
  if (!isDataLoaded) loadData();
  expensesCache = [];
  receiptsCache = [];
  saveExpenses();
  saveReceipts();
}

export function syncExpensesFromSheets(items: GroceryItem[]): { added: number; total: number } {
  if (!isDataLoaded) loadData();
  const existingMap = new Map<string, GroceryItem>();
  for (const it of expensesCache) {
    existingMap.set(it.id, it);
  }
  let added = 0;
  for (const it of items) {
    if (!existingMap.has(it.id)) {
      expensesCache.push(it);
      existingMap.set(it.id, it);
      added++;
    }
  }
  expensesCache.sort(
    (a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime()
  );
  saveExpenses();
  return { added, total: expensesCache.length };
}

export function getReceipts(): ReceiptRecord[] {
  if (!isDataLoaded) loadData();
  return receiptsCache;
}

export function addReceipt(receipt: ReceiptRecord): ReceiptRecord {
  receiptsCache = [receipt, ...receiptsCache];
  saveReceipts();
  return receipt;
}

export function getConfig(): AppConfig {
  return configCache;
}

export function updateConfig(updates: Partial<AppConfig>): AppConfig {
  configCache = { ...configCache, ...updates };
  saveConfig();
  return configCache;
}

// Initial load
loadData();
