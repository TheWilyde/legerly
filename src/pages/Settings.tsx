import {useState, useEffect} from 'react';
import {useActiveProfile} from '../hooks/useActiveProfile';
import {useProfiles} from '../contexts/ProfileContext';
import {usePeriod} from '../contexts/PeriodContext';
import PageHeader from '../components/common/PageHeader';
import Card from '../components/analytics/Card';
import {
  FiSave,
  FiPrinter,
  FiBox,
  FiSettings,
  FiDollarSign,
  FiDatabase,
  FiDownload,
} from 'react-icons/fi';
import {emitAppFeedback} from '../utils/feedback';

export interface Settings {
  autoCalculateAnalytics: boolean;
  // ✅ Kept as requested
  currencySymbol: string;

  // ✅ Font Family Selection
  fontFamily: 'Figtree' | 'Calibri' | 'Segoe UI' | 'Cambria';

  // ✅ New: Print Configuration
  printDefaults: {
    pageSize: 'A4' | 'A5';
    copies: number;
  };

  // ✅ New: Inventory Rules
  inventoryPreferences: {
    lowStockThreshold: number;
    allowNegativeStock: boolean;
  };

  // ✅ New: System Safety
  systemPreferences: {
    confirmDelete: boolean;
  };

  // Existing Defaults
  purchaseInvoiceDefaults: {
    supplierName: string;
    contactNo: string;
  };
  saleInvoiceDefaults: {
    supplierName: string;
    contactNo: string;
  };
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as {message?: unknown}).message === 'string'
  ) {
    return (error as {message: string}).message;
  }
  return fallback;
}

function toPeriodUserMessage(error: unknown, fallback: string): string {
  const raw = toErrorMessage(error, fallback);
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as {code?: unknown}).code === 'string'
      ? (error as {code: string}).code
      : undefined;

  if (raw.includes('Only closed periods can be reopened.')) {
    return 'Select a closed period to reopen.';
  }
  if (raw.includes('Only the active period can be closed.')) {
    return 'Only the active period can be closed.';
  }
  if (raw.includes('Selected period has no stock snapshot to restore.')) {
    return 'This period cannot be reopened yet because no stock snapshot is available.';
  }

  if (code === 'PERIOD_NOT_ACTIVE') {
    return 'This period action is not available right now.';
  }
  if (code === 'PERIOD_NOT_FOUND') {
    return 'Selected period was not found. Refresh and try again.';
  }
  if (code === 'PERIOD_OVERLAP') {
    return 'Selected period dates overlap an existing period.';
  }

  return raw;
}

function formatPeriodLabel(startDate: string, endDate: string): string {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const startMonth = start.toLocaleString('en-US', {month: 'short'});
  const endMonth = end.toLocaleString('en-US', {month: 'short'});
  return startMonth === endMonth ? startMonth : `${startMonth}-${endMonth}`;
}

export default function Settings() {
  const profileId = useActiveProfile();
  const {profiles, refresh} = useProfiles();
  const {
    periods,
    activePeriod,
    selectedPeriod,
    closeActivePeriod,
    closeReopenedPeriod,
    reopenReturnPeriod,
    reopenPeriod,
  } = usePeriod();
  const [settings, setSettings] = useState<Settings>({
    autoCalculateAnalytics: false,
    currencySymbol: 'Rs',
    fontFamily: 'Cambria',
    printDefaults: {
      pageSize: 'A4',
      copies: 1,
    },
    inventoryPreferences: {
      lowStockThreshold: 5,
      allowNegativeStock: true,
    },
    systemPreferences: {
      confirmDelete: true,
    },
    purchaseInvoiceDefaults: {
      supplierName: '',
      contactNo: '',
    },
    saleInvoiceDefaults: {
      supplierName: '',
      contactNo: '',
    },
  });
  const [backingUp, setBackingUp] = useState(false);
  const [periodWorking, setPeriodWorking] = useState(false);
  const [closePeriodForm, setClosePeriodForm] = useState<{
    startDate: string;
    endDate: string;
    label: string;
  }>({startDate: '', endDate: '', label: ''});
  const [reopenPeriodId, setReopenPeriodId] = useState<string>('');

  useEffect(() => {
    if (!profileId) return;

    const key = `settings:${profileId}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSettings((prev) => ({
          ...prev,
          ...parsed,
          printDefaults: {
            ...prev.printDefaults,
            ...parsed.printDefaults,
          },
          inventoryPreferences: {
            ...prev.inventoryPreferences,
            ...parsed.inventoryPreferences,
          },
          systemPreferences: {
            ...prev.systemPreferences,
            ...parsed.systemPreferences,
          },
        }));
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    }
  }, [profileId]);

  useEffect(() => {
    if (selectedPeriod?.status !== 'closed') return;
    setReopenPeriodId(String(selectedPeriod.id));
  }, [selectedPeriod?.id, selectedPeriod?.status]);

  useEffect(() => {
    if (!profileId || !activePeriod) return;

    let cancelled = false;
    (async () => {
      const [purchase, sale] = await Promise.all([
        window.api.invoices.list(profileId, {periodId: activePeriod.id}),
        window.api.saleInvoices.list(profileId, {periodId: activePeriod.id}),
      ]);
      if (cancelled) return;

      const dates = [...purchase, ...sale]
        .map((invoice) => invoice.invoiceDate || invoice.createdAt)
        .filter((value): value is string => Boolean(value))
        .sort();

      setClosePeriodForm({
        startDate: dates[0]?.slice(0, 10) || activePeriod.startDate,
        endDate: dates[dates.length - 1]?.slice(0, 10) || activePeriod.endDate,
        label: formatPeriodLabel(
          dates[0]?.slice(0, 10) || activePeriod.startDate,
          dates[dates.length - 1]?.slice(0, 10) || activePeriod.endDate,
        ),
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [activePeriod, profileId]);

  useEffect(() => {
    if (!closePeriodForm.startDate || !closePeriodForm.endDate) return;
    const nextLabel = formatPeriodLabel(
      closePeriodForm.startDate,
      closePeriodForm.endDate,
    );
    setClosePeriodForm((prev) =>
      prev.label === nextLabel ? prev : {...prev, label: nextLabel},
    );
  }, [closePeriodForm.endDate, closePeriodForm.startDate]);

  const isReopenedPeriodActive =
    !!activePeriod &&
    !!reopenReturnPeriod &&
    activePeriod.id !== reopenReturnPeriod.id;

  async function handleCloseActivePeriod() {
    if (!profileId) return;

    const targetPeriod = selectedPeriod ?? activePeriod;
    const startDate = closePeriodForm.startDate.trim();
    const endDate = closePeriodForm.endDate.trim();
    const label =
      closePeriodForm.label.trim() || formatPeriodLabel(startDate, endDate);

    if (!targetPeriod) {
      emitAppFeedback('warn', 'No selected period found.');
      return;
    }
    if (targetPeriod.status !== 'active') {
      emitAppFeedback(
        'warn',
        'Selected period is closed. Reopen it first, then close it.',
      );
      return;
    }
    if (!startDate || !endDate) {
      emitAppFeedback('warn', 'Select start and end dates.');
      return;
    }

    setPeriodWorking(true);

    try {
      await closeActivePeriod({
        periodId: targetPeriod.id,
        startDate,
        endDate,
        label,
      });
      emitAppFeedback('success', 'Active period closed.');
    } catch (error) {
      emitAppFeedback(
        'error',
        toPeriodUserMessage(error, 'Failed to close selected period.'),
      );
    } finally {
      setPeriodWorking(false);
    }
  }

  async function handleReopenPeriod() {
    if (!profileId) return;
    const periodId = Number(reopenPeriodId);
    if (!Number.isFinite(periodId) || periodId <= 0) {
      emitAppFeedback('warn', 'Select a closed period to reopen.');
      return;
    }

    const selected = periods.find((period) => period.id === periodId);
    if (!selected || selected.status !== 'closed') {
      setReopenPeriodId('');
      emitAppFeedback('warn', 'Select a closed period to reopen.');
      return;
    }

    setPeriodWorking(true);

    try {
      await reopenPeriod(periodId);
      setReopenPeriodId('');
      emitAppFeedback('success', 'Period reopened and set active.');
    } catch (error) {
      emitAppFeedback(
        'error',
        toPeriodUserMessage(error, 'Failed to reopen period.'),
      );
    } finally {
      setPeriodWorking(false);
    }
  }

  async function handleCloseReopenedPeriod() {
    if (!profileId || !isReopenedPeriodActive || !reopenReturnPeriod) return;

    setPeriodWorking(true);

    try {
      await closeReopenedPeriod();
      setReopenPeriodId('');
      emitAppFeedback(
        'success',
        `Reopened period closed. Returned to ${reopenReturnPeriod.label}.`,
      );
    } catch (error) {
      emitAppFeedback(
        'error',
        toPeriodUserMessage(error, 'Failed to close reopened period.'),
      );
    } finally {
      setPeriodWorking(false);
    }
  }

  const closedPeriods = periods.filter((period) => period.status === 'closed');

  // Manual backup handler
  async function handleManualBackup() {
    if (!profileId) return;

    setBackingUp(true);

    try {
      await window.api.profiles.createBackup(profileId);
      emitAppFeedback('success', 'Backup created successfully!');
    } catch (err: any) {
      console.warn('Backup failed:', err);
      emitAppFeedback(
        'error',
        'Failed to create backup: ' + (err.message || 'Unknown error'),
      );
    } finally {
      setBackingUp(false);
    }
  }

  // Apply font to document
  useEffect(() => {
    const fontMap: Record<string, string> = {
      Figtree: "'Figtree', ui-sans-serif, system-ui",
      Calibri: "'Calibri', 'Segoe UI', sans-serif",
      'Segoe UI': "'Segoe UI', Cambria, sans-serif",
      Cambria: "'Cambria', 'Georgia', serif",
    };
    document.documentElement.style.fontFamily =
      fontMap[settings.fontFamily] || fontMap['Cambria'];
  }, [settings.fontFamily]);

  // Save settings
  function handleSave() {
    if (!profileId) return;

    const key = `settings:${profileId}`;
    localStorage.setItem(key, JSON.stringify(settings));
    emitAppFeedback('success', 'Settings saved successfully.');

    // Dispatch event to notify other components
    window.dispatchEvent(
      new CustomEvent('settings:changed', {
        detail: settings,
      }),
    );
  }

  if (!profileId) {
    return (
      <div>
        <PageHeader title="Settings" />
        <div className="text-center py-12 text-neutral-500">
          No profile selected
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <PageHeader title="Settings" />

      {/* 1. General & Localization */}
      <Card title="General & Localization">
        <div className="space-y-4">
          {/* Currency Symbol */}
          <div className="flex items-start gap-4">
            <div className="p-2 bg-neutral-100 rounded-full mt-1">
              <FiDollarSign className="size-5 text-neutral-600" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-neutral-900 mb-1">
                Currency Symbol
              </label>
              <p className="text-xs text-neutral-500 mb-2">
                Used on invoices and reports (e.g. Rs, $, £, €)
              </p>
              <input
                type="text"
                value={settings.currencySymbol}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    currencySymbol: e.target.value.slice(0, 3),
                  }))
                }
                maxLength={3}
                placeholder="e.g. Rs"
                className="w-24 h-9 px-3 rounded border border-neutral-300 text-sm bg-white focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 outline-none"
              />
            </div>
          </div>

          {/* Font Family */}
          <div className="border-t border-neutral-100 pt-4">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-neutral-100 rounded-full mt-1">
                <FiSettings className="size-5 text-neutral-600" />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-neutral-900 mb-1">
                  Font Family
                </label>
                <p className="text-xs text-neutral-500 mb-2">
                  Default font for the entire application
                </p>
                <select
                  value={settings.fontFamily}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      fontFamily: e.target.value as
                        | 'Figtree'
                        | 'Calibri'
                        | 'Segoe UI'
                        | 'Cambria',
                    }))
                  }
                  className="w-48 h-9 px-3 rounded border border-neutral-300 text-sm bg-white focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 outline-none">
                  <option value="Cambria">Cambria (Default, Serif)</option>
                  <option value="Calibri">Calibri (Sans-serif)</option>
                  <option value="Figtree">Figtree (Modern)</option>
                  <option value="Segoe UI">Segoe UI (Clean)</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 2. Printing Configuration */}
      <Card title="Printing Defaults">
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-neutral-100 rounded-full mt-1">
              <FiPrinter className="size-5 text-neutral-600" />
            </div>
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-neutral-900 mb-2">
                  Default Paper Size
                </label>
                <select
                  value={settings.printDefaults.pageSize}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      printDefaults: {
                        ...s.printDefaults,
                        pageSize: e.target.value as 'A4' | 'A5',
                      },
                    }))
                  }
                  className="w-full h-9 px-3 rounded border border-neutral-300 text-sm bg-white focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 outline-none">
                  <option value="A4">A4 (Standard, Full Page)</option>
                  <option value="A5">A5 (Half Page)</option>
                </select>
                <p className="text-xs text-neutral-500 mt-1">
                  Used when printing invoices
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-900 mb-2">
                  Default Number of Copies
                </label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={settings.printDefaults.copies}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      printDefaults: {
                        ...s.printDefaults,
                        copies: Number(e.target.value),
                      },
                    }))
                  }
                  className="w-full h-9 px-3 rounded border border-neutral-300 text-sm focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 outline-none"
                />
                <p className="text-xs text-neutral-500 mt-1">
                  Range: 1 to 5 copies
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 3. Inventory Rules */}
      <Card title="Inventory Rules">
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-neutral-100 rounded-full mt-1">
              <FiBox className="size-5 text-neutral-600" />
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-900 mb-2">
                  Low Stock Warning Threshold
                </label>
                <p className="text-xs text-neutral-500 mb-2">
                  Items below this quantity will be highlighted in red on your
                  inventory list
                </p>
                <input
                  type="number"
                  min="0"
                  value={settings.inventoryPreferences.lowStockThreshold}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      inventoryPreferences: {
                        ...s.inventoryPreferences,
                        lowStockThreshold: Number(e.target.value),
                      },
                    }))
                  }
                  className="w-32 h-9 px-3 rounded border border-neutral-300 text-sm focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 outline-none"
                />
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-neutral-100">
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-neutral-900">
                    Allow Negative Stock
                  </h4>
                  <p className="text-xs text-neutral-500 mt-1">
                    Permit selling items even when stock reaches zero
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer ml-4 shrink-0">
                  <input
                    type="checkbox"
                    checked={settings.inventoryPreferences.allowNegativeStock}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        inventoryPreferences: {
                          ...s.inventoryPreferences,
                          allowNegativeStock: e.target.checked,
                        },
                      }))
                    }
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-neutral-900"></div>
                </label>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 4. System Preferences */}
      <Card title="System Preferences">
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-neutral-100 rounded-full mt-1">
              <FiSettings className="size-5 text-neutral-600" />
            </div>
            <div className="flex-1 space-y-4">
              {/* Confirm Delete */}
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-neutral-900">
                    Ask for Confirmation Before Deleting
                  </h4>
                  <p className="text-xs text-neutral-500 mt-1">
                    Show a confirmation dialog before deleting invoices or items
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer ml-4 shrink-0">
                  <input
                    type="checkbox"
                    checked={settings.systemPreferences.confirmDelete}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        systemPreferences: {
                          ...s.systemPreferences,
                          confirmDelete: e.target.checked,
                        },
                      }))
                    }
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-neutral-900"></div>
                </label>
              </div>

              {/* Auto-Calculate Analytics */}
              <div className="flex items-center justify-between pt-4 border-t border-neutral-100">
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-neutral-900">
                    Auto-Calculate Analytics
                  </h4>
                  <p className="text-xs text-neutral-500 mt-1">
                    Automatically compute charts on dashboard load (may be
                    slower with large datasets)
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer ml-4 shrink-0">
                  <input
                    type="checkbox"
                    checked={settings.autoCalculateAnalytics}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        autoCalculateAnalytics: e.target.checked,
                      }))
                    }
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-neutral-900"></div>
                </label>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card title="Period Closeout">
        <div className="space-y-4">
          {/* Close / Reopen Current Period */}
          <div className="rounded-lg border border-neutral-200 p-4 space-y-4 bg-neutral-50">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900">
                {isReopenedPeriodActive
                  ? 'Close Reopened Period'
                  : 'Close Current Period'}
              </h3>
              <p className="text-xs text-neutral-600 mt-1">
                {isReopenedPeriodActive
                  ? 'Finish the temporary reopened period and return to the original active period.'
                  : 'End the active period and save it as historical data. The date range will be auto-filled based on your invoices.'}
              </p>
            </div>

            {!isReopenedPeriodActive ? (
              <div className="space-y-4">
                <label className="space-y-2 text-xs">
                  <span className="text-neutral-900 font-medium">
                    Period Name
                  </span>
                  <input
                    type="text"
                    value={closePeriodForm.label}
                    onChange={(event) =>
                      setClosePeriodForm((prev) => ({
                        ...prev,
                        label: event.target.value,
                      }))
                    }
                    placeholder={
                      closePeriodForm.startDate && closePeriodForm.endDate
                        ? formatPeriodLabel(
                            closePeriodForm.startDate,
                            closePeriodForm.endDate,
                          )
                        : 'e.g. January or Jan-Feb'
                    }
                    className="w-full h-10 px-3 rounded border border-neutral-300 text-sm bg-white focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
                  />
                </label>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="space-y-2 text-xs">
                    <span className="text-neutral-900 font-medium">
                      Start Date
                    </span>
                    <input
                      type="date"
                      value={closePeriodForm.startDate}
                      onChange={(event) =>
                        setClosePeriodForm((prev) => ({
                          ...prev,
                          startDate: event.target.value,
                        }))
                      }
                      className="w-full h-10 px-3 rounded border border-neutral-300 text-sm bg-white focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
                    />
                  </label>
                  <label className="space-y-2 text-xs">
                    <span className="text-neutral-900 font-medium">
                      End Date
                    </span>
                    <input
                      type="date"
                      value={closePeriodForm.endDate}
                      onChange={(event) =>
                        setClosePeriodForm((prev) => ({
                          ...prev,
                          endDate: event.target.value,
                        }))
                      }
                      className="w-full h-10 px-3 rounded border border-neutral-300 text-sm bg-white focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
                    />
                  </label>
                </div>

                <button
                  type="button"
                  onClick={handleCloseActivePeriod}
                  disabled={
                    periodWorking ||
                    Boolean(
                      selectedPeriod && selectedPeriod.status !== 'active',
                    )
                  }
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 font-medium text-sm transition-colors">
                  <FiSave className="size-4" />
                  Close Period
                </button>
              </div>
            ) : (
              <div className="space-y-3 rounded-md border border-neutral-200 bg-white p-3">
                <div className="text-xs text-neutral-700">
                  Return target:{' '}
                  <span className="font-medium text-neutral-900">
                    {reopenReturnPeriod?.label}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCloseReopenedPeriod}
                  disabled={periodWorking}
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-50 font-medium text-sm transition-colors">
                  <FiSave className="size-4" />
                  Close & Return
                </button>
              </div>
            )}
          </div>

          {/* Reopen Closed Period */}
          <div className="rounded-lg border border-neutral-200 p-4 space-y-3 bg-neutral-50">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900">
                Reopen a Closed Period
              </h3>
              <p className="text-xs text-neutral-600 mt-1">
                Make a closed period active again for additional edits. This
                temporarily closes the current active period.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
              <select
                value={reopenPeriodId}
                onChange={(event) => setReopenPeriodId(event.target.value)}
                className="h-9 px-3 rounded border border-neutral-300 text-sm bg-white focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900">
                <option value="">
                  {closedPeriods.length === 0
                    ? 'No closed periods available'
                    : 'Select a closed period...'}
                </option>
                {closedPeriods.map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleReopenPeriod}
                disabled={periodWorking || closedPeriods.length === 0}
                className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-neutral-300 text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 font-medium text-sm transition-colors">
                Reopen
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* 5. Profile Customization */}
      <Card title="Profile Customization">
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-neutral-100 rounded-full mt-1">
              <FiSettings className="size-5 text-neutral-600" />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-medium text-neutral-900 mb-2">
                Profile Highlight Color
              </h4>
              <p className="text-xs text-neutral-500 mb-4">
                Personalize this profile with a unique color. Used in the
                sidebar and navigation to quickly identify profiles.
              </p>
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-sm font-medium text-neutral-700">
                    {profiles.find((p) => p.id === profileId)?.name ||
                      'Current Profile'}
                  </p>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Profile ID: {profileId}
                  </p>
                </div>
                <input
                  type="color"
                  value={
                    profiles.find((p) => p.id === profileId)?.color || '#3b82f6'
                  }
                  onChange={async (e) => {
                    try {
                      await window.api.profiles.updateColor(
                        profileId,
                        e.target.value,
                      );
                      await refresh();
                      emitAppFeedback('success', 'Profile color updated');
                    } catch (err) {
                      console.error('Failed to update profile color:', err);
                      emitAppFeedback(
                        'error',
                        'Failed to update profile color',
                      );
                    }
                  }}
                  className="w-12 h-12 rounded border-2 border-neutral-300 cursor-pointer hover:border-neutral-400 transition-colors"
                  title="Click to change profile color"
                />
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 6. Backup & Data Management */}
      <Card title="Backup & Data Management">
        <div className="space-y-6">
          {/* Manual Backup */}
          <div className="flex items-start gap-4">
            <div className="p-2 bg-blue-50 rounded-lg">
              <FiDownload className="size-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-medium text-neutral-900 mb-2">
                Manual Backup
              </h4>
              <p className="text-xs text-neutral-600 mb-4">
                Create an immediate backup of your current profile data. Backups
                are automatically created each time you open a profile, but you
                can create one manually anytime for extra safety.
              </p>
              <button
                onClick={handleManualBackup}
                disabled={backingUp}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition-colors">
                <FiDownload className="size-4" />
                {backingUp ? 'Creating Backup...' : 'Create Backup Now'}
              </button>
            </div>
          </div>

          {/* Automatic Backups Info */}
          <div className="border-t border-neutral-200 pt-6">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-neutral-100 rounded-lg">
                <FiDatabase className="size-5 text-neutral-600" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-medium text-neutral-900 mb-2">
                  Automatic Backups
                </h4>
                <p className="text-xs text-neutral-600">
                  Your data is automatically backed up when you open each
                  profile. The system maintains the 10 most recent backups and
                  automatically removes older ones. This provides a safety net
                  for data recovery if needed.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 6. Default Invoice Values */}
      <Card title="Default Invoice Values">
        <div className="space-y-6">
          {/* Purchase Invoice Defaults */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-6 bg-amber-600 rounded-full"></div>
              <h3 className="font-semibold text-neutral-900">
                Purchase Invoices
              </h3>
            </div>
            <div className="grid gap-3 md:grid-cols-2 pl-3">
              <div>
                <label className="block text-sm font-medium text-neutral-900 mb-2">
                  Default Supplier Name
                </label>
                <input
                  type="text"
                  value={settings.purchaseInvoiceDefaults.supplierName}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      purchaseInvoiceDefaults: {
                        ...s.purchaseInvoiceDefaults,
                        supplierName: e.target.value,
                      },
                    }))
                  }
                  placeholder="e.g. ACME Traders"
                  className="w-full h-9 px-3 rounded border border-neutral-300 text-sm focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
                />
                <p className="text-xs text-neutral-500 mt-1">
                  Auto-filled when creating new purchases
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-900 mb-2">
                  Default Contact Number
                </label>
                <input
                  type="text"
                  value={settings.purchaseInvoiceDefaults.contactNo}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      purchaseInvoiceDefaults: {
                        ...s.purchaseInvoiceDefaults,
                        contactNo: e.target.value,
                      },
                    }))
                  }
                  placeholder="e.g. 0300-1234567"
                  className="w-full h-9 px-3 rounded border border-neutral-300 text-sm focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
                />
                <p className="text-xs text-neutral-500 mt-1">
                  Supplier's phone number
                </p>
              </div>
            </div>
          </div>

          {/* Sale Invoice Defaults */}
          <div className="border-t border-neutral-100 pt-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-6 bg-blue-600 rounded-full"></div>
              <h3 className="font-semibold text-neutral-900">Sale Invoices</h3>
            </div>
            <div className="grid gap-3 md:grid-cols-2 pl-3">
              <div>
                <label className="block text-sm font-medium text-neutral-900 mb-2">
                  Default Customer Name
                </label>
                <input
                  type="text"
                  value={settings.saleInvoiceDefaults.supplierName}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      saleInvoiceDefaults: {
                        ...s.saleInvoiceDefaults,
                        supplierName: e.target.value,
                      },
                    }))
                  }
                  placeholder="e.g. Walk-in Customer"
                  className="w-full h-9 px-3 rounded border border-neutral-300 text-sm focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
                />
                <p className="text-xs text-neutral-500 mt-1">
                  Used for unnamed/retail customers
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-900 mb-2">
                  Default Contact Number
                </label>
                <input
                  type="text"
                  value={settings.saleInvoiceDefaults.contactNo}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      saleInvoiceDefaults: {
                        ...s.saleInvoiceDefaults,
                        contactNo: e.target.value,
                      },
                    }))
                  }
                  placeholder="e.g. N/A"
                  className="w-full h-9 px-3 rounded border border-neutral-300 text-sm focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
                />
                <p className="text-xs text-neutral-500 mt-1">
                  Customer's phone number (optional)
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end sticky bottom-0 bg-white border-t border-neutral-200 -mx-6 px-6 py-4 mt-8">
        <button
          onClick={handleSave}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-50 transition-colors font-medium">
          <FiSave className="size-4" />
          Save Settings
        </button>
      </div>
    </div>
  );
}
