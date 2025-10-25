import {useProfiles} from '../contexts/ProfileContext';
import {useNavigate} from 'react-router-dom';
import {useEffect} from 'react';

/**
 * Hook to get the active profile ID
 * Redirects to profile selector if no profile is active
 */
export function useActiveProfile(): string | null {
  const {activeProfileId, openProfiles} = useProfiles();
  const navigate = useNavigate();

  useEffect(() => {
    // If no profiles are open, redirect to profile selector
    if (openProfiles.length === 0) {
      navigate('/profile-selector');
    }
  }, [openProfiles.length, navigate]);

  return activeProfileId;
}