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
  onPullAll?: () => Promise<void>;
  isPulling?: boolean;
}

export function GoogleSheetsModal({
  isOpen,
  onClose,
  config,
  onUpdateConfig,
  onSyncAll,
  isSyncing,
  onPullAll,
  isPulling,
}: GoogleSheetsModalProps) {
  const [webhookUrl, setWebhookUrl] = useState(config.googleSheetsWebhookUrl || '');
  const [autoSync, setAutoSync] = useState(config.autoSyncToSheets ?? true);
  const [copiedCode, setCopiedCode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isConnecting24h, setIsConnecting24h] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

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

  const handleConnect24hTelegram = async () => {
    if (!webhookUrl || !webhookUrl.startsWith('https://script.google.com/')) {
      setFeedback({
        type: 'error',
        message: 'Masukkan URL Web App Google Apps Script yang valid terlebih dahulu (harus diawali https://script.google.com/macros/s/.../exec).',
      });
      return;
    }

    setIsConnecting24h(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/telegram/set-sheets-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: config.telegramBotToken,
          sheetsUrl: webhookUrl.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          type: 'success',
          message: data.message || '⚡ Mode 24/7 Always-On Aktif! Telegram terhubung langsung ke Google Apps Script tanpa bergantung server AI Studio.',
        });
        await onUpdateConfig({
          googleSheetsWebhookUrl: webhookUrl.trim(),
          telegramMode: 'webhook',
          registeredWebhookUrl: webhookUrl.trim(),
        });
      } else {
        setFeedback({
          type: 'error',
          message: data.error || 'Gagal menghubungkan webhook Telegram ke Google Apps Script.',
        });
      }
    } catch (e: any) {
      setFeedback({
        type: 'error',
        message: e.message || 'Terjadi kesalahan saat menghubungkan.',
      });
    } finally {
      setIsConnecting24h(false);
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
          {/* Fitur Sinkronisasi Banner */}
          <div className="p-3.5 bg-linear-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-200/80 rounded-xl space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <h4 className="text-xs font-bold text-emerald-950 uppercase tracking-wider">
                Sinkronisasi Dua Arah Otomatis:
              </h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700">
              <div className="flex items-start gap-2 bg-white/80 p-2 rounded-lg border border-emerald-100">
                <span className="text-emerald-600 font-bold">➕</span>
                <div>
                  <span className="font-semibold text-slate-900">Tambah Otomatis:</span>
                  <p className="text-[11px] text-slate-500">Foto bon & input Telegram/web langsung jadi baris baru.</p>
                </div>
              </div>
              <div className="flex items-start gap-2 bg-white/80 p-2 rounded-lg border border-emerald-100">
                <span className="text-rose-600 font-bold">🗑️</span>
                <div>
                  <span className="font-semibold text-slate-900">Hapus Otomatis:</span>
                  <p className="text-[11px] text-slate-500">Hapus belanjaan di sini / Telegram otomatis hapus baris di Spreadsheet.</p>
                </div>
              </div>
            </div>
          </div>

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

            <div className="pt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onSyncAll}
                  disabled={isSyncing || !webhookUrl}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 disabled:opacity-50 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? 'Menyinkronkan...' : 'Sync ke Sheets'}
                </button>

                {onPullAll && (
                  <button
                    type="button"
                    onClick={onPullAll}
                    disabled={isPulling || !webhookUrl}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 border border-indigo-200 text-indigo-700 text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
                  >
                    <Download className={`w-3.5 h-3.5 ${isPulling ? 'animate-spin' : ''}`} />
                    {isPulling ? 'Menarik data...' : 'Tarik Data dari Sheets'}
                  </button>
                )}
              </div>

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

          {/* 24/7 Always-On Direct Connect Box */}
          <div className="p-4 bg-gradient-to-br from-indigo-50/90 via-purple-50/50 to-emerald-50/80 border border-indigo-200/90 rounded-xl space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600 text-white uppercase tracking-wider mb-1">
                  Solusi Bot Online 24/7 Bebas Tidur
                </span>
                <h4 className="text-xs font-bold text-slate-900">
                  Jalankan Bot Langsung di Google Apps Script (Tanpa Perlu Buka AI Studio)
                </h4>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Lingkungan AI Studio otomatis <b>hibernasi/tidur (scale-to-zero)</b> jika 10-15 menit tidak dibuka. Agar bot Telegram Anda <b>tetap langsung merespons kapan saja (24 jam non-stop)</b>, sambungkan webhook Telegram langsung ke URL Web App Google Apps Script di atas!
            </p>
            <div className="pt-1">
              <button
                type="button"
                onClick={handleConnect24hTelegram}
                disabled={isConnecting24h || !webhookUrl}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isConnecting24h ? 'animate-spin' : ''}`} />
                {isConnecting24h ? 'Menghubungkan ke Telegram...' : '⚡ Aktifkan Mode 24/7 Always-On Sekarang'}
              </button>
            </div>
          </div>

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
            <div className="mt-2.5 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900 leading-normal">
              💡 <b>Catatan untuk yang sudah pernah pasang:</b> Jika sebelumnya Anda sudah membuat Web App Google Sheets, salin kode script terbaru ini, lalu pilih <b>Deploy &gt; Manage deployments &gt; Edit (ikon pensil) &gt; Version: New version &gt; Deploy</b> agar fitur otomatis hapus data aktif.
            </div>
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
