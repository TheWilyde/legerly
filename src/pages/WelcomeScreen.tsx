import {useEffect, useState, useRef} from 'react';
import {useNavigate} from 'react-router-dom';
import {
  FiPackage,
  FiPlus,
  FiTrash2,
  FiRotateCcw,
  FiX,
  FiAlertTriangle,
} from 'react-icons/fi';
import {useProfiles} from '../contexts/ProfileContext';
import {emitAppFeedback, toErrorText} from '../utils/feedback';

interface Profile {
  id: string;
  name: string;
  createdAt: string;
  lastOpened: string;
  path: string;
}

// Helper function to format backup date
function formatBackupDate(dateStr: string): string {
  const dt = new Date(dateStr);
  if (isNaN(dt.getTime())) return 'Unknown date';

  const day = String(dt.getDate()).padStart(2, '0');
  const month = dt.toLocaleString('en-US', {month: 'short'});
  const year = dt.getFullYear();
  const hours = String(dt.getHours()).padStart(2, '0');
  const minutes = String(dt.getMinutes()).padStart(2, '0');

  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

export default function WelcomeScreen() {
  const navigate = useNavigate();
  const {createProfile, openProfile, setActiveProfile, deleteProfile} =
    useProfiles();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileColor, setNewProfileColor] = useState('#3b82f6');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // FIX: State for Backup Modal
  const [showBackups, setShowBackups] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    null,
  );
  const [backups, setBackups] = useState<any[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);

  // ✅ FIX: Use ref for input to ensure focus works
  const inputRef = useRef<HTMLInputElement>(null);
  const focusTimerRef = useRef<number | null>(null);

  const setWelcomeError = (message: string | null) => {
    setError(message);
    if (message) {
      emitAppFeedback('error', message);
    }
  };

  // ✅ FIX: Focus input when showCreate becomes true
  useEffect(() => {
    if (!showCreate) {
      if (focusTimerRef.current !== null) {
        window.clearTimeout(focusTimerRef.current);
        focusTimerRef.current = null;
      }
      return;
    }

    // Small delay to ensure DOM is ready.
    focusTimerRef.current = window.setTimeout(() => {
      inputRef.current?.focus();
      focusTimerRef.current = null;
    }, 50);

    return () => {
      if (focusTimerRef.current !== null) {
        window.clearTimeout(focusTimerRef.current);
        focusTimerRef.current = null;
      }
    };
  }, [showCreate]);

  // Load existing profiles
  useEffect(() => {
    async function loadProfiles() {
      try {
        const allProfiles = await window.api.profiles.list();
        setProfiles(allProfiles as any);
      } catch (err) {
        console.error('Failed to load profiles:', err);
      }
    }
    loadProfiles();
  }, []);

  // Create new profile
  async function handleCreateProfile() {
    const name = newProfileName.trim();
    if (!name) {
      setWelcomeError('Please enter a business name');
      return;
    }

    setLoading(true);
    setWelcomeError(null);

    try {
      await createProfile(name, newProfileColor);
      setNewProfileName('');
      setNewProfileColor('#3b82f6');
      setShowCreate(false);
      // Reload list after creation
      const all = await window.api.profiles.list();
      setProfiles(all as any);
    } catch (err: any) {
      console.error('Create failed:', err);
      setWelcomeError(err.message || 'Failed to create profile');
    } finally {
      setLoading(false);
    }
  }

  // Open existing profile
  async function handleOpenProfile(profileId: string) {
    try {
      await openProfile(profileId);
      await setActiveProfile(profileId);
      navigate('/');
    } catch (err: any) {
      console.error('Failed to open profile:', err);
      emitAppFeedback('error', `Failed to open profile: ${toErrorText(err)}`);
    }
  }

  // Delete existing profile
  async function handleDeleteProfile(profileId: string) {
    if (!confirm('Delete this profile? This cannot be undone.')) return;
    setDeletingId(profileId);
    try {
      await deleteProfile(profileId);
      const all = await window.api.profiles.list();
      setProfiles(all as any);
    } catch (err: any) {
      emitAppFeedback('error', `Failed to delete profile: ${toErrorText(err)}`);
    } finally {
      setDeletingId(null);
    }
  }

  // FIX: Load backups for a profile
  async function openBackups(profileId: string) {
    setSelectedProfileId(profileId);
    setShowBackups(true);
    setLoadingBackups(true);
    try {
      const list = await window.api.profiles.getBackups(profileId);
      setBackups(list || []);
    } catch (err) {
      console.error('Failed to load backups:', err);
      setBackups([]);
    } finally {
      setLoadingBackups(false);
    }
  }

  // FIX: Restore handler
  async function handleRestore(filename: string) {
    if (!selectedProfileId) return;
    if (
      !confirm(
        `Restore backup "${filename}"? Current data will be backed up first.`,
      )
    )
      return;

    try {
      await window.api.profiles.restoreBackup(selectedProfileId, filename);
      emitAppFeedback('success', 'Backup restored successfully!');
      setShowBackups(false);
    } catch (err: any) {
      emitAppFeedback('error', `Failed to restore backup: ${toErrorText(err)}`);
    }
  }

  return (
    <div className="h-full w-full overflow-auto bg-linear-to-br from-blue-50 to-neutral-100 flex justify-center items-center p-6">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-3xl my-auto relative">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-neutral-900">
            Manage Profiles
          </h1>
          {!showCreate && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 transition-colors">
              <FiPlus />
              Create Profile
            </button>
          )}
        </div>

        {/* ✅ FIX: Simplified input with ref */}
        {showCreate && (
          <div className="mb-8 animate-in fade-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex gap-4 mb-4">
              <input
                ref={inputRef}
                type="text"
                value={newProfileName}
                onChange={(e) => {
                  setWelcomeError(null);
                  setNewProfileName(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreateProfile();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setShowCreate(false);
                    setNewProfileName('');
                    setNewProfileColor('#3b82f6');
                  }
                }}
                placeholder="New profile name"
                autoComplete="off"
                className="flex-1 px-4 py-3 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <div className="flex items-center gap-2">
                <label className="text-sm text-neutral-600">Color:</label>
                <input
                  type="color"
                  value={newProfileColor}
                  onChange={(e) => setNewProfileColor(e.target.value)}
                  className="w-10 h-10 rounded border border-neutral-300 cursor-pointer"
                  title="Choose profile color"
                />
              </div>
            </div>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={handleCreateProfile}
                disabled={!newProfileName.trim() || loading}
                className="px-5 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                <FiPlus className="size-5" />
                <span>{loading ? 'Creating...' : 'Create'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreate(false);
                  setNewProfileName('');
                  setNewProfileColor('#3b82f6');
                  setWelcomeError(null);
                }}
                className="px-4 py-3 text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        <div>
          <h2 className="text-lg font-semibold mb-3 text-neutral-800">
            Existing Profiles ({profiles.length})
          </h2>
          {profiles.length === 0 && (
            <div className="text-sm text-neutral-500">
              No profiles yet. Create one above.
            </div>
          )}
          <div className="space-y-2">
            {profiles.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-3 rounded-lg border hover:border-neutral-300 bg-neutral-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-neutral-100 rounded-lg flex items-center justify-center">
                    <FiPackage className="w-5 h-5 text-neutral-600" />
                  </div>
                  <div>
                    <div className="font-medium text-neutral-900">{p.name}</div>
                    <div className="text-xs text-neutral-500">
                      Last opened: {new Date(p.lastOpened).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openBackups(p.id)}
                    className="p-2 text-neutral-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Restore Backup">
                    <FiRotateCcw className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteProfile(p.id)}
                    disabled={deletingId === p.id}
                    className="p-2 text-neutral-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    title="Delete Profile">
                    <FiTrash2 className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenProfile(p.id)}
                    className="px-4 py-2 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 text-sm font-medium">
                    Open
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Backup Modal */}
        {showBackups && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
                <h3 className="text-lg font-semibold text-neutral-900">
                  Restore Backup
                </h3>
                <button
                  type="button"
                  onClick={() => setShowBackups(false)}
                  className="p-1 hover:bg-neutral-100 rounded-full transition-colors">
                  <FiX className="size-5" />
                </button>
              </div>

              <div className="p-5 max-h-100 overflow-y-auto">
                {loadingBackups ? (
                  <div className="text-center py-8 text-neutral-500">
                    Loading backups...
                  </div>
                ) : backups.length === 0 ? (
                  <div className="text-center py-8">
                    <FiAlertTriangle className="size-8 mx-auto text-neutral-400 mb-2" />
                    <p className="text-neutral-500">No backups available</p>
                  </div>
                ) : (
                  <table className="w-full text-sm text-left">
                    <thead className="bg-neutral-50 text-neutral-500 font-medium border-b border-neutral-200 sticky top-0">
                      <tr>
                        <th className="px-4 py-2">Date</th>
                        <th className="px-4 py-2">Size</th>
                        <th className="px-4 py-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backups.map((b: any) => (
                        <tr
                          key={b.filename}
                          className="border-b border-neutral-100 hover:bg-neutral-50">
                          <td className="px-4 py-2">
                            {formatBackupDate(b.date)}
                          </td>
                          <td className="px-4 py-2">
                            {(b.size / 1024).toFixed(1)} KB
                          </td>
                          <td className="px-4 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => handleRestore(b.filename)}
                              className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700">
                              Restore
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
