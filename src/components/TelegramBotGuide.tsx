import React, { useState } from 'react';
import {
  Smartphone,
  Bot,
  Send,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ExternalLink,
  Camera,
  Sparkles,
  RefreshCw,
  HelpCircle,
  MessageSquare,
  ShieldCheck,
  Key,
} from 'lucide-react';
import { AppConfig, SystemStatus } from '../types';

interface TelegramBotGuideProps {
  config: AppConfig;
  status: SystemStatus | null;
  onUpdateConfig: (updates: Partial<AppConfig>) => Promise<void>;
  onRefreshStatus: () => Promise<void>;
}

export function TelegramBotGuide({
  config,
  status,
  onUpdateConfig,
  onRefreshStatus,
}: TelegramBotGuideProps) {
  const [tokenInput, setTokenInput] = useState(config.telegramBotToken || '');
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectMessage, setConnectMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Chat simulator state
  const [simMessages, setSimMessages] = useState<Array<{ sender: 'user' | 'bot'; text: string; isPhoto?: boolean }>>([
    {
      sender: 'bot',
      text: '👋 Halo! Saya asisten bot pencatat belanjaan kamu. Kirim foto bon/struk belanja dari kamera iPhone atau ketik langsung seperti:\n"Beras 5kg 75000"\n"Minyak 2L 35rb, Telur 1kg 28rb"',
    },
  ]);
  const [simInput, setSimInput] = useState('');
  const [isSimLoading, setIsSimLoading] = useState(false);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleSetWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) {
      setConnectMessage({ type: 'error', text: 'Mohon masukkan Bot Token dari @BotFather.' });
      return;
    }

    setIsConnecting(true);
    setConnectMessage(null);

    try {
      const res = await fetch('/api/telegram/set-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: tokenInput.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.telegramResponse?.description || 'Gagal mengatur webhook');
      }

      setConnectMessage({
        type: 'success',
        text: `Sukses terhubung! Bot @${data.botInfo?.username || 'kamu'} sudah aktif menerima foto bon & pesan dari iPhone!`,
      });

      await onUpdateConfig({
        telegramBotToken: tokenInput.trim(),
        botUsername: data.botInfo?.username,
      });
      await onRefreshStatus();
    } catch (err: any) {
      setConnectMessage({
        type: 'error',
        text: err.message || 'Gagal menghubungi server Telegram.',
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSimSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simInput.trim()) return;

    const userText = simInput.trim();
    setSimMessages(prev => [...prev, { sender: 'user', text: userText }]);
    setSimInput('');
    setIsSimLoading(true);

    try {
      if (userText === '/rekap' || userText === '/total') {
        const res = await fetch('/api/expenses');
        const data = await res.json();
        const total = (data.items || []).reduce((sum: number, it: any) => sum + (it.total || 0), 0);
        setSimMessages(prev => [
          ...prev,
          {
            sender: 'bot',
            text: `📊 *REKAP PENGELUARAN*\n\nTotal belanja tercatat: Rp ${total.toLocaleString('id-ID')}\nJumlah item: ${data.items?.length || 0} barang.\nData otomatis sinkron ke Spreadsheet!`,
          },
        ]);
      } else if (userText === '/daftar' || userText === '/lihat' || userText === '/belanja' || userText === '/list') {
        const res = await fetch('/api/expenses');
        const data = await res.json();
        const items = (data.items || []).slice(0, 4);
        const listStr = items.map((it: any, i: number) => `${i + 1}. *${it.name}*\n   ↳ ${it.qty} ${it.unit} × Rp ${it.price.toLocaleString('id-ID')} = *Rp ${it.total.toLocaleString('id-ID')}*\n   [✏️ Edit]  [🗑️ Hapus]`).join('\n\n');
        setSimMessages(prev => [
          ...prev,
          {
            sender: 'bot',
            text: `📋 *DAFTAR DATA BELANJAAN* 🛒\n_Total: ${data.items?.length || 0} barang tersimpan_\n\n${listStr}\n\n_Tombol [✏️ Edit] & [🗑️ Hapus] disematkan interaktif di Telegram!_`,
          },
        ]);
      } else {
        const res = await fetch('/api/parse-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: userText, autoSave: true }),
        });
        const data = await res.json();
        if (data.success && data.parsed) {
          const p = data.parsed;
          const itemsStr = p.items.map((it: any) => `• ${it.name} (${it.qty} ${it.unit}): Rp ${it.total.toLocaleString('id-ID')}`).join('\n');
          setSimMessages(prev => [
            ...prev,
            {
              sender: 'bot',
              text: `✅ *Belanjaan Berhasil Dicatat!*\n\n🏪 Toko: ${p.storeName}\n🛒 Item:\n${itemsStr}\n\n💰 Total: Rp ${p.grandTotal.toLocaleString('id-ID')}\n📊 Otomatis masuk ke Spreadsheet!`,
            },
          ]);
          onRefreshStatus();
        } else {
          setSimMessages(prev => [
            ...prev,
            { sender: 'bot', text: '⚠️ Tidak dapat membaca teks. Coba: "Beras 5kg 75000" atau foto bon belanjaan.' },
          ]);
        }
      }
    } catch (err: any) {
      setSimMessages(prev => [
        ...prev,
        { sender: 'bot', text: '⚠️ Terjadi kesalahan. Pastikan server aktif.' },
      ]);
    } finally {
      setIsSimLoading(false);
    }
  };

  const handleSimSendSampleReceipt = async () => {
    setSimMessages(prev => [
      ...prev,
      { sender: 'user', text: '📸 [Foto Struk Belanja Indomaret]', isPhoto: true },
      { sender: 'bot', text: '🔍 Sedang membaca foto bon belanjaan dengan AI OCR...' },
    ]);
    setIsSimLoading(true);

    try {
      // Simulate quick OCR result
      setTimeout(async () => {
        const res = await fetch('/api/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [
              { name: 'Minyak Goreng Sania 2L', qty: 1, unit: 'pouch', price: 34500, total: 34500, category: 'Bumbu & Minyak', store: 'Indomaret', source: 'telegram_ocr' },
              { name: 'Telur Ayam Omega 10s', qty: 1, unit: 'pack', price: 28000, total: 28000, category: 'Sembako', store: 'Indomaret', source: 'telegram_ocr' },
              { name: 'Roti Tawar Kupas Sari Roti', qty: 1, unit: 'pack', price: 16000, total: 16000, category: 'Makanan & Minuman', store: 'Indomaret', source: 'telegram_ocr' },
            ],
          }),
        });
        await res.json();
        setSimMessages(prev => [
          ...prev,
          {
            sender: 'bot',
            text: `🧾 *STRUK BELANJA BERHASIL DICATAT!*\n\n🏪 Toko: Indomaret Point\n📅 Tanggal: ${new Date().toISOString().split('T')[0]}\n\n🛒 Daftar Barang:\n1. Minyak Goreng Sania 2L (1 pouch) = Rp 34.500\n2. Telur Ayam Omega 10s (1 pack) = Rp 28.000\n3. Roti Tawar Kupas (1 pack) = Rp 16.000\n\n💰 Grand Total: *Rp 78.500*\n📊 Google Sheets: ✅ Berhasil dimasukkan ke Spreadsheet!`,
          },
        ]);
        setIsSimLoading(false);
        onRefreshStatus();
      }, 1500);
    } catch (e) {
      setIsSimLoading(false);
    }
  };

  const botUsername = status?.botInfo?.username || config.botUsername;
  const tgDeepLink = botUsername ? `tg://resolve?domain=${botUsername}` : 'https://t.me/BotFather';
  const tgWebLink = botUsername ? `https://t.me/${botUsername}` : 'https://t.me/BotFather';

  return (
    <div className="space-y-6">
      {/* Hero Banner for iPhone Users */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-6 sm:p-8 shadow-md border border-slate-700 relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold mb-3 border border-emerald-500/30">
            <Smartphone className="w-3.5 h-3.5" />
            Panduan Lengkap untuk Pengguna iPhone & iOS
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white leading-snug">
            Catat Belanjaan Praktis dari Telegram iPhone Anda
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-slate-300 leading-relaxed">
            Tidak perlu install aplikasi tambahan di iPhone! Cukup buka Telegram, ambil foto bon belanjaan dari kamera iPhone atau ketik catatan belanja, dan AI akan otomatis membaca (OCR) lalu mencatatnya ke Spreadsheet.
          </p>

          {botUsername && (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <a
                id="link-open-telegram-ios"
                href={tgDeepLink}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-slate-950 text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <Send className="w-4 h-4" />
                Buka Bot di Telegram iPhone (@{botUsername})
              </a>
              <a
                id="link-open-telegram-web"
                href={tgWebLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl border border-white/20 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Buka di Web
              </a>
            </div>
          )}
        </div>
      </div>

      {/* 3-Step Setup Guide */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Step 1 */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <span className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs">
              1
            </span>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Di Telegram iPhone
            </span>
          </div>
          <h3 className="text-sm font-bold text-slate-900 mb-1.5">
            Buat Bot di @BotFather
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed flex-1">
            Buka aplikasi Telegram di iPhone Anda, cari akun resmi <b>@BotFather</b>, lalu ketik perintah:
          </p>
          <div className="mt-3 bg-slate-50 p-2 rounded-lg border border-slate-200 flex items-center justify-between text-xs font-mono text-slate-800">
            <span>/newbot</span>
            <button
              onClick={() => handleCopy('/newbot', 'newbot')}
              className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              {copiedText === 'newbot' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Ikuti petunjuk BotFather (masukkan nama & username bot). BotFather akan memberikan <b>Bot Token</b> Anda.
          </p>
        </div>

        {/* Step 2 */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <span className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
              2
            </span>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Konfigurasi Webhook
            </span>
          </div>
          <h3 className="text-sm font-bold text-slate-900 mb-1.5">
            Tempelkan Token & Hubungkan
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed flex-1">
            Masukkan Bot Token yang Anda dapatkan dari @BotFather ke kotak di bawah ini, lalu klik tombol <b>Hubungkan Webhook</b>.
          </p>
          <div className="mt-3 p-2 bg-emerald-50 rounded-lg border border-emerald-200 text-emerald-800 text-[11px] font-medium flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            1-Klik setting otomatis ke server Telegram
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Sistem langsung mengaktifkan penerimaan foto bon belanjaan dan input manual.
          </p>
        </div>

        {/* Step 3 */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <span className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
              3
            </span>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Mulai Pakai di iPhone
            </span>
          </div>
          <h3 className="text-sm font-bold text-slate-900 mb-1.5">
            Foto Bon atau Ketik Chat
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed flex-1">
            Buka chat bot Anda di iPhone:
          </p>
          <ul className="mt-2 text-xs text-slate-600 space-y-1.5 list-disc list-inside">
            <li><b>Lihat Data Belanja:</b> Ketik <code className="text-slate-800 font-mono bg-slate-100 px-1 py-0.5 rounded">/daftar</code> untuk melihat list dengan tombol <b>Edit (✏️)</b> & <b>Hapus (🗑️)</b>.</li>
            <li><b>Hapus Semua Data:</b> Ketik <code className="text-slate-800 font-mono bg-slate-100 px-1 py-0.5 rounded">/hapussemua</code> atau <code className="text-slate-800 font-mono bg-slate-100 px-1 py-0.5 rounded">/reset</code> untuk mengosongkan seluruh belanjaan dengan konfirmasi aman.</li>
            <li><b>Foto Bon:</b> Tekan ikon kamera Telegram & kirim struk belanja.</li>
            <li><b>Ketik Manual:</b> Contoh: <code className="text-slate-800 font-mono bg-slate-100 px-1 py-0.5 rounded">Beras 5kg 75000</code></li>
            <li><b>Cek Pengeluaran:</b> Ketik <code className="text-slate-800 font-mono bg-slate-100 px-1 py-0.5 rounded">/rekap</code></li>
          </ul>
        </div>
      </div>

      {/* Webhook Configuration Form */}
      <div className="bg-white p-5 sm:p-6 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Key className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Pengaturan Bot Token & Webhook Telegram
            </h3>
            <p className="text-xs text-slate-500">
              Masukkan token bot dari BotFather untuk mengaktifkan bot secara live
            </p>
          </div>
        </div>

        {connectMessage && (
          <div
            className={`p-3.5 mb-4 rounded-xl text-xs flex items-start gap-2.5 ${
              connectMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {connectMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            )}
            <p className="font-medium">{connectMessage.text}</p>
          </div>
        )}

        <form onSubmit={handleSetWebhook} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Telegram Bot Token (dari @BotFather)
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id="input-telegram-bot-token"
                type="text"
                value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
                placeholder="Contoh: 7123456789:AAHxxxxxx_xxxxxxxxx"
                className="flex-1 px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
              <button
                id="btn-connect-telegram-webhook"
                type="submit"
                disabled={isConnecting}
                className="inline-flex items-center justify-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer shrink-0"
              >
                {isConnecting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Menghubungkan...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Simpan & Aktifkan Bot
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Bot Connection & Real-Time Status Info */}
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Status Bot:</span>
              {status?.botConfigured ? (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    Online (@{status.botInfo?.username || 'Bot'})
                  </span>
                  <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                    Mode Real-Time Aktif
                  </span>
                </div>
              ) : (
                <span className="inline-flex items-center gap-1 font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                  <AlertCircle className="w-3 h-3 text-amber-600" />
                  Belum Dikonfigurasi
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onRefreshStatus()}
                className="inline-flex items-center gap-1 text-[11px] text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 rounded border border-slate-200 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                Refresh Status
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Interactive Telegram Chat Simulator (Preview Experience) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center font-bold text-slate-950 text-xs">
              🤖
            </div>
            <div>
              <h4 className="text-xs font-bold">Simulator Percakapan Bot Telegram iPhone</h4>
              <p className="text-[10px] text-slate-400">
                Uji coba langsung respons bot saat menerima teks atau foto struk
              </p>
            </div>
          </div>

          <button
            onClick={handleSimSendSampleReceipt}
            disabled={isSimLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold border border-white/20 transition-colors cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5 text-emerald-400" />
            Simulasi Kirim Foto Bon
          </button>
        </div>

        {/* Chat Messages */}
        <div className="p-4 bg-slate-100/60 min-h-[260px] max-h-[380px] overflow-y-auto space-y-3">
          {simMessages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] sm:max-w-[75%] p-3 rounded-2xl text-xs whitespace-pre-line shadow-2xs leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-emerald-600 text-white rounded-br-xs'
                    : 'bg-white text-slate-800 border border-slate-200 rounded-bl-xs'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {isSimLoading && (
            <div className="flex justify-start">
              <div className="bg-white p-3 rounded-2xl rounded-bl-xs text-xs text-slate-500 border border-slate-200 flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                AI sedang menganalisis pesan...
              </div>
            </div>
          )}
        </div>

        {/* Chat Input */}
        <form onSubmit={handleSimSend} className="p-3 bg-white border-t border-slate-200 flex items-center gap-2">
          <input
            type="text"
            value={simInput}
            onChange={e => setSimInput(e.target.value)}
            placeholder="Ketik pesan tes (cth: 'Beras 5kg 75000' atau '/rekap')..."
            className="flex-1 px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
          />
          <button
            type="submit"
            disabled={!simInput.trim() || isSimLoading}
            className="p-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl transition-colors cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
