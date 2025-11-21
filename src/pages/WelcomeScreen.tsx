import {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
// FIX: Added FiRotateCcw, FiX, FiAlertTriangle
import {FiPackage, FiPlus, FiTrash2, FiRotateCcw, FiX, FiAlertTriangle} from 'react-icons/fi';
import {useProfiles} from '../contexts/ProfileContext';

interface Profile {
  id: string;
  name: string;
  createdAt: string;
  lastOpened: string;
  path: string;
}

export default function WelcomeScreen() {
  const navigate = useNavigate();
  const {createProfile, openProfile, setActiveProfile, deleteProfile} =
    useProfiles();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [newProfileName, setNewProfileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // FIX: State for Backup Modal
  const [showBackups, setShowBackups] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [backups, setBackups] = useState<any[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);

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
      setError('Please enter a business name');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await createProfile(name);
      setNewProfileName('');
      // Reload list after creation
      const all = await window.api.profiles.list();
      setProfiles(all as any);
    } catch (err: any) {
      console.error('Create failed:', err);
      setError(err.message || 'Failed to create profile');
    } finally {
      setLoading(false);
    }
  }

  // Open existing profile
  async function handleOpenProfile(profileId: string) {
    try {
      await openProfile(profileId);
      setActiveProfile(profileId);
      navigate('/');
    } catch (err: any) {
      console.error('Failed to open profile:', err);
      alert('Failed to open profile: ' + err.message);
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
      alert('Failed to delete profile: ' + err.message);
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
      setBackups(list);
    } catch (err) {
      console.error('Failed to load backups:', err);
      alert('Failed to load backups');
    } finally {
      setLoadingBackups(false);
    }
  }

  // FIX: Restore handler
  async function handleRestore(filename: string) {
    if (!selectedProfileId) return;
    if (!confirm('Are you sure? This will overwrite the current data. A safety copy will be created.')) return;

    try {
      await window.api.profiles.restoreBackup(selectedProfileId, filename);
      alert('Backup restored successfully!');
      setShowBackups(false);
      // Reload profiles to refresh last opened date if needed
      const all = await window.api.profiles.list();
      setProfiles(all as any);
    } catch (err: any) {
      console.error(err);
      alert('Failed to restore: ' + err.message);
    }
  }

  return (
    <div className="h-full w-full overflow-auto bg-gradient-to-br from-blue-50 to-neutral-100 flex justify-center items-center p-6">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-3xl my-auto relative">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-neutral-900">
            Manage Profiles
          </h1>
          {!showCreate && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 transition-colors">
              <FiPlus />
              Create Profile
            </button>
          )}
        </div>

        {/* FIX: Conditionally render creation form */}
        {showCreate && (
          <div className="flex gap-4 mb-8 animate-in fade-in slide-in-from-top-2 duration-200">
            <input
              id="profileName"
              type="text"
              value={newProfileName}
              onChange={(e) => {
                setError(null);
                setNewProfileName(e.target.value);
              }}
              onFocus={() => {
                window.dispatchEvent(new CustomEvent('profileMenu:close'));
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateProfile()}
              placeholder="New profile name"
              autoFocus
              className="flex-1 px-4 py-3 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleCreateProfile}
              disabled={!newProfileName.trim() || loading}
              className="px-5 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
              <FiPlus className="size-5" />
              <span>{loading ? 'Creating...' : 'Create'}</span>
            </button>
            <button 
              onClick={() => setShowCreate(false)}
              className="px-4 py-3 text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors">
              Cancel
            </button>
          </div>
        )}

        {error && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
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
                    onClick={() => handleOpenProfile(p.id)}
                    className="px-3 py-1.5 text-sm rounded-md bg-neutral-900 text-white hover:bg-neutral-800">
                    Open
                  </button>
                  
                  {/* FIX: Added Restore Button */}
                  <button
                    onClick={() => openBackups(p.id)}
                    className="px-3 py-1.5 text-sm rounded-md border border-neutral-300 text-neutral-600 hover:bg-neutral-100 flex items-center gap-1"
                    title="Restore from Backup"
                  >
                    <FiRotateCcw className="size-4" />
                  </button>

                  <button
                    onClick={() => handleDeleteProfile(p.id)}
                    disabled={deletingId === p.id}
                    className="px-3 py-1.5 text-sm rounded-md border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50 flex items-center gap-1">
                    <FiTrash2 className="size-4" />
                    <span>
                      {deletingId === p.id ? '...' : 'Delete'}
                    </span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 pt-4 border-t text-xs text-neutral-500">
          You can maintain multiple profiles for different businesses.
        </div>
      </div>

      {/* FIX: Backup Restore Modal */}
      {showBackups && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-neutral-200 animate-in fade-in zoom-in-95">
            <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between bg-neutral-50">
              <h3 className="font-semibold text-neutral-900 flex items-center gap-2">
                <FiRotateCcw className="text-neutral-500" />
                Restore Backup
              </h3>
              <button 
                onClick={() => setShowBackups(false)}
                className="p-1 hover:bg-neutral-200 rounded-full transition-colors"
              >
                <FiX className="size-5 text-neutral-500" />
              </button>
            </div>
            
            <div className="p-4">
              <div className="mb-4 p-3 bg-amber-50 border border-amber-100 rounded-lg flex gap-3">
                <FiAlertTriangle className="size-5 text-amber-600 shrink-0" />
                <div className="text-xs text-amber-800">
                  <p className="font-bold mb-1">Warning</p>
                  Restoring a backup will overwrite the current data for this profile. 
                  A safety snapshot of the current state will be created before restoring.
                </div>
              </div>

              <div className="max-h-[300px] overflow-y-auto border border-neutral-200 rounded-lg">
                {loadingBackups ? (
                  <div className="p-8 text-center text-neutral-500 text-sm">Loading backups...</div>
                ) : backups.length === 0 ? (
                  <div className="p-8 text-center text-neutral-500 text-sm">No backups found for this profile.</div>
                ) : (
                  <table className="w-full text-sm text-left">
                    <thead className="bg-neutral-50 text-neutral-500 font-medium border-b border-neutral-200 sticky top-0">
                      <tr>
                        <th className="px-4 py-2">Date</th>
                        <th className="px-4 py-2">Size</th>
                        <th className="px-4 py-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {backups.map((b) => (
                        <tr key={b.filename} className="hover:bg-neutral-50 group">
                          <td className="px-4 py-2 text-neutral-700">
                            {new Date(b.date).toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-neutral-500 font-mono text-xs">
                            {(b.size / 1024).toFixed(1)} KB
                          </td>
                          <td className="px-4 py-2 text-right">
                            <button
                              onClick={() => handleRestore(b.filename)}
                              className="px-2 py-1 bg-white border border-neutral-200 rounded text-xs font-medium text-neutral-700 hover:bg-neutral-50 hover:border-neutral-300 shadow-sm"
                            >
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
        </div>
      )}
    </div>
  );
}
