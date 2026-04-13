import {useState, useEffect, useRef} from 'react';
import {useActiveProfile} from '../hooks/useActiveProfile';
import {useProfiles} from '../contexts/ProfileContext';
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

export default function Settings() {
  const profileId = useActiveProfile();
  const {profiles, refresh} = useProfiles();
  const savedTimerRef = useRef<number | null>(null);
  const backupMessageTimerRef = useRef<number | null>(null);
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
    };
  }, []);

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
                      alert('Failed to update profile color');
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
