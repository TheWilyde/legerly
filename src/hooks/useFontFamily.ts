import {useEffect, useEffectEvent} from 'react';
import {useActiveProfile} from './useActiveProfile';

type SettingsChangedEvent = CustomEvent<{fontFamily?: string}>;
const FONT_MAP: Record<string, string> = {
  Figtree: "'Figtree', ui-sans-serif, system-ui",
  Calibri: "'Calibri', 'Segoe UI', sans-serif",
  'Segoe UI': "'Segoe UI', Cambria, sans-serif",
  Cambria: "'Cambria', 'Georgia', serif",
};

export function useFontFamily() {
  const profileId = useActiveProfile();

  const onSettingsChanged = useEffectEvent((event: Event) => {
    const settings = (event as SettingsChangedEvent).detail;
    const fontFamily = settings?.fontFamily || 'Cambria';
    document.documentElement.style.fontFamily =
      FONT_MAP[fontFamily] || FONT_MAP['Cambria'];
  });

  useEffect(() => {
    if (!profileId) return;

    try {
      const settingsKey = `settings:${profileId}`;
      const stored = localStorage.getItem(settingsKey);

      if (stored) {
        const settings = JSON.parse(stored);
        const fontFamily = settings.fontFamily || 'Cambria';
        document.documentElement.style.fontFamily =
          FONT_MAP[fontFamily] || FONT_MAP['Cambria'];
      } else {
        // Apply default font
        document.documentElement.style.fontFamily = FONT_MAP['Cambria'];
      }
    } catch (err) {
      console.error('Failed to apply font preference:', err);
      // Fallback to default
      document.documentElement.style.fontFamily = FONT_MAP['Cambria'];
    }

    window.addEventListener('settings:changed', onSettingsChanged);

    return () => {
      window.removeEventListener('settings:changed', onSettingsChanged);
    };
  }, [profileId]);
}
