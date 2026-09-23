import React, { useState, useMemo } from 'react';
import { GroceryItem } from '../types';
import {
  Search,
  Filter,
  ArrowUpDown,
  Download,
  Trash2,
  Edit3,
  CheckCircle2,
  Clock,
  Sparkles,
  Smartphone,
  Globe,
  RefreshCw,
  Plus,
  Camera,
  Layers,
  FileSpreadsheet,
  AlertCircle,
} from 'lucide-react';

interface SpreadsheetViewProps {
  items: GroceryItem[];
  onDeleteItem: (id: string) => Promise<void>;
  onClearAll?: () => Promise<void>;
  onUpdateItem: (id: string, updated: Partial<GroceryItem>) => Promise<void>;
  onOpenManualModal: () => void;
  onOpenScannerModal: () => void;
  onSyncGoogleSheets: () => Promise<void>;
  isSyncingSheets: boolean;
  onPullGoogleSheets?: () => Promise<void>;
  isPullingSheets?: boolean;
  hasSheetsConfigured: boolean;
}

export function SpreadsheetView({
  items,
  onDeleteItem,
  onClearAll,
  onUpdateItem,
  onOpenManualModal,
  onOpenScannerModal,
  onSyncGoogleSheets,
  isSyncingSheets,
  onPullGoogleSheets,
  isPullingSheets,
  hasSheetsConfigured,
}: SpreadsheetViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedSource, setSelectedSource] = useState('ALL');
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'price-desc' | 'price-asc' | 'name'>('date-desc');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<GroceryItem>>({});
  const [deletingItem, setDeletingItem] = useState<GroceryItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showClearAllModal, setShowClearAllModal] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);

  // Categories list
  const categories = [
    'ALL',
    'Sembako',
    'Sayuran & Buah',
    'Daging & Ikan',
    'Bumbu & Minyak',
    'Makanan & Minuman',
    'Kebutuhan Rumah',
    'Lain-lain',
  ];

  // Filtering & Sorting
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchSearch =
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.store.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.notes && item.notes.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchCategory = selectedCategory === 'ALL' || item.category === selectedCategory;
      const matchSource =
        selectedSource === 'ALL' ||
        (selectedSource === 'telegram' && item.source.startsWith('telegram')) ||
        (selectedSource === 'ocr' && item.source.includes('ocr')) ||
        item.source === selectedSource;

      return matchSearch && matchCategory && matchSource;
    }).sort((a, b) => {
      if (sortBy === 'date-desc') return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);
      if (sortBy === 'date-asc') return a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);
      if (sortBy === 'price-desc') return (b.total || 0) - (a.total || 0);
      if (sortBy === 'price-asc') return (a.total || 0) - (b.total || 0);
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return 0;
    });
  }, [items, searchTerm, selectedCategory, selectedSource, sortBy]);

  const totalFilteredSum = useMemo(() => {
    return filteredItems.reduce((acc, it) => acc + (it.total || 0), 0);
  }, [filteredItems]);

  const formatIDR = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val || 0);
  };

  const handleStartEdit = (item: GroceryItem) => {
    setEditingId(item.id);
    setEditForm({ ...item });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const qty = Number(editForm.qty) || 1;
    const price = Number(editForm.price) || 0;
    const total = Number(editForm.total) || (qty * price);

    await onUpdateItem(editingId, {
      ...editForm,
      qty,
      price,
      total,
    });
    setEditingId(null);
  };

  const handleDownloadCsv = () => {
    window.open('/api/export-csv', '_blank');
  };

  const renderSourceBadge = (source: string) => {
    switch (source) {
      case 'telegram_ocr':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-sky-50 text-sky-700 border border-sky-200">
            <Smartphone className="w-3 h-3 text-sky-600" />
            TG Foto Bon
          </span>
        );
      case 'telegram_manual':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
            <Smartphone className="w-3 h-3 text-blue-600" />
            TG Manual
          </span>
        );
      case 'web_ocr':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
            <Sparkles className="w-3 h-3 text-purple-600" />
            Web OCR
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
            <Globe className="w-3 h-3 text-slate-500" />
            Web Input
          </span>
        );
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Sembako':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Sayuran & Buah':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Daging & Ikan':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'Bumbu & Minyak':
        return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'Makanan & Minuman':
        return 'bg-cyan-50 text-cyan-700 border-cyan-200';
      case 'Kebutuhan Rumah':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
      {/* Action Bar Header */}
      <div className="p-4 border-b border-slate-200/80 bg-slate-50/50">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              Spreed Sheet Belanjaan
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                {filteredItems.length} item
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Data belanjaan otomatis dari Telegram foto bon, input chat, & kamera iPhone
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              id="btn-scan-bon-header"
              onClick={onOpenScannerModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" />
              Foto Bon / OCR
            </button>

            <button
              id="btn-input-manual-header"
              onClick={onOpenManualModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Input Manual
            </button>

            <button
              id="btn-download-csv"
              onClick={handleDownloadCsv}
              title="Download File Rekap Belanja (CSV / Excel) untuk seluruh catatan"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 border border-blue-200 text-blue-700 rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              Download Rekap
            </button>

            {onClearAll && items.length > 0 && (
              <button
                id="btn-clear-all-expenses"
                onClick={() => setShowClearAllModal(true)}
                title="Hapus seluruh data belanjaan sekaligus dari aplikasi dan Google Sheets"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 border border-rose-200 text-rose-700 rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                Hapus Semua Data
              </button>
            )}

            {hasSheetsConfigured && (
              <div className="flex items-center gap-1.5">
                <button
                  id="btn-sync-sheets"
                  onClick={onSyncGoogleSheets}
                  disabled={isSyncingSheets}
                  title="Kirim semua data lokal ke Google Sheets"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingSheets ? 'animate-spin' : ''}`} />
                  {isSyncingSheets ? 'Syncing...' : 'Sync ke Sheets'}
                </button>

                {onPullGoogleSheets && (
                  <button
                    id="btn-pull-sheets"
                    onClick={onPullGoogleSheets}
                    disabled={isPullingSheets}
                    title="Tarik data belanjaan yang dicatat Bot 24/7 di Google Sheets"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Download className={`w-3.5 h-3.5 ${isPullingSheets ? 'animate-spin' : ''}`} />
                    {isPullingSheets ? 'Menarik...' : 'Tarik dari Sheets'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="mt-4 pt-3 border-t border-slate-200/60 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="input-search-items"
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Cari barang atau toko (cth: beras, telur, indomaret)..."
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              id="select-category-filter"
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="py-1.5 px-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            >
              <option value="ALL">Semua Kategori</option>
              {categories.filter(c => c !== 'ALL').map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Source Filter */}
          <select
            id="select-source-filter"
            value={selectedSource}
            onChange={e => setSelectedSource(e.target.value)}
            className="py-1.5 px-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          >
            <option value="ALL">Semua Sumber</option>
            <option value="telegram">Telegram (Foto & Chat)</option>
            <option value="ocr">OCR Foto Bon</option>
            <option value="telegram_ocr">Telegram Foto Bon</option>
            <option value="telegram_manual">Telegram Manual</option>
            <option value="web_ocr">Web Camera OCR</option>
            <option value="web_manual">Web Manual</option>
          </select>

          {/* Sort */}
          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              id="select-sort-by"
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="py-1.5 px-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            >
              <option value="date-desc">Terbaru (Tanggal ↓)</option>
              <option value="date-asc">Terlama (Tanggal ↑)</option>
              <option value="price-desc">Harga Tertinggi (Total ↓)</option>
              <option value="price-asc">Harga Terendah (Total ↑)</option>
              <option value="name">Nama Barang (A - Z)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Spreadsheet Table Container */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-700 border-collapse">
          <thead>
            <tr className="bg-slate-100/70 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider select-none">
              <th className="py-2.5 px-3 w-10 text-center border-r border-slate-200/60">No</th>
              <th className="py-2.5 px-3 w-28 border-r border-slate-200/60">Tanggal & Jam</th>
              <th className="py-2.5 px-3 w-36 border-r border-slate-200/60">Toko / Tempat</th>
              <th className="py-2.5 px-3 min-w-[180px] border-r border-slate-200/60">Nama Barang</th>
              <th className="py-2.5 px-3 w-32 border-r border-slate-200/60">Kategori</th>
              <th className="py-2.5 px-3 w-20 text-right border-r border-slate-200/60">Qty</th>
              <th className="py-2.5 px-3 w-28 text-right border-r border-slate-200/60">Harga Satuan</th>
              <th className="py-2.5 px-3 w-32 text-right border-r border-slate-200/60">Total (Rp)</th>
              <th className="py-2.5 px-3 w-32 border-r border-slate-200/60">Sumber Input</th>
              <th className="py-2.5 px-3 w-24 text-center border-r border-slate-200/60">Sheets</th>
              <th className="py-2.5 px-3 w-20 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/70">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-12 text-center text-slate-400 bg-slate-50/30">
                  <div className="max-w-xs mx-auto">
                    <FileSpreadsheet className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-600 text-sm">Tidak ada catatan belanja</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {searchTerm || selectedCategory !== 'ALL'
                        ? 'Coba sesuaikan filter pencarian Anda'
                        : 'Kirim foto struk di Telegram dari iPhone kamu atau klik "Input Manual"'}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredItems.map((item, index) => {
                const isEditing = editingId === item.id;

                if (isEditing) {
                  return (
                    <tr key={item.id} className="bg-amber-50/50 border-y-2 border-amber-400">
                      <td className="py-2 px-2 text-center font-mono text-slate-400">{index + 1}</td>
                      <td className="py-2 px-2">
                        <input
                          type="date"
                          value={editForm.date || ''}
                          onChange={e => setEditForm({ ...editForm, date: e.target.value })}
                          className="w-full p-1 border border-slate-300 rounded text-xs bg-white"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          value={editForm.store || ''}
                          onChange={e => setEditForm({ ...editForm, store: e.target.value })}
                          placeholder="Toko"
                          className="w-full p-1 border border-slate-300 rounded text-xs bg-white"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          value={editForm.name || ''}
                          onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                          placeholder="Nama Barang"
                          className="w-full p-1 border border-slate-300 rounded text-xs font-semibold bg-white"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <select
                          value={editForm.category || 'Sembako'}
                          onChange={e => setEditForm({ ...editForm, category: e.target.value })}
                          className="w-full p-1 border border-slate-300 rounded text-xs bg-white"
                        >
                          {categories.filter(c => c !== 'ALL').map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0.1"
                            step="any"
                            value={editForm.qty || 1}
                            onChange={e => setEditForm({ ...editForm, qty: parseFloat(e.target.value) || 1 })}
                            className="w-12 p-1 border border-slate-300 rounded text-xs text-right bg-white"
                          />
                          <input
                            type="text"
                            value={editForm.unit || 'pcs'}
                            onChange={e => setEditForm({ ...editForm, unit: e.target.value })}
                            className="w-12 p-1 border border-slate-300 rounded text-xs bg-white"
                          />
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          value={editForm.price || 0}
                          onChange={e => setEditForm({ ...editForm, price: parseFloat(e.target.value) || 0 })}
                          className="w-full p-1 border border-slate-300 rounded text-xs text-right bg-white"
                        />
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-bold text-slate-800">
                        {formatIDR((Number(editForm.qty) || 1) * (Number(editForm.price) || 0))}
                      </td>
                      <td className="py-2 px-2 text-center text-slate-400 text-[11px]">-</td>
                      <td className="py-2 px-2 text-center text-slate-400 text-[11px]">-</td>
                      <td className="py-2 px-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={handleSaveEdit}
                            className="px-2 py-1 bg-emerald-600 text-white rounded text-xs font-semibold hover:bg-emerald-700 cursor-pointer"
                          >
                            Simpan
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-2 py-1 bg-slate-200 text-slate-700 rounded text-xs font-medium hover:bg-slate-300 cursor-pointer"
                          >
                            Batal
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/80 transition-colors group border-b border-slate-100"
                  >
                    {/* No */}
                    <td className="py-2.5 px-3 text-center font-mono text-[11px] text-slate-400 border-r border-slate-100">
                      {index + 1}
                    </td>

                    {/* Date & Time */}
                    <td className="py-2.5 px-3 border-r border-slate-100 whitespace-nowrap">
                      <div className="font-medium text-slate-800">{item.date}</div>
                      {item.time && (
                        <div className="text-[10px] text-slate-400 font-mono flex items-center gap-0.5 mt-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {item.time}
                        </div>
                      )}
                    </td>

                    {/* Store */}
                    <td className="py-2.5 px-3 border-r border-slate-100">
                      <div className="font-semibold text-slate-800 truncate max-w-[140px]" title={item.store}>
                        {item.store || 'Belanja Harian'}
                      </div>
                    </td>

                    {/* Item Name */}
                    <td className="py-2.5 px-3 border-r border-slate-100">
                      <div className="font-bold text-slate-900 leading-tight">
                        {item.name}
                      </div>
                      {item.notes && (
                        <div className="text-[10px] text-slate-400 mt-0.5 italic truncate max-w-[200px]">
                          {item.notes}
                        </div>
                      )}
                    </td>

                    {/* Category */}
                    <td className="py-2.5 px-3 border-r border-slate-100">
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium border ${getCategoryColor(item.category)}`}>
                        {item.category}
                      </span>
                    </td>

                    {/* Qty & Unit */}
                    <td className="py-2.5 px-3 text-right font-mono border-r border-slate-100 whitespace-nowrap">
                      <span className="font-bold text-slate-800">{item.qty}</span>{' '}
                      <span className="text-[11px] text-slate-500">{item.unit || 'pcs'}</span>
                    </td>

                    {/* Price per unit */}
                    <td className="py-2.5 px-3 text-right font-mono text-slate-600 border-r border-slate-100 whitespace-nowrap">
                      {formatIDR(item.price)}
                    </td>

                    {/* Total Price */}
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700 border-r border-slate-100 whitespace-nowrap">
                      {formatIDR(item.total)}
                    </td>

                    {/* Source */}
                    <td className="py-2.5 px-3 border-r border-slate-100 whitespace-nowrap">
                      {renderSourceBadge(item.source)}
                    </td>

                    {/* Sheets Status */}
                    <td className="py-2.5 px-3 text-center border-r border-slate-100 whitespace-nowrap">
                      {item.syncedToSheets ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600" title="Tersinkron ke Google Sheets">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Synced
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-slate-400" title="Tersimpan di database lokal">
                          Lokal
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1 opacity-80 group-hover:opacity-100">
                        <button
                          id={`btn-edit-${item.id}`}
                          onClick={() => handleStartEdit(item)}
                          className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                          title="Edit item"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          id={`btn-delete-${item.id}`}
                          onClick={() => setDeletingItem(item)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                          title="Hapus item (dan baris Google Sheets)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {filteredItems.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 font-bold border-t-2 border-slate-300 text-slate-900">
                <td colSpan={7} className="py-3 px-4 text-right uppercase text-[11px] text-slate-600 tracking-wider">
                  Total Belanja Terfilter ({filteredItems.length} barang):
                </td>
                <td className="py-3 px-3 text-right font-mono text-sm text-emerald-700 bg-emerald-50/50">
                  {formatIDR(totalFilteredSum)}
                </td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Spreadsheet Footer Note */}
      <div className="p-3 bg-slate-50 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
          <span>Menampilkan {filteredItems.length} dari {items.length} total belanjaan</span>
          {hasSheetsConfigured && (
            <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-md">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              Sync Hapus Google Sheets Aktif
            </span>
          )}
        </div>
        <div className="text-[11px] text-slate-400">
          💡 Tips: Hapus data di sini atau via Telegram otomatis menghapus baris di Google Sheets
        </div>
      </div>

      {/* Modal Konfirmasi Hapus Data */}
      {deletingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Hapus Data Belanjaan</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Konfirmasi penghapusan data dari catatan dan spreadsheet
                </p>
              </div>
            </div>

            <div className="p-5 space-y-3">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Nama Barang:</span>
                  <span className="font-bold text-slate-900 text-sm">{deletingItem.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Toko:</span>
                  <span className="text-slate-700">{deletingItem.store} ({deletingItem.date})</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Jumlah:</span>
                  <span className="text-slate-700">{deletingItem.qty} {deletingItem.unit}</span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-slate-200">
                  <span className="text-slate-500">Total Harga:</span>
                  <span className="font-bold text-emerald-700 font-mono text-sm">{formatIDR(deletingItem.total)}</span>
                </div>
              </div>

              {hasSheetsConfigured ? (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Sinkronisasi Hapus Google Sheets Aktif</p>
                    <p className="text-[11px] text-emerald-700 mt-0.5 leading-relaxed">
                      Baris data untuk <b>&quot;{deletingItem.name}&quot;</b> di Google Spreadsheet Anda juga akan otomatis dihapus.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-700 leading-relaxed">
                    Google Sheets belum dihubungkan. Item ini hanya akan dihapus dari database aplikasi.
                  </p>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingItem(null)}
                disabled={isDeleting}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                id="btn-confirm-delete-item"
                disabled={isDeleting}
                onClick={async () => {
                  setIsDeleting(true);
                  try {
                    await onDeleteItem(deletingItem.id);
                  } finally {
                    setIsDeleting(false);
                    setDeletingItem(null);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Menghapus...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Ya, Hapus Data
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Confirmation Modal */}
      {showClearAllModal && onClearAll && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-rose-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Hapus Semua Data Belanja</h3>
                  <p className="text-[11px] text-slate-500">Konfirmasi pembersihan seluruh catatan</p>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-700 leading-relaxed">
                Apakah Anda yakin ingin menghapus <b>seluruh data belanjaan ({items.length} item)</b>? Tindakan ini tidak dapat dibatalkan.
              </p>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1.5">
                <div className="flex justify-between items-center text-slate-600">
                  <span>Total Item:</span>
                  <span className="font-bold text-slate-900">{items.length} barang</span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>Total Pengeluaran:</span>
                  <span className="font-bold text-emerald-700">{formatIDR(items.reduce((acc, it) => acc + (it.total || 0), 0))}</span>
                </div>
              </div>

              {hasSheetsConfigured ? (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Google Sheets Otomatis Dikosongkan</p>
                    <p className="text-[11px] text-emerald-700 mt-0.5 leading-relaxed">
                      Seluruh baris catatan belanja pada spreadsheet Google Sheets Anda juga akan dihapus bersih secara bersamaan.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-700 leading-relaxed">
                    Google Sheets belum dihubungkan. Seluruh data belanjaan hanya akan dihapus dari aplikasi ini.
                  </p>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowClearAllModal(false)}
                disabled={isClearingAll}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                id="btn-confirm-clear-all"
                disabled={isClearingAll}
                onClick={async () => {
                  setIsClearingAll(true);
                  try {
                    await onClearAll();
                    setShowClearAllModal(false);
                  } finally {
                    setIsClearingAll(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                {isClearingAll ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Menghapus Semua...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Ya, Hapus Semua Data
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
