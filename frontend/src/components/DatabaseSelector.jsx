import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Check, X, AlertCircle } from 'lucide-react';
import { useNotification } from '../hooks/useNotification';

const DatabaseSelector = ({ selectedDatabases = [], onSelectionChange, className = '', existingGroups = [], currentGroupId = null }) => {
  const [databases, setDatabases] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter1, setFilter1] = useState(() => {
    // Load from localStorage, default to 'vsr' - check if we're in browser
    if (typeof window !== 'undefined') {
      return localStorage.getItem('db-filter1') || 'vsr';
    }
    return 'vsr';
  });
  const [filter2, setFilter2] = useState(() => {
    // Load from localStorage - check if we're in browser
    if (typeof window !== 'undefined') {
      return localStorage.getItem('db-filter2') || '';
    }
    return '';
  });
  const [selected, setSelected] = useState(new Set(selectedDatabases));
  const { showError } = useNotification();

  // Save filters to localStorage when they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('db-filter1', filter1);
    }
  }, [filter1]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('db-filter2', filter2);
    }
  }, [filter2]);

  const fetchDatabases = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/databases');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setDatabases(data.databases || []);
    } catch (error) {
      console.error('Error fetching databases:', error);
      showError('Failed to load databases. Please check your SQL Server connection.');
    } finally {
      setIsLoading(false);
    }
  }, [showError]);

  // Load databases on component mount
  useEffect(() => {
    fetchDatabases();
  }, [fetchDatabases]);

  // Update parent when selection changes
  useEffect(() => {
    onSelectionChange(Array.from(selected));
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

  // Group filtered databases by category
  const groupedDatabases = useMemo(() => {
    const groups = { 'Global': [], 'User': [], 'Data Warehouse': [] };
    filteredDatabases.forEach(db => {
      if (groups[db.category]) {
        groups[db.category].push(db);
      }
    });
    return groups;
  }, [filteredDatabases]);

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

  const handleSelectAll = () => {
    const availableFilteredNames = filteredDatabases
      .map(db => db.name)
      .filter(name => !databasesInUse.has(name));
    const newSelected = new Set(selected);
    availableFilteredNames.forEach(name => newSelected.add(name));
    setSelected(newSelected);
  };

  const handleDeselectAll = () => {
    const allFilteredNames = filteredDatabases.map(db => db.name);
    const newSelected = new Set(selected);
    allFilteredNames.forEach(name => newSelected.delete(name));
    setSelected(newSelected);
  };

  // Calculate summary stats
  const totalDatabases = databases.length;
  const availableDatabases = filteredDatabases.filter(db => !databasesInUse.has(db.name));
  const visibleSelected = filteredDatabases.filter(db => selected.has(db.name)).length;
  const hiddenSelected = Array.from(selected).filter(name =>
    !filteredDatabases.some(db => db.name === name)
  ).length;
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
                placeholder="e.g., vsr"
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
                placeholder="e.g., sun"
                className="w-full pl-10 pr-4 py-2 border border-secondary-300 dark:border-secondary-600 rounded-lg bg-white dark:bg-secondary-800 text-secondary-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Summary and Controls */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-secondary-600 dark:text-secondary-400">
            {totalSelected > 0 ? (
              <span>
                {visibleSelected} of {availableDatabases.length} Selected
                {hiddenSelected > 0 && ` (${hiddenSelected} Hidden)`}
                {unavailableCount > 0 && ` • ${unavailableCount} in use`}
              </span>
            ) : (
              <span>
                {availableDatabases.length} databases available
                {unavailableCount > 0 && ` • ${unavailableCount} already in use`}
              </span>
            )}
          </div>
          <div className="flex space-x-2">
            <button
              onClick={handleSelectAll}
              className="text-xs px-2 py-1 text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
              disabled={availableDatabases.length === 0}
            >
              Select All Available
            </button>
            <button
              onClick={handleDeselectAll}
              className="text-xs px-2 py-1 text-secondary-600 hover:text-secondary-700 dark:text-secondary-400 dark:hover:text-secondary-300"
              disabled={visibleSelected === 0}
            >
              Deselect All Visible
            </button>
          </div>
        </div>
      </div>

      {/* Database List */}
      <div className="max-h-96 overflow-y-auto border border-secondary-200 dark:border-secondary-700 rounded-lg">
        {Object.entries(groupedDatabases).map(([category, categoryDatabases], categoryIndex) => (
          <div key={category}>
            {categoryDatabases.map((db, dbIndex) => {
              const isSelected = selected.has(db.name);
              const isInUse = databasesInUse.has(db.name);
              const isFirstInCategory = dbIndex === 0;
              const isFirstCategory = categoryIndex === 0;

              return (
                <div key={db.name}>
                  {/* Horizontal rule separator (except before first item) */}
                  {isFirstInCategory && !isFirstCategory && (
                    <hr className="border-secondary-200 dark:border-secondary-700" />
                  )}

                  <div
                    className={`flex items-center justify-between p-3 transition-colors ${
                      isInUse
                        ? 'bg-gray-50 dark:bg-gray-800 cursor-not-allowed opacity-60'
                        : 'hover:bg-secondary-50 dark:hover:bg-secondary-800 cursor-pointer'
                    } ${
                      isSelected ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500' : ''
                    }`}
                    onClick={() => !isInUse && handleToggleDatabase(db.name)}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        isInUse
                          ? 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700'
                          : isSelected
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'border-secondary-300 dark:border-secondary-600 hover:border-primary-500'
                      }`}>
                        {isSelected && <Check className="w-3 h-3" />}
                        {isInUse && <AlertCircle className="w-3 h-3 text-gray-400" />}
                      </div>
                      <div className="flex-1">
                        <div className={`font-medium ${
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
                        <div className={`text-xs ${
                          isInUse
                            ? 'text-gray-400 dark:text-gray-500'
                            : isSelected
                              ? 'text-gray-700 dark:text-gray-300'
                              : 'text-secondary-500 dark:text-secondary-400'
                        }`}>
                          {category} • Created {new Date(db.createDate).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

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
