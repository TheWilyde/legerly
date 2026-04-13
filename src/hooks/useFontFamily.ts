import { useEffect } from 'react';
import { useActiveProfile } from './useActiveProfile';

export function useFontFamily() {
  const profileId = useActiveProfile();

  useEffect(() => {
    if (!profileId) return;

    const fontMap: Record<string, string> = {
      Figtree: "'Figtree', ui-sans-serif, system-ui",
      Calibri: "'Calibri', 'Segoe UI', sans-serif",
      'Segoe UI': "'Segoe UI', Cambria, sans-serif",
      Cambria: "'Cambria', 'Georgia', serif",
    };

    try {
      const settingsKey = `settings:${profileId}`;
      const stored = localStorage.getItem(settingsKey);
      
      if (stored) {
        const settings = JSON.parse(stored);
        const fontFamily = settings.fontFamily || 'Cambria';
        document.documentElement.style.fontFamily = fontMap[fontFamily] || fontMap['Cambria'];
      } else {
        // Apply default font
        document.documentElement.style.fontFamily = fontMap['Cambria'];
      }
    } catch (err) {
      console.error('Failed to apply font preference:', err);
      // Fallback to default
      document.documentElement.style.fontFamily = fontMap['Cambria'];
    }

    // Listen for settings changes
    const handleSettingsChange = (e: CustomEvent) => {
      const settings = e.detail;
      const fontFamily = settings.fontFamily || 'Cambria';
      document.documentElement.style.fontFamily = fontMap[fontFamily] || fontMap['Cambria'];
    };

    window.addEventListener('settings:changed', handleSettingsChange as EventListener);

    return () => {
      window.removeEventListener('settings:changed', handleSettingsChange as EventListener);
    };
  }, [profileId]);
}
