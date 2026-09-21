import { GroceryItem } from '../types';
import { DollarSign, ShoppingBag, Store, Calendar, TrendingUp } from 'lucide-react';

interface SummaryStatsProps {
  items: GroceryItem[];
}

export function SummaryStats({ items }: SummaryStatsProps) {
  const currentMonth = new Date().toISOString().substring(0, 7);
  const thisMonthItems = items.filter(i => i.date.startsWith(currentMonth));

  const totalThisMonth = thisMonthItems.reduce((sum, it) => sum + (it.total || 0), 0);
  const totalAllTime = items.reduce((sum, it) => sum + (it.total || 0), 0);

  // Stores breakdown
  const storeCounts: Record<string, number> = {};
  items.forEach(it => {
    if (it.store) {
      storeCounts[it.store] = (storeCounts[it.store] || 0) + 1;
    }
  });

  const topStore = Object.entries(storeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Belum ada';

  // OCR vs Manual count
  const ocrCount = items.filter(i => i.source.includes('ocr')).length;
  const manualCount = items.length - ocrCount;

  const formatIDR = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
      {/* KPI 1 */}
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Bulan Ini ({currentMonth})</span>
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <DollarSign className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2 text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
          {formatIDR(totalThisMonth)}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Dari {thisMonthItems.length} item belanja
        </p>
      </div>

      {/* KPI 2 */}
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Item Tercatat</span>
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <ShoppingBag className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2 text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
          {items.length} <span className="text-sm font-normal text-slate-500">barang</span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          <span className="text-indigo-600 font-medium">{ocrCount} via OCR</span> • {manualCount} manual
        </p>
      </div>

      {/* KPI 3 */}
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Toko Terfavorit</span>
          <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
            <Store className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2 text-lg sm:text-xl font-bold text-slate-900 truncate">
          {topStore}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {storeCounts[topStore] ? `${storeCounts[topStore]} item dibeli` : 'Mulai catat belanjaan'}
        </p>
      </div>

      {/* KPI 4 */}
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Keseluruhan</span>
          <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
            <TrendingUp className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2 text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
          {formatIDR(totalAllTime)}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Semua catatan di spreadsheet
        </p>
      </div>
    </div>
  );
}
