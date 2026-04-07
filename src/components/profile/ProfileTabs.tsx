import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {useNavigate, useLocation} from 'react-router-dom';
import {FiChevronDown, FiX, FiPlus, FiGrid} from 'react-icons/fi';
import {useProfiles} from '../../contexts/ProfileContext';

export default function ProfileTabs() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    profiles,
    openProfiles,
    activeProfileId,
    closeProfile,
    setActiveProfile,
    openProfile,
  } = useProfiles();

  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{top: number; left: number} | null>(
    null,
  );

  const nameById = useMemo(
    () =>
      new Map(
        profiles.map(
          (p: {id: string; name: string}) => [p.id, p.name] as const,
        ),
      ),
    [profiles],
  );
  const getProfileName = useCallback(
    (id: string | null) => (id ? nameById.get(id) || 'Unknown' : 'Unknown'),
    [nameById],
  );

  const displayedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const id of openProfiles) ids.add(id);
    if (activeProfileId) ids.add(activeProfileId);
    return Array.from(ids);
  }, [openProfiles, activeProfileId]);

  const computeMenuPos = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const MENU_WIDTH = 260;
    const left = Math.min(
      Math.max(8, rect.right - MENU_WIDTH),
      window.innerWidth - MENU_WIDTH - 8,
    );
    const top = Math.min(Math.max(8, rect.bottom + 8), window.innerHeight - 40);
    setMenuPos({top, left});
  }, []);

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false);
    setMenuPos(null);
  }, [location.pathname]);

  useEffect(() => {
    const onClose = () => setMenuOpen(false);
    window.addEventListener('profileMenu:close', onClose);
    return () => window.removeEventListener('profileMenu:close', onClose);
  }, []);

  const handleCloseProfile = useCallback(
    async (profileId: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      try {
        localStorage.removeItem(`lastRoute:${profileId}`);
        await closeProfile(profileId);
        if (profileId === activeProfileId) navigate('/welcome');
      } catch (err) {
        console.error('Failed to close profile:', err);
      }
    },
    [closeProfile, activeProfileId, navigate],
  );

  const handleSwitchProfile = useCallback(
    async (profileId: string) => {
      if (profileId === activeProfileId) return;
      try {
        await setActiveProfile(profileId);
        let lastRoute = localStorage.getItem(`lastRoute:${profileId}`) || '/';
        if (lastRoute.includes('profile-selector')) lastRoute = '/';
        const targetRoute = lastRoute === '/welcome' ? '/' : lastRoute;
        navigate(targetRoute);
      } catch (err) {
        console.error('Failed to switch profile:', err);
        alert('Failed to switch profile');
      }
    },
    [activeProfileId, navigate, setActiveProfile],
  );

  if (location.pathname === '/welcome') return null;

  return (
    <div
      className="h-[53px] bg-neutral-50/80 backdrop-blur-sm border-b border-neutral-200 flex items-center px-4 gap-3 select-none"
      role="navigation"
      aria-label="Profile tabs">
      {/* Scrollable Tabs Area */}
      {/* FIX: Reduced gap from gap-2 to gap-1 */}
      <div className="flex-1 flex items-center gap-1 overflow-x-auto no-scrollbar mask-linear-fade py-1">
        {displayedIds.map((profileId: string) => {
          const isActive = profileId === activeProfileId;
          const profileName =
            nameById.get(profileId) ??
            profiles.find((p) => p.id === profileId)?.name ??
            getProfileName(profileId);

          let lastRoute = isActive
            ? location.pathname
            : localStorage.getItem(`lastRoute:${profileId}`) || '/';

          if (lastRoute.includes('profile-selector')) lastRoute = '/';
          const routeLabel = getRouteLabel(lastRoute);

          return (
            <div
              key={profileId}
              onClick={() => handleSwitchProfile(profileId)}
              className={`
                group relative flex items-center gap-2 px-3 py-1.5 rounded-sm cursor-pointer transition-all duration-200 border
                min-w-[140px] max-w-[200px] h-[38px]
                ${
                  isActive
                    ? 'bg-white border-neutral-200 shadow-sm border-l-2 border-l-neutral-800'
                    : 'bg-transparent border-transparent hover:bg-neutral-200/50 text-neutral-500 hover:text-neutral-700'
                }
              `}>
              <div className="flex-1 min-w-0 flex flex-col justify-center leading-none">
                <span
                  className={`text-sm font-semibold truncate ${
                    isActive ? 'text-neutral-900' : 'text-inherit'
                  }`}>
                  {profileName}
                </span>
                <span
                  className={`text-[10px] truncate mt-1 ${
                    isActive
                      ? 'text-neutral-500 font-medium'
                      : 'text-neutral-400'
                  }`}>
                  {routeLabel}
                </span>
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={(e) => handleCloseProfile(profileId, e)}
                className={`
                  p-1 rounded-sm transition-all
                  ${
                    isActive
                      ? 'text-neutral-400 hover:text-red-600 hover:bg-red-50 opacity-100'
                      : 'text-neutral-400 hover:text-red-600 hover:bg-neutral-300 opacity-0 group-hover:opacity-100'
                  }
                `}
                title="Close profile">
                <FiX className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Divider */}
      <div className="h-6 w-px bg-neutral-200 mx-1" />

      {/* Add/Menu Button */}
      <div className="relative">
        <button
          ref={buttonRef}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!menuOpen) computeMenuPos();
            setMenuOpen(!menuOpen);
          }}
          className={`
            flex items-center gap-2 px-3 py-2 rounded-sm text-sm font-medium transition-all
            ${
              menuOpen
                ? 'bg-neutral-200 text-neutral-900'
                : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
            }
          `}
          title="Manage Profiles">
          <FiGrid className="size-4" />
          <span className="hidden sm:inline">Profiles</span>
          <FiChevronDown
            className={`size-4 transition-transform ${
              menuOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        <ProfileMenu
          buttonRef={buttonRef}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          menuPos={menuPos}
          setMenuPos={setMenuPos}
          computeMenuPos={computeMenuPos}
          profiles={profiles}
          openProfiles={openProfiles}
          activeProfileId={activeProfileId}
          openProfile={openProfile}
          onSwitch={handleSwitchProfile}
          navigate={navigate}
        />
      </div>
    </div>
  );
}

function ProfileMenu(props: {
  buttonRef: React.RefObject<HTMLButtonElement>;
  menuOpen: boolean;
  setMenuOpen: (v: boolean) => void;
  menuPos: {top: number; left: number} | null;
  setMenuPos: (pos: {top: number; left: number} | null) => void;
  computeMenuPos: () => void;
  profiles: Array<{id: string; name: string}>;
  openProfiles: string[];
  activeProfileId: string | null;
  openProfile: (id: string) => Promise<void>;
  onSwitch: (id: string) => Promise<void>;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const {
    menuOpen,
    setMenuOpen,
    menuPos,
    setMenuPos,
    computeMenuPos,
    profiles,
    openProfiles,
    activeProfileId,
    openProfile,
    onSwitch,
  } = props;

  useEffect(() => {
    if (!menuOpen) return;
    function onWin() {
      computeMenuPos();
    }
    window.addEventListener('resize', onWin);
    window.addEventListener('scroll', onWin, true);
    return () => {
      window.removeEventListener('resize', onWin);
      window.removeEventListener('scroll', onWin, true);
    };
  }, [menuOpen, computeMenuPos]);

  useEffect(() => {
    if (!menuOpen) setMenuPos(null);
  }, [menuOpen, setMenuPos]);

  return (
    <>
      {menuOpen &&
        menuPos &&
        createPortal(
          <div
            className="fixed inset-0 z-[99998]"
            onClick={() => props.setMenuOpen(false)}>
            <div
              role="menu"
              aria-label="Profiles"
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                top: `${props.menuPos!.top}px`,
                left: `${props.menuPos!.left}px`,
                width: 260,
              }}
              className="bg-white border border-neutral-200 rounded-lg shadow-2xl max-h-[60vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100">
              <div className="p-3 bg-neutral-50 border-b border-neutral-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  All Profiles
                </span>
                <span className="text-xs bg-neutral-200 text-neutral-600 px-1.5 py-0.5 rounded-full">
                  {profiles.length}
                </span>
              </div>

              <div className="overflow-y-auto p-1.5 space-y-0.5">
                {profiles.map((p: {id: string; name: string}) => {
                  const isOpen = openProfiles.includes(p.id);
                  const active = p.id === activeProfileId;
                  return (
                    <button
                      key={p.id}
                      role="menuitem"
                      onClick={async () => {
                        setMenuOpen(false);
                        try {
                          if (!isOpen) await openProfile(p.id);
                          await onSwitch(p.id);
                        } catch (err) {
                          console.error(
                            'Failed to open profile from menu:',
                            err,
                          );
                          alert('Failed to open profile');
                        }
                      }}
                      className={`w-full text-left px-3 py-2.5 rounded-md flex items-center justify-between transition-colors group ${
                        active
                          ? 'bg-neutral-100 text-neutral-900 font-medium'
                          : 'text-neutral-700 hover:bg-neutral-50'
                      }`}>
                      <span className="truncate">{p.name}</span>
                      <div className="flex items-center gap-2">
                        {active && (
                          <span className="size-2 rounded-full bg-neutral-900" />
                        )}
                        {!active && isOpen && (
                          <span className="text-[10px] font-medium text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded border border-neutral-200">
                            OPEN
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="p-2 border-t border-neutral-100 bg-neutral-50">
                <button
                  onClick={() => {
                    props.setMenuOpen(false);
                    window.dispatchEvent(new CustomEvent('profileMenu:close'));
                    props.navigate('/welcome');
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 text-neutral-700 rounded-md text-sm font-medium transition-all shadow-sm">
                  <FiPlus className="size-4" />
                  <span>Create New Profile</span>
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

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
  if (route.includes('/purchase-invoice/')) return 'Purchase Entry';
  if (route.includes('/sale-invoice/')) return 'Sale Entry';
  if (route.includes('/ledger/')) return 'Ledger Entry';

  return routeMap[route] || 'Dashboard';
}
