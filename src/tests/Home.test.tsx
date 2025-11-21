import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, screen, waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import Home from '../pages/Home';
import * as ActiveProfileHook from '../hooks/useActiveProfile';
import * as AnalyticsContext from '../contexts/AnalyticsContext';

// Mock Hook
vi.mock('../hooks/useActiveProfile', () => ({
  useActiveProfile: vi.fn(),
}));

// Mock Analytics Context
vi.mock('../contexts/AnalyticsContext', () => ({
  useAnalytics: vi.fn(),
}));

describe('Home Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (ActiveProfileHook.useActiveProfile as any).mockReturnValue('profile-1');

    // Mock window.api as a fallback
    vi.stubGlobal('api', {
      analytics: {
        get: vi.fn().mockResolvedValue({}),
      },
    });

    // Default mock implementation with data
    (AnalyticsContext.useAnalytics as any).mockReturnValue({
      stats: {
        totalSales: 15000,
        totalPurchases: 5000,
        netProfit: 10000,
        lowStockItems: [],
        topSellingItems: [],
      },
      loading: false,
      error: null,
      loadAllData: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders dashboard summary cards with formatted currency', async () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      // Check for the values which confirms data is loaded
      expect(screen.getByText(/15,000/)).toBeInTheDocument();
      expect(screen.getByText(/5,000/)).toBeInTheDocument();
    });
  });

  it('renders all quick action buttons with correct links', async () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    );

    await waitFor(() => {
      const newPurchaseLink = screen.getByText('New Purchase').closest('a');
      expect(newPurchaseLink).toHaveAttribute('href', '/purchase-invoice');

      const newSaleLink = screen.getByText('New Sale').closest('a');
      expect(newSaleLink).toHaveAttribute('href', '/sale-invoice');

      const addStockLink = screen.getByText('Add Stock').closest('a');
      expect(addStockLink).toHaveAttribute('href', '/stock');
    });
  });

  it('displays low stock items with correct status labels', async () => {
    (AnalyticsContext.useAnalytics as any).mockReturnValue({
      stats: {
        totalSales: 0,
        totalPurchases: 0,
        netProfit: 0,
        lowStockItems: [
          {code: 'P01', name: 'Pot', inStock: 2},
          {code: 'P02', name: 'Pan', inStock: 0},
        ],
        topSellingItems: [],
      },
      loading: false,
      error: null,
      loadAllData: vi.fn(),
    });

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Low Stock Alert')).toBeInTheDocument();
      expect(screen.getByText(/P01 - Pot/)).toBeInTheDocument();
      expect(screen.getByText('Only 2 left')).toBeInTheDocument();
      expect(screen.getByText(/P02 - Pan/)).toBeInTheDocument();
      expect(screen.getByText('Out of stock')).toBeInTheDocument();
    });
  });

  it('handles empty low stock state gracefully', async () => {
    (AnalyticsContext.useAnalytics as any).mockReturnValue({
      stats: {
        totalSales: 0,
        totalPurchases: 0,
        netProfit: 0,
        lowStockItems: [],
        topSellingItems: [],
      },
      loading: false,
      error: null,
      loadAllData: vi.fn(),
    });

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByText('All items are well stocked')
      ).toBeInTheDocument();
    });
  });
});
