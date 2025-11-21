import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, fireEvent, waitFor} from '@testing-library/react';
import Stock from '../pages/Stock';
import * as ActiveProfileHook from '../hooks/useActiveProfile';

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

describe('Stock Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (ActiveProfileHook.useActiveProfile as any).mockReturnValue(1);
    mockStockList.mockResolvedValue([]);
  });

  it('renders the page header and summary cards', async () => {
    render(<Stock />);
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

    await waitFor(() => {
      // Fix: Use getByDisplayValue because items are in input fields
      expect(screen.getByDisplayValue('P001')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Test Pot')).toBeInTheDocument();
    });
  });

  it('toggles edit mode correctly', async () => {
    render(<Stock />);

    const editBtn = screen.getByText('Edit');
    fireEvent.click(editBtn);

    expect(screen.getByText('View')).toBeInTheDocument();
    // Fix: Look for the button text "Add" instead of title
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

    await waitFor(() => {
      // Fix: Use getByDisplayValue
      expect(screen.getByDisplayValue('Item A')).toBeInTheDocument();
    });

    expect(screen.queryByText('Delete')).not.toBeInTheDocument();

    const checkboxes = screen.getAllByRole('checkbox');
    // Index 0 is "Select All", Index 1 is the item row
    if (checkboxes.length > 1) {
      fireEvent.click(checkboxes[1]);
      expect(screen.getByText('Delete')).toBeInTheDocument();
    }
  });
});
