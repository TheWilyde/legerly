import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import Home from '../pages/Home';
import * as AnalyticsContext from '../contexts/AnalyticsContext';

// Mock Analytics Context
vi.mock('../contexts/AnalyticsContext', () => ({
  useAnalytics: vi.fn(),
}));

const makeAnalytics = (overrides: Record<string, unknown> = {}) => ({
  totalPurchases: 5000,
  totalSales: 15000,
  grossProfit: 10000,
  grossMargin: 66.67,
  totalStockValue: 4200,
  stockItemCount: 3,
  purchaseInvoiceCount: 2,
  saleInvoiceCount: 3,
  monthlyTrend: [],
  topSellingItems: [],
  lowStockAlerts: [],
  ...overrides,
});

describe('Home Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementation with data
    (AnalyticsContext.useAnalytics as any).mockReturnValue({
      analytics: makeAnalytics(),
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
  });

  it('renders dashboard summary cards with formatted currency', async () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getAllByText(/15,000/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/5,000/).length).toBeGreaterThan(0);
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
      expect(newPurchaseLink).toHaveAttribute('href', '/purchase-invoice/new');

      const newSaleLink = screen.getByText('New Sale').closest('a');
      expect(newSaleLink).toHaveAttribute('href', '/sale-invoice/new');

      const addStockLink = screen.getByText('Add Stock').closest('a');
      expect(addStockLink).toHaveAttribute('href', '/stock');
    });
  });

  it('displays low stock items with correct status labels', async () => {
    (AnalyticsContext.useAnalytics as any).mockReturnValue({
      analytics: makeAnalytics({
        totalSales: 0,
        totalPurchases: 0,
        grossProfit: 0,
        grossMargin: 0,
        lowStockAlerts: [
          {code: 'P01', name: 'Pot', inStock: 2},
          {code: 'P02', name: 'Pan', inStock: 0},
        ],
      }),
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Stock Alerts')).toBeInTheDocument();
      expect(screen.getByText(/P01 - Pot/)).toBeInTheDocument();
      expect(screen.getByText('Only 2 left')).toBeInTheDocument();
      expect(screen.getByText(/P02 - Pan/)).toBeInTheDocument();
      expect(screen.getByText('Out of stock')).toBeInTheDocument();
    });
  });

  it('handles empty low stock state gracefully', async () => {
    (AnalyticsContext.useAnalytics as any).mockReturnValue({
      analytics: makeAnalytics({
        totalSales: 0,
        totalPurchases: 0,
        grossProfit: 0,
        grossMargin: 0,
        lowStockAlerts: [],
      }),
      loading: false,
      error: null,
      refresh: vi.fn(),
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
