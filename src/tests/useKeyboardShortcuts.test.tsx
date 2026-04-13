import {afterEach, describe, expect, it, vi} from 'vitest';
import {render, screen, cleanup} from '@testing-library/react';
import {useKeyboardShortcuts} from '../hooks/useKeyboardShortcuts';

type HarnessProps = {
  onTrigger: () => void;
  allowInInput?: boolean;
};

function Harness({onTrigger, allowInInput = false}: HarnessProps) {
  useKeyboardShortcuts([
    {
      key: 's',
      ctrl: true,
      allowInInput,
      handler: onTrigger,
    },
  ]);

  return <input data-testid="field" />;
}

function dispatchKey(target: Window | HTMLElement, init: KeyboardEventInit) {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init,
  });

  target.dispatchEvent(event);
  return event;
}

afterEach(() => {
  cleanup();
});

describe('useKeyboardShortcuts', () => {
  it('triggers callback and prevents default for matching combo', () => {
    const onTrigger = vi.fn();
    render(<Harness onTrigger={onTrigger} />);

    const event = dispatchKey(window, {key: 's', ctrlKey: true});

    expect(onTrigger).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('requires exact modifier combo', () => {
    const onTrigger = vi.fn();
    render(<Harness onTrigger={onTrigger} />);

    dispatchKey(window, {key: 's', ctrlKey: true, shiftKey: true});

    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('does not fire while typing in input by default', () => {
    const onTrigger = vi.fn();
    render(<Harness onTrigger={onTrigger} />);

    const input = screen.getByTestId('field');
    input.focus();

    dispatchKey(input, {key: 's', ctrlKey: true});

    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('can be enabled while typing in input', () => {
    const onTrigger = vi.fn();
    render(<Harness onTrigger={onTrigger} allowInInput />);

    const input = screen.getByTestId('field');
    input.focus();

    dispatchKey(input, {key: 's', ctrlKey: true});

    expect(onTrigger).toHaveBeenCalledTimes(1);
  });
});
