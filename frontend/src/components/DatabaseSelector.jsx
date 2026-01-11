import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Search, Check, X, AlertCircle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useNotification } from '../hooks/useNotification';
import { api } from '../api';

const DatabaseSelector = ({ selectedDatabases = [], onSelectionChange, className = '', existingGroups = [], currentGroupId = null, clearFiltersOnMount = false }) => {
  const [databases, setDatabases] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter1, setFilter1] = useState(() => {
    // Clear filters when editing a group, otherwise load from localStorage
    if (clearFiltersOnMount) return '';
    if (typeof window !== 'undefined') {
      return localStorage.getItem('db-filter1') || '';
    }
    return '';
  });
  const [filter2, setFilter2] = useState(() => {
    // Clear filters when editing a group, otherwise load from localStorage
    if (clearFiltersOnMount) return '';
    if (typeof window !== 'undefined') {
      return localStorage.getItem('db-filter2') || '';
    }
    return '';
  });
  const [selected, setSelected] = useState(new Set(selectedDatabases));
  const selectedRef = useRef(selected);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);
  const { showError } = useNotification();
  const lastPropRef = useRef(selectedDatabases);
  const skipCallbackRef = useRef(false);

  // Keep ref in sync with state
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  // Sync selected state when prop changes from parent (but avoid infinite loop)
  useEffect(() => {
    // Check if prop actually changed (deep comparison)
    const propString = JSON.stringify([...selectedDatabases].sort());
    const lastPropString = JSON.stringify([...lastPropRef.current].sort());

    if (propString !== lastPropString) {
      const propSet = new Set(selectedDatabases);
      const currentSet = selectedRef.current;

      // Only sync if sets are actually different
      const setsEqual =
        propSet.size === currentSet.size &&
        [...propSet].every(db => currentSet.has(db));

      if (!setsEqual) {
        // This is an external change, sync our state
        skipCallbackRef.current = true;
        setSelected(propSet);
      }
      lastPropRef.current = selectedDatabases;
    }
  }, [selectedDatabases]);

  // Clear filters when clearFiltersOnMount prop is true (happens when modal opens)
  useEffect(() => {
    if (clearFiltersOnMount) {
      setFilter1('');
      setFilter2('');
      setCurrentPage(1);
    }
  }, [clearFiltersOnMount]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filter1, filter2]);

  // Save filters to localStorage when they change (only if not in "clear" mode)
  useEffect(() => {
    if (typeof window !== 'undefined' && !clearFiltersOnMount) {
      localStorage.setItem('db-filter1', filter1);
    }
  }, [filter1, clearFiltersOnMount]);

  useEffect(() => {
    if (typeof window !== 'undefined' && !clearFiltersOnMount) {
      localStorage.setItem('db-filter2', filter2);
    }
  }, [filter2, clearFiltersOnMount]);

  const fetchDatabases = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.get('/api/databases');
      // Handle both ApiResponse format (Tauri) and legacy format (Express)
      const databases = data.data || data.databases || [];
      setDatabases(databases);
    } catch (error) {
      console.error('Error fetching databases:', error);
      showError('Failed to load databases. Please check your SQL Server connection.');
    } finally {
      setIsLoading(false);
    }
  }, [showError]);

  // Load databases on component mount (only once)
  const hasFetchedRef = useRef(false);
  useEffect(() => {
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchDatabases();
    }
  }, [fetchDatabases]);

  // Track if component has mounted to avoid calling onSelectionChange on initial mount
  const hasMountedRef = useRef(false);

  // Update parent when selection changes (skip during sync to prevent infinite loops)
  const prevSelectedRef = useRef(JSON.stringify([...selected].sort()));
  useEffect(() => {
    // Don't call callback if we're syncing from prop
    if (skipCallbackRef.current) {
      prevSelectedRef.current = JSON.stringify([...selected].sort());
      skipCallbackRef.current = false;
      hasMountedRef.current = true;
      return;
    }

    // Only call if selection actually changed and component has mounted
    const currentSelectedString = JSON.stringify([...selected].sort());

    if (currentSelectedString !== prevSelectedRef.current && hasMountedRef.current) {
      onSelectionChange([...selected].sort());
      prevSelectedRef.current = currentSelectedString;
    } else if (!hasMountedRef.current) {
      // On mount, just update the ref without calling callback
      prevSelectedRef.current = currentSelectedString;
      hasMountedRef.current = true;
    }
  }, [selected, onSelectionChange]);

  // Filter databases based on both filters
  const filteredDatabases = useMemo(() => {
    return databases.filter(db => {
      const name = db.name.toLowerCase();
      const filter1Match = filter1 ? name.includes(filter1.toLowerCase()) : true;
      const filter2Match = filter2 ? name.includes(filter2.toLowerCase()) : true;
      return filter1Match && filter2Match;
    });
  }, [databases, filter1, filter2]);

  // Determine which databases are already in use by other groups
  const databasesInUse = useMemo(() => {
    const inUse = new Set();
    existingGroups.forEach(group => {
      // Skip the current group if we're editing it
      if (currentGroupId && group.id === currentGroupId) {
        return;
      }
      group.databases.forEach(dbName => {
        inUse.add(dbName);
      });
    });
    return inUse;
  }, [existingGroups, currentGroupId]);

  // Pagination calculations
  const totalPages = useMemo(() => {
    if (itemsPerPage === 'All') return 1;
    return Math.ceil(filteredDatabases.length / itemsPerPage);
  }, [filteredDatabases.length, itemsPerPage]);

  const paginatedDatabases = useMemo(() => {
    if (itemsPerPage === 'All') return filteredDatabases;
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredDatabases.slice(startIndex, endIndex);
  }, [filteredDatabases, currentPage, itemsPerPage]);

  const handleToggleDatabase = (dbName) => {
    // Don't allow selecting databases that are already in use by other groups
    if (databasesInUse.has(dbName)) {
      return;
    }

    const newSelected = new Set(selected);
    if (newSelected.has(dbName)) {
      newSelected.delete(dbName);
    } else {
      newSelected.add(dbName);
    }
    setSelected(newSelected);
  };

  const handlePageChange = (e, newPage) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setCurrentPage(newPage);
  };

  const handleItemsPerPageChange = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const value = e.target.value === 'All' ? 'All' : parseInt(e.target.value, 10);
    setItemsPerPage(value);
    setCurrentPage(1);
  };

  // Generate intelligent page numbers with ellipses
  const getPageNumbers = () => {
    if (totalPages <= 7) {
      // Show all pages if 7 or fewer
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages = [];
    const current = currentPage;
    const total = totalPages;

    // Always show first page
    pages.push(1);

    if (current <= 4) {
      // Near the beginning: 1 2 3 4 5 ... last
      for (let i = 2; i <= Math.min(5, total); i++) {
        pages.push(i);
      }
      if (total > 6) {
        pages.push('ellipsis');
        pages.push(total);
      } else if (total > 5) {
        pages.push(total);
      }
    } else if (current >= total - 3) {
      // Near the end: 1 ... (total-4) (total-3) (total-2) (total-1) total
      if (total > 6) {
        pages.push('ellipsis');
      }
      for (let i = Math.max(2, total - 4); i <= total; i++) {
        pages.push(i);
      }
    } else {
      // In the middle: 1 ... (current-1) current (current+1) ... total
      pages.push('ellipsis');
      pages.push(current - 1);
      pages.push(current);
      pages.push(current + 1);
      pages.push('ellipsis');
      pages.push(total);
    }

    return pages;
  };

  // Calculate summary stats
  const totalDatabases = databases.length;
  const availableDatabases = filteredDatabases.filter(db => !databasesInUse.has(db.name));
  const visibleSelected = filteredDatabases.filter(db => selected.has(db.name)).length;
  const totalSelected = selected.size;
  const unavailableCount = filteredDatabases.filter(db => databasesInUse.has(db.name)).length;

  if (isLoading) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="animate-pulse">
          <div className="h-4 bg-secondary-200 dark:bg-secondary-700 rounded w-1/4 mb-2"></div>
          <div className="h-10 bg-secondary-200 dark:bg-secondary-700 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Filter Controls */}
      <div className="space-y-3">
        <div className="flex space-x-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
              Filter 1
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-secondary-400" />
              <input
                type="text"
                value={filter1}
                onChange={(e) => setFilter1(e.target.value)}
                placeholder="e.g., myapp"
                className="w-full pl-10 pr-4 py-2 border border-secondary-300 dark:border-secondary-600 rounded-lg bg-white dark:bg-secondary-800 text-secondary-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
              Filter 2
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-secondary-400" />
              <input
                type="text"
                value={filter2}
                onChange={(e) => setFilter2(e.target.value)}
                placeholder="e.g., test2"
                className="w-full pl-10 pr-4 py-2 border border-secondary-300 dark:border-secondary-600 rounded-lg bg-white dark:bg-secondary-800 text-secondary-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="text-sm text-secondary-600 dark:text-secondary-400">
          {totalSelected > 0 ? (
            <span>
              {visibleSelected} of {availableDatabases.length} Selected
              {unavailableCount > 0 && ` • ${unavailableCount} in use`}
            </span>
          ) : (
            <span>
              {availableDatabases.length} databases available
              {unavailableCount > 0 && ` • ${unavailableCount} already in use`}
            </span>
          )}
        </div>
      </div>

      {/* Database List */}
      <div className="border border-secondary-200 dark:border-secondary-700 rounded-lg">
        {paginatedDatabases.map((db) => {
          const isSelected = selected.has(db.name);
          const isInUse = databasesInUse.has(db.name);

          return (
            <div
              key={db.name}
              className={`flex items-center justify-between px-3 py-2 transition-colors ${
                isInUse
                  ? 'bg-gray-50 dark:bg-gray-800 cursor-not-allowed opacity-60'
                  : 'hover:bg-secondary-50 dark:hover:bg-secondary-800 cursor-pointer'
              } ${
                isSelected ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500' : ''
              }`}
              onClick={() => !isInUse && handleToggleDatabase(db.name)}
            >
              <div className="flex items-center space-x-3 flex-1">
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
                  isInUse
                    ? 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700'
                    : isSelected
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'border-secondary-300 dark:border-secondary-600 hover:border-primary-500'
                }`}>
                  {isSelected && <Check className="w-2.5 h-2.5" />}
                  {isInUse && <AlertCircle className="w-2.5 h-2.5 text-gray-400" />}
                </div>
                <div className={`font-medium text-sm ${
                  isInUse
                    ? 'text-gray-500 dark:text-gray-400'
                    : isSelected
                      ? 'text-gray-900 dark:text-white'
                      : 'text-secondary-900 dark:text-white'
                }`}>
                  {db.name}
                  {isInUse && (
                    <span className="ml-2 text-xs text-orange-600 dark:text-orange-400">
                      (Already in use)
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filteredDatabases.length === 0 && (
          <div className="p-6 text-center text-secondary-500 dark:text-secondary-400">
            <X className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No databases match your filters</p>
            <p className="text-sm mt-1">
              Try adjusting your filter criteria
            </p>
          </div>
        )}

        {filteredDatabases.length > 0 && availableDatabases.length === 0 && (
          <div className="p-6 text-center text-orange-600 dark:text-orange-400">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>All filtered databases are already in use</p>
            <p className="text-sm mt-1">
              Try adjusting your filter criteria or select different databases
            </p>
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {filteredDatabases.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <select
              value={itemsPerPage}
              onChange={handleItemsPerPageChange}
              className="px-2 py-1 text-sm border border-secondary-300 dark:border-secondary-600 rounded-lg bg-white dark:bg-secondary-700 text-secondary-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value="All">All</option>
            </select>
            <label className="text-sm text-secondary-600 dark:text-secondary-400">Items per page</label>
          </div>
          <div className="flex items-center space-x-1">
            <button
              type="button"
              onClick={(e) => handlePageChange(e, 1)}
              disabled={currentPage === 1}
              className="p-1.5 rounded border border-secondary-300 dark:border-secondary-600 bg-white dark:bg-secondary-700 text-secondary-700 dark:text-secondary-300 hover:bg-secondary-50 dark:hover:bg-secondary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="First page"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={(e) => handlePageChange(e, currentPage - 1)}
              disabled={currentPage === 1}
              className="p-1.5 rounded border border-secondary-300 dark:border-secondary-600 bg-white dark:bg-secondary-700 text-secondary-700 dark:text-secondary-300 hover:bg-secondary-50 dark:hover:bg-secondary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {getPageNumbers().map((page, index) => {
              if (page === 'ellipsis') {
                return (
                  <span key={`ellipsis-${index}`} className="px-2 text-secondary-500 dark:text-secondary-400">
                    ...
                  </span>
                );
              }
              const isCurrent = page === currentPage;
              return (
                <button
                  key={page}
                  type="button"
                  onClick={(e) => handlePageChange(e, page)}
                  className={`px-3 py-1.5 text-sm rounded border border-secondary-300 dark:border-secondary-600 transition-colors ${
                    isCurrent
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white dark:bg-secondary-700 text-secondary-700 dark:text-secondary-300 hover:bg-secondary-50 dark:hover:bg-secondary-600'
                  }`}
                  aria-label={`Page ${page}`}
                  aria-current={isCurrent ? 'page' : undefined}
                >
                  {page.toLocaleString()}
                </button>
              );
            })}
            <button
              type="button"
              onClick={(e) => handlePageChange(e, currentPage + 1)}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded border border-secondary-300 dark:border-secondary-600 bg-white dark:bg-secondary-700 text-secondary-700 dark:text-secondary-300 hover:bg-secondary-50 dark:hover:bg-secondary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={(e) => handlePageChange(e, totalPages)}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded border border-secondary-300 dark:border-secondary-600 bg-white dark:bg-secondary-700 text-secondary-700 dark:text-secondary-300 hover:bg-secondary-50 dark:hover:bg-secondary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Last page"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Selected Databases Summary */}
      {totalSelected > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
          <div className="text-sm font-medium text-gray-900 dark:text-white mb-2">
            Selected Databases ({totalSelected})
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from(selected).map(dbName => (
              <span
                key={dbName}
                className="inline-flex items-center px-2 py-1 bg-blue-100 dark:bg-blue-800 text-gray-900 dark:text-white text-xs rounded-md border border-blue-300 dark:border-blue-600"
              >
                {dbName}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleDatabase(dbName);
                  }}
                  className="ml-1 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DatabaseSelector;
