import React, { useState, useEffect, useCallback } from 'react';
import {
  FileSpreadsheet,
  Camera,
  Plus,
  Send,
  Smartphone,
  Sparkles,
  Bot,
  RefreshCw,
  Download,
  Settings,
  HelpCircle,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
} from 'lucide-react';
import { GroceryItem, AppConfig, SystemStatus } from './types';
import { SummaryStats } from './components/SummaryStats';
import { SpreadsheetView } from './components/SpreadsheetView';
import { ReceiptScannerModal } from './components/ReceiptScannerModal';
import { ManualInputModal } from './components/ManualInputModal';
import { TelegramBotGuide } from './components/TelegramBotGuide';
import { GoogleSheetsModal } from './components/GoogleSheetsModal';

export default function App() {
  const [activeTab, setActiveTab] = useState<'spreadsheet' | 'scanner' | 'telegram' | 'sheets'>('spreadsheet');
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [config, setConfig] = useState<AppConfig>({
    telegramBotToken: '',
    googleSheetsWebhookUrl: '',
    currency: 'IDR',
    autoSyncToSheets: true,
  });
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Modals
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [isSheetsModalOpen, setIsSheetsModalOpen] = useState(false);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Fetch expenses
  const fetchExpenses = useCallback(async () => {
    try {
      const res = await fetch('/api/expenses');
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (e) {
      console.warn('Error fetching expenses:', e);
    }
  }, []);

  // Fetch config
  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch (e) {
      console.warn('Error fetching config:', e);
    }
  }, []);

  // Fetch system status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (e) {
      console.warn('Error fetching status:', e);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await Promise.all([fetchExpenses(), fetchConfig(), fetchStatus()]);
      setIsLoading(false);
    };
    init();

    // Periodic poll for new entries from Telegram bot
    const interval = setInterval(() => {
      fetchExpenses();
      fetchStatus();
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchExpenses, fetchConfig, fetchStatus]);

  // Handle Delete
  const handleDeleteItem = async (id: string) => {
    try {
      const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== id));
        showToast('Item berhasil dihapus dari catatan.');
      }
    } catch (e) {
      showToast('Gagal menghapus item.', 'error');
    }
  };

  // Handle Update
  const handleUpdateItem = async (id: string, updated: Partial<GroceryItem>) => {
    try {
      const res = await fetch(`/api/expenses/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (res.ok) {
        setItems(prev => prev.map(i => (i.id === id ? { ...i, ...updated } : i)));
        showToast('Perubahan item berhasil disimpan.');
      }
    } catch (e) {
      showToast('Gagal mengubah item.', 'error');
    }
  };

  // Handle Config Update
  const handleUpdateConfig = async (updates: Partial<AppConfig>) => {
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
        showToast('Pengaturan berhasil diperbarui.');
        await fetchStatus();
      }
    } catch (e) {
      showToast('Gagal menyimpan pengaturan.', 'error');
    }
  };

  // Sync to Google Sheets
  const handleSyncGoogleSheets = async () => {
    if (!config.googleSheetsWebhookUrl) {
      setIsSheetsModalOpen(true);
      return;
    }

    setIsSyncingSheets(true);
    try {
      const res = await fetch('/api/sync-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl: config.googleSheetsWebhookUrl }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setItems(prev => prev.map(i => ({ ...i, syncedToSheets: true })));
        showToast(`Berhasil menyinkronkan ${data.count} item ke Google Sheets!`);
      } else {
        showToast(data.message || 'Gagal sinkron ke Google Sheets', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Koneksi ke Google Sheets gagal.', 'error');
    } finally {
      setIsSyncingSheets(false);
    }
  };

  const botUsername = status?.botInfo?.username || config.botUsername;
  const tgDeepLink = botUsername ? `tg://resolve?domain=${botUsername}` : 'https://t.me/BotFather';

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 pb-16">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 animate-fade-in">
          <div
            className={`px-4 py-3 rounded-xl shadow-lg border text-xs font-semibold flex items-center gap-2 ${
              toast.type === 'success'
                ? 'bg-emerald-600 text-white border-emerald-700'
                : toast.type === 'error'
                ? 'bg-rose-600 text-white border-rose-700'
                : 'bg-slate-900 text-white border-slate-800'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Main Navigation Bar */}
      <header className="bg-white border-b border-slate-200/90 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-3">
            {/* Logo and Brand */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
                    Catat Belanja Telegram &amp; OCR Bon
                  </h1>
                  <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-900 text-white">
                    <Smartphone className="w-3 h-3" />
                    iPhone Ready
                  </span>
                </div>
                <p className="text-xs text-slate-500 hidden md:block">
                  Input manual, scan foto struk otomatis (OCR AI), dan sinkronisasi Spreadsheet
                </p>
              </div>
            </div>

            {/* Top Quick Actions */}
            <div className="flex items-center gap-2 sm:gap-2.5">
              {/* Telegram Bot Pill */}
              {status?.botConfigured ? (
                <a
                  id="header-btn-open-telegram"
                  href={tgDeepLink}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 transition-colors"
                  title="Buka bot langsung di aplikasi Telegram iPhone"
                >
                  <Send className="w-3.5 h-3.5 text-sky-600" />
                  <span className="hidden xs:inline">Buka di</span> Telegram
                </a>
              ) : (
                <button
                  id="header-btn-setup-bot"
                  onClick={() => setActiveTab('telegram')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 transition-colors cursor-pointer"
                >
                  <Bot className="w-3.5 h-3.5 text-amber-600" />
                  Hubungkan Bot Telegram
                </button>
              )}

              {/* Photo OCR Button */}
              <button
                id="header-btn-ocr"
                onClick={() => setIsScannerOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-xs transition-colors cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Foto</span> Bon OCR
              </button>

              {/* Add Manual Button */}
              <button
                id="header-btn-manual"
                onClick={() => setIsManualOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Input</span> Manual
              </button>

              {/* Google Sheets Settings */}
              <button
                id="header-btn-sheets-config"
                onClick={() => setIsSheetsModalOpen(true)}
                className={`p-2 rounded-lg text-slate-700 border transition-colors cursor-pointer ${
                  config.googleSheetsWebhookUrl
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                }`}
                title="Integrasi & Pengaturan Google Sheets"
              >
                <FileSpreadsheet className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="flex items-center gap-1 -mb-px overflow-x-auto scrollbar-none pt-1">
            <button
              id="tab-spreadsheet"
              onClick={() => setActiveTab('spreadsheet')}
              className={`py-2.5 px-3.5 border-b-2 text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'spreadsheet'
                  ? 'border-emerald-600 text-emerald-700 bg-emerald-50/40 rounded-t-lg'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Tabel Spreadsheet Belanja ({items.length})
            </button>

            <button
              id="tab-telegram-guide"
              onClick={() => setActiveTab('telegram')}
              className={`py-2.5 px-3.5 border-b-2 text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'telegram'
                  ? 'border-emerald-600 text-emerald-700 bg-emerald-50/40 rounded-t-lg'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              Panduan Bot Telegram iPhone
              {status?.botConfigured ? (
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              ) : (
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              )}
            </button>

            <button
              id="tab-scanner"
              onClick={() => setIsScannerOpen(true)}
              className="py-2.5 px-3.5 border-b-2 border-transparent text-xs font-bold text-slate-600 hover:text-slate-900 hover:border-slate-300 transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5"
            >
              <Camera className="w-3.5 h-3.5" />
              Kamera &amp; Scan Bon
            </button>

            <button
              id="tab-sheets-integration"
              onClick={() => setIsSheetsModalOpen(true)}
              className="py-2.5 px-3.5 border-b-2 border-transparent text-xs font-bold text-slate-600 hover:text-slate-900 hover:border-slate-300 transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Google Sheets (1-Menit Setup)
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {/* Top Summary Stats */}
        <SummaryStats items={items} />

        {/* Dynamic Tab Content */}
        {activeTab === 'spreadsheet' && (
          <SpreadsheetView
            items={items}
            onDeleteItem={handleDeleteItem}
            onUpdateItem={handleUpdateItem}
            onOpenManualModal={() => setIsManualOpen(true)}
            onOpenScannerModal={() => setIsScannerOpen(true)}
            onSyncGoogleSheets={handleSyncGoogleSheets}
            isSyncingSheets={isSyncingSheets}
            hasSheetsConfigured={!!config.googleSheetsWebhookUrl}
          />
        )}

        {activeTab === 'telegram' && (
          <TelegramBotGuide
            config={config}
            status={status}
            onUpdateConfig={handleUpdateConfig}
            onRefreshStatus={async () => {
              await fetchStatus();
              await fetchExpenses();
            }}
          />
        )}
      </main>

      {/* Modals */}
      <ReceiptScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onReceiptSaved={async () => {
          await fetchExpenses();
          await fetchStatus();
          showToast('Foto bon berhasil di-OCR dan dimasukkan ke Spreadsheet!');
        }}
      />

      <ManualInputModal
        isOpen={isManualOpen}
        onClose={() => setIsManualOpen(false)}
        onItemAdded={async () => {
          await fetchExpenses();
          await fetchStatus();
          showToast('Catatan belanjaan berhasil disimpan ke Spreadsheet!');
        }}
      />

      <GoogleSheetsModal
        isOpen={isSheetsModalOpen}
        onClose={() => setIsSheetsModalOpen(false)}
        config={config}
        onUpdateConfig={handleUpdateConfig}
        onSyncAll={handleSyncGoogleSheets}
        isSyncing={isSyncingSheets}
      />
    </div>
  );
}
