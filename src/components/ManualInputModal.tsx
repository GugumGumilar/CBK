import React, { useState } from 'react';
import {
  Plus,
  X,
  Sparkles,
  ShoppingBag,
  Store,
  Calendar,
  DollarSign,
  Layers,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';

interface ManualInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onItemAdded: () => void;
}

export function ManualInputModal({ isOpen, onClose, onItemAdded }: ManualInputModalProps) {
  const [activeTab, setActiveTab] = useState<'quick' | 'form'>('quick');

  // Quick Natural Text State
  const [quickText, setQuickText] = useState('');
  const [isParsingQuick, setIsParsingQuick] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [store, setStore] = useState('Pasar Tradisional');
  const [category, setCategory] = useState('Sembako');
  const [qty, setQty] = useState('1');
  const [unit, setUnit] = useState('pcs');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleQuickTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickText.trim()) return;

    setIsParsingQuick(true);
    setError(null);

    try {
      const res = await fetch('/api/parse-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: quickText,
          autoSave: true,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal memproses catatan teks.');
      }

      onItemAdded();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan saat memproses teks.');
    } finally {
      setIsParsingQuick(false);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Nama barang harus diisi.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const numQty = parseFloat(qty) || 1;
      const numPrice = parseFloat(price) || 0;
      const total = numQty * numPrice;

      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          store: store.trim() || 'Belanja Harian',
          category,
          qty: numQty,
          unit: unit.trim() || 'pcs',
          price: numPrice,
          total,
          date,
          notes: notes.trim(),
          source: 'web_manual',
        }),
      });

      if (!res.ok) {
        throw new Error('Gagal menyimpan barang ke spreadsheet.');
      }

      onItemAdded();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Gagal menyimpan data.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-auto">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-2xs">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Input Catatan Belanjaan Manual
              </h3>
              <p className="text-xs text-slate-500">
                Tulis langsung dengan bahasa natural atau formulir
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

        {/* Tab Toggle */}
        <div className="p-3 bg-slate-100/60 border-b border-slate-200/80 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab('quick');
              setError(null);
            }}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'quick'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            Ketik Bebas (AI Natural Parser)
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('form');
              setError(null);
            }}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'form'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5 text-slate-600" />
            Formulir Rinci
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5">
          {error && (
            <div className="p-3 mb-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-800 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          {activeTab === 'quick' ? (
            <form onSubmit={handleQuickTextSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Tulis Catatan Belanjaan Anda:
                </label>
                <textarea
                  id="textarea-quick-expense"
                  rows={4}
                  value={quickText}
                  onChange={e => setQuickText(e.target.value)}
                  placeholder="Contoh:&#10;• Beras pandan 5kg 78000 di Pasar&#10;• Minyak goreng 2L 34rb, Telur 1kg 28rb di Superindo&#10;• Beli susu ultra 18000 dan roti 15000"
                  className="w-full p-3 border border-slate-300 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-sans leading-relaxed"
                />
              </div>

              <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl text-xs text-emerald-800 space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  Format ini sama persis seperti kirim chat di Telegram!
                </p>
                <p className="text-[11px] text-emerald-700 leading-normal">
                  AI otomatis mengenali nama barang, jumlah (kg/pcs), singkatan harga (cth: 28rb, 50k), dan nama toko.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-100 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  id="btn-submit-quick-expense"
                  type="submit"
                  disabled={isParsingQuick || !quickText.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  {isParsingQuick ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Mengekstrak Belanjaan...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Simpan ke Spreadsheet
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleFormSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Barang Belanjaan *
                </label>
                <input
                  id="input-form-item-name"
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Cth: Beras Rojo Lele 5kg, Telur Ayam 1kg..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Toko / Tempat Beli
                  </label>
                  <input
                    type="text"
                    value={store}
                    onChange={e => setStore(e.target.value)}
                    placeholder="Cth: Indomaret, Pasar..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kategori
                  </label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-800 bg-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Sembako">Sembako</option>
                    <option value="Sayuran & Buah">Sayuran & Buah</option>
                    <option value="Daging & Ikan">Daging & Ikan</option>
                    <option value="Bumbu & Minyak">Bumbu & Minyak</option>
                    <option value="Makanan & Minuman">Makanan & Minuman</option>
                    <option value="Kebutuhan Rumah">Kebutuhan Rumah</option>
                    <option value="Lain-lain">Lain-lain</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Jumlah (Qty)
                  </label>
                  <input
                    type="number"
                    min="0.1"
                    step="any"
                    value={qty}
                    onChange={e => setQty(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-emerald-500 text-right font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Satuan
                  </label>
                  <input
                    type="text"
                    value={unit}
                    onChange={e => setUnit(e.target.value)}
                    placeholder="pcs, kg, ikat..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Harga Satuan (Rp)
                  </label>
                  <input
                    type="number"
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    placeholder="25000"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-emerald-500 text-right font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tanggal
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Catatan (Opsional)
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Merk, varian..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-100 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  id="btn-submit-form-expense"
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Simpan Barang
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
