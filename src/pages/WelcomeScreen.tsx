import {useState, useEffect} from 'react';
import {useNavigate} from 'react-router-dom';
import {FiPackage, FiPlus, FiFolderPlus, FiClock} from 'react-icons/fi';
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
  const {createProfile} = useProfiles();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [showNewProfileModal, setShowNewProfileModal] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load existing profiles
  useEffect(() => {
    async function loadProfiles() {
      try {
        const allProfiles = await window.electron.profiles.list();
        // Sort by last opened, most recent first
        const sorted = allProfiles.sort(
          (a, b) =>
            new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime()
        );
        setProfiles(sorted.slice(0, 5)); // Show only 5 most recent
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
      console.log('🔵 WelcomeScreen: Creating profile...');

      await createProfile(name);

      console.log('✅ WelcomeScreen: Profile created, navigating...');

      // Small delay to ensure context is fully updated
      await new Promise((resolve) => setTimeout(resolve, 200));

      navigate('/');
    } catch (err: any) {
      console.error('❌ WelcomeScreen: Failed to create profile:', err);
      setError(err.message || 'Failed to create profile');
    } finally {
      setLoading(false);
    }
  }

  // Open existing profile
  async function handleOpenProfile(profileId: string) {
    try {
      await window.electron.profiles.open(profileId);
      navigate('/');
    } catch (err: any) {
      console.error('Failed to open profile:', err);
      alert('Failed to open profile: ' + err.message);
    }
  }

  // Open file picker (for future implementation)
  function handleOpenFile() {
    alert('Open file functionality - Coming soon!');
    // TODO: Implement file picker to open .ledgerly files
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-neutral-100 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-neutral-900 mb-2">
            Welcome to Bartan Markaz
          </h1>
          <p className="text-neutral-600">
            Create your first profile to get started
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="profileName"
              className="block text-sm font-medium text-neutral-700 mb-2">
              Profile Name
            </label>
            <input
              id="profileName"
              type="text"
              value={newProfileName}
              onChange={(e) => setNewProfileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateProfile();
              }}
              placeholder="My Business"
              className="w-full px-4 py-3 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          <button
            onClick={handleCreateProfile}
            disabled={!newProfileName.trim() || loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            <FiPlus className="size-5" />
            <span>{loading ? 'Creating...' : 'Create Profile'}</span>
          </button>
        </div>

        {/* Recent Profiles List */}
        {profiles.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6 mt-6">
            <h3 className="text-lg font-bold text-neutral-900 mb-4 flex items-center gap-2">
              <FiClock className="w-5 h-5" />
              Recent Profiles
            </h3>
            <div className="space-y-2">
              {profiles.map((profile) => (
                <button
                  key={profile.id}
                  onClick={() => handleOpenProfile(profile.id)}
                  className="w-full flex items-center justify-between p-4 rounded-lg hover:bg-neutral-50 transition-colors group border border-transparent hover:border-neutral-200">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-neutral-100 rounded-lg flex items-center justify-center group-hover:bg-neutral-900 transition-colors">
                      <FiPackage className="w-5 h-5 text-neutral-600 group-hover:text-white" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-neutral-900">
                        {profile.name}
                      </p>
                      <p className="text-xs text-neutral-500">
                        Last opened:{' '}
                        {new Date(profile.lastOpened).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-neutral-400 group-hover:text-neutral-900">
                    →
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-neutral-200 text-center text-sm text-neutral-500">
          <p>You can create multiple profiles for different businesses</p>
        </div>
      </div>

      {/* Create New Profile Modal */}
      {showNewProfileModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold text-neutral-900 mb-4">
              Create New Profile
            </h2>

            <div className="mb-4">
              <label
                htmlFor="newProfileName"
                className="block text-sm font-medium text-neutral-700 mb-2">
                Business Name
              </label>
              <input
                id="newProfileName"
                type="text"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleCreateProfile()}
                placeholder="e.g., Main Store"
                disabled={loading}
                className="w-full px-4 py-3 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-neutral-900 focus:border-transparent disabled:bg-neutral-100"
                autoFocus
              />
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowNewProfileModal(false);
                  setNewProfileName('');
                  setError(null);
                }}
                disabled={loading}
                className="flex-1 px-4 py-3 border border-neutral-300 rounded-lg text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 font-medium">
                Cancel
              </button>
              <button
                onClick={handleCreateProfile}
                disabled={loading || !newProfileName.trim()}
                className="flex-1 px-4 py-3 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 disabled:opacity-50 font-medium">
                {loading ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
