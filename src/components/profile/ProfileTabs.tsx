import {useEffect, useRef} from 'react';
import {useNavigate, useLocation} from 'react-router-dom';
import {useProfiles} from '../../contexts/ProfileContext';
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

  const lastSavedRoute = useRef<string>('');
  const lastSavedProfile = useRef<string | null>(null); // ✅ Track last saved profile
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null); // ✅ Debounce timer

  // ✅ Aggressively debounced route saving
  useEffect(() => {
    if (
      !activeProfileId ||
      location.pathname === '/welcome' ||
      location.pathname === '/profile-selector'
    ) {
      return;
    }

    // ✅ Skip if nothing changed
    if (
      location.pathname === lastSavedRoute.current &&
      activeProfileId === lastSavedProfile.current
    ) {
      return;
    }

    // ✅ Clear previous timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // ✅ Debounce by 300ms
    saveTimeoutRef.current = setTimeout(() => {
      const key = `lastRoute:${activeProfileId}`;
      localStorage.setItem(key, location.pathname);
      lastSavedRoute.current = location.pathname;
      lastSavedProfile.current = activeProfileId;
      console.log(
        `💾 Saved route for ${getProfileName(activeProfileId)}: ${location.pathname}`
      );
    }, 300);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [location.pathname, activeProfileId]);

  // ✅ Update browser title with profile name
  useEffect(() => {
    const activeProfile = profiles.find(
      (p: {id: string}) => p.id === activeProfileId
    );
    if (activeProfile) {
      document.title = `${activeProfile.name} - Bartan Markaz`;
    }
  }, [activeProfileId, profiles]);

  // Don't render on welcome/selector screens
  if (
    location.pathname === '/welcome' ||
    location.pathname === '/profile-selector'
  ) {
    return null;
  }

  if (openProfiles.length === 0) {
    return null;
  }

  const handleCloseProfile = async (profileId: string) => {
    try {
      // ✅ Clear saved route for closed profile
      const key = `lastRoute:${profileId}`;
      localStorage.removeItem(key);
      console.log(`🗑️ Cleared route for ${getProfileName(profileId)}`);

      await closeProfile(profileId);

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
      const fromProfileName = getProfileName(activeProfileId);
      const toProfileName = getProfileName(profileId);

      console.log(
        `🔄 Switching profile from "${fromProfileName}" to "${toProfileName}"`
      );

      // ✅ 1. Switch backend profile
      await window.electron.profiles.switch(profileId);

      // ✅ 2. Update React context
      setActiveProfile(profileId);

      // ✅ 3. Restore last route for new profile (or default to home)
      const key = `lastRoute:${profileId}`;
      const lastRoute = localStorage.getItem(key) || '/';

      console.log(`📂 Restoring route for "${toProfileName}":`, lastRoute);
      navigate(lastRoute);

      // ✅ 4. Broadcast profile change event
      window.dispatchEvent(
        new CustomEvent('profile:switched', {
          detail: {
            from: activeProfileId,
            to: profileId,
            fromRoute: location.pathname,
            toRoute: lastRoute,
            timestamp: Date.now(),
          },
        })
      );

      console.log('✅ Profile switched successfully');

      // ✅ 5. Show visual confirmation
      showToast(`Switched to ${toProfileName}`);
    } catch (err) {
      console.error('❌ Failed to switch profile:', err);
      alert('Failed to switch profile: ' + (err as Error).message);
    }
  };

  const getProfileName = (profileId: string | null): string => {
    if (!profileId) return 'Unknown';
    return (
      profiles.find((p: {id: string; name: string}) => p.id === profileId)
        ?.name || 'Unknown'
    );
  };

  // ✅ Toast notification
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
          const lastRoute = localStorage.getItem(`lastRoute:${profileId}`) || '/';
          const routeLabel = getRouteLabel(lastRoute);

          return (
            <div
              key={profileId}
              className={`group relative flex items-center gap-2 px-4 py-2 border-b-2 transition-all cursor-pointer ${
                isActive
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-transparent hover:bg-neutral-50'
              }`}
              onClick={() => handleSwitchProfile(profileId)}
              title={`Switch to ${profileName} (${routeLabel})`}>
              {/* ✅ Active indicator icon */}
              {isActive && (
                <FiCheck className="size-4 text-blue-600 animate-fade-in" />
              )}

              {/* Profile Info */}
              <div className="flex flex-col">
                <span
                  className={`text-sm font-medium whitespace-nowrap ${
                    isActive ? 'text-blue-600' : 'text-neutral-700'
                  }`}>
                  {profileName}
                </span>

                {/* ✅ Show last route as subtitle */}
                <span
                  className={`text-xs ${
                    isActive ? 'text-blue-500' : 'text-neutral-500'
                  }`}>
                  {routeLabel}
                </span>
              </div>

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

// ✅ Helper to get friendly route labels
function getRouteLabel(route: string): string {
  const routeMap: Record<string, string> = {
    '/': 'Home',
    '/purchase-invoice': 'Purchases',
    '/sale-invoice': 'Sales',
    '/stock': 'Stock',
    '/ledger': 'Ledger',
    '/analytics': 'Analytics',
    '/settings': 'Settings',
  };

  return routeMap[route] || route;
}
