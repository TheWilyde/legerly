import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, fireEvent, waitFor, act} from '@testing-library/react';
import Stock from '../pages/Stock';
import * as ActiveProfileHook from '../hooks/useActiveProfile';
import * as PeriodContext from '../contexts/PeriodContext';

// 1. Mock the window.api object
const mockStockList = vi.fn();
const mockStockCreate = vi.fn();
const mockStockUpdate = vi.fn();
const mockStockDelete = vi.fn();

Object.defineProperty(window, 'api', {
  value: {
    stock: {
      list: mockStockList,
      create: mockStockCreate,
      update: mockStockUpdate,
      delete: mockStockDelete,
    },
  },
  writable: true,
});

// 2. Mock the custom hook
vi.mock('../hooks/useActiveProfile', () => ({
  useActiveProfile: vi.fn(),
}));

vi.mock('../contexts/PeriodContext', () => ({
  usePeriod: vi.fn(),
}));

async function waitForInitialStockLoad() {
  await waitFor(() => {
    expect(mockStockList).toHaveBeenCalled();
  });

  const pending = mockStockList.mock.results
    .map((result) => result.value)
    .filter(
      (value): value is Promise<unknown> =>
        !!value && typeof (value as {then?: unknown}).then === 'function',
    );

  if (pending.length > 0) {
    await act(async () => {
      await Promise.allSettled(pending);
      await Promise.resolve();
    });
  }
}

describe('Stock Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (ActiveProfileHook.useActiveProfile as any).mockReturnValue(1);
    (PeriodContext.usePeriod as any).mockReturnValue({
      periods: [
        {
          id: 1,
          label: '2026-01',
          startDate: '2026-01-01',
          endDate: '2026-01-31',
          status: 'active',
          closedAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      activePeriod: {
        id: 1,
        label: '2026-01',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        status: 'active',
        closedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      selectedPeriod: {
        id: 1,
        label: '2026-01',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        status: 'active',
        closedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      isViewingHistorical: false,
      selectPeriod: vi.fn(),
      resetToActive: vi.fn(),
      refresh: vi.fn(),
      closeActivePeriod: vi.fn(),
      reopenPeriod: vi.fn(),
    });
    mockStockList.mockResolvedValue([]);
  });

  it('renders the page header and summary cards', async () => {
    render(<Stock />);
    await waitForInitialStockLoad();

    expect(screen.getByText('Stock')).toBeInTheDocument();
    expect(screen.getByText('Purchase Value')).toBeInTheDocument();
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  it('loads and displays stock items from the API', async () => {
    const dummyItems = [
      {
        id: 1,
        code: 'P001',
        name: 'Test Pot',
        purchaseRate: 500,
        purchaseQty: 10,
        saleRate: 700,
        saleQty: 2,
      },
    ];
    mockStockList.mockResolvedValue(dummyItems);

    render(<Stock />);
    await waitForInitialStockLoad();

    await waitFor(() => {
      expect(screen.getByText('P001')).toBeInTheDocument();
      expect(screen.getByText('Test Pot')).toBeInTheDocument();
    });
  });

  it('toggles edit mode correctly', async () => {
    render(<Stock />);
    await waitForInitialStockLoad();

    const editBtn = screen.getByText('Edit');
    fireEvent.click(editBtn);

    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Add')).toBeInTheDocument();
  });

  it('shows delete button only when an item is selected', async () => {
    const dummyItems = [
      {
        id: 1,
        code: 'A1',
        name: 'Item A',
        purchaseRate: 10,
        purchaseQty: 10,
        saleRate: 20,
        saleQty: 0,
      },
    ];
    mockStockList.mockResolvedValue(dummyItems);

    render(<Stock />);
    await waitForInitialStockLoad();

    await waitFor(() => {
      expect(screen.getByText('Item A')).toBeInTheDocument();
    });

    expect(screen.queryByText('Delete')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Edit'));

    const checkboxes = screen.getAllByRole('checkbox');
    if (checkboxes.length > 1) {
      fireEvent.click(checkboxes[1]);
      expect(screen.getByText('Delete')).toBeInTheDocument();
    }
  });
});
