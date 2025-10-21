import React, { useState, useEffect, useCallback } from 'react';
import { Clock, Database, Camera, Trash2, RotateCcw, ChevronLeft, ChevronRight, AlertTriangle, Scissors } from 'lucide-react';
import { Toast } from './ui/Modal';
import { useNotification } from '../hooks/useNotification';
import Modal from './ui/Modal';

const HistoryView = () => {
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const ITEMS_PER_PAGE = 10;

  // Custom hook for notifications
  const { notification, showError, showSuccess, hideNotification } = useNotification();

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/history');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setHistory(data.operations || []);
      // Reset to first page when data changes
      setCurrentPage(1);
    } catch (error) {
      console.error('Error fetching history:', error);
      showError('Failed to load operation history. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [showError]);

  const clearHistory = useCallback(async () => {
    setIsClearing(true);
    try {
      const response = await fetch('/api/history', {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      await fetchHistory(); // Refresh the history
      showSuccess('History cleared successfully');
      setShowClearConfirm(false);
    } catch (error) {
      console.error('Error clearing history:', error);
      showError('Failed to clear history. Please try again.');
    } finally {
      setIsClearing(false);
    }
  }, [fetchHistory, showError, showSuccess]);

  // Pagination calculations
  const totalPages = Math.ceil(history.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentHistory = history.slice(startIndex, endIndex);

  const goToPage = (page) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const getOperationIcon = (type) => {
    switch (type) {
      case 'create_group':
        return Database;
      case 'update_group':
        return Database;
      case 'delete_group':
        return Trash2;
      case 'create_snapshots':
        return Camera;
      case 'create_automatic_checkpoint':
        return Clock;
      case 'restore_snapshot':
        return RotateCcw;
      case 'trim_history':
        return Scissors;
      default:
        return Clock;
    }
  };

  const getOperationColor = (type) => {
    switch (type) {
      case 'create_group':
        return 'text-green-600 bg-green-100 dark:bg-green-900';
      case 'update_group':
        return 'text-blue-600 bg-blue-100 dark:bg-blue-900';
      case 'delete_group':
        return 'text-red-600 bg-red-100 dark:bg-red-900';
      case 'create_snapshots':
        return 'text-purple-600 bg-purple-100 dark:bg-purple-900';
      case 'create_automatic_checkpoint':
        return 'text-orange-600 bg-orange-100 dark:bg-orange-900';
      case 'restore_snapshot':
        return 'text-indigo-600 bg-indigo-100 dark:bg-indigo-900';
      case 'trim_history':
        return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900';
      default:
        return 'text-secondary-600 bg-secondary-100 dark:bg-secondary-700';
    }
  };

  const formatOperationDescription = (operation) => {
    switch (operation.type) {
      case 'create_group':
        return `Created group "${operation.groupName}" with ${operation.databaseCount} databases`;
      case 'update_group':
        return `Updated group "${operation.groupName}" with ${operation.databaseCount} databases`;
      case 'delete_group':
        return `Deleted group "${operation.groupName}"`;
      case 'create_snapshots': {
        const successCount = operation.results?.filter(r => r.success).length || 0;
        const totalCount = operation.results?.length || 0;
        return `Created snapshots for group "${operation.groupName}" (${successCount}/${totalCount} successful)`;
      }
      case 'create_automatic_checkpoint': {
        const successCount = operation.results?.filter(r => r.success).length || 0;
        const totalCount = operation.results?.length || 0;
        return `Created automatic checkpoint for group "${operation.groupName}" (${successCount}/${totalCount} successful)`;
      }
      case 'restore_snapshot':
        return `Restored snapshot "${operation.snapshotName}" for group "${operation.groupName}"`;
      case 'trim_history':
        return `${operation.removedCount} history entries removed by changing max from ${operation.previousCount} to ${operation.newMaxEntries}`;
      default:
        return `Unknown operation: ${operation.type}`;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-secondary-900 dark:text-white">
            Operation History
          </h2>
          <p className="text-secondary-600 dark:text-secondary-400">
            Track all snapshot and group management operations
          </p>
        </div>

        {history.length > 0 && (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="px-4 py-2 border border-red-300 text-red-700 bg-white hover:bg-red-50 hover:border-red-400 dark:border-red-600 dark:text-red-300 dark:bg-red-900/20 dark:hover:bg-red-900/30 rounded-lg font-medium transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isClearing}
          >
            <Trash2 className="w-4 h-4" />
            <span>{isClearing ? 'Clearing...' : 'Clear History'}</span>
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="text-center py-12">
          <Clock className="w-16 h-16 text-secondary-300 dark:text-secondary-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-secondary-900 dark:text-white mb-2">
            No operations yet
          </h3>
          <p className="text-secondary-600 dark:text-secondary-400">
            Your operation history will appear here as you manage groups and snapshots
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {currentHistory.map((operation, index) => {
              const Icon = getOperationIcon(operation.type);
              return (
                <div key={startIndex + index} className="card p-4">
                  <div className="flex items-start space-x-4">
                    <div className={`p-2 rounded-lg ${getOperationColor(operation.type)}`}>
                      <Icon className="w-5 h-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-secondary-900 dark:text-white">
                          {formatOperationDescription(operation)}
                        </p>
                        <time className="text-xs text-secondary-500 dark:text-secondary-400">
                          {new Date(operation.timestamp).toLocaleString()}
                        </time>
                      </div>

                      {operation.results && operation.results.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {operation.results.map((result, resultIndex) => (
                            <div key={resultIndex} className="text-xs text-secondary-600 dark:text-secondary-400">
                              {result.database}: {result.success ? '✓ Success' : `✗ ${result.error}`}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <div className="text-sm text-secondary-600 dark:text-secondary-400">
                Showing {startIndex + 1} to {Math.min(endIndex, history.length)} of {history.length} operations
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-400 dark:border-gray-600 dark:text-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-md text-sm font-medium transition-colors flex items-center space-x-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Previous</span>
                </button>

                <div className="flex items-center space-x-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => goToPage(page)}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                        page === currentPage
                          ? 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
                          : 'border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-400 dark:border-gray-600 dark:text-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-400 dark:border-gray-600 dark:text-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-md text-sm font-medium transition-colors flex items-center space-x-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Clear History Confirmation Modal */}
      <Modal
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        title="Clear Operation History"
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-6 h-6 text-red-500 mt-0.5" />
            <div>
              <p className="text-secondary-900 dark:text-white font-medium">
                Are you sure you want to clear all operation history?
              </p>
              <p className="text-secondary-600 dark:text-secondary-400 text-sm mt-1">
                This action cannot be undone. All {history.length} operation records will be permanently deleted.
              </p>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              onClick={() => setShowClearConfirm(false)}
              className="px-4 py-2 border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-400 dark:border-gray-600 dark:text-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isClearing}
            >
              Cancel
            </button>
            <button
              onClick={clearHistory}
              className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isClearing}
            >
              {isClearing ? 'Clearing...' : 'Clear History'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Toast Notification */}
      <Toast
        message={notification.message}
        type={notification.type}
        isVisible={notification.isVisible}
        onClose={hideNotification}
      />
    </div>
  );
};

export default HistoryView;
