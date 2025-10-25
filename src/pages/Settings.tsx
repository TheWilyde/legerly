import {useState, useEffect} from 'react';
import {useActiveProfile} from '../hooks/useActiveProfile';
import PageHeader from '../components/common/PageHeader';
import Card from '../components/analytics/Card';
import {FiSave, FiAlertCircle} from 'react-icons/fi';
import {generateDemoData, clearAllData} from '../utils/demoData';

interface Settings {
  autoCalculateAnalytics: boolean;
  // Add other settings here
}

export default function Settings() {
  const profileId = useActiveProfile();
  const [settings, setSettings] = useState<Settings>({
    autoCalculateAnalytics: false, // ✅ Default is disabled
  });
  const [saved, setSaved] = useState(false);

  // Load settings from localStorage
  useEffect(() => {
    if (!profileId) return;
    
    const key = `settings:${profileId}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        setSettings(JSON.parse(stored));
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
    window.dispatchEvent(new CustomEvent('settings:changed', {
      detail: settings
    }));
    
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
    <div className="space-y-6">
      <PageHeader title="Settings" />

      <Card title="Analytics Settings">
        <div className="space-y-4">
          {/* Auto Calculate Analytics Toggle */}
          <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-lg">
            <div className="flex-1">
              <h3 className="font-medium text-neutral-900 mb-1">
                Auto-Calculate Analytics
              </h3>
              <p className="text-sm text-neutral-600">
                Automatically compute analytics when opening the dashboard or analytics page
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoCalculateAnalytics}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    autoCalculateAnalytics: e.target.checked,
                  })
                }
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-neutral-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-neutral-900"></div>
            </label>
          </div>

          {/* Warning when disabled */}
          {!settings.autoCalculateAnalytics && (
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <FiAlertCircle className="size-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-medium mb-1">Manual Analytics Mode</p>
                <p>
                  Analytics will not be calculated automatically. Use the "Calculate" button on the Dashboard or Analytics page to compute them manually.
                </p>
              </div>
            </div>
          )}

          {/* Save Button */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t">
            {saved && (
              <span className="text-sm text-green-600">✓ Settings saved</span>
            )}
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 transition-colors">
              <FiSave className="size-4" />
              Save Settings
            </button>
          </div>
        </div>
      </Card>

      {/* Demo Data Section */}
      <div className="mt-8 bg-white rounded-lg border border-neutral-200 p-6">
        <h2 className="text-xl font-semibold mb-4">Demo Data</h2>
        <p className="text-neutral-600 mb-4">
          Generate fake data to test analytics and features. This will create
          sample invoices and stock items.
        </p>
        <div className="flex gap-4">
          <button
            onClick={generateDemoData}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
            Generate Demo Data
          </button>
          <button
            onClick={clearAllData}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700">
            Clear All Data
          </button>
        </div>
      </div>
    </div>
  );
}
