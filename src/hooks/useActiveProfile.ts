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
    // FIX: Do not redirect if we are in the print window
    // We check window.location.href/hash directly to avoid Router timing issues
    if (window.location.href.includes('/print/') || window.location.hash.includes('/print/')) {
      return;
    }

    // If no profiles are open, redirect to profile selector
    if (openProfiles.length === 0) {
      navigate('/welcome');
    }
  }, [openProfiles.length, navigate]);

  return activeProfileId;
}
