import React, { useState } from 'react';
import {
  FileSpreadsheet,
  X,
  Copy,
  Check,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Download,
  Key,
  ShieldCheck,
} from 'lucide-react';
import { AppConfig } from '../types';

interface GoogleSheetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AppConfig;
  onUpdateConfig: (updates: Partial<AppConfig>) => Promise<void>;
  onSyncAll: () => Promise<void>;
  isSyncing: boolean;
}

export function GoogleSheetsModal({
  isOpen,
  onClose,
  config,
  onUpdateConfig,
  onSyncAll,
  isSyncing,
}: GoogleSheetsModalProps) {
  const [webhookUrl, setWebhookUrl] = useState(config.googleSheetsWebhookUrl || '');
  const [autoSync, setAutoSync] = useState(config.autoSyncToSheets ?? true);
  const [copiedCode, setCopiedCode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  if (!isOpen) return null;

  const handleCopyCode = () => {
    if (config.appsScriptTemplate) {
      navigator.clipboard.writeText(config.appsScriptTemplate);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setFeedback(null);

    try {
      await onUpdateConfig({
        googleSheetsWebhookUrl: webhookUrl.trim(),
        autoSyncToSheets: autoSync,
      });

      setFeedback({
        type: 'success',
        message: 'Pengaturan Google Sheets berhasil disimpan!',
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Gagal menyimpan pengaturan.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-auto max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-2xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Integrasi Otomatis Google Sheets
              </h3>
              <p className="text-xs text-slate-500">
                Hubungkan bot Telegram langsung ke dokumen Google Spreadsheet Anda
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5">
          {feedback && (
            <div
              className={`p-3 rounded-xl text-xs flex items-start gap-2.5 ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              )}
              <p className="font-medium">{feedback.message}</p>
            </div>
          )}

          {/* Form URL */}
          <form onSubmit={handleSaveConfig} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Google Sheets Webhook URL:
              </label>
              <input
                id="input-google-sheets-url"
                type="url"
                value={webhookUrl}
                onChange={e => setWebhookUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="checkbox-auto-sync"
                checked={autoSync}
                onChange={e => setAutoSync(e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
              />
              <label htmlFor="checkbox-auto-sync" className="text-xs text-slate-700 font-medium cursor-pointer">
                Otomatis kirim ke Google Sheets setiap kali ada foto bon / chat baru dari Telegram
              </label>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={onSyncAll}
                disabled={isSyncing || !webhookUrl}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 disabled:opacity-50 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Menyinkronkan...' : 'Sync Semua Data Sekarang'}
              </button>

              <button
                id="btn-save-sheets-config"
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                {isSaving ? 'Menyimpan...' : 'Simpan URL'}
              </button>
            </div>
          </form>

          {/* Setup Guide */}
          <div>
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2.5">
              Cara Pasang di Google Sheets (Hanya 1 Menit):
            </h4>
            <ol className="text-xs text-slate-600 space-y-2.5 list-decimal list-inside leading-relaxed">
              <li>
                Buka tab baru dan buat Google Sheet baru di{' '}
                <a
                  href="https://sheets.new"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-600 font-semibold inline-flex items-center gap-0.5 hover:underline"
                >
                  sheets.new <ExternalLink className="w-3 h-3" />
                </a>.
              </li>
              <li>
                Di Google Sheets, klik menu <b>Ekstensi (Extensions)</b> &gt; <b>Apps Script</b>.
              </li>
              <li>
                Hapus teks kode yang ada di Apps Script, lalu <b>tempel (paste)</b> kode di bawah ini:
              </li>
            </ol>

            {/* Code Box */}
            <div className="mt-3 relative">
              <div className="absolute top-2 right-2 z-10">
                <button
                  onClick={handleCopyCode}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-md text-[11px] font-semibold transition-colors cursor-pointer"
                >
                  {copiedCode ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      Tersalin!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Salin Kode Script
                    </>
                  )}
                </button>
              </div>
              <pre className="p-3.5 pt-8 bg-slate-950 text-slate-200 rounded-xl text-[11px] font-mono overflow-x-auto max-h-48 border border-slate-800 leading-normal">
                {config.appsScriptTemplate || 'Loading template...'}
              </pre>
            </div>

            <ol start={4} className="mt-3 text-xs text-slate-600 space-y-2 list-decimal list-inside leading-relaxed">
              <li>
                Klik tombol biru <b>Deploy (Terapkan)</b> di kanan atas &gt; <b>New deployment (Penerapan baru)</b>.
              </li>
              <li>
                Pilih tipe ikon roda gigi &gt; <b>Web app (Aplikasi web)</b>.
              </li>
              <li>
                Pada <i>Who has access (Siapa yang memiliki akses)</i>, pilih <b>Anyone (Siapa saja)</b>.
              </li>
              <li>
                Klik <b>Deploy</b>, setujui perizinan Google Anda, lalu salin <b>Web app URL</b> dan tempelkan ke form di atas!
              </li>
            </ol>
          </div>

          {/* Offline CSV Alternative */}
          <div className="p-3.5 bg-slate-100/70 rounded-xl border border-slate-200 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-800">
                Mau buka langsung tanpa Apps Script?
              </p>
              <p className="text-[11px] text-slate-500">
                Anda bisa download file CSV yang siap dibuka langsung di Excel atau di-import ke Google Sheets.
              </p>
            </div>
            <a
              href="/api/export-csv"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold shrink-0 cursor-pointer shadow-2xs"
            >
              <Download className="w-3.5 h-3.5" />
              Download CSV
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
}
