import React, { useState, useEffect } from 'react';
import { Clock, Database, Camera, Trash2, RotateCcw } from 'lucide-react';

const HistoryView = () => {
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const response = await fetch('/api/history');
      const data = await response.json();
      setHistory(data.operations || []);
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setIsLoading(false);
    }
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
      case 'restore_snapshot':
        return RotateCcw;
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
      case 'restore_snapshot':
        return 'text-orange-600 bg-orange-100 dark:bg-orange-900';
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
      case 'create_snapshots':
        const successCount = operation.results?.filter(r => r.success).length || 0;
        const totalCount = operation.results?.length || 0;
        return `Created snapshots for group "${operation.groupName}" (${successCount}/${totalCount} successful)`;
      case 'restore_snapshot':
        return `Restored snapshot "${operation.snapshotName}" for group "${operation.groupName}"`;
      default:
        return 'Unknown operation';
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
      <div>
        <h2 className="text-2xl font-bold text-secondary-900 dark:text-white">
          Operation History
        </h2>
        <p className="text-secondary-600 dark:text-secondary-400">
          Track all snapshot and group management operations
        </p>
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
        <div className="space-y-4">
          {history.map((operation, index) => {
            const Icon = getOperationIcon(operation.type);
            return (
              <div key={index} className="card p-4">
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
      )}
    </div>
  );
};

export default HistoryView;
