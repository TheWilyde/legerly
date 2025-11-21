import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Ledger from '../pages/Ledger';
import * as ActiveProfileHook from '../hooks/useActiveProfile';

// Mock Hook
vi.mock('../hooks/useActiveProfile', () => ({
  useActiveProfile: vi.fn(),
}));

describe('Ledger Page', () => {
  const mockLedgerList = vi.fn();
  const mockLedgerDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (ActiveProfileHook.useActiveProfile as any).mockReturnValue('profile-1');
    
    // Setup window.api mock for each test
    vi.stubGlobal('api', {
      ledger: {
        list: mockLedgerList,
        delete: mockLedgerDelete,
      },
    });

    mockLedgerList.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders header and summary cards', async () => {
    render(
      <MemoryRouter>
        <Ledger />
      </MemoryRouter>
    );
    
    expect(screen.getByRole('heading', { name: /^Ledger$/i })).toBeInTheDocument();
    // Check for summary cards
    expect(screen.getAllByText(/Total Debit/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Total Credit/i).length).toBeGreaterThan(0);
  });

  it('loads and displays ledger items correctly', async () => {
    // Providing multiple name properties to ensure one matches the component's expectation
    const dummyItems = [
      { 
        id: 1, 
        name: 'Customer One', 
        description: 'Customer One', 
        customerName: 'Customer One',
        title: 'Customer One',
        totalDebit: 0, 
        totalCredit: 500, 
        balance: 500, 
        balanceType: 'CR' 
      }
    ];
    mockLedgerList.mockResolvedValue(dummyItems);

    render(
      <MemoryRouter>
        <Ledger />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Customer One')).toBeInTheDocument();
      
      const row = screen.getByText('Customer One').closest('button');
      expect(row).toBeInTheDocument();
      if (row) {
        expect(within(row).getByText('500')).toBeInTheDocument();
      }
    });
  });

  it('enables delete button only when items are selected', async () => {
    const dummyItems = [
      { id: 10, name: 'Entry A', description: 'Entry A', totalDebit: 100, totalCredit: 0, balance: 100, balanceType: 'DR' },
      { id: 11, name: 'Entry B', description: 'Entry B', totalDebit: 200, totalCredit: 0, balance: 200, balanceType: 'DR' }
    ];
    mockLedgerList.mockResolvedValue(dummyItems);

    render(
      <MemoryRouter>
        <Ledger />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Entry A')).toBeInTheDocument();
    });

    expect(screen.queryByText('Delete')).not.toBeInTheDocument();

    // Select first item (Index 0 is "Select All", Index 1 is first row)
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);

    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('calls delete API with correct ID when confirmed', async () => {
    const dummyItems = [
      { id: 55, name: 'Mistake Entry', description: 'Mistake Entry', totalDebit: 100, totalCredit: 0, balance: 100, balanceType: 'DR' }
    ];
    mockLedgerList.mockResolvedValue(dummyItems);
    mockLedgerDelete.mockResolvedValue({ success: true });

    render(
      <MemoryRouter>
        <Ledger />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Mistake Entry')).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);

    const deleteBtn = screen.getByText('Delete');
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(mockLedgerDelete).toHaveBeenCalledWith('profile-1', 55);
    });
  });

  it('handles "Select All" functionality', async () => {
    const dummyItems = [
      { id: 1, name: 'A', description: 'A', totalDebit: 0, totalCredit: 0, balance: 0 },
      { id: 2, name: 'B', description: 'B', totalDebit: 0, totalCredit: 0, balance: 0 }
    ];
    mockLedgerList.mockResolvedValue(dummyItems);

    render(
      <MemoryRouter>
        <Ledger />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('A')).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByRole('checkbox');
    const selectAllCheckbox = checkboxes[0];

    fireEvent.click(selectAllCheckbox);

    expect(screen.getByText('Delete')).toBeInTheDocument();
    expect(checkboxes[1]).toBeChecked();
    expect(checkboxes[2]).toBeChecked();
  });
});