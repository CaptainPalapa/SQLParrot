// ABOUTME: Unified API client that works with both HTTP (Docker) and Tauri invoke
// ABOUTME: Detects runtime environment and routes calls appropriately

/**
 * Check if running in Tauri desktop app
 */
const isTauri = () => typeof window !== 'undefined' && typeof window.__TAURI__ !== 'undefined';

/**
 * Normalize API responses to a consistent format across Express and Tauri backends.
 * Both backends should return: { success, data, messages, timestamp }
 * But the actual data structure inside 'data' may differ.
 * @param {string} endpoint - The API endpoint
 * @param {Object} response - The raw response from either backend
 * @returns {Object} Normalized response
 */
const normalizeResponse = (endpoint, response) => {
  const path = endpoint.replace(/^\/api\//, '');

  // Health endpoint
  if (path === 'health') {
    // Express: direct { status, connected, ... }
    // Tauri: { success, data: { connected, ... }, ... }
    if (response.data !== undefined) {
      // Tauri format - flatten data to top level for compatibility
      return { ...response, ...response.data };
    }
    return response;
  }

  // Groups endpoint
  if (path === 'groups') {
    // Express: { success, data: { groups: [...] }, ... }
    // Tauri: { success, data: [...], ... }
    if (response.data?.groups) {
      // Express format - lift groups array to data
      return { ...response, data: response.data.groups };
    }
    return response;
  }

  // Snapshots endpoint (groups/:id/snapshots)
  if (path.match(/^groups\/[^/]+\/snapshots$/)) {
    // Express: direct { snapshots: [...], metadata }
    // Tauri: { success, data: [...], ... }
    if (response.snapshots !== undefined) {
      // Express format - convert to standard format
      return {
        success: true,
        data: response.snapshots,
        metadata: response.metadata,
        messages: { error: [], warning: [], info: [], success: [] },
        timestamp: new Date().toISOString()
      };
    }
    return response;
  }

  // Databases endpoint
  if (path === 'databases') {
    // Express: direct { databases: [...] }
    // Tauri: { success, data: [...], ... }
    if (response.databases !== undefined && response.data === undefined) {
      // Express format
      return {
        success: true,
        data: response.databases,
        messages: { error: [], warning: [], info: [], success: [] },
        timestamp: new Date().toISOString()
      };
    }
    return response;
  }

  // Settings endpoint
  if (path === 'settings') {
    // Express: direct settings object { preferences, ... }
    // Tauri: { success, data: Settings, ... }
    if (response.preferences !== undefined && response.data === undefined) {
      // Express format - wrap in standard format
      return {
        success: true,
        data: response,
        messages: { error: [], warning: [], info: [], success: [] },
        timestamp: new Date().toISOString()
      };
    }
    return response;
  }

  // Auth endpoints (password status, check, set, change, remove, skip)
  if (path.startsWith('auth/')) {
    // Both Express and Tauri return standard format
    return response;
  }

  // Connection endpoint
  if (path === 'connection') {
    // Express: direct connection object or null
    // Tauri: { success, data: ConnectionProfile, ... }
    if (response.data === undefined && !response.success) {
      // Express format - wrap in standard format
      return {
        success: true,
        data: response,
        messages: { error: [], warning: [], info: [], success: [] },
        timestamp: new Date().toISOString()
      };
    }
    return response;
  }

  // Test connection endpoint
  if (path === 'test-connection') {
    // Express: { success, message, databaseCount }
    // Tauri: { success, data: String (version), ... }
    // Keep as-is, components handle both
    return response;
  }

  // Check-external endpoint (snapshots/:id/check-external)
  if (path.match(/^snapshots\/[^/]+\/check-external$/)) {
    // Express: direct { success, hasExternalSnapshots, externalSnapshots, dropCommands }
    // Tauri: { success, data: { hasExternalSnapshots, externalSnapshots, dropCommands }, ... }
    if (response.data?.hasExternalSnapshots !== undefined) {
      // Tauri format - flatten data to top level
      return { ...response, ...response.data };
    }
    return response;
  }

  // Default - return as-is
  return response;
};

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

  // Connection management
  if (path === 'connection') return 'get_connection';
  if (path === 'test-connection') return 'test_connection';
  if (path === 'save-connection') return 'save_connection';

  // Databases
  if (path === 'databases') return 'get_databases';

  // Settings
  if (path === 'settings') {
    return method === 'PUT' ? 'update_settings' : 'get_settings';
  }

  // Auth endpoints (UI Security)
  if (path === 'auth/password-status') return 'get_password_status';
  if (path === 'auth/check-password') return 'check_password';
  if (path === 'auth/set-password') return 'set_password';
  if (path === 'auth/change-password') return 'change_password';
  if (path === 'auth/remove-password') return 'remove_password';
  if (path === 'auth/skip-password') return 'skip_password';

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
    return method === 'POST' ? 'create_snapshot' : 'get_snapshots';
  }

  // Snapshot operations: snapshots/:id/...
  if (segments[0] === 'snapshots' && segments.length >= 2) {
    if (segments[2] === 'check-external') return 'check_external_snapshots';
    if (segments[2] === 'rollback') return 'rollback_snapshot';
    if (segments[2] === 'cleanup') return 'cleanup_snapshot';
    if (method === 'DELETE') return 'delete_snapshot';
  }

  // Profile operations: profiles
  if (segments[0] === 'profiles') {
    if (segments.length === 1 && method === 'GET') return 'get_profiles';
    if (segments.length === 2 && method === 'GET') return 'get_profile';
    if (segments.length === 1 && method === 'POST') return 'create_profile';
    if (segments.length === 2 && method === 'PUT') return 'update_profile';
    if (segments.length === 2 && method === 'DELETE') return 'delete_profile';
    if (segments[2] === 'activate' && method === 'POST') return 'set_active_profile';
  }

  // Fallback - convert path to snake_case command
  console.warn(`Unknown endpoint mapping: ${method} ${endpoint}`);
  return path.replace(/[/-]/g, '_').replace(/:(\w+)/g, '');
};

/**
 * Extract path parameters from endpoint
 * @param {string} endpoint - API endpoint with actual values
 * @returns {Object} Extracted parameters (using snake_case for Rust)
 */
const extractPathParams = (endpoint) => {
  const params = {};
  const path = endpoint.replace(/^\/api\//, '');
  const segments = path.split('/');

  // groups/:id/... - use 'id' for direct group operations, 'groupId' for nested
  if (segments[0] === 'groups' && segments.length >= 2) {
    if (segments.length === 2) {
      // Direct group operation (update, delete): groups/:id
      params.id = segments[1];
    } else {
      // Nested operation (snapshots): groups/:groupId/snapshots
      params.groupId = segments[1];
    }
  }

  // snapshots/:id/... - use 'id' for direct operations
  if (segments[0] === 'snapshots' && segments.length >= 2) {
    params.id = segments[1];
  }

  // profiles/:id/... - use 'profileId' for all profile operations (Tauri v2 converts camelCase to snake_case)
  // Handle both direct operations (profiles/:id) and nested operations (profiles/:id/activate)
  if (segments[0] === 'profiles' && segments.length >= 2) {
    // Extract profileId from the second segment (works for both /profiles/:id and /profiles/:id/activate)
    // Tauri v2 converts camelCase profileId to snake_case profile_id in Rust
    params.profileId = segments[1];
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
    // Tauri path - use invoke via window.__TAURI__ global (injected by Tauri runtime)
    try {
      const command = endpointToCommand(endpoint, method);
      const pathParams = extractPathParams(endpoint);

      // Merge path params with body
      const args = { ...pathParams, ...body };

      // Use the Tauri global directly - available in Tauri v2 via window.__TAURI__.core
      const result = await window.__TAURI__.core.invoke(command, args);
      return normalizeResponse(endpoint, result);
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

    // Add session token if available (for password-protected routes)
    const sessionToken = sessionStorage.getItem('sessionToken');
    if (sessionToken) {
      fetchOptions.headers['X-Session-Token'] = sessionToken;
    }

    if (body) {
      fetchOptions.headers['Content-Type'] = 'application/json';
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(endpoint, fetchOptions);

    // Handle 401 Unauthorized - password required
    if (response.status === 401) {
      return {
        success: false,
        data: null,
        messages: {
          error: ['Authentication required'],
          warning: [],
          info: [],
          success: []
        },
        timestamp: new Date().toISOString(),
        requiresAuth: true
      };
    }

    // Handle other error status codes (400, 500, etc.)
    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
      }
      return {
        success: false,
        error: errorData.error || errorData.messages?.error?.[0] || `HTTP ${response.status}`,
        messages: errorData.messages || { error: [errorData.error || `HTTP ${response.status}`], warning: [], info: [], success: [] },
        timestamp: new Date().toISOString()
      };
    }

    const result = await response.json();

    // Store session token if provided
    if (result.data?.sessionToken) {
      sessionStorage.setItem('sessionToken', result.data.sessionToken);
    }

    return normalizeResponse(endpoint, result);
  }
}

// Convenience methods for common HTTP verbs
export const api = {
  get: (endpoint) => apiCall(endpoint, { method: 'GET' }),
  post: (endpoint, body) => apiCall(endpoint, { method: 'POST', body }),
  put: (endpoint, body) => apiCall(endpoint, { method: 'PUT', body }),
  delete: (endpoint, body) => apiCall(endpoint, { method: 'DELETE', body }),

  // Profile management
  getProfiles: () => apiCall('/api/profiles'),
  getProfile: (id) => apiCall(`/api/profiles/${id}`),
  createProfile: (profileData) => apiCall('/api/profiles', {
    method: 'POST',
    body: profileData
  }),
  updateProfile: (id, profileData) => apiCall(`/api/profiles/${id}`, {
    method: 'PUT',
    body: profileData
  }),
  deleteProfile: (id) => apiCall(`/api/profiles/${id}`, {
    method: 'DELETE'
  }),
  setActiveProfile: (id) => apiCall(`/api/profiles/${id}/activate`, {
    method: 'POST',
    body: { profileId: id } // Use camelCase for Tauri v2 (converts to profile_id in Rust)
  }),
};

// Export isTauri for components that need to know
export { isTauri };
