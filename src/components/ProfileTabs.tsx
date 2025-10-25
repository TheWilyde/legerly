import {useContext, useEffect} from 'react';
import {useNavigate, useLocation} from 'react-router-dom';
import {useProfiles} from '../contexts/ProfileContext';
import {FiX, FiChevronDown, FiCheck} from 'react-icons/fi';

export default function ProfileTabs() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    profiles,
    openProfiles,
    activeProfileId,
    closeProfile,
    setActiveProfile,
  } = useProfiles();

  // ✅ Show current profile name in browser title
  useEffect(() => {
    const activeProfile = profiles.find((p) => p.id === activeProfileId);
    if (activeProfile) {
      document.title = `${activeProfile.name} - Bartan Markaz`;
    }
  }, [activeProfileId, profiles]);

  // Don't show tabs on welcome/profile-selector pages
  if (
    location.pathname === '/welcome' ||
    location.pathname === '/profile-selector'
  ) {
    return null;
  }

  // Don't show if no profiles are open
  if (openProfiles.length === 0) {
    return null;
  }

  const handleCloseProfile = async (profileId: string) => {
    try {
      await closeProfile(profileId);

      // If we closed the last profile, navigate to selector
      if (openProfiles.length === 1) {
        navigate('/profile-selector');
      }
    } catch (err) {
      console.error('Failed to close profile:', err);
    }
  };

  const handleSwitchProfile = async (profileId: string) => {
    if (profileId === activeProfileId) return;

    try {
      console.log('🔄 Switching profile from', activeProfileId, 'to', profileId);

      // 1. Switch backend profile
      await window.electron.profiles.switch(profileId);

      // 2. Update React context
      setActiveProfile(profileId);

      // ✅ 3. Broadcast profile change event to trigger data refresh
      window.dispatchEvent(
        new CustomEvent('profile:switched', {
          detail: {
            from: activeProfileId,
            to: profileId,
          },
        })
      );

      console.log('✅ Profile switched successfully');

      // ✅ 4. Show visual confirmation (toast notification)
      const profileName = getProfileName(profileId);
      showToast(`Switched to ${profileName}`);
    } catch (err) {
      console.error('❌ Failed to switch profile:', err);
      alert('Failed to switch profile: ' + (err as Error).message);
    }
  };

  const getProfileName = (profileId: string): string => {
    return profiles.find((p) => p.id === profileId)?.name || 'Unknown';
  };

  // ✅ Simple toast notification
  function showToast(message: string) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.className =
      'fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg z-[10000] animate-fade-in';
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 300ms';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  return (
    <div className="bg-white border-b border-neutral-200 shadow-sm">
      <div className="flex items-center gap-1 px-4 overflow-x-auto">
        {openProfiles.map((profileId: string) => {
          const isActive = profileId === activeProfileId;
          const profileName = getProfileName(profileId);

          return (
            <div
              key={profileId}
              className={`group relative flex items-center gap-2 px-4 py-2 border-b-2 transition-all cursor-pointer ${
                isActive
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-transparent hover:bg-neutral-50'
              }`}
              onClick={() => handleSwitchProfile(profileId)}
              title={`Switch to ${profileName}`}>
              {/* ✅ Active indicator icon */}
              {isActive && (
                <FiCheck className="size-4 text-blue-600 animate-fade-in" />
              )}

              {/* Profile Name */}
              <span
                className={`text-sm font-medium whitespace-nowrap ${
                  isActive ? 'text-blue-600' : 'text-neutral-700'
                }`}>
                {profileName}
              </span>

              {/* ✅ Active badge */}
              {isActive && (
                <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">
                  Active
                </span>
              )}

              {/* Close Button */}
              {openProfiles.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCloseProfile(profileId);
                  }}
                  className={`p-1 rounded hover:bg-neutral-200 transition-colors ${
                    isActive ? 'text-blue-600' : 'text-neutral-500'
                  }`}
                  title={`Close ${profileName}`}>
                  <FiX className="size-4" />
                </button>
              )}
            </div>
          );
        })}

        {/* Add Profile Button */}
        <button
          onClick={() => navigate('/profile-selector')}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors whitespace-nowrap border-l border-neutral-200"
          title="Open Another Profile">
          <FiChevronDown className="size-4" />
          Open Profile
        </button>
      </div>
    </div>
  );
}
