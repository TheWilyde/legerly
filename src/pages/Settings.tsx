import {useState, useEffect} from 'react';
import {useActiveProfile} from '../hooks/useActiveProfile';
import PageHeader from '../components/common/PageHeader';
import Card from '../components/analytics/Card';
import {
  FiSave,
  FiPrinter,
  FiBox,
  FiSettings,
  FiDollarSign,
} from 'react-icons/fi';

export interface Settings {
  autoCalculateAnalytics: boolean;
  // ✅ Kept as requested
  currencySymbol: string;

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
  const [settings, setSettings] = useState<Settings>({
    autoCalculateAnalytics: false,
    currencySymbol: 'Rs',
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
      })
    );

    setTimeout(() => setSaved(false), 3000);
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
                  <div className="w-9 h-5 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-neutral-900"></div>
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
                  <div className="w-9 h-5 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-neutral-900"></div>
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
                  <div className="w-9 h-5 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-neutral-900"></div>
                </label>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 5. Existing Defaults */}
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

      {/* Floating Save Button */}
      <div className="fixed bottom-6 right-6 z-10">
        <div className="flex items-center gap-3 bg-white p-2 rounded-lg shadow-lg border border-neutral-200">
          {saved && (
            <span className="text-sm text-green-600 font-medium px-2 animate-in fade-in">
              ✓ Saved
            </span>
          )}
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-6 py-2.5 bg-neutral-900 text-white rounded-md hover:bg-neutral-800 transition-all shadow-md hover:shadow-lg active:scale-95">
            <FiSave className="size-4" />
            <span className="font-medium">Save All Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
}
