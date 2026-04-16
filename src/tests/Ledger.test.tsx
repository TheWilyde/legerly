import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, screen, fireEvent, waitFor, act} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import Ledger from '../pages/Ledger';
import * as ActiveProfileHook from '../hooks/useActiveProfile';

// Mock Hook
vi.mock('../hooks/useActiveProfile', () => ({
  useActiveProfile: vi.fn(),
}));

describe('Ledger Page', () => {
  const mockLedgerList = vi.fn();
  const mockLedgerDelete = vi.fn();

  async function waitForInitialLedgerLoad() {
    await waitFor(() => {
      expect(mockLedgerList).toHaveBeenCalled();
    });

    const pending = mockLedgerList.mock.results
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

  beforeEach(() => {
    vi.clearAllMocks();
    (ActiveProfileHook.useActiveProfile as any).mockReturnValue('profile-1');

    // Setup window.api mock for each test
    const apiMock = {
      ledger: {
        list: mockLedgerList,
        delete: mockLedgerDelete,
      },
    };

    vi.stubGlobal('api', apiMock);
    (window as any).api = apiMock;

    mockLedgerList.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders header and summary cards', async () => {
    render(
      <MemoryRouter>
        <Ledger />
      </MemoryRouter>,
    );

    await waitForInitialLedgerLoad();

    expect(screen.getByRole('heading', {name: /Ledgers/i})).toBeInTheDocument();
    // Check for summary cards
    expect(screen.getAllByText(/Total Debit/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Total Credit/i).length).toBeGreaterThan(0);
  });

  it('loads and displays ledger items correctly', async () => {
    // Providing multiple name properties to ensure one matches the component's expectation
    const dummyItems = [
      {
        id: 1,
        customerName: 'Customer One',
        totals: {
          debit: 0,
          credit: 500,
          net: 500,
        },
      },
    ];
    mockLedgerList.mockResolvedValue(dummyItems);

    render(
      <MemoryRouter>
        <Ledger />
      </MemoryRouter>,
    );

    await waitForInitialLedgerLoad();

    await waitFor(() => {
      expect(screen.getByText('Customer One')).toBeInTheDocument();
      expect(screen.getAllByText('500.00').length).toBeGreaterThan(0);
    });
  });

  it('enables delete button only when items are selected', async () => {
    const dummyItems = [
      {
        id: 10,
        customerName: 'Entry A',
        totals: {
          debit: 100,
          credit: 0,
          net: -100,
        },
      },
      {
        id: 11,
        customerName: 'Entry B',
        totals: {
          debit: 200,
          credit: 0,
          net: -200,
        },
      },
    ];
    mockLedgerList.mockResolvedValue(dummyItems);

    render(
      <MemoryRouter>
        <Ledger />
      </MemoryRouter>,
    );

    await waitForInitialLedgerLoad();

    await waitFor(() => {
      expect(screen.getByText('Entry A')).toBeInTheDocument();
    });

    expect(screen.queryByText(/Delete/i)).not.toBeInTheDocument();

    // Select first item (Index 0 is "Select All", Index 1 is first row)
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);

    expect(screen.getByText(/Delete/i)).toBeInTheDocument();
  });

  it('calls delete API with correct ID when confirmed', async () => {
    const dummyItems = [
      {
        id: 55,
        customerName: 'Mistake Entry',
        totals: {
          debit: 100,
          credit: 0,
          net: -100,
        },
      },
    ];
    mockLedgerList.mockResolvedValue(dummyItems);
    mockLedgerDelete.mockResolvedValue({success: true});

    render(
      <MemoryRouter>
        <Ledger />
      </MemoryRouter>,
    );

    await waitForInitialLedgerLoad();

    await waitFor(() => {
      expect(screen.getByText('Mistake Entry')).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);

    const deleteBtn = screen.getByText(/Delete/i);
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(mockLedgerDelete).toHaveBeenCalledWith('profile-1', 55);
    });
  });

  it('handles "Select All" functionality', async () => {
    const dummyItems = [
      {
        id: 1,
        customerName: 'A',
        totals: {
          debit: 0,
          credit: 0,
          net: 0,
        },
      },
      {
        id: 2,
        customerName: 'B',
        totals: {
          debit: 0,
          credit: 0,
          net: 0,
        },
      },
    ];
    mockLedgerList.mockResolvedValue(dummyItems);

    render(
      <MemoryRouter>
        <Ledger />
      </MemoryRouter>,
    );

    await waitForInitialLedgerLoad();

    await waitFor(() => {
      expect(screen.getByText('A')).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByRole('checkbox');
    const selectAllCheckbox = checkboxes[0];

    fireEvent.click(selectAllCheckbox);

    expect(screen.getByText(/Delete/i)).toBeInTheDocument();
    expect(checkboxes[1]).toBeChecked();
    expect(checkboxes[2]).toBeChecked();
  });
});
