import React, { useState, useRef } from 'react';
import {
  Camera,
  Upload,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  X,
  Plus,
  Trash2,
  Store,
  Calendar,
  FileText,
  DollarSign,
  Loader2,
  Image as ImageIcon,
} from 'lucide-react';
import { ParsedReceiptData, ParsedItem } from '../types';

interface ReceiptScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReceiptSaved: () => void;
}

export function ReceiptScannerModal({ isOpen, onClose, onReceiptSaved }: ReceiptScannerModalProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('image/jpeg');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<ParsedReceiptData | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setMimeType('image/jpeg');

    const reader = new FileReader();
    reader.onload = () => {
      const rawBase64 = reader.result as string;
      // Optimize image for fast and reliable OCR
      const img = new Image();
      img.onload = () => {
        const maxDimension = 1400;
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const optimizedBase64 = canvas.toDataURL('image/jpeg', 0.85);
          setSelectedImage(optimizedBase64);
        } else {
          setSelectedImage(rawBase64);
        }
        setParsedData(null);
      };
      img.onerror = () => {
        setSelectedImage(rawBase64);
        setParsedData(null);
      };
      img.src = rawBase64;
    };
    reader.readAsDataURL(file);
  };

  const handleProcessOCR = async () => {
    if (!selectedImage) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: selectedImage,
          mimeType,
          autoSave: false,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal memproses struk dengan OCR.');
      }

      setParsedData(data.parsed);
    } catch (err: any) {
      console.error('OCR error:', err);
      let errText = err?.message || 'Terjadi kesalahan saat memproses OCR.';
      if (errText.includes('503') || errText.includes('high demand') || errText.includes('UNAVAILABLE')) {
        errText = 'Server AI Google sedang mengalami lonjakan trafik sementara (503). Silakan tekan tombol "Coba Lagi" di bawah dalam beberapa detik.';
      } else {
        try {
          const parsedErr = JSON.parse(errText);
          if (parsedErr?.error?.message) {
            errText = parsedErr.error.message;
          }
        } catch {}
      }
      setError(errText);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveToSpreadsheet = async () => {
    if (!parsedData) return;

    setIsSaving(true);
    setError(null);

    try {
      const itemsToAdd = parsedData.items.map((it, idx) => ({
        id: `item-${Date.now()}-${idx}`,
        date: parsedData.date || new Date().toISOString().split('T')[0],
        time: parsedData.time || new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        store: parsedData.storeName || 'Toko Swalayan',
        name: it.name,
        category: it.category || 'Sembako',
        qty: it.qty,
        unit: it.unit || 'pcs',
        price: it.price,
        total: it.total,
        source: 'web_ocr',
        notes: parsedData.rawNotes || '',
      }));

      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToAdd }),
      });

      if (!res.ok) {
        throw new Error('Gagal menyimpan belanjaan ke database.');
      }

      onReceiptSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Gagal menyimpan ke spreadsheet.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleItemChange = (index: number, field: keyof ParsedItem, val: any) => {
    if (!parsedData) return;
    const nextItems = [...parsedData.items];
    nextItems[index] = { ...nextItems[index], [field]: val };

    if (field === 'qty' || field === 'price') {
      const qty = Number(field === 'qty' ? val : nextItems[index].qty) || 1;
      const price = Number(field === 'price' ? val : nextItems[index].price) || 0;
      nextItems[index].total = qty * price;
    }

    const nextGrandTotal = nextItems.reduce((acc, it) => acc + (it.total || 0), 0);
    setParsedData({
      ...parsedData,
      items: nextItems,
      grandTotal: nextGrandTotal,
    });
  };

  const handleDeleteItem = (index: number) => {
    if (!parsedData) return;
    const nextItems = parsedData.items.filter((_, i) => i !== index);
    const nextGrandTotal = nextItems.reduce((acc, it) => acc + (it.total || 0), 0);
    setParsedData({
      ...parsedData,
      items: nextItems,
      grandTotal: nextGrandTotal,
    });
  };

  const handleAddItem = () => {
    if (!parsedData) return;
    const newItem: ParsedItem = {
      name: 'Item Baru',
      qty: 1,
      unit: 'pcs',
      price: 10000,
      total: 10000,
      category: 'Sembako',
    };
    const nextItems = [...parsedData.items, newItem];
    setParsedData({
      ...parsedData,
      items: nextItems,
      grandTotal: nextItems.reduce((acc, it) => acc + (it.total || 0), 0),
    });
  };

  // Sample receipt generator for quick testing
  const handleLoadSampleReceipt = () => {
    // Generate a simple receipt canvas image
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 550;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 400, 550);

    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SUPERINDO FRESH', 200, 40);

    ctx.font = '12px sans-serif';
    ctx.fillText('Jl. Boulevard No. 88, Jakarta', 200, 65);
    ctx.fillText('Tanggal: 20-09-2026 14:30 WIB', 200, 85);
    ctx.fillText('----------------------------------------------------', 200, 105);

    ctx.textAlign = 'left';
    ctx.font = '13px monospace';
    const items = [
      { name: 'BERAS PANDAN WANGI 5KG', qty: '1 x 78.500', total: '78.500' },
      { name: 'MINYAK GORENG SANIA 2L', qty: '1 x 34.000', total: '34.000' },
      { name: 'TELUR AYAM 10 BUTIR', qty: '1 x 26.500', total: '26.500' },
      { name: 'SAYUR BAYAM SEGAR', qty: '2 x 4.500', total: '9.000' },
      { name: 'INDOMIE AYAM BAWANG', qty: '5 x 3.100', total: '15.500' },
      { name: 'SABUN MANDI LIFEBUOY', qty: '1 x 18.000', total: '18.000' },
    ];

    let y = 135;
    items.forEach(it => {
      ctx.fillText(it.name, 25, y);
      y += 18;
      ctx.fillText(it.qty, 40, y);
      ctx.textAlign = 'right';
      ctx.fillText(it.total, 375, y);
      ctx.textAlign = 'left';
      y += 24;
    });

    ctx.textAlign = 'center';
    ctx.fillText('----------------------------------------------------', 200, y);
    y += 25;

    ctx.textAlign = 'left';
    ctx.font = 'bold 15px monospace';
    ctx.fillText('TOTAL PEMBAYARAN', 25, y);
    ctx.textAlign = 'right';
    ctx.fillText('Rp 181.500', 375, y);

    y += 30;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PEMBAYARAN: QRIS BCA', 200, y);
    y += 20;
    ctx.fillText('Terima Kasih Telah Berbelanja', 200, y);

    const base64 = canvas.toDataURL('image/png');
    setSelectedImage(base64);
    setMimeType('image/png');
    setParsedData(null);
  };

  const formatIDR = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val || 0);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-2xs">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Scan Bon Belanjaan (OCR AI)
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-emerald-600 text-white">
                  Gemini 3.8 Flash
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                Foto struk dari kamera iPhone atau upload foto untuk mengekstrak barang otomatis
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
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-rose-800 text-xs">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Info Pemrosesan OCR</p>
                  <p className="mt-0.5 text-rose-700">{error}</p>
                </div>
              </div>
              {selectedImage && !isLoading && (
                <button
                  type="button"
                  onClick={handleProcessOCR}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shrink-0 cursor-pointer shadow-2xs self-end sm:self-auto"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Coba Lagi
                </button>
              )}
            </div>
          )}

          {/* Section 1: Upload / Capture */}
          {!parsedData && (
            <div>
              {/* Hidden file inputs */}
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <input
                type="file"
                ref={cameraInputRef}
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
              />

              {!selectedImage ? (
                <div className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-2xl p-6 sm:p-8 text-center transition-colors bg-slate-50/50 flex flex-col items-center justify-center">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
                    <Camera className="w-7 h-7" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-800">
                    Ambil Foto Bon dari Kamera iPhone atau Galeri
                  </h4>
                  <p className="text-xs text-slate-500 max-w-sm mt-1 mb-5">
                    Mendukung struk Indomaret, Alfamart, Superindo, Pasar Tradisional, Toko Sayur, dan Swalayan lainnya.
                  </p>

                  <div className="flex flex-wrap items-center justify-center gap-2.5">
                    {/* Primary Camera Button for iPhone */}
                    <button
                      id="btn-take-photo-iphone"
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
                    >
                      <Camera className="w-4 h-4" />
                      Buka Kamera iPhone
                    </button>

                    {/* Choose from Library */}
                    <button
                      id="btn-choose-from-gallery"
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold rounded-xl shadow-2xs transition-colors cursor-pointer"
                    >
                      <Upload className="w-4 h-4" />
                      Pilih dari Galeri Foto
                    </button>

                    {/* Test with Sample Receipt */}
                    <button
                      id="btn-load-sample-receipt"
                      type="button"
                      onClick={handleLoadSampleReceipt}
                      className="inline-flex items-center gap-2 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4 text-indigo-500" />
                      Coba Struk Contoh (Test OCR)
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                    <div className="w-32 h-44 rounded-xl overflow-hidden bg-slate-900 border border-slate-300 shrink-0 relative flex items-center justify-center">
                      <img
                        src={selectedImage}
                        alt="Struk Belanja"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="flex-1 text-center sm:text-left">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md mb-2">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Foto Bon Siap Dianalisis
                      </span>
                      <h4 className="text-sm font-bold text-slate-900">
                        Klik &quot;Mulai Baca Bon (OCR)&quot;
                      </h4>
                      <p className="text-xs text-slate-500 mt-1 max-w-md">
                        AI Gemini akan membaca nama setiap barang, jumlah (qty), harga satuan, dan menghitung total secara otomatis.
                      </p>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <button
                          id="btn-start-ocr-process"
                          type="button"
                          onClick={handleProcessOCR}
                          disabled={isLoading}
                          className="inline-flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                        >
                          {isLoading ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Sedang Menganalisis Struk...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4" />
                              Mulai Baca Bon (OCR)
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedImage(null);
                            setParsedData(null);
                          }}
                          disabled={isLoading}
                          className="px-3.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                        >
                          Ganti Foto
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Section 2: OCR Results Review Table */}
          {parsedData && (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-200/60 pb-3 mb-3">
                  <div className="flex items-center gap-2">
                    <Store className="w-4 h-4 text-emerald-700" />
                    <span className="text-xs font-bold text-slate-700">Toko:</span>
                    <input
                      type="text"
                      value={parsedData.storeName}
                      onChange={e => setParsedData({ ...parsedData, storeName: e.target.value })}
                      className="px-2 py-1 bg-white border border-emerald-300 rounded-md text-xs font-bold text-slate-900"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-emerald-700" />
                    <span className="text-xs font-bold text-slate-700">Tanggal:</span>
                    <input
                      type="date"
                      value={parsedData.date}
                      onChange={e => setParsedData({ ...parsedData, date: e.target.value })}
                      className="px-2 py-1 bg-white border border-emerald-300 rounded-md text-xs font-semibold text-slate-800"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-emerald-900 font-medium">
                    ✅ Ditemukan <b>{parsedData.items.length} item barang</b> dari struk. Anda dapat memeriksa dan mengedit data sebelum menyimpan.
                  </span>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-800 rounded-md text-xs font-bold transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Tambah Barang
                  </button>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100/90 text-slate-600 text-[11px] font-bold uppercase sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Nama Barang</th>
                      <th className="py-2 px-2 w-28">Kategori</th>
                      <th className="py-2 px-2 w-20 text-right">Qty</th>
                      <th className="py-2 px-2 w-28 text-right">Harga Satuan</th>
                      <th className="py-2 px-3 w-28 text-right">Total</th>
                      <th className="py-2 px-2 w-10 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedData.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/60">
                        <td className="py-1.5 px-3">
                          <input
                            type="text"
                            value={item.name}
                            onChange={e => handleItemChange(idx, 'name', e.target.value)}
                            className="w-full px-2 py-1 border border-slate-200 rounded text-xs font-medium text-slate-800 focus:border-emerald-500"
                          />
                        </td>
                        <td className="py-1.5 px-2">
                          <select
                            value={item.category}
                            onChange={e => handleItemChange(idx, 'category', e.target.value)}
                            className="w-full px-1.5 py-1 border border-slate-200 rounded text-xs text-slate-700 bg-white"
                          >
                            <option value="Sembako">Sembako</option>
                            <option value="Sayuran & Buah">Sayuran & Buah</option>
                            <option value="Daging & Ikan">Daging & Ikan</option>
                            <option value="Bumbu & Minyak">Bumbu & Minyak</option>
                            <option value="Makanan & Minuman">Makanan & Minuman</option>
                            <option value="Kebutuhan Rumah">Kebutuhan Rumah</option>
                            <option value="Lain-lain">Lain-lain</option>
                          </select>
                        </td>
                        <td className="py-1.5 px-2">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="0.1"
                              step="any"
                              value={item.qty}
                              onChange={e => handleItemChange(idx, 'qty', parseFloat(e.target.value) || 1)}
                              className="w-12 px-1 py-1 border border-slate-200 rounded text-xs text-right font-mono"
                            />
                            <input
                              type="text"
                              value={item.unit}
                              onChange={e => handleItemChange(idx, 'unit', e.target.value)}
                              className="w-10 px-1 py-1 border border-slate-200 rounded text-[11px] text-slate-500"
                            />
                          </div>
                        </td>
                        <td className="py-1.5 px-2">
                          <input
                            type="number"
                            value={item.price}
                            onChange={e => handleItemChange(idx, 'price', parseFloat(e.target.value) || 0)}
                            className="w-full px-1.5 py-1 border border-slate-200 rounded text-xs text-right font-mono text-slate-700"
                          />
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                          {formatIDR(item.total)}
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(idx)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Total Summary Box */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Belanjaan Struk</span>
                  <p className="text-xs text-slate-400">
                    {parsedData.paymentMethod ? `Metode: ${parsedData.paymentMethod}` : 'Dihitung otomatis'}
                  </p>
                </div>
                <div className="text-lg sm:text-xl font-mono font-extrabold text-emerald-700">
                  {formatIDR(parsedData.grandTotal)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          {parsedData ? (
            <button
              type="button"
              onClick={() => setParsedData(null)}
              className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
            >
              ← Scan Ulang Foto Lain
            </button>
          ) : (
            <div className="text-[11px] text-slate-400">
              💡 Didukung oleh Google Gemini 3.8 Flash Multimodal OCR
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Tutup
            </button>

            {parsedData && (
              <button
                id="btn-confirm-save-receipt"
                type="button"
                onClick={handleSaveToSpreadsheet}
                disabled={isSaving}
                className="inline-flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Menyimpan ke Spreadsheet...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Simpan ke Spreadsheet ({parsedData.items.length} Item)
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
