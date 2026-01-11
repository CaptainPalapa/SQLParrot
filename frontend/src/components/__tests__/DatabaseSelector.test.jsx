import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DatabaseSelector from '../DatabaseSelector';
import { api } from '../../api';

// Mock the API
vi.mock('../../api', () => ({
  api: {
    get: vi.fn(),
  },
}));

// Mock useNotification with stable reference to prevent useCallback recreation
const mockNotification = {
  showError: vi.fn(),
};

vi.mock('../../hooks/useNotification', () => ({
  useNotification: () => mockNotification,
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('DatabaseSelector - Pagination', () => {
  const mockDatabases = Array.from({ length: 30 }, (_, i) => ({
    name: `database_${i + 1}`,
    category: i < 10 ? 'Global' : i < 20 ? 'User' : 'Data Warehouse',
    createDate: new Date(2025, 0, i + 1).toISOString(),
  }));

  // Helper to wait for component to finish loading
  const waitForLoad = async () => {
    // Wait for API to be called
    await waitFor(() => {
      expect(api.get).toHaveBeenCalled();
    }, { timeout: 2000 });

    // Wait for loading to complete - check for actual content
    await waitFor(
      () => {
        // Look for database names (database_N or db_N) indicating loading is complete
        const hasDatabases = screen.queryAllByText(/^(database|db)_\d+$/).length > 0;
        if (!hasDatabases) {
          throw new Error('Component still loading');
        }
      },
      { timeout: 3000, interval: 100 }
    );
  };

  // Helper to check current page by aria-current attribute
  const getCurrentPage = () => {
    const currentPageButton = document.querySelector('[aria-current="page"]');
    return currentPageButton ? parseInt(currentPageButton.textContent, 10) : null;
  };

  // Helper to get total pages by counting page buttons
  const getTotalPages = () => {
    const pageButtons = document.querySelectorAll('[aria-label^="Page "]');
    let maxPage = 0;
    pageButtons.forEach(btn => {
      const pageNum = parseInt(btn.textContent, 10);
      if (!isNaN(pageNum) && pageNum > maxPage) {
        maxPage = pageNum;
      }
    });
    return maxPage;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset notification mock
    mockNotification.showError.mockClear();
    // Reset localStorage mocks
    localStorageMock.getItem.mockReturnValue(null);
    localStorageMock.setItem.mockClear();

    // Mock API to return databases immediately
    api.get.mockResolvedValue({
      data: mockDatabases,
      success: true,
    });
  });

  it('should display first 5 databases by default', async () => {
    const onSelectionChange = vi.fn();

    render(<DatabaseSelector selectedDatabases={[]} onSelectionChange={onSelectionChange} />);

    await waitForLoad();

    await waitFor(() => {
      expect(screen.getByText('database_1')).toBeInTheDocument();
      expect(screen.getByText('database_5')).toBeInTheDocument();
      expect(screen.queryByText('database_6')).not.toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it('should show correct page count', async () => {
    render(<DatabaseSelector selectedDatabases={[]} onSelectionChange={vi.fn()} />);

    await waitForLoad();

    await waitFor(() => {
      // With 30 databases and 5 per page = 6 pages
      expect(getCurrentPage()).toBe(1);
      expect(getTotalPages()).toBe(6);
    });
  });

  it('should navigate to next page', async () => {
    const user = userEvent.setup();
    render(<DatabaseSelector selectedDatabases={[]} onSelectionChange={vi.fn()} />);

    await waitForLoad();

    await waitFor(() => {
      expect(screen.getByText('database_1')).toBeInTheDocument();
    });

    const nextButton = screen.getByLabelText('Next page');
    await user.click(nextButton);

    await waitFor(() => {
      expect(screen.getByText('database_6')).toBeInTheDocument();
      expect(screen.getByText('database_10')).toBeInTheDocument();
      expect(screen.queryByText('database_1')).not.toBeInTheDocument();
      expect(getCurrentPage()).toBe(2);
    });
  });

  it('should navigate to previous page', async () => {
    const user = userEvent.setup();
    render(<DatabaseSelector selectedDatabases={[]} onSelectionChange={vi.fn()} />);

    await waitForLoad();

    await waitFor(() => {
      expect(screen.getByText('database_1')).toBeInTheDocument();
    });

    // Go to page 2 first
    const nextButton = screen.getByLabelText('Next page');
    await user.click(nextButton);

    await waitFor(() => {
      expect(getCurrentPage()).toBe(2);
    });

    // Then go back
    const prevButton = screen.getByLabelText('Previous page');
    await user.click(prevButton);

    await waitFor(() => {
      expect(screen.getByText('database_1')).toBeInTheDocument();
      expect(getCurrentPage()).toBe(1);
    });
  });

  it('should navigate to first page', async () => {
    const user = userEvent.setup();
    render(<DatabaseSelector selectedDatabases={[]} onSelectionChange={vi.fn()} />);

    await waitForLoad();

    await waitFor(() => {
      expect(screen.getByText('database_1')).toBeInTheDocument();
    });

    // Go to page 3
    const nextButton = screen.getByLabelText('Next page');
    await user.click(nextButton);
    await user.click(nextButton);

    await waitFor(() => {
      expect(getCurrentPage()).toBe(3);
    });

    // Click first page button
    const firstButton = screen.getByLabelText('First page');
    await user.click(firstButton);

    await waitFor(() => {
      expect(screen.getByText('database_1')).toBeInTheDocument();
      expect(getCurrentPage()).toBe(1);
    });
  });

  it('should navigate to last page', async () => {
    const user = userEvent.setup();
    render(<DatabaseSelector selectedDatabases={[]} onSelectionChange={vi.fn()} />);

    await waitForLoad();

    await waitFor(() => {
      expect(screen.getByText('database_1')).toBeInTheDocument();
    });

    const lastButton = screen.getByLabelText('Last page');
    await user.click(lastButton);

    await waitFor(() => {
      expect(screen.getByText('database_26')).toBeInTheDocument();
      expect(screen.getByText('database_30')).toBeInTheDocument();
      expect(getCurrentPage()).toBe(6);
    });
  });

  it('should change items per page', async () => {
    const user = userEvent.setup();
    render(<DatabaseSelector selectedDatabases={[]} onSelectionChange={vi.fn()} />);

    await waitForLoad();

    await waitFor(() => {
      expect(screen.getByText('database_1')).toBeInTheDocument();
      expect(screen.queryByText('database_6')).not.toBeInTheDocument();
    });

    const itemsPerPageSelect = screen.getByDisplayValue('5');
    await user.selectOptions(itemsPerPageSelect, '10');

    await waitFor(() => {
      expect(screen.getByText('database_1')).toBeInTheDocument();
      expect(screen.getByText('database_10')).toBeInTheDocument();
      // With 30 databases and 10 per page = 3 pages
      expect(getCurrentPage()).toBe(1);
      expect(getTotalPages()).toBe(3);
    });
  });

  it('should show all items when "All" is selected', async () => {
    const user = userEvent.setup();
    render(<DatabaseSelector selectedDatabases={[]} onSelectionChange={vi.fn()} />);

    await waitForLoad();

    await waitFor(() => {
      expect(screen.getByText('database_1')).toBeInTheDocument();
    });

    const itemsPerPageSelect = screen.getByDisplayValue('5');
    await user.selectOptions(itemsPerPageSelect, 'All');

    await waitFor(() => {
      expect(screen.getByText('database_1')).toBeInTheDocument();
      expect(screen.getByText('database_30')).toBeInTheDocument();
      // When "All" is selected, only 1 page
      expect(getCurrentPage()).toBe(1);
      expect(getTotalPages()).toBe(1);
    });
  });

  it('should reset to page 1 when items per page changes', async () => {
    const user = userEvent.setup();
    render(<DatabaseSelector selectedDatabases={[]} onSelectionChange={vi.fn()} />);

    await waitForLoad();

    await waitFor(() => {
      expect(screen.getByText('database_1')).toBeInTheDocument();
    });

    // Go to page 2
    const nextButton = screen.getByLabelText('Next page');
    await user.click(nextButton);

    await waitFor(() => {
      expect(getCurrentPage()).toBe(2);
    });

    // Change items per page
    const itemsPerPageSelect = screen.getByDisplayValue('5');
    await user.selectOptions(itemsPerPageSelect, '10');

    await waitFor(() => {
      expect(getCurrentPage()).toBe(1);
      expect(screen.getByText('database_1')).toBeInTheDocument();
    });
  });

  it('should reset to page 1 when filters change', async () => {
    const user = userEvent.setup();
    render(<DatabaseSelector selectedDatabases={[]} onSelectionChange={vi.fn()} />);

    await waitForLoad();

    await waitFor(() => {
      expect(screen.getByText('database_1')).toBeInTheDocument();
    });

    // Go to page 2
    const nextButton = screen.getByLabelText('Next page');
    await user.click(nextButton);

    await waitFor(() => {
      expect(getCurrentPage()).toBe(2);
    });

    // Change filter
    const filterInput = screen.getByPlaceholderText('e.g., myapp');
    await user.type(filterInput, 'database_1');

    await waitFor(() => {
      // Should reset to page 1
      expect(getCurrentPage()).toBe(1);
    });
  });

  it('should disable prev/first buttons on first page', async () => {
    render(<DatabaseSelector selectedDatabases={[]} onSelectionChange={vi.fn()} />);

    await waitForLoad();

    await waitFor(() => {
      const prevButton = screen.getByLabelText('Previous page');
      const firstButton = screen.getByLabelText('First page');
      expect(prevButton).toBeDisabled();
      expect(firstButton).toBeDisabled();
    });
  });

  it('should disable next/last buttons on last page', async () => {
    const user = userEvent.setup();
    render(<DatabaseSelector selectedDatabases={[]} onSelectionChange={vi.fn()} />);

    await waitForLoad();

    await waitFor(() => {
      expect(screen.getByText('database_1')).toBeInTheDocument();
    });

    // Navigate to last page
    const lastButton = screen.getByLabelText('Last page');
    await user.click(lastButton);

    await waitFor(() => {
      const nextButton = screen.getByLabelText('Next page');
      const lastButtonAfter = screen.getByLabelText('Last page');
      expect(nextButton).toBeDisabled();
      expect(lastButtonAfter).toBeDisabled();
    });
  });

  describe('Intelligent Page Numbering', () => {
    it('should show all pages when 7 or fewer pages', async () => {
      const smallDbList = Array.from({ length: 30 }, (_, i) => ({
        name: `db_${i + 1}`,
        category: 'User',
        createDate: new Date().toISOString(),
      }));

      api.get.mockResolvedValue({
        data: smallDbList,
        success: true,
      });

      render(
        <DatabaseSelector
          selectedDatabases={[]}
          onSelectionChange={vi.fn()}
          clearFiltersOnMount={true}
        />
      );

      await waitForLoad();

      await waitFor(() => {
        // With 30 databases and 5 per page = 6 pages, should show all
        expect(screen.getByLabelText('Page 1')).toBeInTheDocument();
        expect(screen.getByLabelText('Page 6')).toBeInTheDocument();
        // Should not have ellipses
        expect(screen.queryByText('...')).not.toBeInTheDocument();
      });
    });

    it('should show ellipses when more than 7 pages', async () => {
      const largeDbList = Array.from({ length: 50 }, (_, i) => ({
        name: `db_${i + 1}`,
        category: 'User',
        createDate: new Date().toISOString(),
      }));

      api.get.mockResolvedValue({
        data: largeDbList,
        success: true,
      });

      render(
        <DatabaseSelector
          selectedDatabases={[]}
          onSelectionChange={vi.fn()}
          clearFiltersOnMount={true}
        />
      );

      await waitForLoad();

      await waitFor(() => {
        // With 50 databases and 5 per page = 10 pages
        // On page 1, should show: 1 2 3 4 5 ... 10
        expect(screen.getByLabelText('Page 1')).toBeInTheDocument();
        expect(screen.getByLabelText('Page 5')).toBeInTheDocument();
        expect(screen.getByLabelText('Page 10')).toBeInTheDocument();
        // Should have ellipses
        const ellipses = screen.getAllByText('...');
        expect(ellipses.length).toBeGreaterThan(0);
      });
    });
  });
});
