// Ensure only stable named exports; no default export that changes type.
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export type Profile = {
  id: string;
  name: string;
  createdAt: string;
  lastOpened: string;
};

type Ctx = {
  profiles: Profile[];
  openProfiles: string[];
  activeProfileId: string | null;
  openProfile: (id: string) => Promise<void>;
  closeProfile: (id: string) => Promise<void>;
  setActiveProfile: (id: string) => Promise<void>;
  createProfile: (name: string) => Promise<Profile>;
  deleteProfile: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const ProfileContext = createContext<Ctx>({} as any);

export function ProfileProvider({children}: {children: React.ReactNode}) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [openProfiles, setOpenProfiles] = useState<string[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);

  const loadProfileState = useCallback(async () => {
    try {
      const [list, openIds, activeId] = await Promise.all([
        window.api.profiles.list(),
        (window.api as any).profiles.getOpen?.(),
        (window.api as any).profiles.getActive?.(),
      ]);
      setProfiles(list as Profile[]);
      setOpenProfiles(Array.isArray(openIds) ? openIds : []);
      setActiveProfileId(
        Array.isArray(openIds) && openIds.length === 0
          ? null
          : (activeId ?? null),
      );
    } catch (err) {
      console.warn('Failed to load profile state', err);
    }
  }, []);

  useEffect(() => {
    void loadProfileState();
  }, [loadProfileState]);

  const createProfile = useCallback(
    async (name: string) => {
      const newProfile = await window.api.profiles.create(name);
      await loadProfileState();
      return newProfile;
    },
    [loadProfileState],
  );

  const openProfile = useCallback(
    async (id: string) => {
      await window.api.profiles.open(id);
      await loadProfileState();
    },
    [loadProfileState],
  );

  const closeProfile = useCallback(
    async (id: string) => {
      await window.api.profiles.close(id);
      await loadProfileState();
    },
    [loadProfileState],
  );

  const setActiveProfile = useCallback(
    async (id: string) => {
      await (window.api as any).profiles.switch?.(id);
      // Dispatch event for state persistence
      window.dispatchEvent(
        new CustomEvent('profile:switched', {detail: {to: id}}),
      );
      await loadProfileState();
    },
    [loadProfileState],
  );

  const deleteProfile = useCallback(
    async (profileId: string) => {
      await (window.api as any).profiles.delete(profileId);
      await loadProfileState();
    },
    [loadProfileState],
  );

  const value = useMemo(
    () => ({
      profiles,
      openProfiles,
      activeProfileId,
      setActiveProfile,
      closeProfile,
      createProfile,
      openProfile,
      deleteProfile,
      refresh: loadProfileState,
    }),
    [
      profiles,
      openProfiles,
      activeProfileId,
      setActiveProfile,
      closeProfile,
      createProfile,
      openProfile,
      deleteProfile,
      loadProfileState,
    ],
  );

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}

export function useProfiles() {
  return useContext(ProfileContext);
}
