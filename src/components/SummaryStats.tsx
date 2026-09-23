import { GroceryItem } from '../types';
import { DollarSign, ShoppingBag, Store, TrendingUp, Target, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface SummaryStatsProps {
  items: GroceryItem[];
  monthlyBudget?: number;
  onOpenBudgetModal?: () => void;
}

export function SummaryStats({ items, monthlyBudget = 0, onOpenBudgetModal }: SummaryStatsProps) {
  const currentMonth = new Date().toISOString().substring(0, 7);
  const thisMonthItems = items.filter(i => i.date.startsWith(currentMonth));

  const totalThisMonth = thisMonthItems.reduce((sum, it) => sum + (it.total || 0), 0);
  const totalAllTime = items.reduce((sum, it) => sum + (it.total || 0), 0);

  // Budget calculations
  const hasBudget = monthlyBudget > 0;
  const remainingBudget = hasBudget ? monthlyBudget - totalThisMonth : 0;
  const percentUsed = hasBudget
    ? Math.min(100, Math.round((totalThisMonth / monthlyBudget) * 100))
    : 0;
  const isOverBudget = hasBudget && remainingBudget < 0;
  const isNearLimit = hasBudget && !isOverBudget && percentUsed >= 85;

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
    <div className="space-y-4 mb-6">
      {/* 4 Main Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* KPI 1: Pengeluaran Bulan Ini */}
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

        {/* KPI 2: Budget Bulanan & Sisa */}
        <div
          onClick={onOpenBudgetModal}
          className={`p-4 sm:p-5 rounded-xl border shadow-xs transition-all cursor-pointer group ${
            isOverBudget
              ? 'bg-rose-50/50 border-rose-200 hover:border-rose-300'
              : isNearLimit
              ? 'bg-amber-50/50 border-amber-200 hover:border-amber-300'
              : hasBudget
              ? 'bg-emerald-50/30 border-emerald-200 hover:border-emerald-300'
              : 'bg-white border-slate-200/80 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <span>Batas Budget</span>
              <span className="text-[10px] text-emerald-600 font-bold group-hover:underline">
                {hasBudget ? '(Ubah)' : '(Set)'}
              </span>
            </span>
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                isOverBudget
                  ? 'bg-rose-100 text-rose-600'
                  : isNearLimit
                  ? 'bg-amber-100 text-amber-600'
                  : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              <Target className="w-4 h-4" />
            </div>
          </div>

          {hasBudget ? (
            <>
              <div className="mt-2 text-xl sm:text-2xl font-bold tracking-tight">
                <span className={isOverBudget ? 'text-rose-600' : 'text-slate-900'}>
                  {formatIDR(remainingBudget)}
                </span>
              </div>
              <div className="mt-2 w-full h-1.5 bg-slate-200/70 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isOverBudget
                      ? 'bg-rose-500'
                      : isNearLimit
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, (totalThisMonth / monthlyBudget) * 100)}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-slate-500 flex items-center justify-between">
                <span>
                  {isOverBudget ? (
                    <span className="text-rose-600 font-bold flex items-center gap-0.5">
                      <AlertTriangle className="w-3 h-3" /> Over budget!
                    </span>
                  ) : (
                    <span>Sisa dari {formatIDR(monthlyBudget)}</span>
                  )}
                </span>
                <span className="font-semibold text-slate-700">{percentUsed}%</span>
              </p>
            </>
          ) : (
            <>
              <div className="mt-2 text-sm sm:text-base font-bold text-slate-700">
                Belum Diatur
              </div>
              <p className="mt-1.5 text-xs text-emerald-600 font-semibold group-hover:underline flex items-center gap-1">
                + Pasang batas belanja bulanan
              </p>
            </>
          )}
        </div>

        {/* KPI 3: Total Item Tercatat */}
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

        {/* KPI 4: Total Keseluruhan */}
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
    </div>
  );
}
