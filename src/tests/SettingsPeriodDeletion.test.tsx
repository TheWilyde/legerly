import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Settings from '../pages/Settings';
import type {
  RendererPeriod,
  RendererPeriodDeleteImpact,
} from '../types/electron-api';

const periodContext = vi.hoisted(() => ({value: {} as Record<string, unknown>}));

vi.mock('../hooks/useActiveProfile', () => ({
  useActiveProfile: () => 'profile-a',
}));

vi.mock('../contexts/ProfileContext', () => ({
  useProfiles: () => ({
    profiles: [{id: 'profile-a', name: 'Profile A', color: '#2563eb'}],
    refresh: vi.fn(),
  }),
}));

vi.mock('../contexts/PeriodContext', () => ({
  usePeriod: () => periodContext.value,
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

describe('Settings period deletion', () => {
  const closed = period(1, 'September 2026', 'closed');
  const active = period(2, 'October 2026', 'active');
  let getDeleteImpact: ReturnType<typeof vi.fn>;
  let deletePeriod: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    getDeleteImpact = vi.fn();
    deletePeriod = vi.fn().mockResolvedValue(undefined);
    periodContext.value = {
      periods: [closed, active],
      activePeriod: active,
      selectedPeriod: closed,
      closeActivePeriod: vi.fn(),
      closeReopenedPeriod: vi.fn(),
      reopenReturnPeriod: null,
      reopenPeriod: vi.fn(),
      deletePeriod,
    };
    window.api = {
      periods: {getDeleteImpact},
      invoices: {list: vi.fn().mockResolvedValue([])},
      saleInvoices: {list: vi.fn().mockResolvedValue([])},
      profiles: {
        createBackup: vi.fn(),
        updateColor: vi.fn(),
      },
    } as unknown as typeof window.api;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows counts and does not delete when confirmation is cancelled', async () => {
    const impact: RendererPeriodDeleteImpact = {
      periodId: closed.id,
      purchaseInvoiceCount: 0,
      saleInvoiceCount: 0,
      canDelete: true,
      blockedReason: null,
    };
    getDeleteImpact.mockResolvedValue(impact);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<Settings />);

    const deleteButton = await screen.findByRole('button', {
      name: 'Delete Period',
    });
    await waitFor(() => expect(deleteButton).toBeEnabled());
    expect(screen.getByText('Purchase invoices: 0')).toBeInTheDocument();
    expect(screen.getByText('Sale invoices: 0')).toBeInTheDocument();

    fireEvent.click(deleteButton);

    await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    expect(confirm.mock.calls[0]?.[0]).toContain('September 2026');
    expect(deletePeriod).not.toHaveBeenCalled();
  });

  it('disables deletion and explains when the period contains invoices', async () => {
    const impact: RendererPeriodDeleteImpact = {
      periodId: closed.id,
      purchaseInvoiceCount: 2,
      saleInvoiceCount: 1,
      canDelete: false,
      blockedReason: 'not_empty',
    };
    getDeleteImpact.mockResolvedValue(impact);

    render(<Settings />);

    const deleteButton = await screen.findByRole('button', {
      name: 'Delete Period',
    });
    await waitFor(() => expect(deleteButton).toBeDisabled());
    expect(screen.getByText('Purchase invoices: 2')).toBeInTheDocument();
    expect(screen.getByText('Sale invoices: 1')).toBeInTheDocument();
    expect(
      screen.getByText(
        'This period contains invoices and cannot be deleted.',
      ),
    ).toBeInTheDocument();
  });
});
