import React, { useState } from 'react';
import { Target, X, Check, AlertTriangle, Sparkles, TrendingDown } from 'lucide-react';

interface MonthlyBudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBudget: number;
  totalSpentThisMonth: number;
  onSaveBudget: (budget: number) => Promise<void>;
}

export function MonthlyBudgetModal({
  isOpen,
  onClose,
  currentBudget,
  totalSpentThisMonth,
  onSaveBudget,
}: MonthlyBudgetModalProps) {
  const [budgetInput, setBudgetInput] = useState<string>(
    currentBudget > 0 ? String(currentBudget) : ''
  );
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const parsedBudget = parseFloat(budgetInput.replace(/[^0-9]/g, '')) || 0;
  const remaining = parsedBudget > 0 ? parsedBudget - totalSpentThisMonth : 0;
  const percentUsed =
    parsedBudget > 0 ? Math.min(100, Math.round((totalSpentThisMonth / parsedBudget) * 100)) : 0;

  const quickBudgets = [1500000, 2500000, 3500000, 5000000, 7500000, 10000000];

  const formatIDR = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSaveBudget(parsedBudget);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setIsSaving(true);
    try {
      await onSaveBudget(0);
      setBudgetInput('');
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Atur Batas Budget Bulanan</h3>
              <p className="text-xs text-slate-500">Kendalikan pengeluaran belanja dapur & rumah tangga</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSave} className="p-6 space-y-5">
          {/* Current Month Overview Card */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>Pengeluaran Bulan Ini:</span>
              <span className="font-semibold text-slate-700">{formatIDR(totalSpentThisMonth)}</span>
            </div>
            {parsedBudget > 0 ? (
              <>
                <div className="flex items-center justify-between text-xs font-semibold mb-2">
                  <span className={remaining < 0 ? 'text-rose-600 font-bold' : 'text-slate-700'}>
                    {remaining < 0 ? 'Melebihi Budget:' : 'Sisa Budget:'}
                  </span>
                  <span className={remaining < 0 ? 'text-rose-600 text-sm font-bold' : 'text-emerald-700 text-sm font-bold'}>
                    {formatIDR(Math.abs(remaining))}
                  </span>
                </div>
                {/* Progress bar */}
                <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 rounded-full ${
                      remaining < 0
                        ? 'bg-rose-500'
                        : percentUsed >= 85
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, (totalSpentThisMonth / parsedBudget) * 100)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                  <span>{percentUsed}% terpakai</span>
                  <span>Target: {formatIDR(parsedBudget)}</span>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-500 mt-2 italic">
                Belum ada batas budget yang ditetapkan. Masukkan nominal di bawah untuk mengaktifkan pelacak budget.
              </p>
            )}
          </div>

          {/* Input Field */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Batas Budget Bulanan (IDR)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                Rp
              </span>
              <input
                type="text"
                value={
                  budgetInput
                    ? Number(budgetInput.replace(/[^0-9]/g, '')).toLocaleString('id-ID')
                    : ''
                }
                onChange={e => {
                  const val = e.target.value.replace(/[^0-9]/g, '');
                  setBudgetInput(val);
                }}
                placeholder="Misal: 3.000.000"
                className="w-full pl-11 pr-4 py-2.5 text-base font-bold text-slate-900 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-all"
              />
            </div>
          </div>

          {/* Quick Select Buttons */}
          <div>
            <span className="block text-xs font-medium text-slate-500 mb-2">Pilihan Cepat:</span>
            <div className="grid grid-cols-3 gap-2">
              {quickBudgets.map(val => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setBudgetInput(String(val))}
                  className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    parsedBudget === val
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300 ring-1 ring-emerald-400'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {formatIDR(val).replace(',00', '')}
                </button>
              ))}
            </div>
          </div>

          {/* Telegram Tip Box */}
          <div className="p-3 rounded-xl bg-sky-50 border border-sky-100 flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-sky-600 mt-0.5 shrink-0" />
            <p className="text-xs text-sky-800 leading-relaxed">
              <strong>Tips Telegram:</strong> Kamu juga bisa mengubah atau cek sisa budget langsung dari obrolan Telegram dengan mengetik perintah <code className="bg-sky-100 px-1 py-0.5 rounded font-mono">/budget 3jt</code> atau <code className="bg-sky-100 px-1 py-0.5 rounded font-mono">/rekap</code>.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            {currentBudget > 0 ? (
              <button
                type="button"
                onClick={handleReset}
                disabled={isSaving}
                className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer disabled:opacity-50"
              >
                Hapus Batas Budget
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                {isSaving ? 'Menyimpan...' : 'Simpan Budget'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
