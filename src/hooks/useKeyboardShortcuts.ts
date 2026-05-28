import {useEffect, useEffectEvent} from 'react';

type KeyboardShortcut = {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  enabled?: boolean;
  preventDefault?: boolean;
  stopPropagation?: boolean;
  allowInInput?: boolean;
  handler: (event: KeyboardEvent) => void;
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  if (target.isContentEditable) return true;
  if (target.closest('[contenteditable="true"]')) return true;

  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

function matchesKey(eventKey: string, shortcutKey: string): boolean {
  const normalizedEventKey = eventKey.toLowerCase();
  const normalizedShortcutKey = shortcutKey.toLowerCase();

  if (normalizedShortcutKey === 'esc') {
    return normalizedEventKey === 'escape';
  }

  if (normalizedShortcutKey === 'return') {
    return normalizedEventKey === 'enter';
  }

  return normalizedEventKey === normalizedShortcutKey;
}

function matchesShortcut(
  event: KeyboardEvent,
  shortcut: KeyboardShortcut,
): boolean {
  if (event.ctrlKey !== Boolean(shortcut.ctrl)) return false;
  if (event.shiftKey !== Boolean(shortcut.shift)) return false;
  if (event.altKey !== Boolean(shortcut.alt)) return false;
  if (event.metaKey !== Boolean(shortcut.meta)) return false;

  return matchesKey(event.key, shortcut.key);
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    for (const shortcut of shortcuts) {
      if (shortcut.enabled === false) continue;
      if (!matchesShortcut(event, shortcut)) continue;
      if (!shortcut.allowInInput && isEditableTarget(event.target)) continue;

      if (shortcut.preventDefault !== false) {
        event.preventDefault();
      }

      if (shortcut.stopPropagation) {
        event.stopPropagation();
      }

      shortcut.handler(event);
      break;
    }
  });

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
