import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';

type Profile = {
  id: string;
  name: string;
  createdAt: string;
  lastOpened: string;
};

type ProfileContextType = {
  activeProfile: string | null;
  activeProfileId: string | null;
  openProfiles: string[];
  profiles: Profile[];
  setActiveProfile: (profileId: string) => void;
  closeProfile: (profileId: string) => Promise<void>;
  createProfile: (name: string) => Promise<Profile>;
  refresh: () => Promise<void>;
};

export const ProfileContext = createContext<ProfileContextType>({
  activeProfile: null,
  activeProfileId: null,
  openProfiles: [],
  profiles: [],
  setActiveProfile: () => {},
  closeProfile: async () => {},
  createProfile: async () => ({} as Profile),
  refresh: async () => {},
});

export function ProfileProvider({children}: {children: React.ReactNode}) {
  const [activeProfile, setActiveProfileState] = useState<string | null>(null);
  const [openProfiles, setOpenProfiles] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const loadingRef = useRef(false);

  async function loadProfileState() {
    if (loadingRef.current) return;
    
    loadingRef.current = true;
    try {
      const [active, open, allProfiles] = await Promise.all([
        window.electron.profiles.getActive(),
        window.electron.profiles.getOpen(),
        window.electron.profiles.list(),
      ]);
      
      // Only update if actually changed
      if (active !== activeProfile) {
        console.log('🔄 Active profile changed:', activeProfile, '→', active);
        setActiveProfileState(active);
        
        // Broadcast profile change event
        if (activeProfile && active && activeProfile !== active) {
          window.dispatchEvent(new CustomEvent('profile:switched', {
            detail: {from: activeProfile, to: active, timestamp: Date.now()}
          }));
        }
      }
      
      const openChanged = JSON.stringify(open) !== JSON.stringify(openProfiles);
      const profilesChanged = JSON.stringify(allProfiles) !== JSON.stringify(profiles);
      
      if (openChanged) {
        setOpenProfiles(open);
      }
      
      if (profilesChanged) {
        setProfiles(allProfiles);
      }
      
      if (active !== activeProfile || openChanged || profilesChanged) {
        console.log('📋 Profile state updated:', {
          total: allProfiles.length,
          open: open.length,
          active,
        });
      }
    } catch (err) {
      console.error('Failed to load profile state:', err);
    } finally {
      loadingRef.current = false;
    }
  }

  // ✅ Initial load only
  useEffect(() => {
    loadProfileState();
  }, []);

  // ✅ Listen for IPC events from backend
  useEffect(() => {
    const handleProfileSwitch = (data: {from: string; to: string}) => {
      console.log('🔔 Profile switched via IPC:', data);
      loadProfileState();
    };

    // Listen for profile switch events
    // @ts-ignore - electron.on exists from preload
    window.electron?.on?.('profile:switched', handleProfileSwitch);

    return () => {
      // @ts-ignore
      window.electron?.off?.('profile:switched', handleProfileSwitch);
    };
  }, []);

  // ❌ REMOVED: Polling interval (no longer needed!)
  // The IPC events handle all profile switches now

  const setActiveProfile = useCallback(
    async (profileId: string) => {
      try {
        // Tell backend to switch (this will trigger IPC event)
        await window.electron.profiles.switch(profileId);
        
        // Force immediate reload (don't wait for IPC event)
        await loadProfileState();
      } catch (err) {
        console.error('Failed to switch profile:', err);
        throw err;
      }
    },
    []
  );

  const closeProfile = useCallback(
    async (profileId: string) => {
      if (openProfiles.length === 1) {
        throw new Error('Cannot close the last open profile');
      }

      try {
        await window.electron.profiles.close(profileId);
        
        // Backend auto-switches to another profile
        await loadProfileState();
      } catch (err) {
        console.error('Failed to close profile:', err);
        throw err;
      }
    },
    [openProfiles]
  );

  const createProfile = useCallback(async (name: string) => {
    try {
      const newProfile = await window.electron.profiles.create(name);
      await loadProfileState();
      return newProfile;
    } catch (err) {
      console.error('Failed to create profile:', err);
      throw err;
    }
  }, []);

  return (
    <ProfileContext.Provider
      value={{
        activeProfile,
        activeProfileId: activeProfile,
        openProfiles,
        profiles,
        setActiveProfile,
        closeProfile,
        createProfile,
        refresh: loadProfileState,
      }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfiles() {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfiles must be used within ProfileProvider');
  }
  return context;
}
