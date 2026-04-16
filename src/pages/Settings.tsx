import {useState, useEffect, useRef} from 'react';
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

function addDaysIso(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function endOfMonthIso(dateIso: string): string {
  const [yearText, monthText] = dateIso.split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const date = new Date(Date.UTC(year, monthIndex + 1, 0));
  return date.toISOString().slice(0, 10);
}

export default function Settings() {
  const profileId = useActiveProfile();
  const {profiles, refresh} = useProfiles();
  const {
    periods,
    activePeriod,
    selectedPeriod,
    closeActivePeriod,
    reopenPeriod,
  } = usePeriod();
  const savedTimerRef = useRef<number | null>(null);
  const backupMessageTimerRef = useRef<number | null>(null);
  const periodMessageTimerRef = useRef<number | null>(null);
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
  const [saved, setSaved] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [periodMessage, setPeriodMessage] = useState<string | null>(null);
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [periodWorking, setPeriodWorking] = useState(false);
  const [closePeriodForm, setClosePeriodForm] = useState<{
    nextPeriodId: string;
    label: string;
    startDate: string;
    endDate: string;
  }>({
    nextPeriodId: '',
    label: '',
    startDate: '',
    endDate: '',
  });
  const [reopenPeriodId, setReopenPeriodId] = useState<string>('');

  const setPeriodErrorWithFeedback = (message: string | null) => {
    setPeriodError(message);
    if (message) {
      emitAppFeedback('error', message);
    }
  };

  // Load settings from localStorage
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
          // Ensure nested objects are merged correctly if missing in old data
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
    return () => {
      if (savedTimerRef.current !== null) {
        window.clearTimeout(savedTimerRef.current);
      }
      if (backupMessageTimerRef.current !== null) {
        window.clearTimeout(backupMessageTimerRef.current);
      }
      if (periodMessageTimerRef.current !== null) {
        window.clearTimeout(periodMessageTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!activePeriod) return;
    setClosePeriodForm((prev) => {
      if (prev.startDate || prev.endDate) return prev;
      const startDate = addDaysIso(activePeriod.endDate, 1);
      return {
        ...prev,
        startDate,
        endDate: endOfMonthIso(startDate),
      };
    });
  }, [activePeriod]);

  useEffect(() => {
    if (selectedPeriod?.status !== 'closed') return;
    setReopenPeriodId(String(selectedPeriod.id));
  }, [selectedPeriod?.id, selectedPeriod?.status]);

  useEffect(() => {
    if (!periodMessage && !periodError) return;
    if (periodMessageTimerRef.current !== null) {
      window.clearTimeout(periodMessageTimerRef.current);
    }
    periodMessageTimerRef.current = window.setTimeout(() => {
      setPeriodMessage(null);
      setPeriodError(null);
      periodMessageTimerRef.current = null;
    }, 4000);
  }, [periodMessage, periodError]);

  async function handleCloseActivePeriod() {
    if (!profileId || !activePeriod) return;

    const nextPeriodId = Number(closePeriodForm.nextPeriodId);
    const hasExistingTarget = Number.isFinite(nextPeriodId) && nextPeriodId > 0;
    const hasInlineNext =
      closePeriodForm.startDate.trim() && closePeriodForm.endDate.trim();

    if (!hasExistingTarget && !hasInlineNext) {
      setPeriodErrorWithFeedback(
        'Pick an existing next period or enter start/end for a new next period.',
      );
      return;
    }

    if (
      !hasExistingTarget &&
      closePeriodForm.startDate > closePeriodForm.endDate
    ) {
      setPeriodErrorWithFeedback(
        'Next period start date must be before or equal to end date.',
      );
      return;
    }

    setPeriodWorking(true);
    setPeriodErrorWithFeedback(null);
    setPeriodMessage(null);

    try {
      if (hasExistingTarget) {
        await closeActivePeriod({nextPeriodId});
      } else {
        await closeActivePeriod({
          nextPeriod: {
            label: closePeriodForm.label.trim() || undefined,
            startDate: closePeriodForm.startDate,
            endDate: closePeriodForm.endDate,
          },
        });
      }
      setPeriodMessage('Active period closed. New active period set.');
      setClosePeriodForm((prev) => ({
        ...prev,
        nextPeriodId: '',
        label: '',
        startDate: '',
        endDate: '',
      }));
    } catch (error) {
      setPeriodErrorWithFeedback(
        toErrorMessage(error, 'Failed to close active period.'),
      );
    } finally {
      setPeriodWorking(false);
    }
  }

  async function handleReopenPeriod() {
    if (!profileId) return;
    const periodId = Number(reopenPeriodId);
    if (!Number.isFinite(periodId) || periodId <= 0) {
      setPeriodErrorWithFeedback('Select a closed period to reopen.');
      return;
    }

    setPeriodWorking(true);
    setPeriodErrorWithFeedback(null);
    setPeriodMessage(null);

    try {
      await reopenPeriod(periodId);
      setPeriodMessage('Period reopened and set active.');
    } catch (error) {
      setPeriodErrorWithFeedback(
        toErrorMessage(error, 'Failed to reopen period.'),
      );
    } finally {
      setPeriodWorking(false);
    }
  }

  const nextPeriodOptions = periods.filter(
    (period) => period.id !== activePeriod?.id,
  );
  const closedPeriods = periods.filter((period) => period.status === 'closed');

  // Manual backup handler
  async function handleManualBackup() {
    if (!profileId) return;

    setBackingUp(true);
    setBackupMessage(null);

    try {
      await window.api.profiles.createBackup(profileId);
      setBackupMessage('Backup created successfully!');
      if (backupMessageTimerRef.current !== null) {
        window.clearTimeout(backupMessageTimerRef.current);
      }
      backupMessageTimerRef.current = window.setTimeout(() => {
        setBackupMessage(null);
        backupMessageTimerRef.current = null;
      }, 3000);
    } catch (err: any) {
      console.error('Backup failed:', err);
      setBackupMessage(
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
    setSaved(true);

    // Dispatch event to notify other components
    window.dispatchEvent(
      new CustomEvent('settings:changed', {
        detail: settings,
      }),
    );

    if (savedTimerRef.current !== null) {
      window.clearTimeout(savedTimerRef.current);
    }
    savedTimerRef.current = window.setTimeout(() => {
      setSaved(false);
      savedTimerRef.current = null;
    }, 3000);
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
          <div className="flex items-center gap-4">
            <div className="p-2 bg-neutral-100 rounded-full">
              <FiDollarSign className="size-5 text-neutral-600" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-neutral-900 mb-1">
                Currency Symbol
              </label>
              <p className="text-xs text-neutral-500 mb-2">
                Displayed on invoices and reports (e.g. Rs, $, £)
              </p>
              <input
                type="text"
                value={settings.currencySymbol}
                onChange={(e) =>
                  setSettings((s) => ({...s, currencySymbol: e.target.value}))
                }
                className="w-24 h-9 px-3 rounded border border-neutral-300 text-sm font-bold text-center focus:border-neutral-900 outline-none"
                placeholder="Rs"
              />
            </div>
          </div>
          <div className="border-t border-neutral-200 pt-4 flex items-center gap-4">
            <div className="p-2 bg-neutral-100 rounded-full">
              <FiSettings className="size-5 text-neutral-600" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-neutral-900 mb-1">
                Font Family
              </label>
              <p className="text-xs text-neutral-500 mb-2">
                Choose your preferred font for the entire application
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
                className="w-48 h-9 px-3 rounded border border-neutral-300 text-sm bg-white focus:border-neutral-900 outline-none">
                <option value="Cambria">Cambria (Default)</option>
                <option value="Calibri">Calibri</option>
                <option value="Figtree">Figtree</option>
                <option value="Segoe UI">Segoe UI</option>
              </select>
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
                <label className="block text-sm font-medium text-neutral-900 mb-1">
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
                  className="w-full h-9 px-3 rounded border border-neutral-300 text-sm bg-white focus:border-neutral-900 outline-none">
                  <option value="A4">A4 (Standard)</option>
                  <option value="A5">A5 (Half Page)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-900 mb-1">
                  Default Copies
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
                  className="w-full h-9 px-3 rounded border border-neutral-300 text-sm focus:border-neutral-900 outline-none"
                />
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
                <label className="block text-sm font-medium text-neutral-900 mb-1">
                  Low Stock Warning Threshold
                </label>
                <p className="text-xs text-neutral-500 mb-2">
                  Items below this quantity will be highlighted in red
                </p>
                <input
                  type="number"
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
                  className="w-32 h-9 px-3 rounded border border-neutral-300 text-sm focus:border-neutral-900 outline-none"
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-neutral-100">
                <div>
                  <h4 className="text-sm font-medium text-neutral-900">
                    Allow Negative Stock
                  </h4>
                  <p className="text-xs text-neutral-500">
                    Allow selling items even if stock is 0
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
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
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-neutral-900">
                    Confirm Before Delete
                  </h4>
                  <p className="text-xs text-neutral-500">
                    Show a confirmation dialog before deleting invoices or items
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
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

              <div className="flex items-center justify-between pt-4 border-t border-neutral-100">
                <div>
                  <h4 className="text-sm font-medium text-neutral-900">
                    Auto-Calculate Analytics
                  </h4>
                  <p className="text-xs text-neutral-500">
                    Automatically compute charts on dashboard load (may be slow
                    with large data)
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
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
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
            <div className="font-medium text-neutral-900">Active Period</div>
            <div className="mt-1">
              {activePeriod
                ? `${activePeriod.label} (${activePeriod.startDate} to ${activePeriod.endDate})`
                : 'No active period found'}
            </div>
          </div>

          {periodMessage && (
            <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              {periodMessage}
            </div>
          )}

          <div className="rounded-lg border border-neutral-200 p-3 space-y-3">
            <div className="text-sm font-medium text-neutral-900">
              Close Active Period
            </div>
            <select
              value={closePeriodForm.nextPeriodId}
              onChange={(event) =>
                setClosePeriodForm((prev) => ({
                  ...prev,
                  nextPeriodId: event.target.value,
                }))
              }
              className="w-full h-9 px-3 rounded border border-neutral-300 text-sm bg-white">
              <option value="">Choose existing next period</option>
              {nextPeriodOptions.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.label} ({period.status})
                </option>
              ))}
            </select>

            <div className="text-xs text-neutral-500">
              Or create next period now
            </div>

            <input
              type="text"
              value={closePeriodForm.label}
              onChange={(event) =>
                setClosePeriodForm((prev) => ({
                  ...prev,
                  label: event.target.value,
                }))
              }
              placeholder="Next period label (optional)"
              className="w-full h-9 px-3 rounded border border-neutral-300 text-sm"
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                type="date"
                value={closePeriodForm.startDate}
                onChange={(event) =>
                  setClosePeriodForm((prev) => ({
                    ...prev,
                    startDate: event.target.value,
                    nextPeriodId: '',
                  }))
                }
                className="w-full h-9 px-3 rounded border border-neutral-300 text-sm"
              />
              <input
                type="date"
                value={closePeriodForm.endDate}
                onChange={(event) =>
                  setClosePeriodForm((prev) => ({
                    ...prev,
                    endDate: event.target.value,
                    nextPeriodId: '',
                  }))
                }
                className="w-full h-9 px-3 rounded border border-neutral-300 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={handleCloseActivePeriod}
              disabled={periodWorking || !activePeriod}
              className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50">
              Close Active Period
            </button>
          </div>

          <div className="rounded-lg border border-neutral-200 p-3 space-y-3">
            <div className="text-sm font-medium text-neutral-900">
              Reopen Closed Period
            </div>
            {activePeriod && (
              <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                Reopen is frozen while an active period exists.
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
              <select
                value={reopenPeriodId}
                onChange={(event) => setReopenPeriodId(event.target.value)}
                className="w-full h-9 px-3 rounded border border-neutral-300 text-sm bg-white">
                <option value="">Select closed period</option>
                {closedPeriods.map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleReopenPeriod}
                disabled={
                  periodWorking || closedPeriods.length === 0 || !!activePeriod
                }
                className="inline-flex items-center justify-center h-9 px-3 rounded-md border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">
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
                Profile Color
              </h4>
              <p className="text-xs text-neutral-500 mb-4">
                Customize the highlight color for this profile. This color will
                be used in the sidebar to distinguish this profile from others.
              </p>
              <div className="flex items-center gap-3">
                <span className="text-sm text-neutral-700">
                  {profiles.find((p) => p.id === profileId)?.name ||
                    'Current Profile'}
                </span>
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
                    } catch (err) {
                      console.error('Failed to update profile color:', err);
                      emitAppFeedback(
                        'error',
                        'Failed to update profile color',
                      );
                    }
                  }}
                  className="w-10 h-8 rounded border border-neutral-300 cursor-pointer"
                  title="Change profile color"
                />
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 6. Backup & Data Management */}
      <Card title="Backup & Data Management">
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-blue-50 rounded-lg">
              <FiDatabase className="size-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <h4 className="font-medium text-neutral-900">Manual Backup</h4>
              <p className="text-sm text-neutral-500 mt-1">
                Create a backup of your current profile data. Backups are
                automatically created when you open a profile, but you can
                create one manually anytime.
              </p>
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={handleManualBackup}
                  disabled={backingUp}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  <FiDownload className="size-4" />
                  {backingUp ? 'Creating Backup...' : 'Create Backup Now'}
                </button>
                {backupMessage && (
                  <span
                    className={`text-sm ${backupMessage.includes('success') ? 'text-green-600' : 'text-red-600'}`}>
                    {backupMessage}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-neutral-200 pt-4">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-neutral-100 rounded-lg">
                <FiSettings className="size-5 text-neutral-600" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-neutral-900">
                  Automatic Backups
                </h4>
                <p className="text-sm text-neutral-500 mt-1">
                  A backup is automatically created each time you open your
                  profile. The system keeps the last 10 backups and
                  automatically removes older ones.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 6. Default Invoice Values */}
      <Card title="Default Invoice Values">
        <div className="space-y-6">
          <div>
            <h3 className="font-medium text-neutral-900 mb-2">
              Purchase Invoice Defaults
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold mb-1">
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
                  className="w-full h-9 px-3 rounded border border-neutral-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Default Contact No
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
                  className="w-full h-9 px-3 rounded border border-neutral-300 text-sm"
                />
              </div>
            </div>
          </div>
          <div>
            <h3 className="font-medium text-neutral-900 mb-2">
              Sale Invoice Defaults
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Default Customer/Supplier Name
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
                  className="w-full h-9 px-3 rounded border border-neutral-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Default Contact No
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
                  className="w-full h-9 px-3 rounded border border-neutral-300 text-sm"
                />
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 transition-colors">
          <FiSave className="size-4" />
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
