// ABOUTME: Unified API client that works with both HTTP (Docker) and Tauri invoke
// ABOUTME: Detects runtime environment and routes calls appropriately

/**
 * Check if running in Tauri desktop app
 */
const isTauri = () => typeof window !== 'undefined' && typeof window.__TAURI__ !== 'undefined';

/**
 * Map HTTP endpoint + method to Tauri command name
 * @param {string} endpoint - API endpoint path
 * @param {string} method - HTTP method
 * @returns {string} Tauri command name
 */
const endpointToCommand = (endpoint, method) => {
  // Remove /api prefix and normalize
  const path = endpoint.replace(/^\/api\//, '');

  // Extract path segments and parameters
  const segments = path.split('/');

  // Handle dynamic segments (e.g., groups/:id/snapshots)
  // Convert to snake_case command names

  // Health check
  if (path === 'health') return 'check_health';

  // Databases
  if (path === 'databases') return 'get_databases';

  // Settings
  if (path === 'settings') {
    return method === 'PUT' ? 'update_settings' : 'get_settings';
  }

  // History
  if (path === 'history') {
    return method === 'DELETE' ? 'clear_history' : 'get_history';
  }

  // Test snapshot path
  if (path === 'test-snapshot-path') return 'test_snapshot_path';

  // Metadata endpoints
  if (path === 'metadata/status') return 'get_metadata_status';
  if (path === 'metadata/sync') return 'sync_metadata';

  // Snapshots verification/cleanup
  if (path === 'snapshots/verify') return 'verify_snapshots';

  // Groups
  if (path === 'groups') {
    return method === 'POST' ? 'create_group' : 'get_groups';
  }

  // Group operations with ID: groups/:id
  if (segments[0] === 'groups' && segments.length === 2) {
    if (method === 'PUT') return 'update_group';
    if (method === 'DELETE') return 'delete_group';
    return 'get_group';
  }

  // Group snapshots: groups/:id/snapshots
  if (segments[0] === 'groups' && segments[2] === 'snapshots') {
    return method === 'POST' ? 'create_snapshot' : 'get_group_snapshots';
  }

  // Snapshot operations: snapshots/:id/...
  if (segments[0] === 'snapshots' && segments.length >= 2) {
    if (segments[2] === 'check-external') return 'check_external_snapshots';
    if (segments[2] === 'rollback') return 'rollback_snapshot';
    if (segments[2] === 'cleanup') return 'cleanup_snapshot';
    if (method === 'DELETE') return 'delete_snapshot';
  }

  // Fallback - convert path to snake_case command
  console.warn(`Unknown endpoint mapping: ${method} ${endpoint}`);
  return path.replace(/[/-]/g, '_').replace(/:(\w+)/g, '');
};

/**
 * Extract path parameters from endpoint
 * @param {string} endpoint - API endpoint with actual values
 * @returns {Object} Extracted parameters
 */
const extractPathParams = (endpoint) => {
  const params = {};
  const path = endpoint.replace(/^\/api\//, '');
  const segments = path.split('/');

  // groups/:groupId/...
  if (segments[0] === 'groups' && segments.length >= 2) {
    params.groupId = segments[1];
  }

  // snapshots/:snapshotId/...
  if (segments[0] === 'snapshots' && segments.length >= 2) {
    params.snapshotId = segments[1];
  }

  return params;
};

/**
 * Make an API call - works with both HTTP and Tauri
 * @param {string} endpoint - API endpoint path (e.g., '/api/groups')
 * @param {Object} options - Request options
 * @param {string} options.method - HTTP method (GET, POST, PUT, DELETE)
 * @param {Object} options.body - Request body (for POST/PUT)
 * @returns {Promise<Object>} API response
 */
export async function apiCall(endpoint, options = {}) {
  const method = options.method || 'GET';
  const body = options.body || null;

  if (isTauri()) {
    // Tauri path - use invoke
    // Dynamic import with try/catch to handle cases where Tauri API isn't installed
    try {
      const tauriCore = await import('@tauri-apps/api/core');
      const command = endpointToCommand(endpoint, method);
      const pathParams = extractPathParams(endpoint);

      // Merge path params with body
      const args = { ...pathParams, ...body };

      // Tauri commands return the data directly, but we want consistent format
      const result = await tauriCore.invoke(command, args);
      return result;
    } catch (error) {
      // Wrap Tauri errors in consistent format
      return {
        success: false,
        data: null,
        messages: {
          error: [error.toString()],
          warning: [],
          info: [],
          success: []
        },
        timestamp: new Date().toISOString()
      };
    }
  } else {
    // HTTP path - use fetch
    const fetchOptions = {
      method,
      headers: {}
    };

    if (body) {
      fetchOptions.headers['Content-Type'] = 'application/json';
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(endpoint, fetchOptions);
    return response.json();
  }
}

// Convenience methods for common HTTP verbs
export const api = {
  get: (endpoint) => apiCall(endpoint, { method: 'GET' }),
  post: (endpoint, body) => apiCall(endpoint, { method: 'POST', body }),
  put: (endpoint, body) => apiCall(endpoint, { method: 'PUT', body }),
  delete: (endpoint, body) => apiCall(endpoint, { method: 'DELETE', body })
};

// Export isTauri for components that need to know
export { isTauri };
