import {useState, useEffect} from 'react';
import {NavLink} from 'react-router-dom';
import {
  FiHome,
  FiPackage,
  FiFileText,
  FiShoppingCart,
  FiBook,
  FiBarChart2,
  FiSettings,
  FiChevronDown,
  FiPlus,
  FiCheck,
  FiX,
} from 'react-icons/fi';
import {useActiveProfile} from '../../hooks/useActiveProfile';

type Profile = {
  id: string;
  name: string;
  createdAt: string;
  lastOpened: string;
};

const navItems = [
  {path: '/', icon: FiHome, label: 'Home'},
  {path: '/stock', icon: FiPackage, label: 'Stock'},
  {path: '/invoice', icon: FiFileText, label: 'Purchase Invoice'},
  {path: '/sale-invoice', icon: FiShoppingCart, label: 'Sale Invoice'},
  {path: '/ledger', icon: FiBook, label: 'Ledger'},
  {path: '/analytics', icon: FiBarChart2, label: 'Analytics'},
  {path: '/settings', icon: FiSettings, label: 'Settings'},
];

export default function Sidebar() {
  const activeProfileId = useActiveProfile();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [openProfiles, setOpenProfiles] = useState<string[]>([]);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showNewProfile, setShowNewProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadProfiles();
    loadOpenProfiles();
  }, []);

  async function loadProfiles() {
    try {
      const list = await window.electron.profiles.list();
      setProfiles(list);
    } catch (err) {
      console.error('Failed to load profiles:', err);
    }
  }

  async function loadOpenProfiles() {
    try {
      const open = await window.electron.profiles.getOpen();
      setOpenProfiles(open);
    } catch (err) {
      console.error('Failed to load open profiles:', err);
    }
  }

  async function handleSwitchProfile(profileId: string) {
    try {
      // If profile is not open, open it first
      if (!openProfiles.includes(profileId)) {
        await window.electron.profiles.open(profileId);
        // ✅ Wait a bit for the backend to update state
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Switch to the profile
      await window.electron.profiles.switch(profileId);
      // ✅ Wait for backend to persist the active profile
      await new Promise(resolve => setTimeout(resolve, 100));
      
      setShowProfileDropdown(false);

      // Reload the page to reflect new active profile
      window.location.reload();
    } catch (err) {
      console.error('Failed to switch profile:', err);
      alert('Failed to switch profile');
    }
  }

  async function handleCloseProfile(profileId: string, e: React.MouseEvent) {
    e.stopPropagation();

    if (openProfiles.length === 1) {
      alert('Cannot close the last open profile');
      return;
    }

    try {
      await window.electron.profiles.close(profileId);
      await loadOpenProfiles();

      // If we closed the active profile, reload
      if (profileId === activeProfileId) {
        window.location.reload();
      }
    } catch (err) {
      console.error('Failed to close profile:', err);
      alert('Failed to close profile');
    }
  }

  // ✅ Fixed: Properly handle opening a closed profile
  async function handleOpenProfile(profileId: string) {
    try {
      console.log('📂 Opening profile:', profileId);
      
      // 1. Open the profile
      await window.electron.profiles.open(profileId);
      console.log('✅ Profile opened');
      
      // 2. Wait for backend to update state
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // 3. Switch to the profile
      await window.electron.profiles.switch(profileId);
      console.log('✅ Switched to profile');
      
      // 4. Wait for backend to persist active profile
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // 5. Verify the profile is actually active
      const activeProfile = await window.electron.profiles.getActive();
      console.log('📋 Active profile after switch:', activeProfile);
      
      if (activeProfile !== profileId) {
        console.warn('⚠️ Profile not active, retrying...');
        await window.electron.profiles.switch(profileId);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      setShowProfileDropdown(false);
      
      // 6. Reload to show the new profile
      console.log('🔄 Reloading page...');
      window.location.reload();
    } catch (err) {
      console.error('Failed to open profile:', err);
      alert('Failed to open profile: ' + (err as Error).message);
    }
  }

  async function handleCreateProfile() {
    const name = newProfileName.trim();
    if (!name) return;

    setCreating(true);
    try {
      console.log('🆕 Creating profile:', name);
      
      // Create profile (backend auto-opens it)
      const profile = await window.electron.profiles.create(name);
      console.log('✅ Profile created:', profile.id);
      
      // Wait for backend to update state
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Reload profiles list
      await loadProfiles();
      await loadOpenProfiles();

      setNewProfileName('');
      setShowNewProfile(false);
      setShowProfileDropdown(false);

      // Reload to show new profile
      console.log('🔄 Reloading page...');
      window.location.reload();
    } catch (err) {
      console.error('Failed to create profile:', err);
      alert('Failed to create profile: ' + (err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  const activeProfile = profiles.find((p) => p.id === activeProfileId);
  const closedProfiles = profiles.filter((p) => !openProfiles.includes(p.id));

  return (
    <aside className="w-64 bg-white border-r border-neutral-200 flex flex-col">
      {/* Logo / Brand */}
      <div className="p-4 border-b border-neutral-200">
        <h1 className="text-xl font-bold text-neutral-900">Bartan Markaz</h1>
      </div>

      {/* Profile Switcher */}
      <div className="p-3 border-b border-neutral-200">
        {/* ✅ Added wrapper div for proper relative positioning */}
        <div className="relative">
          <button
            onClick={() => setShowProfileDropdown(!showProfileDropdown)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors w-full justify-between"
            title="Switch profile">
            <span className="font-medium truncate">
              {activeProfile?.name || 'Select Profile'}
            </span>
            <FiChevronDown className="size-4 flex-shrink-0" />
          </button>

          {/* Profile Dropdown */}
          {showProfileDropdown && (
            <>
              {/* Backdrop - ✅ Higher z-index */}
              <div
                className="fixed inset-0 z-[9998]"
                onClick={() => setShowProfileDropdown(false)}
              />

              {/* Dropdown Content - ✅ Highest z-index and fixed positioning */}
              <div 
                className="fixed left-3 w-[232px] bg-white border border-neutral-200 rounded-lg shadow-2xl z-[9999] max-h-[70vh] overflow-y-auto"
                style={{top: '88px'}}>
                {/* Open Profiles Section */}
                <div className="p-2 border-b border-neutral-200">
                  <div className="px-2 py-1 text-xs font-semibold text-neutral-500 uppercase">
                    Open Profiles
                  </div>
                  {openProfiles.map((profileId) => {
                    const profile = profiles.find((p) => p.id === profileId);
                    if (!profile) return null;

                    const isActive = profileId === activeProfileId;

                    return (
                      <button
                        key={profileId}
                        onClick={() => handleSwitchProfile(profileId)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-md transition-colors ${
                          isActive
                            ? 'bg-blue-50 text-blue-600'
                            : 'hover:bg-neutral-100 text-neutral-700'
                        }`}>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {isActive && (
                            <FiCheck className="size-4 flex-shrink-0" />
                          )}
                          <span className="truncate">{profile.name}</span>
                        </div>
                        {openProfiles.length > 1 && (
                          <button
                            onClick={(e) => handleCloseProfile(profileId, e)}
                            className="p-1 hover:bg-neutral-200 rounded-md transition-colors"
                            title="Close profile">
                            <FiX className="size-3" />
                          </button>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Closed Profiles Section */}
                {closedProfiles.length > 0 && (
                  <div className="p-2 border-b border-neutral-200">
                    <div className="px-2 py-1 text-xs font-semibold text-neutral-500 uppercase">
                      Other Profiles
                    </div>
                    {closedProfiles.map((profile) => (
                      <button
                        key={profile.id}
                        onClick={() => handleOpenProfile(profile.id)}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-md hover:bg-neutral-100 text-neutral-700 transition-colors">
                        <span className="truncate">{profile.name}</span>
                        <FiPlus className="size-4 flex-shrink-0 text-neutral-400" />
                      </button>
                    ))}
                  </div>
                )}

                {/* Create New Profile Section */}
                <div className="p-2">
                  {!showNewProfile ? (
                    <button
                      onClick={() => setShowNewProfile(true)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-neutral-100 text-neutral-700 transition-colors">
                      <FiPlus className="size-4" />
                      <span>Create New Profile</span>
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={newProfileName}
                        onChange={(e) => setNewProfileName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreateProfile();
                          if (e.key === 'Escape') {
                            setShowNewProfile(false);
                            setNewProfileName('');
                          }
                        }}
                        placeholder="Profile name"
                        className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleCreateProfile}
                          disabled={!newProfileName.trim() || creating}
                          className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                          {creating ? 'Creating...' : 'Create'}
                        </button>
                        <button
                          onClick={() => {
                            setShowNewProfile(false);
                            setNewProfileName('');
                          }}
                          className="px-3 py-2 text-sm border border-neutral-300 rounded-md hover:bg-neutral-100">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({isActive}) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-600 font-medium'
                  : 'text-neutral-600 hover:bg-neutral-100'
              }`
            }>
            <item.icon className="size-5" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-neutral-200 text-xs text-neutral-500">
        <p>© 2025 Bartan Markaz</p>
        <p className="mt-1">Version 1.0.0</p>
      </div>
    </aside>
  );
}
