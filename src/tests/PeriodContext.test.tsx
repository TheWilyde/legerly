import {act, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {PeriodProvider, usePeriod} from '../contexts/PeriodContext';
import type {RendererPeriod} from '../types/electron-api';

const activeProfile = vi.hoisted(() => ({id: 'profile-a'}));

vi.mock('../hooks/useActiveProfile', () => ({
  useActiveProfile: () => activeProfile.id,
}));

function period(
  id: number,
  label: string,
  status: 'active' | 'closed',
): RendererPeriod {
  return {
    id,
    label,
    startDate: id === 1 ? '2026-09-01' : '2026-10-01',
    endDate: id === 1 ? '2026-09-30' : '2026-10-31',
    status,
    closedAt: status === 'closed' ? '2026-10-01T00:00:00.000Z' : null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

function Consumer() {
  const {activePeriod, selectedPeriod, selectPeriod, deletePeriod} = usePeriod();
  return (
    <>
      <div data-testid="active-period">{activePeriod?.label ?? 'none'}</div>
      <div data-testid="selected-period">{selectedPeriod?.label ?? 'none'}</div>
      <button type="button" onClick={() => selectPeriod(1)}>
        Select period 1
      </button>
      <button type="button" onClick={() => void deletePeriod(1)}>
        Delete period 1
      </button>
    </>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return {promise, resolve};
}

describe('PeriodProvider', () => {
  beforeEach(() => {
    activeProfile.id = 'profile-a';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('selects the active period on startup even when a closed period is listed first', async () => {
    const closed = period(1, 'September 2026', 'closed');
    const active = period(2, 'October 2026', 'active');
    window.api = {
      periods: {
        list: vi.fn().mockResolvedValue([closed, active]),
        getActive: vi.fn().mockResolvedValue(active),
        getReopenContext: vi.fn().mockResolvedValue(null),
      },
    } as unknown as typeof window.api;

    render(
      <PeriodProvider>
        <Consumer />
      </PeriodProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('selected-period')).toHaveTextContent(
        'October 2026',
      );
    });
  });

  it('resets to the new profile active period when period IDs overlap', async () => {
    const profileAClosed = period(1, 'A September', 'closed');
    const profileAActive = period(2, 'A October', 'active');
    const profileBClosed = period(1, 'B September', 'closed');
    const profileBActive = period(2, 'B October', 'active');

    window.api = {
      periods: {
        list: vi.fn((profileId: string) =>
          Promise.resolve(
            profileId === 'profile-a'
              ? [profileAClosed, profileAActive]
              : [profileBClosed, profileBActive],
          ),
        ),
        getActive: vi.fn((profileId: string) =>
          Promise.resolve(
            profileId === 'profile-a' ? profileAActive : profileBActive,
          ),
        ),
        getReopenContext: vi.fn().mockResolvedValue(null),
      },
    } as unknown as typeof window.api;

    const view = render(
      <PeriodProvider>
        <Consumer />
      </PeriodProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('selected-period')).toHaveTextContent(
        'A October',
      );
    });

    act(() => screen.getByRole('button', {name: 'Select period 1'}).click());
    expect(screen.getByTestId('selected-period')).toHaveTextContent(
      'A September',
    );

    activeProfile.id = 'profile-b';
    view.rerender(
      <PeriodProvider>
        <Consumer />
      </PeriodProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('selected-period')).toHaveTextContent(
        'B October',
      );
    });
  });

  it('ignores a stale startup response after the active profile changes', async () => {
    const listA = deferred<RendererPeriod[]>();
    const activeA = deferred<RendererPeriod>();
    const contextA = deferred<null>();
    const profileBActive = period(2, 'B October', 'active');

    window.api = {
      periods: {
        list: vi.fn((profileId: string) =>
          profileId === 'profile-a'
            ? listA.promise
            : Promise.resolve([profileBActive]),
        ),
        getActive: vi.fn((profileId: string) =>
          profileId === 'profile-a'
            ? activeA.promise
            : Promise.resolve(profileBActive),
        ),
        getReopenContext: vi.fn((profileId: string) =>
          profileId === 'profile-a' ? contextA.promise : Promise.resolve(null),
        ),
      },
    } as unknown as typeof window.api;

    const view = render(
      <PeriodProvider>
        <Consumer />
      </PeriodProvider>,
    );

    activeProfile.id = 'profile-b';
    view.rerender(
      <PeriodProvider>
        <Consumer />
      </PeriodProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('selected-period')).toHaveTextContent(
        'B October',
      );
    });

    const staleActive = period(1, 'A September', 'active');
    await act(async () => {
      listA.resolve([staleActive]);
      activeA.resolve(staleActive);
      contextA.resolve(null);
      await listA.promise;
    });

    expect(screen.getByTestId('selected-period')).toHaveTextContent(
      'B October',
    );
    expect(screen.getByTestId('active-period')).toHaveTextContent('B October');
  });

  it('deletes a closed period, returns selection to active, and invalidates consumers', async () => {
    const closed = period(1, 'September 2026', 'closed');
    const active = period(2, 'October 2026', 'active');
    let availablePeriods = [closed, active];
    const deletePeriod = vi.fn().mockImplementation(async () => {
      availablePeriods = [active];
      return {deletedPeriodId: closed.id};
    });
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    window.api = {
      periods: {
        list: vi.fn().mockImplementation(() => Promise.resolve(availablePeriods)),
        getActive: vi.fn().mockResolvedValue(active),
        getReopenContext: vi.fn().mockResolvedValue(null),
        delete: deletePeriod,
      },
    } as unknown as typeof window.api;

    render(
      <PeriodProvider>
        <Consumer />
      </PeriodProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('selected-period')).toHaveTextContent(
        'October 2026',
      );
    });

    act(() => screen.getByRole('button', {name: 'Select period 1'}).click());
    expect(screen.getByTestId('selected-period')).toHaveTextContent(
      'September 2026',
    );
    act(() => screen.getByRole('button', {name: 'Delete period 1'}).click());

    await waitFor(() => {
      expect(deletePeriod).toHaveBeenCalledWith('profile-a', closed.id);
      expect(screen.getByTestId('selected-period')).toHaveTextContent(
        'October 2026',
      );
    });
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({type: 'period:changed'}),
    );
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({type: 'stock:changed'}),
    );
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({type: 'analytics:invalidate'}),
    );
  });
});
