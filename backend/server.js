const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const sql = require('mssql');
const bcrypt = require('bcryptjs');

// Standardized API response utility
const createApiResponse = (success, data = null, messages = {}) => {
  return {
    success,
    data,
    messages: {
      error: messages.error || [],
      warning: messages.warning || [],
      info: messages.info || [],
      success: messages.success || []
    },
    timestamp: new Date().toISOString()
  };
};

// Helper function for error responses
const createErrorResponse = (errorMessages, statusCode = 400, details = null) => {
  const response = {
    status: statusCode,
    ...createApiResponse(false, null, { error: Array.isArray(errorMessages) ? errorMessages : [errorMessages] })
  };

  // Include detailed error information in development mode
  if (process.env.NODE_ENV === 'development' && details) {
    response.details = details;
  }

  return response;
};

// Helper function for success responses
const createSuccessResponse = (data, successMessages = []) => {
  return createApiResponse(true, data, { success: Array.isArray(successMessages) ? successMessages : [successMessages] });
};

// Load environment variables from .env file
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
// Environment variables loaded from .env file

// Import metadata storage (SQLite-based, local storage)
const MetadataStorage = require('./utils/metadataStorageSqlite');
const metadataStorage = new MetadataStorage();

// Metadata is stored locally in SQLite (no SQL Server connection needed for metadata)
const metadataMode = 'sql'; // Always use SQLite for metadata storage


const app = express();
const PORT = process.env.PORT || (process.env.npm_lifecycle_event === 'dev' ? 3001 : 3000);

// Middleware
app.use(cors());
app.use(express.json());

// Prevent browser caching of API responses - always return fresh data
app.use('/api', (req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  next();
});

// Handle Chrome DevTools Protocol discovery (prevents CSP console errors for all users)
// Chrome DevTools automatically checks for this endpoint when DevTools is opened
// Returning a proper response prevents confusing console errors for end users
app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => {
  // Return empty JSON - this satisfies Chrome's request without enabling the feature
  // This prevents CSP violations and console errors for users who open DevTools
  res.status(200).json({});
});

// Session storage for authenticated users (in-memory, cleared on server restart)
// Key: session token (random UUID), Value: { authenticated: true, timestamp: Date }
const authenticatedSessions = new Map();
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours

// Generate session token
function generateSessionToken() {
  return require('crypto').randomUUID();
}

// Clean up expired sessions
function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [token, session] of authenticatedSessions.entries()) {
    if (now - session.timestamp > SESSION_TIMEOUT) {
      authenticatedSessions.delete(token);
    }
  }
}

// Run cleanup every hour
const sessionCleanupInterval = setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

// Cleanup function for tests
function cleanupTimers() {
  if (sessionCleanupInterval) {
    clearInterval(sessionCleanupInterval);
  }
}

// Password check middleware (UI Security - protects access to SQL Parrot UI)
async function requirePasswordAuth(req, res, next) {
  // Skip auth for auth endpoints and health check
  if (req.path.startsWith('/api/auth/') || req.path === '/api/health') {
    return next();
  }

  // Skip auth for static files
  if (!req.path.startsWith('/api/')) {
    return next();
  }

  try {
    // Check password status
    const passwordStatus = await metadataStorage.getPasswordStatus();

    // If password not set or skipped, allow access
    if (!passwordStatus.success || passwordStatus.status === 'not-set' || passwordStatus.status === 'skipped') {
      return next();
    }

    // Check for session token
    const sessionToken = req.headers['x-session-token'] || req.cookies?.sessionToken;

    if (sessionToken && authenticatedSessions.has(sessionToken)) {
      const session = authenticatedSessions.get(sessionToken);
      // Check if session expired
      if (Date.now() - session.timestamp < SESSION_TIMEOUT) {
        // Update timestamp
        session.timestamp = Date.now();
        return next();
      } else {
        authenticatedSessions.delete(sessionToken);
      }
    }

    // No valid session - require password
    return res.status(401).json(createErrorResponse('Authentication required', 401));
  } catch (error) {
    console.error('Error in password auth middleware:', error);
    return res.status(500).json(createErrorResponse('Authentication check failed', 500));
  }
}

app.use(requirePasswordAuth);

// API routes will be defined here

// Data file paths - REMOVED: No longer using JSON files

// Initialize SQLite metadata storage
// Track initialization state
let isInitialized = false;
let initializationError = null;

async function initializeMetadataStorage() {
  if (isInitialized) return true;

  try {
    // Initialize SQLite database and tables
    await metadataStorage.initialize();
    isInitialized = true;
    initializationError = null;
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize metadata storage:', error.message);
    initializationError = error.message;
    isInitialized = false;
    throw error;
  }
}

// Check if backend is ready to serve requests
function isBackendReady() {
  return isInitialized;
}

// Get current initialization status
function getInitializationStatus() {
  return {
    initialized: isInitialized,
    error: initializationError
  };
}

// Helper functions - REMOVED: No longer using JSON files

async function addToHistory(operation) {
  try {
    const historyEntry = {
      ...operation,
      timestamp: new Date().toISOString()
    };

    // Add to SQL Server metadata storage
    await metadataStorage.addHistoryEntry(historyEntry);
  } catch (error) {
    console.error('Failed to add history entry:', error.message);
  }
}

// Snapshot management functions
async function getSnapshotsData() {
  try {
    const snapshots = await metadataStorage.getAllSnapshots();
    return { snapshots, metadata: { version: "1.0", lastUpdated: new Date().toISOString() } };
  } catch (error) {
    console.error('Error getting snapshots from metadata storage:', error);
    return { snapshots: [], metadata: { version: "1.0", lastUpdated: null } };
  }
}

function generateSnapshotId(groupName, snapshotName, timestamp = null) {
  const crypto = require('crypto');

  // Clean group name: lowercase, no spaces or special characters
  // Handle undefined/null groupName gracefully
  const cleanGroupName = (groupName || 'sf').toLowerCase().replace(/[^a-z0-9]/g, '');

  // Create a unique hash from snapshot name + timestamp
  const timeStr = timestamp || new Date().toISOString();
  const hashInput = `${snapshotName}_${timeStr}`;
  const hash = crypto.createHash('sha256').update(hashInput).digest('hex').substring(0, 8);

  return `${cleanGroupName}_${hash}`;
}

function generateDisplayName(snapshotName) {
  // Convert user input to display-friendly name
  return snapshotName.trim();
}

async function getNextSequenceForGroup(groupId) {
  // Use metadataStorage method for proper sequence calculation
  return metadataStorage.getNextSequence(groupId);
}

async function deleteAllSnapshots() {
  try {
    const config = await getSqlConfig();
    if (!config) {
      throw new Error('No SQL Server configuration found');
    }

    const pool = await sql.connect(config);

    // Get all snapshot databases
    const result = await pool.request().query(`
      SELECT name
      FROM sys.databases
      WHERE source_database_id IS NOT NULL
    `);

    const deletedSnapshots = [];
    for (const db of result.recordset) {
      try {
        await pool.request().query(`DROP DATABASE [${db.name}]`);
        deletedSnapshots.push(db.name);
      } catch (error) {
        console.error(`Error deleting snapshot ${db.name}:`, error.message);
      }
    }

    await pool.close();

    return deletedSnapshots;
  } catch (error) {
    console.error('Error deleting all snapshots:', error);
    throw error;
  }
}

async function deleteGroupSnapshots(groupId) {
  try {
    const snapshotsData = await getSnapshotsData();
    const groupSnapshots = snapshotsData.snapshots.filter(s => s.groupId === groupId);

    if (groupSnapshots.length === 0) {
      return { deletedCount: 0, deletedSnapshots: [] };
    }

    const config = await getSqlConfig();
    if (!config) {
      throw new Error('No SQL Server configuration found');
    }

    const pool = await sql.connect(config);
    const deletedSnapshots = [];

    for (const snapshot of groupSnapshots) {
      for (const dbSnapshot of snapshot.databaseSnapshots) {
        try {
          await pool.request().query(`DROP DATABASE [${dbSnapshot.snapshotName}]`);
          deletedSnapshots.push(dbSnapshot.snapshotName);
        } catch (error) {
          console.error(`Error deleting snapshot ${dbSnapshot.snapshotName}:`, error.message);
        }
      }
    }

    await pool.close();

    return { deletedCount: deletedSnapshots.length, deletedSnapshots };
  } catch (error) {
    console.error('Error deleting group snapshots:', error);
    throw error;
  }
}

async function cleanupStaleSqlMetadata() {
  try {
    const verification = await verifySnapshotConsistency();

    if (verification.verified) {
      return { cleaned: 0, staleSnapshots: [] };
    }

    // Clean up both missing metadata entries AND inaccessible snapshots
    let cleanedCount = 0;
    const cleanedSnapshots = [];

    // Clean up stale metadata entries (snapshots in metadata that don't exist in SQL Server)
    if (verification.missingInSQL && verification.missingInSQL.length > 0) {

      // Get all snapshots from metadata to find the snapshot IDs
      const snapshotsData = await getSnapshotsData();
      const snapshotIdMap = new Map();

      snapshotsData.snapshots.forEach(snapshot => {
        snapshot.databaseSnapshots.forEach(dbSnapshot => {
          if (dbSnapshot.success && dbSnapshot.snapshotName) {
            // Map full snapshot name to snapshot ID
            snapshotIdMap.set(dbSnapshot.snapshotName, snapshot.id);
          }
        });
      });

      for (const snapshotName of verification.missingInSQL) {
        try {
          const snapshotId = snapshotIdMap.get(snapshotName);
          if (snapshotId) {
            const deleteResult = await metadataStorage.deleteSnapshot(snapshotId);
            if (deleteResult.success) {
              cleanedCount++;
              cleanedSnapshots.push(snapshotName);
            }
          }
        } catch (error) {
          console.error(`Failed to remove stale snapshot entry ${snapshotName}:`, error.message);
        }
      }
    }

    // Clean up inaccessible snapshots (snapshots that exist in SQL Server but are broken)
    if (verification.inaccessibleSnapshots && verification.inaccessibleSnapshots.length > 0) {
      const config = await getFreshSqlConfig();
      if (config) {
        const pool = await sql.connect(config);

        for (const snapshotName of verification.inaccessibleSnapshots) {
          try {
            await pool.request().query(`DROP DATABASE [${snapshotName}]`);
            cleanedCount++;
            cleanedSnapshots.push(snapshotName);
          } catch (error) {
            console.error(`Failed to drop inaccessible snapshot ${snapshotName}:`, error.message);
          }
        }

        await pool.close();
      }
    }

    if (cleanedCount > 0) {
      await addToHistory({
        type: 'cleanup_stale_metadata',
        deletedCount: cleanedCount,
        message: `Cleaned up ${cleanedCount} stale/inaccessible snapshots`
      });
    }

    return { cleaned: cleanedCount, staleSnapshots: cleanedSnapshots };
  } catch (error) {
    console.error('Error cleaning up stale SQL metadata:', error);
    throw error;
  }
}

async function verifySnapshotConsistency() {
  try {
    const config = await getFreshSqlConfig();
    if (!config) {
      return { verified: true, issues: [] };
    }

    const pool = await sql.connect(config);

    // Get all snapshot databases from SQL Server
    const sqlResult = await pool.request().query(`
      SELECT name, create_date, state_desc
      FROM sys.databases
      WHERE source_database_id IS NOT NULL
    `);

    // Get all snapshots from our SQL metadata
    const snapshotsData = await getSnapshotsData();
    const metadataSnapshots = snapshotsData.snapshots;

    const issues = [];
    let needsCleanup = false;
    let autoCleanedCount = 0;

    // Check 1: Find snapshots in SQL Server that are not in our SQL metadata
    const sqlSnapshotNames = sqlResult.recordset.map(row => row.name);
    const metadataSnapshotNames = [];

    metadataSnapshots.forEach(snapshot => {
      snapshot.databaseSnapshots.forEach(dbSnapshot => {
        if (dbSnapshot.success && dbSnapshot.snapshotName) {
          metadataSnapshotNames.push(dbSnapshot.snapshotName);
        }
      });
    });

    const orphanedInSQL = sqlSnapshotNames.filter(name => !metadataSnapshotNames.includes(name));
    if (orphanedInSQL.length > 0) {
      issues.push(`Found ${orphanedInSQL.length} snapshots in SQL Server not tracked in metadata: ${orphanedInSQL.join(', ')}`);
      needsCleanup = true;
    }

    // Check 2: Find snapshots in SQL metadata that don't exist in SQL Server - AUTO CLEANUP
    const missingInSQL = metadataSnapshotNames.filter(name => !sqlSnapshotNames.includes(name));
    if (missingInSQL.length > 0) {

      // Get all snapshots from metadata to find the snapshot IDs
      const snapshotIdMap = new Map();
      snapshotsData.snapshots.forEach(snapshot => {
        snapshot.databaseSnapshots.forEach(dbSnapshot => {
          if (dbSnapshot.success && dbSnapshot.snapshotName) {
            snapshotIdMap.set(dbSnapshot.snapshotName, snapshot.id);
          }
        });
      });

      // Auto-clean stale metadata entries
      for (const snapshotName of missingInSQL) {
        try {
          const snapshotId = snapshotIdMap.get(snapshotName);
          if (snapshotId) {
            const deleteResult = await metadataStorage.deleteSnapshot(snapshotId);
            if (deleteResult.success) {
              autoCleanedCount++;
            }
          }
        } catch (error) {
          console.error(`❌ Failed to auto-remove stale snapshot entry ${snapshotName}:`, error.message);
        }
      }

      if (autoCleanedCount > 0) {
        issues.push(`Auto-cleaned ${autoCleanedCount} stale metadata entries that don't exist in SQL Server`);
        await addToHistory({
          type: 'auto_cleanup_stale_metadata',
          deletedCount: autoCleanedCount,
          message: `Auto-cleaned ${autoCleanedCount} stale snapshot entries from metadata`
        });
      }
    }

    // Check 3: Verify snapshot accessibility (files exist) - REMOVED
    // We should NOT be checking file accessibility - if SQL Server says they exist in sys.databases, that's enough
    const inaccessibleSnapshots = [];

    await pool.close();

    if (needsCleanup || autoCleanedCount > 0) {
      return { verified: false, issues, orphanedInSQL, missingInSQL: [], inaccessibleSnapshots };
    } else {
      return { verified: true, issues: [] };
    }

  } catch (error) {
    console.error('Error verifying snapshot consistency:', error);
    return { verified: false, issues: [`Verification failed: ${error.message}`] };
  }
}

async function cleanupOrphanedSnapshots() {
  try {
    // First verify consistency
    const verification = await verifySnapshotConsistency();

    if (verification.verified) {
      return { cleaned: 0, orphans: [] };
    }

    const config = await getFreshSqlConfig();
    if (!config) {
      return { cleaned: 0, orphans: [] };
    }

    const pool = await sql.connect(config);
    const cleanedSnapshots = [];
    const orphanedSnapshots = [];

    // Track orphaned snapshots (snapshots in SQL Server not tracked in metadata)
    if (verification.orphanedInSQL && verification.orphanedInSQL.length > 0) {
      orphanedSnapshots.push(...verification.orphanedInSQL);
    }

    // Clean up inaccessible snapshots
    if (verification.inaccessibleSnapshots && verification.inaccessibleSnapshots.length > 0) {
      for (const snapshotName of verification.inaccessibleSnapshots) {
        try {
          await pool.request().query(`DROP DATABASE [${snapshotName}]`);
          cleanedSnapshots.push(snapshotName);
        } catch (error) {
          console.error(`❌ Failed to drop inaccessible snapshot ${snapshotName}:`, error.message);
        }
      }
    }

    await pool.close();

    if (cleanedSnapshots.length > 0) {
      await addToHistory({
        type: 'startup_orphan_cleanup',
        deletedCount: cleanedSnapshots.length,
        deletedSnapshots: cleanedSnapshots.slice(0, 10)
      });

      // Startup cleanup completed
    } else {
      // Startup cleanup completed
    }

    return { cleaned: cleanedSnapshots.length, orphans: orphanedSnapshots };
  } catch (error) {
    console.error('Error during startup orphan cleanup:', error);
    return { cleaned: 0, orphans: [], error: error.message };
  }
}

// SQL Server connection
let sqlConfig = null;

/**
 * Resolves environment variable references in profile values.
 * Supports ${VAR_NAME} syntax with fallback logic:
 * - ${SQL_SERVER_1} will use SQL_SERVER_1 if set, otherwise falls back to SQL_SERVER
 * - ${SQL_SERVER_2} requires SQL_SERVER_2 to be set (no fallback)
 *
 * @param {string} value - The profile value that may contain ${VAR_NAME} references
 * @param {string} fieldName - Name of the field (for error messages)
 * @returns {string} - Resolved value with env vars substituted
 * @throws {Error} - If a required env var is missing
 */
function resolveEnvVarSubstitution(value, fieldName = 'field') {
  if (!value || typeof value !== 'string') {
    return value;
  }

  // Match ${VAR_NAME} patterns
  const envVarPattern = /\$\{([^}]+)\}/g;
  let result = value;
  const missingVars = [];

  result = result.replace(envVarPattern, (match, varName) => {
    // Check if the exact variable exists
    if (process.env[varName] !== undefined) {
      return process.env[varName];
    }

    // For numbered variables (e.g., SQL_SERVER_1), try fallback to base name
    const numberedMatch = varName.match(/^(.+)_(\d+)$/);
    if (numberedMatch) {
      const [, baseName, number] = numberedMatch;
      // Only fallback for _1, not _2, _3, etc.
      if (number === '1' && process.env[baseName] !== undefined) {
        return process.env[baseName];
      }
    }

    // Variable not found
    missingVars.push(varName);
    return match; // Return original match so we can detect it
  });

  // Check if any substitutions failed
  if (missingVars.length > 0) {
    const missingList = missingVars.map(v => `\${${v}}`).join(', ');
    throw new Error(
      `Environment variable(s) not found for ${fieldName}: ${missingList}. ` +
      `Please ensure these variables are set in your .env file or environment.`
    );
  }

  return result;
}

async function getSqlConfig() {
  if (!sqlConfig) {
    try {
      // Try to get active profile from SQLite first
      const profile = metadataStorage.getActiveProfile();

      if (profile) {
        // Resolve environment variable substitutions in profile values
        const resolvedHost = resolveEnvVarSubstitution(profile.host, 'host');
        const resolvedUsername = resolveEnvVarSubstitution(profile.username, 'username');
        const resolvedPassword = resolveEnvVarSubstitution(profile.password, 'password');
        const resolvedTrustCert = resolveEnvVarSubstitution(
          profile.trustCertificate?.toString() || 'true',
          'trustCertificate'
        );

        sqlConfig = {
          server: resolvedHost,
          port: parseInt(profile.port) || 1433,
          user: resolvedUsername,
          password: resolvedPassword,
          database: 'master',
          options: {
            encrypt: false,
            trustServerCertificate: resolvedTrustCert === 'true' || resolvedTrustCert === true
          }
        };
      } else {
        // Fallback to environment variables (for backward compatibility)
        sqlConfig = {
          server: process.env.SQL_SERVER || 'localhost',
          port: parseInt(process.env.SQL_PORT) || 1433,
          user: process.env.SQL_USERNAME || '',
          password: process.env.SQL_PASSWORD || '',
          database: 'master',
          options: {
            encrypt: false,
            trustServerCertificate: process.env.SQL_TRUST_CERTIFICATE === 'true' || true
          }
        };
      }
    } catch (error) {
      console.error('Error getting SQL config:', error);
      // Re-throw if it's an env var substitution error
      if (error.message.includes('Environment variable(s) not found')) {
        throw error;
      }
      // Final fallback to environment variables only
      sqlConfig = {
        server: process.env.SQL_SERVER || 'localhost',
        port: parseInt(process.env.SQL_PORT) || 1433,
        user: process.env.SQL_USERNAME || '',
        password: process.env.SQL_PASSWORD || '',
        database: 'master',
        options: {
          encrypt: false,
          trustServerCertificate: process.env.SQL_TRUST_CERTIFICATE === 'true' || true
        }
      };
    }
  }
  return sqlConfig;
}

// Force fresh SQL config for unmanaged snapshots
async function getFreshSqlConfig() {
  try {
    // Get active profile from SQLite
    const profile = metadataStorage.getActiveProfile();

    if (profile) {
      // Resolve environment variable substitutions in profile values
      const resolvedHost = resolveEnvVarSubstitution(profile.host, 'host');
      const resolvedUsername = resolveEnvVarSubstitution(profile.username, 'username');
      const resolvedPassword = resolveEnvVarSubstitution(profile.password, 'password');
      const resolvedTrustCert = resolveEnvVarSubstitution(
        profile.trustCertificate?.toString() || 'true',
        'trustCertificate'
      );

      return {
        server: resolvedHost,
        port: parseInt(profile.port) || 1433,
        user: resolvedUsername,
        password: resolvedPassword,
        database: 'master',
        options: {
          encrypt: false,
          trustServerCertificate: resolvedTrustCert === 'true' || resolvedTrustCert === true
        }
      };
    } else {
      // Fallback to environment variables
      return {
        server: process.env.SQL_SERVER || 'localhost',
        port: parseInt(process.env.SQL_PORT) || 1433,
        user: process.env.SQL_USERNAME || '',
        password: process.env.SQL_PASSWORD || '',
        database: 'master',
        options: {
          encrypt: false,
          trustServerCertificate: process.env.SQL_TRUST_CERTIFICATE === 'true' || true
        }
      };
    }
  } catch (error) {
    console.error('Error getting fresh SQL config:', error);
    // Re-throw if it's an env var substitution error
    if (error.message.includes('Environment variable(s) not found')) {
      throw error;
    }
    // Final fallback to environment variables only
    return {
      server: process.env.SQL_SERVER || 'localhost',
      port: parseInt(process.env.SQL_PORT) || 1433,
      user: process.env.SQL_USERNAME || '',
      password: process.env.SQL_PASSWORD || '',
      database: 'master',
      options: {
        encrypt: false,
        trustServerCertificate: process.env.SQL_TRUST_CERTIFICATE === 'true' || true
      }
    };
  }
}

// Note: File Management API helpers removed - external file API no longer supported

// Routes

// Health check endpoint - checks both metadata storage and SQL Server connection
app.get('/api/health', async (req, res) => {
  // If not initialized, try to initialize now
  if (!isInitialized) {
    try {
      await initializeMetadataStorage();
    } catch (error) {
      return res.status(503).json({
        status: 'error',
        initialized: false,
        connected: false,
        message: error.message
      });
    }
  }

  // Re-check after initialization attempt
  if (!isInitialized) {
    return res.status(503).json({
      status: 'error',
      initialized: false,
      connected: false,
      message: initializationError || 'Metadata storage not available'
    });
  }

  // Check SQL Server connection
  let sqlConnected = false;
  let sqlError = null;
  try {
    const config = await getFreshSqlConfig();
    if (config && config.user) {
      const pool = await sql.connect(config);
      await pool.request().query('SELECT 1 as test');
      await pool.close();
      sqlConnected = true;
    } else {
      sqlError = 'No active profile with username configured';
    }
  } catch (error) {
    console.error('[/api/health] SQL connection error:', error.message);
    sqlError = error.message;
  }

  res.json({
    status: sqlConnected ? 'ok' : 'degraded',
    initialized: true,
    connected: sqlConnected,
    metadataStorage: 'ready',
    sqlServer: sqlConnected ? 'connected' : 'disconnected',
    sqlError: sqlError,
    message: sqlConnected
      ? 'All systems operational'
      : 'SQL Server not configured or unreachable - configure in Settings'
  });
});

// ===== UI Security Authentication Endpoints =====
// These endpoints protect access to SQL Parrot UI (NOT database profile passwords)

// Get password status
app.get('/api/auth/password-status', async (req, res) => {
  try {
    const passwordStatus = await metadataStorage.getPasswordStatus();

    if (!passwordStatus.success) {
      return res.status(500).json(createErrorResponse('Failed to get password status', 500));
    }

    // Check if UI_PASSWORD env var is being ignored
    let envVarIgnored = false;
    if (process.env.UI_PASSWORD && passwordStatus.passwordSet) {
      // Compare env var password with stored hash
      try {
        const settingsResult = await metadataStorage.getSettings();
        const settings = settingsResult.success ? settingsResult.settings : {};
        const storedHash = settings.passwordHash;

        if (storedHash) {
          const envVarMatches = await bcrypt.compare(process.env.UI_PASSWORD, storedHash);
          if (!envVarMatches) {
            envVarIgnored = true;
          }
        }
      } catch (error) {
        console.error('Error checking env var password:', error);
      }
    }

    const response = {
      status: passwordStatus.status,
      passwordSet: passwordStatus.passwordSet,
      passwordSkipped: passwordStatus.passwordSkipped,
      envVarIgnored
    };

    const messages = {};
    if (envVarIgnored) {
      messages.warning = ['UI_PASSWORD in environment variables is being ignored because a password was already set via the UI. Remove UI_PASSWORD from your .env/docker-compose.yml or reset the SQLite database to use it.'];
    }

    res.json(createApiResponse(true, response, messages));
  } catch (error) {
    console.error('Error getting password status:', error);
    res.status(500).json(createErrorResponse('Failed to get password status', 500));
  }
});

// Check password (verify and create session)
app.post('/api/auth/check-password', async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json(createErrorResponse('Password is required', 400));
    }

    const passwordStatus = await metadataStorage.getPasswordStatus();

    if (!passwordStatus.passwordSet) {
      return res.status(400).json(createErrorResponse('Password not set', 400));
    }

    // Get stored hash
    const settingsResult = await metadataStorage.getSettings();
    const settings = settingsResult.success ? settingsResult.settings : {};
    const storedHash = settings.passwordHash;

    if (!storedHash) {
      return res.status(500).json(createErrorResponse('Password hash not found', 500));
    }

    // Verify password
    const isValid = await bcrypt.compare(password, storedHash);

    if (!isValid) {
      return res.status(401).json(createErrorResponse('Invalid password', 401));
    }

    // Create session token
    const sessionToken = generateSessionToken();
    authenticatedSessions.set(sessionToken, {
      authenticated: true,
      timestamp: Date.now()
    });

    res.json(createSuccessResponse(
      { authenticated: true, sessionToken },
      ['Password verified']
    ));
  } catch (error) {
    console.error('Error checking password:', error);
    res.status(500).json(createErrorResponse('Password verification failed', 500));
  }
});

// Set password (initial setup only)
app.post('/api/auth/set-password', async (req, res) => {
  try {
    const { password, confirm } = req.body;

    if (!password || !confirm) {
      return res.status(400).json(createErrorResponse('Password and confirmation are required', 400));
    }

    if (password !== confirm) {
      return res.status(400).json(createErrorResponse('Passwords do not match', 400));
    }

    if (password.length < 6) {
      return res.status(400).json(createErrorResponse('Password must be at least 6 characters', 400));
    }

    // Check if password already exists
    const passwordStatus = await metadataStorage.getPasswordStatus();
    if (passwordStatus.passwordSet) {
      return res.status(400).json(createErrorResponse('Password already set. Use change-password endpoint instead.', 400));
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Store hash
    const result = await metadataStorage.setPasswordHash(passwordHash);

    if (!result.success) {
      return res.status(500).json(createErrorResponse('Failed to set password', 500));
    }

    res.json(createSuccessResponse(
      { passwordSet: true },
      ['Password set successfully']
    ));
  } catch (error) {
    console.error('Error setting password:', error);
    res.status(500).json(createErrorResponse('Failed to set password', 500));
  }
});

// Change password (requires current password)
app.post('/api/auth/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword, confirm } = req.body;

    if (!currentPassword || !newPassword || !confirm) {
      return res.status(400).json(createErrorResponse('Current password, new password, and confirmation are required', 400));
    }

    if (newPassword !== confirm) {
      return res.status(400).json(createErrorResponse('New passwords do not match', 400));
    }

    if (newPassword.length < 6) {
      return res.status(400).json(createErrorResponse('Password must be at least 6 characters', 400));
    }

    // Verify current password
    const passwordStatus = await metadataStorage.getPasswordStatus();
    if (!passwordStatus.passwordSet) {
      return res.status(400).json(createErrorResponse('Password not set. Use set-password endpoint instead.', 400));
    }

    const settingsResult = await metadataStorage.getSettings();
    const settings = settingsResult.success ? settingsResult.settings : {};
    const storedHash = settings.passwordHash;

    if (!storedHash) {
      return res.status(500).json(createErrorResponse('Password hash not found', 500));
    }

    const currentPasswordValid = await bcrypt.compare(currentPassword, storedHash);
    if (!currentPasswordValid) {
      return res.status(401).json(createErrorResponse('Current password is incorrect', 401));
    }

    // Hash new password
    const saltRounds = 10;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update hash
    const result = await metadataStorage.setPasswordHash(newPasswordHash);

    if (!result.success) {
      return res.status(500).json(createErrorResponse('Failed to change password', 500));
    }

    res.json(createSuccessResponse(
      { passwordChanged: true },
      ['Password changed successfully']
    ));
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json(createErrorResponse('Failed to change password', 500));
  }
});

// Remove password protection (requires current password)
app.post('/api/auth/remove-password', async (req, res) => {
  try {
    const { currentPassword } = req.body;

    if (!currentPassword) {
      return res.status(400).json(createErrorResponse('Current password is required', 400));
    }

    // Verify current password
    const passwordStatus = await metadataStorage.getPasswordStatus();
    if (!passwordStatus.passwordSet) {
      return res.status(400).json(createErrorResponse('Password not set', 400));
    }

    const settingsResult = await metadataStorage.getSettings();
    const settings = settingsResult.success ? settingsResult.settings : {};
    const storedHash = settings.passwordHash;

    if (!storedHash) {
      return res.status(500).json(createErrorResponse('Password hash not found', 500));
    }

    const currentPasswordValid = await bcrypt.compare(currentPassword, storedHash);
    if (!currentPasswordValid) {
      return res.status(401).json(createErrorResponse('Current password is incorrect', 401));
    }

    // Remove password
    const result = await metadataStorage.removePassword();

    if (!result.success) {
      return res.status(500).json(createErrorResponse('Failed to remove password', 500));
    }

    res.json(createSuccessResponse(
      { passwordRemoved: true },
      ['Password protection removed']
    ));
  } catch (error) {
    console.error('Error removing password:', error);
    res.status(500).json(createErrorResponse('Failed to remove password', 500));
  }
});

// Skip password protection (first launch only)
app.post('/api/auth/skip-password', async (req, res) => {
  try {
    // Check if password already exists
    const passwordStatus = await metadataStorage.getPasswordStatus();
    if (passwordStatus.passwordSet) {
      return res.status(400).json(createErrorResponse('Password already set. Cannot skip.', 400));
    }

    // Skip password
    const result = await metadataStorage.skipPassword();

    if (!result.success) {
      return res.status(500).json(createErrorResponse('Failed to skip password', 500));
    }

    res.json(createSuccessResponse(
      { skipped: true },
      ['Password protection skipped']
    ));
  } catch (error) {
    console.error('Error skipping password:', error);
    res.status(500).json(createErrorResponse('Failed to skip password', 500));
  }
});

// Get all groups
app.get('/api/groups', async (req, res) => {
  try {
    // Get groups from SQL Server metadata storage
    const groups = await metadataStorage.getAllGroups();
    res.json(createSuccessResponse({ groups }));
  } catch (error) {
    console.error('Error reading groups:', error);
    res.status(500).json(createErrorResponse(
      `Failed to load groups: ${error.message}`,
      500,
      error.stack
    ));
  }
});

// Create a new group
app.post('/api/groups', async (req, res) => {
  try {
    const { name, databases } = req.body;

    // Use database-based groups
    try {
      // Get existing groups for validation
      const dbResult = await metadataStorage.getGroups();
      if (!dbResult.success) {
        return res.status(500).json(createErrorResponse(
          `Failed to access groups database: ${dbResult.error || 'Unknown error'}`,
          500,
          dbResult.details
        ));
      }

      const existingGroups = dbResult.groups || [];

      // Check for duplicate group name
      const existingGroup = existingGroups.find(g => g.name.toLowerCase() === name.toLowerCase());
      if (existingGroup) {
        return res.status(400).json(createErrorResponse(
          `Group name '${name}' already exists. Cannot create a duplicate group.`
        ));
      }

      // Check for overlapping databases
      const overlappingDatabases = [];
      existingGroups.forEach(group => {
        group.databases.forEach(dbName => {
          if (databases.includes(dbName)) {
            overlappingDatabases.push({ database: dbName, group: group.name });
          }
        });
      });

      if (overlappingDatabases.length > 0) {
        const overlappingList = overlappingDatabases
          .map(item => `${item.database} (in "${item.group}")`)
          .join(', ');
        return res.status(400).json(createErrorResponse(
          `The following databases are already assigned to other groups: ${overlappingList}`
        ));
      }

      const newGroup = {
        id: `group-${Date.now()}`,
        name,
        databases: databases || []
      };

      const createResult = await metadataStorage.createGroup(newGroup);
      if (!createResult.success) {
        return res.status(500).json(createErrorResponse(
          `Failed to create group in database: ${createResult.error || 'Unknown error'}`,
          500,
          createResult.details
        ));
      }

      await addToHistory({
        type: 'create_group',
        groupName: name,
        databaseCount: databases?.length || 0
      });

      res.json(createSuccessResponse(newGroup, [`Group '${name}' created successfully`]));
    } catch (error) {
      console.error('Error creating group in database:', error);
      return res.status(500).json(createErrorResponse(
        `Failed to create group in database: ${error.message}`,
        500,
        error.stack
      ));
    }
  } catch (error) {
    console.error('Error creating group:', error);
    res.status(500).json(createErrorResponse(
      `Failed to create group: ${error.message}`,
      500,
      error.stack
    ));
  }
});

// Update a group
app.put('/api/groups/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, databases, deleteSnapshots = false } = req.body;
    const groups = await metadataStorage.getAllGroups();

    const groupIndex = groups.findIndex(g => g.id === id);
    if (groupIndex === -1) {
      return res.status(404).json(createErrorResponse(
        'Group not found. It may have been deleted by another user.',
        404
      ));
    }

    const originalGroup = groups[groupIndex];

    // Check for duplicate group name (excluding current group)
    const existingGroup = groups.find(g => g.id !== id && g.name.toLowerCase() === name.toLowerCase());
    if (existingGroup) {
      return res.status(400).json(createErrorResponse(
        `Group name '${name}' already exists. Please choose a different name.`
      ));
    }

    // Check for overlapping databases (excluding current group)
    const overlappingDatabases = [];
    groups.forEach(group => {
      if (group.id === id) return; // Skip current group
      group.databases.forEach(dbName => {
        if (databases.includes(dbName)) {
          overlappingDatabases.push({ database: dbName, group: group.name });
        }
      });
    });

    if (overlappingDatabases.length > 0) {
      const overlappingList = overlappingDatabases
        .map(item => `${item.database} (in "${item.group}")`)
        .join(', ');
      return res.status(400).json(createErrorResponse(
        `The following databases are already assigned to other groups: ${overlappingList}`
      ));
    }

    // Check if snapshots exist and database members were changed
    const snapshotsData = await getSnapshotsData();
    const groupSnapshots = snapshotsData.snapshots.filter(s => s.groupId === id);
    const hasSnapshots = groupSnapshots.length > 0;

    const nameChanged = originalGroup.name !== name;
    const databasesChanged = JSON.stringify(originalGroup.databases.sort()) !== JSON.stringify(databases.sort());

    // Only require snapshot deletion when database members change, not when just renaming
    if (hasSnapshots && databasesChanged && !deleteSnapshots) {
      return res.status(400).json({
        error: 'Changing database members requires snapshot deletion',
        requiresConfirmation: true,
        snapshotCount: groupSnapshots.length,
        databaseCount: originalGroup.databases.length,
        totalSnapshots: groupSnapshots.length * originalGroup.databases.length
      });
    }

    // Delete snapshots if confirmed and database members changed
    if (hasSnapshots && databasesChanged && deleteSnapshots) {
      await deleteGroupSnapshots(id);
    }

    // Update group using SQL metadata storage
    const updatedGroup = { ...groups[groupIndex], name, databases };
    const updateResult = await metadataStorage.updateGroup(id, updatedGroup);
    if (!updateResult.success) {
      return res.status(500).json(createErrorResponse(
        `Failed to update group: ${updateResult.error || 'Unknown error'}`,
        500,
        updateResult.details
      ));
    }

    await addToHistory({
      type: 'update_group',
      groupName: name,
      databaseCount: databases?.length || 0,
      snapshotsDeleted: hasSnapshots && databasesChanged && deleteSnapshots ? groupSnapshots.length : 0
    });

    const successMessage = hasSnapshots && databasesChanged && deleteSnapshots
      ? `Group '${name}' updated successfully and ${groupSnapshots.length} snapshots were deleted`
      : `Group '${name}' updated successfully`;

    res.json(createSuccessResponse(updatedGroup, [successMessage]));
  } catch (error) {
    console.error('Error updating group:', error);
    res.status(500).json(createErrorResponse(
      'Failed to update group due to an internal server error',
      500
    ));
  }
});

// Delete a group
app.delete('/api/groups/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (metadataMode === 'sql') {
      // Use database-based groups
      try {
        // Get the group first to get its details
        const dbResult = await metadataStorage.getGroups();
        if (!dbResult.success) {
          return res.status(500).json(createErrorResponse('Failed to access groups database'));
        }

        const existingGroups = dbResult.groups || [];
        const groupToDelete = existingGroups.find(g => g.id === id);

        if (!groupToDelete) {
          return res.status(404).json(createErrorResponse(
            'Group not found. It may have already been deleted.',
            404
          ));
        }

        // Delete all snapshots for this group
        const snapshotResult = await deleteGroupSnapshots(id);

        // Delete the group from database
        const deleteResult = await metadataStorage.deleteGroup(id);
        if (!deleteResult.success) {
          return res.status(500).json(createErrorResponse('Failed to delete group from database'));
        }

        await addToHistory({
          type: 'delete_group',
          groupName: groupToDelete.name,
          snapshotsDeleted: snapshotResult.deletedCount
        });

        const successMessage = snapshotResult.deletedCount > 0
          ? `Group '${groupToDelete.name}' deleted successfully along with ${snapshotResult.deletedCount} snapshots`
          : `Group '${groupToDelete.name}' deleted successfully`;

        res.json(createSuccessResponse(
          { snapshotsDeleted: snapshotResult.deletedCount },
          [successMessage]
        ));
        return;
      } catch (error) {
        console.error('Error deleting group from database:', error);
        return res.status(500).json(createErrorResponse('Failed to delete group from database'));
      }
    }

    // Use JSON file approach
    const groups = await metadataStorage.getAllGroups();

    const groupIndex = groups.findIndex(g => g.id === id);
    if (groupIndex === -1) {
      return res.status(404).json(createErrorResponse(
        'Group not found. It may have already been deleted.',
        404
      ));
    }

    const deletedGroup = groups[groupIndex];

    // Delete all snapshots for this group
    const snapshotResult = await deleteGroupSnapshots(id);

    // Delete group using SQL metadata storage
    const deleteResult = await metadataStorage.deleteGroup(id);
    if (!deleteResult.success) {
      return res.status(500).json(createErrorResponse(
        `Failed to delete group: ${deleteResult.error || 'Unknown error'}`,
        500,
        deleteResult.details
      ));
    }

    await addToHistory({
      type: 'delete_group',
      groupName: deletedGroup.name,
      snapshotsDeleted: snapshotResult.deletedCount
    });

    const successMessage = snapshotResult.deletedCount > 0
      ? `Group '${deletedGroup.name}' deleted successfully along with ${snapshotResult.deletedCount} snapshots`
      : `Group '${deletedGroup.name}' deleted successfully`;

    res.json(createSuccessResponse(
      { snapshotsDeleted: snapshotResult.deletedCount },
      [successMessage]
    ));
  } catch (error) {
    console.error('Error deleting group:', error);
    res.status(500).json(createErrorResponse(
      'Failed to delete group due to an internal server error',
      500
    ));
  }
});

// Get operation history
app.get('/api/history', async (req, res) => {
  try {
    const dbResult = await metadataStorage.getHistory();
    if (dbResult.success && dbResult.history) {
      res.json({ operations: dbResult.history });
    } else {
      res.json({ operations: [] });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to read history' });
  }
});

// Clear operation history
app.delete('/api/history', async (req, res) => {
  try {
    const dbResult = await metadataStorage.clearHistory();
    if (dbResult.success) {
      res.json(createSuccessResponse(null, ['History cleared successfully']));
    } else {
      res.status(500).json(createErrorResponse('Failed to clear history'));
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear history' });
  }
});

// Get settings (without sensitive data)
app.get('/api/settings', async (req, res) => {
  try {
    const dbResult = await metadataStorage.getSettings();
    const settings = dbResult.success && dbResult.settings ? dbResult.settings : {};

    // Convert database settings to expected format
    const formattedSettings = {
      preferences: {
        maxHistoryEntries: settings.maxHistoryEntries || 100,
        defaultGroup: settings.defaultGroup || '',
        autoCreateCheckpoint: settings.autoCreateCheckpoint ?? true
      },
      autoVerification: {
        enabled: settings.autoVerificationEnabled || false,
        intervalMinutes: settings.autoVerificationIntervalMinutes || 15
      },
      connection: {
        server: '',
        port: 1433,
        username: '***masked***',
        password: '***masked***',
        trustServerCertificate: true
      },
      fileApi: {
        configured: false
      },
      environment: {
        userName: metadataStorage.userName
      }
    };

    res.json(formattedSettings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read settings' });
  }
});

// Update settings (only non-sensitive data)
app.put('/api/settings', async (req, res) => {
  try {
    const settings = req.body;

    if (metadataMode === 'sql') {
      // Use database-based settings
      try {
        // Get current settings to check for maxHistoryEntries change and preserve password fields
        const currentDbResult = await metadataStorage.getSettings();
        const currentSettings = currentDbResult.settings || {};
        const oldMaxHistoryEntries = currentSettings.maxHistoryEntries || 100;
        const newMaxHistoryEntries = settings.preferences?.maxHistoryEntries || 100;

        // Convert settings to database format, preserving password fields
        const dbSettings = {
          maxHistoryEntries: settings.preferences?.maxHistoryEntries || 100,
          defaultGroup: settings.preferences?.defaultGroup || '',
          autoCreateCheckpoint: settings.preferences?.autoCreateCheckpoint ?? true,
          autoVerificationEnabled: settings.autoVerification?.enabled || false,
          autoVerificationIntervalMinutes: settings.autoVerification?.intervalMinutes || 15,
          // Preserve password fields (not updated through this endpoint)
          passwordHash: currentSettings.passwordHash || null,
          passwordSkipped: currentSettings.passwordSkipped || false
        };

        const dbResult = await metadataStorage.updateSettings(dbSettings);
        if (dbResult.success) {
          // If maxHistoryEntries decreased, trim the history
          if (newMaxHistoryEntries < oldMaxHistoryEntries) {
            const trimResult = await metadataStorage.trimHistoryEntries(newMaxHistoryEntries);
            if (trimResult.success && trimResult.trimmed > 0) {
            }
          }

          // Return the updated settings
          const responseSettings = {
            preferences: {
              maxHistoryEntries: dbSettings.maxHistoryEntries,
              defaultGroup: dbSettings.defaultGroup,
              autoCreateCheckpoint: dbSettings.autoCreateCheckpoint
            },
            autoVerification: {
              enabled: dbSettings.autoVerificationEnabled,
              intervalMinutes: dbSettings.autoVerificationIntervalMinutes
            },
            connection: {
              server: '',
              port: 1433,
              username: '',
              password: '',
              trustServerCertificate: true
            },
            fileApi: {
              configured: false
            }
          };

          res.json(responseSettings);
          return;
        }
      } catch (error) {
        console.error('❌ Failed to update settings in database:', error.message);
        res.status(500).json({ error: 'Failed to update settings in database' });
      }
    } else {
      // This shouldn't happen - metadataMode is always 'sql'
      res.status(500).json({ error: 'Metadata storage not configured' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Test SQL Server connection
// Accepts connection parameters from request body, or uses active profile if password is empty
app.post('/api/test-connection', async (req, res) => {
  try {
    const { host, port, username, password, trustCertificate, profileId } = req.body;

    let config;

    // Resolve environment variable substitutions in provided values
    let resolvedHost = host;
    let resolvedUsername = username;
    let resolvedPassword = password;
    let resolvedTrustCert = trustCertificate;

    try {
      if (host) resolvedHost = resolveEnvVarSubstitution(host, 'host');
      if (username) resolvedUsername = resolveEnvVarSubstitution(username, 'username');
      if (password) resolvedPassword = resolveEnvVarSubstitution(password, 'password');
      if (trustCertificate !== undefined) {
        const trustCertStr = trustCertificate?.toString() || 'true';
        resolvedTrustCert = resolveEnvVarSubstitution(trustCertStr, 'trustCertificate') === 'true';
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    // If password is empty or whitespace, try to use saved password from profile (either active or the one being edited)
    // Check for empty string, null, undefined, or whitespace-only
    const isEmptyPassword = !resolvedPassword || (typeof resolvedPassword === 'string' && resolvedPassword.trim() === '');

    if (isEmptyPassword && host && port && username) {
      // If profileId is provided (editing mode), prioritize that profile
      if (profileId) {
        const profile = metadataStorage.getProfile(profileId);
        if (profile && profile.password) {
          // Resolve env vars in profile password
          let profilePassword;
          try {
            profilePassword = resolveEnvVarSubstitution(profile.password, 'password');
          } catch (error) {
            return res.status(400).json({
              success: false,
              error: `Profile password references missing environment variable: ${error.message}`
            });
          }
          // When editing, use saved password from the profile being edited
          config = {
            server: resolvedHost,
            port: parseInt(port) || 1433,
            user: resolvedUsername,
            password: profilePassword,
            database: 'master',
            options: {
              encrypt: false,
              trustServerCertificate: resolvedTrustCert !== false
            }
          };
        } else {
          // Profile not found - allow test without password
          config = {
            server: resolvedHost,
            port: parseInt(port) || 1433,
            user: resolvedUsername,
            password: '', // Empty password - let SQL Server handle it
            database: 'master',
            options: {
              encrypt: false,
              trustServerCertificate: resolvedTrustCert !== false
            }
          };
        }
      } else {
        // No profileId - try active profile
        const profile = metadataStorage.getActiveProfile();
        if (profile) {
          // Resolve env vars in profile values for comparison
          let profileHost, profileUsername;
          try {
            profileHost = resolveEnvVarSubstitution(profile.host, 'host');
            profileUsername = resolveEnvVarSubstitution(profile.username, 'username');
          } catch (error) {
            // If profile has env var issues, continue without matching
          }

          if (profile && profileHost === resolvedHost && profile.port === port && profileUsername === resolvedUsername) {
            // Use saved password from active profile if connection details match
            let profilePassword;
            try {
              profilePassword = resolveEnvVarSubstitution(profile.password, 'password');
            } catch (error) {
              return res.status(400).json({
                success: false,
                error: `Active profile password references missing environment variable: ${error.message}`
              });
            }
            config = {
              server: profileHost,
              port: profile.port,
              user: profileUsername,
              password: profilePassword,
              database: 'master',
              options: {
                encrypt: false,
                trustServerCertificate: profile.trustCertificate
              }
            };
          } else {
            // No matching profile found - allow test without password (maybe no password needed)
            config = {
              server: resolvedHost,
              port: parseInt(port) || 1433,
              user: resolvedUsername,
              password: '', // Empty password - let SQL Server handle it
              database: 'master',
              options: {
                encrypt: false,
                trustServerCertificate: resolvedTrustCert !== false
              }
            };
          }
        } else {
          // No active profile - allow test without password
          config = {
            server: resolvedHost,
            port: parseInt(port) || 1433,
            user: resolvedUsername,
            password: '', // Empty password - let SQL Server handle it
            database: 'master',
            options: {
              encrypt: false,
              trustServerCertificate: resolvedTrustCert !== false
            }
          };
        }
      }
    } else if (resolvedHost && port && resolvedUsername && resolvedPassword) {
      // Use provided credentials
      config = {
        server: resolvedHost,
        port: parseInt(port) || 1433,
        user: resolvedUsername,
        password: resolvedPassword,
        database: 'master',
        options: {
          encrypt: false,
          trustServerCertificate: resolvedTrustCert !== false
        }
      };
    } else {
      // Fallback to active profile
      const profile = metadataStorage.getActiveProfile();
      if (!profile) {
        return res.status(400).json({
          success: false,
          error: 'No connection profile configured. Please provide connection details or configure a profile.'
        });
      }
      // Resolve env vars in profile
      let profileHost, profileUsername, profilePassword, profileTrustCert;
      try {
        profileHost = resolveEnvVarSubstitution(profile.host, 'host');
        profileUsername = resolveEnvVarSubstitution(profile.username, 'username');
        profilePassword = resolveEnvVarSubstitution(profile.password, 'password');
        const trustCertStr = profile.trustCertificate?.toString() || 'true';
        profileTrustCert = resolveEnvVarSubstitution(trustCertStr, 'trustCertificate') === 'true';
      } catch (error) {
        return res.status(400).json({
          success: false,
          error: `Active profile references missing environment variable: ${error.message}`
        });
      }
      config = {
        server: profileHost,
        port: profile.port,
        user: profileUsername,
        password: profilePassword,
        database: 'master',
        options: {
          encrypt: false,
          trustServerCertificate: profileTrustCert
        }
      };
    }

    // Allow empty password - SQL Server might not require it (Windows auth, etc.)
    // Only require password if we're not using a saved profile
    if (!config) {
      return res.status(400).json({
        success: false,
        error: 'Connection configuration is required.'
      });
    }

    const pool = await sql.connect(config);

    // Test basic connection and get SQL Server version
    const versionResult = await pool.request().query('SELECT @@VERSION as version');
    const version = versionResult.recordset[0].version.split('\n')[0]; // First line

    // Get database count (user databases only, excluding snapshots)
    let databaseCount = 0;
    try {
      const dbResult = await pool.request().query(`
        SELECT COUNT(*) as database_count
        FROM sys.databases
        WHERE database_id > 4
        AND state = 0  -- Only online databases
        AND source_database_id IS NULL  -- Exclude snapshot databases
      `);
      databaseCount = dbResult.recordset[0].database_count;
    } catch (dbError) {
      // Continue without database count
    }

    await pool.close();

    res.json({
      success: true,
      data: version, // Match Tauri format (returns version string)
      message: databaseCount > 0 ?
        `Connection successful - ${databaseCount} databases found` :
        'Connection successful',
      databaseCount: databaseCount
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get databases list
app.get('/api/databases', async (req, res) => {
  try {
    const config = await getSqlConfig();
    if (!config) {
      return res.status(400).json({ error: 'No SQL Server configuration found' });
    }

    const pool = await sql.connect(config);

    // Get user databases (exclude system databases, snapshots, and sqlparrot metadata database)
    const result = await pool.request().query(`
      SELECT
        name,
        database_id,
        create_date,
        collation_name
      FROM sys.databases
      WHERE database_id > 4  -- Exclude system databases (master, tempdb, model, msdb)
      AND state = 0  -- Only online databases
      AND source_database_id IS NULL  -- Exclude snapshot databases
      AND name != 'sqlparrot'  -- Exclude metadata database
      ORDER BY name
    `);

    await pool.close();

    // Categorize databases
    const databases = result.recordset.map(db => {
      let category = 'User';
      if (db.name.toLowerCase().includes('global')) {
        category = 'Global';
      } else if (db.name.toLowerCase().includes('dw') || db.name.toLowerCase().includes('datawarehouse')) {
        category = 'Data Warehouse';
      }

      return {
        name: db.name,
        category,
        databaseId: db.database_id,
        createDate: db.create_date,
        collation: db.collation_name
      };
    });

    // Sort by category priority, then by name within category
    const categoryOrder = { 'Global': 0, 'User': 1, 'Data Warehouse': 2 };
    databases.sort((a, b) => {
      if (categoryOrder[a.category] !== categoryOrder[b.category]) {
        return categoryOrder[a.category] - categoryOrder[b.category];
      }
      return a.name.localeCompare(b.name);
    });

    res.json({ databases });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get metadata storage status
app.get('/api/metadata/status', async (req, res) => {
  try {
    const status = await metadataStorage.getStatus();
    res.json(createSuccessResponse(status));
  } catch (error) {
    console.error('Error getting metadata status:', error);
    res.status(500).json(createErrorResponse('Failed to get metadata status', 500));
  }
});

// Test metadata storage connection and permissions
app.get('/api/metadata/test', async (req, res) => {
  try {
    const config = await getSqlConfig();
    if (!config) {
      return res.status(400).json(createErrorResponse('No SQL Server configuration found'));
    }

    const pool = await sql.connect(config);

    // Test basic connection
    await pool.request().query('SELECT 1 as test');

    // Test CREATE DATABASE permission
    let canCreateDatabase = false;
    try {
      await pool.request().query(`
        SELECT HAS_PERMS_BY_NAME('master', 'DATABASE', 'CREATE DATABASE') as can_create_db
      `);
      const permResult = await pool.request().query(`
        SELECT HAS_PERMS_BY_NAME('master', 'DATABASE', 'CREATE DATABASE') as can_create_db
      `);
      canCreateDatabase = permResult.recordset[0].can_create_db === 1;
    } catch (permError) {
    }

    // Check if sqlparrot database exists
    let sqlparrotExists = false;
    try {
      const dbCheck = await pool.request().query(`
        SELECT name FROM sys.databases WHERE name = 'sqlparrot'
      `);
      sqlparrotExists = dbCheck.recordset.length > 0;
    } catch (dbError) {
    }

    await pool.close();

    res.json(createSuccessResponse({
      connection: 'success',
      canCreateDatabase,
      sqlparrotExists,
      config: {
        server: config.server,
        port: config.port,
        user: config.user,
        database: config.database
      }
    }));

  } catch (error) {
    console.error('Error testing metadata storage:', error);
    res.status(500).json(createErrorResponse(`Connection test failed: ${error.message}`, 500));
  }
});

// Initialize metadata storage system manually
app.post('/api/metadata/initialize', async (req, res) => {
  try {
    const initResult = await metadataStorage.initialize();

    if (initResult.success) {
      res.json(createSuccessResponse(initResult, [
        `Metadata storage initialized: ${initResult.mode} mode`
      ]));
    } else {
      res.status(500).json(createErrorResponse(`Initialization failed: ${initResult.message}`, 500));
    }
  } catch (error) {
    console.error('Error initializing metadata storage:', error);
    res.status(500).json(createErrorResponse(`Initialization failed: ${error.message}`, 500));
  }
});

// Sync metadata between SQL Server and JSON
app.post('/api/metadata/sync', async (req, res) => {
  try {
    const config = await getSqlConfig();
    if (!config) {
      return res.status(400).json(createErrorResponse('No SQL Server configuration found'));
    }

    const pool = await sql.connect(config);
    const syncResult = await metadataStorage.performSync(pool);
    await pool.close();

    res.json(createSuccessResponse(syncResult, [
      `Sync completed: ${syncResult.resolved.length} conflicts resolved`
    ]));
  } catch (error) {
    console.error('Error syncing metadata:', error);
    res.status(500).json(createErrorResponse('Failed to sync metadata', 500));
  }
});

// Verify snapshot consistency
app.post('/api/snapshots/verify', async (req, res) => {
  try {
    const verification = await verifySnapshotConsistency();

    res.json({
      success: true,
      verified: verification.verified,
      issues: verification.issues,
      orphanedInSQL: verification.orphanedInSQL || [],
      missingInSQL: verification.missingInSQL || [],
      inaccessibleSnapshots: verification.inaccessibleSnapshots || [],
      message: verification.verified ?
        'All snapshots are consistent' :
        `Found ${verification.issues.length} consistency issues`
    });
  } catch (error) {
    console.error('Error verifying snapshot consistency:', error);
    res.status(500).json({
      success: false,
      verified: false,
      message: error.message,
      issues: [`Verification failed: ${error.message}`]
    });
  }
});

// Clean up orphaned snapshots based on verification
app.post('/api/snapshots/cleanup-orphaned', async (req, res) => {
  try {
    const cleanup = await cleanupOrphanedSnapshots();

    res.json({
      success: true,
      cleaned: cleanup.cleaned,
      orphans: cleanup.orphans,
      message: cleanup.cleaned > 0 ?
        `Cleaned up ${cleanup.cleaned} orphaned snapshots` :
        'No orphaned snapshots found'
    });
  } catch (error) {
    console.error('Error cleaning up orphaned snapshots:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Clean up stale SQL metadata
app.post('/api/snapshots/cleanup-metadata', async (req, res) => {
  try {
    const cleanup = await cleanupStaleSqlMetadata();

    res.json({
      success: true,
      cleaned: cleanup.cleaned,
      staleSnapshots: cleanup.staleSnapshots,
      message: cleanup.cleaned > 0 ?
        `Cleaned up ${cleanup.cleaned} stale SQL metadata entries` :
        'SQL metadata is consistent with SQL Server'
    });
  } catch (error) {
    console.error('Error cleaning up stale SQL metadata:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Clean up all existing snapshots (migration endpoint)
app.post('/api/snapshots/cleanup', async (req, res) => {
  try {
    const deletedSnapshots = await deleteAllSnapshots();

    await addToHistory({
      type: 'cleanup_snapshots',
      deletedCount: deletedSnapshots.length,
      deletedSnapshots: deletedSnapshots.slice(0, 10) // Limit for history
    });

    res.json({
      success: true,
      deletedCount: deletedSnapshots.length,
      message: `Cleaned up ${deletedSnapshots.length} existing snapshots`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test endpoint to validate snapshot integrity with different methods
app.get('/api/test/snapshot-validation/:snapshotName', async (req, res) => {
  const snapshotName = req.params.snapshotName;

  try {
    const config = await getSqlConfig();
    const pool = await sql.connect(config);

    const results = {
      snapshotName,
      tests: {}
    };

    // Test 1: Simple query test
    try {
      await pool.request().query(`SELECT COUNT(*) FROM [${snapshotName}].sys.tables`);
      results.tests.simpleQuery = { success: true, message: 'Simple query succeeded' };
    } catch (error) {
      results.tests.simpleQuery = { success: false, message: error.message };
    }

    // Test 2: File existence check
    try {
      const fileResult = await pool.request().query(`
        SELECT name, physical_name, state_desc
        FROM [${snapshotName}].sys.database_files
      `);
      results.tests.fileCheck = {
        success: true,
        message: 'File check succeeded',
        files: fileResult.recordset
      };
    } catch (error) {
      results.tests.fileCheck = { success: false, message: error.message };
    }

    // Test 3: Snapshot state check
    try {
      const stateResult = await pool.request().query(`
        SELECT name, state_desc, is_read_only
        FROM sys.databases
        WHERE name = '${snapshotName}'
      `);
      results.tests.stateCheck = {
        success: true,
        message: 'State check succeeded',
        state: stateResult.recordset[0]
      };
    } catch (error) {
      results.tests.stateCheck = { success: false, message: error.message };
    }

    // Test 4: DBCC CHECKDB
    const dbccStartTime = Date.now();
    try {
      await pool.request().query(`DBCC CHECKDB('${snapshotName}') WITH NO_INFOMSGS`);
      const dbccEndTime = Date.now();
      results.tests.dbccCheck = {
        success: true,
        message: 'DBCC CHECKDB succeeded',
        duration: dbccEndTime - dbccStartTime
      };
    } catch (error) {
      const dbccEndTime = Date.now();
      results.tests.dbccCheck = {
        success: false,
        message: error.message,
        duration: dbccEndTime - dbccStartTime
      };
    }

    await pool.close();
    res.json(results);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Batch test endpoint to run DBCC CHECKDB against all snapshots
app.get('/api/test/dbcc-all-snapshots', async (req, res) => {
  const startTime = Date.now();

  try {
    const config = await getSqlConfig();
    const pool = await sql.connect(config);

    // Get all snapshot databases
    const dbResult = await pool.request().query(`
      SELECT name
      FROM sys.databases
      WHERE source_database_id IS NOT NULL
    `);

    const snapshots = dbResult.recordset.map(db => db.name);

    const results = {
      totalSnapshots: snapshots.length,
      snapshots: [],
      totalDuration: 0,
      averageDuration: 0,
      startTime: new Date().toISOString()
    };

    let totalDbccTime = 0;

    for (const snapshotName of snapshots) {
      const snapshotStartTime = Date.now();

      try {
        await pool.request().query(`DBCC CHECKDB('${snapshotName}') WITH NO_INFOMSGS`);
        const snapshotEndTime = Date.now();
        const duration = snapshotEndTime - snapshotStartTime;
        totalDbccTime += duration;

        results.snapshots.push({
          name: snapshotName,
          success: true,
          duration: duration,
          message: 'DBCC CHECKDB succeeded'
        });
      } catch (error) {
        const snapshotEndTime = Date.now();
        const duration = snapshotEndTime - snapshotStartTime;
        totalDbccTime += duration;

        results.snapshots.push({
          name: snapshotName,
          success: false,
          duration: duration,
          message: error.message
        });
      }
    }

    await pool.close();

    const endTime = Date.now();
    results.totalDuration = endTime - startTime;
    results.dbccDuration = totalDbccTime;
    results.averageDuration = Math.round(totalDbccTime / snapshots.length);
    results.endTime = new Date().toISOString();

    res.json(results);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a specific snapshot (valid snapshots only)
app.delete('/api/snapshots/:snapshotId', async (req, res) => {
  try {
    const { snapshotId } = req.params;

    // Get snapshot details from SQL metadata storage
    const snapshots = await metadataStorage.getAllSnapshots();
    const snapshot = snapshots.find(s => s.id === snapshotId);

    if (!snapshot) {
      return res.status(404).json({ success: false, message: 'Snapshot not found' });
    }

    const config = await getSqlConfig();
    const pool = await sql.connect(config);

    // Drop all snapshot databases for this snapshot
    const droppedDatabases = [];
    for (const dbSnapshot of snapshot.databaseSnapshots) {
      if (dbSnapshot.success && dbSnapshot.snapshotName) {
        try {
          await pool.request().query(`DROP DATABASE [${dbSnapshot.snapshotName}]`);
          droppedDatabases.push(dbSnapshot.snapshotName);
        } catch (error) {
          console.error(`Failed to drop snapshot database ${dbSnapshot.snapshotName}: ${error.message}`);
        }
      }
    }

    await pool.close();

    // Remove snapshot from SQL metadata storage
    const deleteResult = await metadataStorage.deleteSnapshot(snapshotId);
    if (!deleteResult.success) {
      return res.status(500).json({
        success: false,
        message: `Failed to delete snapshot metadata: ${deleteResult.error}`
      });
    }

    res.json({
      success: true,
      message: `Snapshot "${snapshot.displayName}" deleted successfully`,
      droppedDatabases: droppedDatabases.length
    });

  } catch (error) {
    console.error('Error deleting snapshot:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Pre-check for external snapshots before rollback
app.get('/api/snapshots/:snapshotId/check-external', async (req, res) => {
  try {
    const { snapshotId } = req.params;

    const snapshots = await metadataStorage.getAllSnapshots();
    const snapshot = snapshots.find(s => s.id === snapshotId);

    if (!snapshot) {
      return res.status(404).json({ success: false, message: 'Snapshot not found' });
    }

    const config = await getSqlConfig();
    const pool = await sql.connect(config);

    const sourceDatabaseNames = snapshot.databaseSnapshots
      .filter(dbSnapshot => dbSnapshot.success)
      .map(dbSnapshot => dbSnapshot.database);

    // Get all SQL Parrot snapshot names from metadata to identify external snapshots
    const allMetadataSnapshots = await metadataStorage.getAllSnapshots();
    const sqlParrotSnapshotNames = new Set();
    allMetadataSnapshots.forEach(s => {
      if (s.databaseSnapshots) {
        s.databaseSnapshots.forEach(dbSnap => {
          if (dbSnap.snapshotName) {
            sqlParrotSnapshotNames.add(dbSnap.snapshotName);
          }
        });
      }
    });

    const allSnapshotsResult = await pool.request().query(`
      SELECT d.name as snapshot_name, DB_NAME(d.source_database_id) as source_db
      FROM sys.databases d
      WHERE d.source_database_id IS NOT NULL
      AND (${sourceDatabaseNames.map(db => `d.source_database_id = DB_ID('${db}')`).join(' OR ')})
    `);

    await pool.close();

    // Filter to find truly external snapshots (not in our metadata)
    const externalSnapshotsFound = allSnapshotsResult.recordset.filter(
      row => !sqlParrotSnapshotNames.has(row.snapshot_name)
    );

    if (externalSnapshotsFound.length > 0) {
      const externalSnapshots = externalSnapshotsFound;
      const dropCommands = externalSnapshots.map(s => `DROP DATABASE [${s.snapshot_name}];`);

      return res.json({
        success: true,
        hasExternalSnapshots: true,
        externalSnapshots: externalSnapshots.map(s => ({
          snapshotName: s.snapshot_name,
          sourceDatabase: s.source_db
        })),
        dropCommands: dropCommands
      });
    }

    res.json({ success: true, hasExternalSnapshots: false });
  } catch (error) {
    console.error('Error checking for external snapshots:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Rollback to a specific snapshot
app.post('/api/snapshots/:snapshotId/rollback', async (req, res) => {
  try {
    const { snapshotId } = req.params;

    // Get snapshot details from SQL metadata storage
    const snapshots = await metadataStorage.getAllSnapshots();
    const snapshot = snapshots.find(s => s.id === snapshotId);

    if (!snapshot) {
      return res.status(404).json({ success: false, message: 'Snapshot not found' });
    }

    const config = await getSqlConfig();
    const pool = await sql.connect(config);

    // Pre-check: Look for external snapshots that would block the rollback
    // SQL Server requires ALL snapshots on a database to be dropped before restoring
    const sourceDatabaseNames = snapshot.databaseSnapshots
      .filter(dbSnapshot => dbSnapshot.success)
      .map(dbSnapshot => dbSnapshot.database);

    // Get all SQL Parrot snapshot names from metadata to identify external snapshots
    const allMetadataSnapshots = await metadataStorage.getAllSnapshots();
    const sqlParrotSnapshotNames = new Set();
    allMetadataSnapshots.forEach(s => {
      if (s.databaseSnapshots) {
        s.databaseSnapshots.forEach(dbSnap => {
          if (dbSnap.snapshotName) {
            sqlParrotSnapshotNames.add(dbSnap.snapshotName);
          }
        });
      }
    });

    const allSnapshotsResult = await pool.request().query(`
      SELECT d.name as snapshot_name, DB_NAME(d.source_database_id) as source_db
      FROM sys.databases d
      WHERE d.source_database_id IS NOT NULL
      AND (${sourceDatabaseNames.map(db => `d.source_database_id = DB_ID('${db}')`).join(' OR ')})
    `);

    // Filter to find truly external snapshots (not in our metadata)
    const externalSnapshotsFound = allSnapshotsResult.recordset.filter(
      row => !sqlParrotSnapshotNames.has(row.snapshot_name)
    );

    if (externalSnapshotsFound.length > 0) {
      const externalSnapshots = externalSnapshotsFound;
      const dropCommands = externalSnapshots.map(s => `DROP DATABASE [${s.snapshot_name}];`);

      await pool.close();
      return res.status(409).json({
        success: false,
        message: 'External snapshots detected',
        error: 'Cannot rollback: external snapshots exist on the target databases. SQL Server requires all snapshots to be removed before restoring.',
        externalSnapshots: externalSnapshots.map(s => ({
          snapshotName: s.snapshot_name,
          sourceDatabase: s.source_db
        })),
        dropCommands: dropCommands,
        hint: 'Remove these snapshots manually using the SQL commands provided, then retry the rollback.'
      });
    }

    // Step 1: Drop ALL snapshot databases for OUR GROUP AND SOURCE DATABASES EXCEPT the target
    // This ensures complete cleanup while preserving the target snapshot for restore
    const droppedSnapshots = [];

    try {
      // Get snapshot databases that match our group's naming pattern AND our source databases
      // Pattern is {cleanGroupName}_{hash}_{database} based on generateSnapshotId()
      const groups = await metadataStorage.getAllGroups();
      const snapshotGroup = groups.find(g => g.id === snapshot.groupId);
      const cleanGroupName = snapshotGroup?.name?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
      const snapshotPattern = cleanGroupName ? `${cleanGroupName}_%` : 'sf_%';


      const groupSnapshotsResult = await pool.request().query(`
        SELECT name, source_database_id
        FROM sys.databases
        WHERE source_database_id IS NOT NULL
        AND name LIKE '${snapshotPattern}'
        AND (${sourceDatabaseNames.map(db => `source_database_id = DB_ID('${db}')`).join(' OR ')})
      `);


      // Get target snapshot names to preserve them
      const targetSnapshotNames = new Set();
      snapshot.databaseSnapshots.forEach(dbSnapshot => {
        if (dbSnapshot.success && dbSnapshot.snapshotName) {
          targetSnapshotNames.add(dbSnapshot.snapshotName);
        }
      });

      console.log(`[Rollback] Target snapshots to preserve: ${Array.from(targetSnapshotNames).join(', ')}`);
      console.log(`[Rollback] Found ${groupSnapshotsResult.recordset.length} snapshots matching pattern '${snapshotPattern}'`);

      // Drop ALL snapshot databases for our group and source databases EXCEPT the target ones
      for (const snapshotDb of groupSnapshotsResult.recordset) {
        if (!targetSnapshotNames.has(snapshotDb.name)) {
          try {
            console.log(`[Rollback] Dropping snapshot: ${snapshotDb.name}`);
            await pool.request().query(`DROP DATABASE [${snapshotDb.name}]`);
            droppedSnapshots.push(snapshotDb.name);
          } catch (error) {
            console.error(`Failed to drop group+source snapshot database ${snapshotDb.name}: ${error.message}`);
          }
        } else {
          console.log(`[Rollback] Preserving target snapshot: ${snapshotDb.name}`);
        }
      }
    } catch (error) {
      console.error(`Error getting group+source snapshot databases: ${error.message}`);
    }

    // Step 2: Restore each database to the target snapshot state
    // The target snapshot will be automatically removed by SQL Server during restore
    const rolledBackDatabases = [];
    const failedRollbacks = [];

    for (const dbSnapshot of snapshot.databaseSnapshots) {
      if (dbSnapshot.success && dbSnapshot.snapshotName) {
        try {
          const sourceDbName = dbSnapshot.database;

          // Check if the snapshot database exists before attempting restore
          const snapshotExists = await pool.request().query(`
            SELECT name FROM sys.databases WHERE name = '${dbSnapshot.snapshotName}'
          `);

          if (snapshotExists.recordset.length === 0) {
            // Check if it was accidentally dropped - list all snapshots for this database
            const allSnapshotsForDb = await pool.request().query(`
              SELECT d.name as snapshot_name, DB_NAME(d.source_database_id) as source_db
              FROM sys.databases d
              WHERE d.source_database_id = DB_ID('${sourceDbName}')
            `);
            const existingSnapshots = allSnapshotsForDb.recordset.map(r => r.snapshot_name);
            throw new Error(`Snapshot database '${dbSnapshot.snapshotName}' does not exist. Existing snapshots for this database: ${existingSnapshots.length > 0 ? existingSnapshots.join(', ') : 'none'}`);
          }

          // Comprehensive connection cleanup and restore

          // Step 1: Kill all active connections to the database
          try {
            await pool.request().query(`
              DECLARE @sql NVARCHAR(MAX) = '';
              SELECT @sql = @sql + 'KILL ' + CAST(session_id AS NVARCHAR(10)) + '; '
              FROM sys.dm_exec_sessions
              WHERE database_id = DB_ID('${sourceDbName}') AND session_id != @@SPID;
              IF @sql != '' EXEC sp_executesql @sql;
            `);
          } catch (killError) {
            console.warn(`Could not kill connections to ${sourceDbName}: ${killError.message}`);
          }

          // Step 2: Set database to single user mode with immediate rollback
          try {
            await pool.request().query(`
              ALTER DATABASE [${sourceDbName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE
            `);
          } catch (singleUserError) {
            console.warn(`Could not set single user mode for ${sourceDbName}: ${singleUserError.message}`);
          }

          // Step 3: Check database state before restore
          try {
            const dbStateResult = await pool.request().query(`
              SELECT state_desc FROM sys.databases WHERE name = '${sourceDbName}'
            `);
            const dbState = dbStateResult.recordset[0]?.state_desc;

            // If database is in RESTORING state, try to recover it first
            if (dbState === 'RESTORING') {
              try {
                await pool.request().query(`RESTORE DATABASE [${sourceDbName}] WITH RECOVERY`);
              } catch (recoveryError) {
                console.warn(`Could not recover database: ${recoveryError.message}`);
              }
            }
          } catch (stateError) {
            console.warn(`Could not check database state: ${stateError.message}`);
          }

          // Step 4: Restore database from snapshot using proper SQL Server command
          // This restores the ENTIRE database state (all tables, schema, procedures, etc.)
          // Note: SQL Server automatically deletes the snapshot after successful restore
          try {

            await pool.request().query(`
              RESTORE DATABASE [${sourceDbName}] FROM DATABASE_SNAPSHOT = '${dbSnapshot.snapshotName}'
            `);


          } catch (restoreError) {
            console.error(`Failed to restore database from snapshot: ${restoreError.message}`);
            throw restoreError;
          }

          // Step 5: Restore multi-user access
          try {
            await pool.request().query(`
              ALTER DATABASE [${sourceDbName}] SET MULTI_USER
            `);
          } catch (multiUserError) {
            console.warn(`Could not restore multi-user access to ${sourceDbName}: ${multiUserError.message}`);
          }

          rolledBackDatabases.push(sourceDbName);
        } catch (error) {
          console.error(`Failed to rollback database ${dbSnapshot.database}: ${error.message}`);
          failedRollbacks.push({
            database: dbSnapshot.database,
            snapshotName: dbSnapshot.snapshotName,
            error: error.message
          });
        }
      }
    }

    // If any rollbacks failed, return an error
    if (failedRollbacks.length > 0) {
      await pool.close();
      return res.status(500).json({
        success: false,
        message: `Rollback failed for ${failedRollbacks.length} database(s)`,
        failedRollbacks: failedRollbacks,
        rolledBackDatabases: rolledBackDatabases.length
      });
    }

    // Step 3: Clean up any remaining snapshot databases for our group and source databases (in case SQL Server didn't auto-remove them)
    try {
      // Get our source database names
      const sourceDatabaseNames = snapshot.databaseSnapshots
        .filter(dbSnapshot => dbSnapshot.success)
        .map(dbSnapshot => dbSnapshot.database);

      // Use same pattern as initial cleanup
      const groupsForCleanup = await metadataStorage.getAllGroups();
      const snapshotGroupForCleanup = groupsForCleanup.find(g => g.id === snapshot.groupId);
      const cleanGroupNameForCleanup = snapshotGroupForCleanup?.name?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
      const cleanupPattern = cleanGroupNameForCleanup ? `${cleanGroupNameForCleanup}_%` : 'sf_%';

      const remainingGroupSnapshotsResult = await pool.request().query(`
        SELECT name, source_database_id
        FROM sys.databases
        WHERE source_database_id IS NOT NULL
        AND name LIKE '${cleanupPattern}'
        AND (${sourceDatabaseNames.map(db => `source_database_id = DB_ID('${db}')`).join(' OR ')})
      `);

      if (remainingGroupSnapshotsResult.recordset.length > 0) {

        for (const remainingSnapshot of remainingGroupSnapshotsResult.recordset) {
          try {
            await pool.request().query(`DROP DATABASE [${remainingSnapshot.name}]`);
            droppedSnapshots.push(remainingSnapshot.name);
          } catch (error) {
            console.error(`Failed to cleanup remaining group+source snapshot database ${remainingSnapshot.name}: ${error.message}`);
          }
        }
      } else {
      }
    } catch (error) {
      console.error(`Error checking for remaining group+source snapshots: ${error.message}`);
    }

    await pool.close();

    // Step 4: Remove all snapshots from metadata (all snapshots have been cleaned up)
    // Delete all snapshots for this group from SQL metadata storage
    const allSnapshots = await metadataStorage.getAllSnapshots();
    const groupSnapshots = allSnapshots.filter(s => s.groupId === snapshot.groupId);

    for (const groupSnapshot of groupSnapshots) {
      const deleteResult = await metadataStorage.deleteSnapshot(groupSnapshot.id);
    }

    // Step 4: Create a new checkpoint snapshot after restore

    // Get the group details for creating the checkpoint
    const groups = await metadataStorage.getAllGroups();
    const group = groups.find(g => g.id === snapshot.groupId);

    if (!group) {
      console.error('Group not found for checkpoint creation');
      return res.json({
        success: true,
        message: `Successfully rolled back to snapshot "${snapshot.displayName}". All snapshots have been removed.`,
        rolledBackDatabases: rolledBackDatabases.length,
        droppedSnapshots: droppedSnapshots.length,
        checkpointCreated: false,
        note: "Group not found for checkpoint creation"
      });
    }

    // Create checkpoint snapshot using the same logic as regular snapshot creation
    const sequence = 1; // Reset sequence numbering
    const checkpointDisplayName = `Automatic - ${new Date().toLocaleString()}`;
    // Use group.name instead of snapshot.groupName (which may be undefined)
    const checkpointId = generateSnapshotId(group.name, checkpointDisplayName);

    // Reconnect to database for checkpoint creation
    const checkpointPool = await sql.connect(config);
    const checkpointDatabaseSnapshots = [];
    const checkpointResults = [];

    // Get snapshot path from active profile with env var substitution
    const checkpointProfile = metadataStorage.getActiveProfile();
    if (!checkpointProfile || !checkpointProfile.snapshotPath) {
      return res.status(400).json({
        success: false,
        error: 'No snapshot path configured in active profile. Please configure a snapshot path in your profile settings.'
      });
    }
    const snapshotBasePath = resolveEnvVarSubstitution(checkpointProfile.snapshotPath, 'snapshotPath');

    for (const database of group.databases) {
      try {
        const fullSnapshotName = `${checkpointId}_${database}`;
        const snapshotPath = `${snapshotBasePath}/${fullSnapshotName}.ss`;

        // Get database files (exclude log files - only data files allowed in snapshots)
        const dbFiles = await checkpointPool.request().query(`
          SELECT name, physical_name
          FROM sys.master_files
          WHERE database_id = DB_ID('${database}')
          AND type = 0  -- Only data files (type 0), exclude log files (type 1)
        `);

        if (dbFiles.recordset.length === 0) {
          throw new Error(`No data files found for database '${database}'. Cannot create checkpoint snapshot.`);
        }

        let fileList = '';
        for (const file of dbFiles.recordset) {
          const physicalFileName = `${snapshotPath.replace('.ss', `_${file.name}.ss`)}`;
          fileList += `(NAME = '${file.name}', FILENAME = '${physicalFileName}'),`;
        }
        fileList = fileList.slice(0, -1); // Remove trailing comma

        await checkpointPool.request().query(`
          CREATE DATABASE [${fullSnapshotName}]
          ON ${fileList}
          AS SNAPSHOT OF [${database}]
        `);

        checkpointDatabaseSnapshots.push({
          database,
          snapshotName: fullSnapshotName,
          success: true
        });

        checkpointResults.push({ database, snapshotName: fullSnapshotName, success: true });
      } catch (dbError) {
        checkpointDatabaseSnapshots.push({
          database,
          error: dbError.message,
          success: false
        });
        checkpointResults.push({ database, error: dbError.message, success: false });
        console.error(`Failed to create checkpoint snapshot for database ${database}: ${dbError.message}`);
      }
    }

    await checkpointPool.close();

    // Create the checkpoint snapshot metadata
    const checkpointSnapshot = {
      id: checkpointId,
      groupId: snapshot.groupId,
      groupName: snapshot.groupName,
      displayName: checkpointDisplayName,
      sequence: 1, // Reset sequence numbering
      createdAt: new Date().toISOString(),
      databaseCount: group.databases.length,
      databaseSnapshots: checkpointDatabaseSnapshots
    };

    // Add checkpoint to SQL metadata storage
    const checkpointResult = await metadataStorage.addSnapshot(checkpointSnapshot);
    if (!checkpointResult.success) {
      console.error(`❌ Failed to add checkpoint to metadata: ${checkpointResult.error}`);
    }

    // Log restore operation to history
    await addToHistory({
      type: 'restore_snapshot',
      groupName: snapshot.groupName,
      snapshotName: snapshot.displayName,
      snapshotId: snapshot.id,
      rolledBackDatabases: rolledBackDatabases,
      droppedSnapshots: droppedSnapshots.length,
      results: rolledBackDatabases.map(db => ({ database: db, success: true }))
    });

    // Log checkpoint creation to history using SQL metadata storage
    await metadataStorage.addHistory({
      type: 'create_automatic_checkpoint',
      groupName: snapshot.groupName,
      originalSnapshotName: snapshot.displayName,
      checkpointSnapshotName: checkpointDisplayName,
      checkpointId: checkpointId,
      sequence: 1,
      results: checkpointResults,
      timestamp: new Date().toISOString()
    });


    res.json(createSuccessResponse({
      rolledBackDatabases: rolledBackDatabases.length,
      droppedSnapshots: droppedSnapshots.length,
      checkpointCreated: true,
      checkpointSnapshot: {
        id: checkpointId,
        displayName: checkpointDisplayName,
        sequence: 1,
        databaseCount: checkpointDatabaseSnapshots.filter(s => s.success).length
      }
    }, [`Successfully rolled back to snapshot "${snapshot.displayName}". All snapshots have been removed and automatic checkpoint created.`]));

  } catch (error) {
    console.error('Error rolling back snapshot:', error);
    res.status(500).json(createErrorResponse(error.message, 500));
  }
});

// Cleanup invalid snapshot (remove from SQL Server)
app.post('/api/snapshots/:snapshotId/cleanup', async (req, res) => {
  try {
    const { snapshotId } = req.params;

    // Get snapshot details
    const snapshotsData = await getSnapshotsData();
    const snapshot = snapshotsData.snapshots.find(s => s.id === snapshotId);

    if (!snapshot) {
      return res.status(404).json({ success: false, message: 'Snapshot not found' });
    }

    const config = await getSqlConfig();
    const pool = await sql.connect(config);

    // Drop all snapshot databases for this snapshot (even if they're invalid)
    const droppedDatabases = [];
    for (const dbSnapshot of snapshot.databaseSnapshots) {
      if (dbSnapshot.success && dbSnapshot.snapshotName) {
        try {
          await pool.request().query(`DROP DATABASE [${dbSnapshot.snapshotName}]`);
          droppedDatabases.push(dbSnapshot.snapshotName);
        } catch (error) {
          console.error(`Failed to cleanup snapshot database ${dbSnapshot.snapshotName}: ${error.message}`);
        }
      }
    }

    await pool.close();

    // Remove snapshot from SQLite metadata
    await metadataStorage.deleteSnapshot(snapshotId);

    res.json({
      success: true,
      message: `Snapshot "${snapshot.displayName}" cleaned up successfully`,
      droppedDatabases: droppedDatabases.length
    });

  } catch (error) {
    console.error('Error cleaning up snapshot:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Note: External API cleanup endpoint removed - external file API no longer supported

// Note: N8N webhook endpoint removed - external file API no longer supported

// Get snapshots for a group
app.get('/api/groups/:id/snapshots', async (req, res) => {
  try {
    const { id } = req.params;

    // Find the group - check database first if in SQL mode
    let group = null;
    if (metadataMode === 'sql') {
      try {
        const dbResult = await metadataStorage.getGroups();
        if (dbResult.success && dbResult.groups) {
          group = dbResult.groups.find(g => g.id === id);
        }
      } catch (error) {
        console.error('Error getting group from database:', error);
      }
    }

    // Fall back to JSON file if not found in database
    if (!group) {
      const groups = await metadataStorage.getAllGroups();
      group = data.groups.find(g => g.id === id);
    }

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const snapshotsData = await getSnapshotsData();
    let groupSnapshots = snapshotsData.snapshots
      .filter(s => s.groupId === id)
      .sort((a, b) => b.sequence - a.sequence); // Most recent first

    // Check for orphaned checkpoint snapshots in SQL Server that aren't in our data files
    try {
      const config = await getSqlConfig();
      if (config) {
        const pool = await sql.connect(config);

        // Get all snapshot databases that match our group's naming pattern
        const result = await pool.request().query(`
          SELECT name, create_date, state_desc
          FROM sys.databases
          WHERE source_database_id IS NOT NULL
          AND name LIKE '${id}_%'
        `);

        await pool.close();

        // Get managed snapshot names
        const managedSnapshotNames = new Set();
        groupSnapshots.forEach(snapshot => {
          snapshot.databaseSnapshots.forEach(dbSnapshot => {
            if (dbSnapshot.success) {
              managedSnapshotNames.add(dbSnapshot.snapshotName);
            }
          });
        });

        // Find orphaned checkpoint snapshots
        const orphanedCheckpoints = result.recordset.filter(db =>
          !managedSnapshotNames.has(db.name) &&
          db.name.includes('_checkpoint_')
        );

        if (orphanedCheckpoints.length > 0) {

          // Group orphaned snapshots by checkpoint ID
          const checkpointGroups = {};
          orphanedCheckpoints.forEach(db => {
            // Extract checkpoint ID from snapshot name (e.g., "group-123_checkpoint_456_mycompany_dev_global" -> "group-123_checkpoint_456")
            const checkpointIdMatch = db.name.match(/^(.+_checkpoint_\d+)_/);
            if (checkpointIdMatch) {
              const checkpointId = checkpointIdMatch[1];
              if (!checkpointGroups[checkpointId]) {
                checkpointGroups[checkpointId] = [];
              }
              checkpointGroups[checkpointId].push(db);
            }
          });

          // Create snapshot entries for orphaned checkpoints
          Object.entries(checkpointGroups).forEach(([checkpointId, databases]) => {
            const checkpointSnapshot = {
              id: checkpointId,
              groupId: id,
              groupName: group.name,
              displayName: `Checkpoint (orphaned)`,
              sequence: 0, // Mark as orphaned with sequence 0
              createdAt: databases[0].create_date,
              databaseCount: databases.length,
              databaseSnapshots: databases.map(db => ({
                database: db.name.split('_').slice(-1)[0], // Extract database name from end
                snapshotName: db.name,
                success: true
              })),
              isOrphaned: true
            };

            groupSnapshots.unshift(checkpointSnapshot); // Add at beginning
          });
        }
      }
    } catch (error) {
      console.error('Error checking for orphaned checkpoints:', error.message);
      // Continue with normal operation if checkpoint detection fails
    }

    res.json(createSuccessResponse(groupSnapshots));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create snapshot for a group
app.post('/api/groups/:id/snapshots', async (req, res) => {
  try {
    const { id } = req.params;
    const { snapshotName } = req.body;
    const groups = await metadataStorage.getAllGroups();
    const group = groups.find(g => g.id === id);

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check 9-snapshot limit
    const snapshotsData = await getSnapshotsData();
    const groupSnapshots = snapshotsData.snapshots.filter(s => s.groupId === id);
    if (groupSnapshots.length >= 9) {
      return res.status(400).json({
        error: 'Maximum of 9 snapshots allowed per group. Please delete some snapshots before creating new ones.'
      });
    }

    const config = await getSqlConfig();
    if (!config) {
      return res.status(400).json({ error: 'No SQL Server configuration found' });
    }

    const sequence = await getNextSequenceForGroup(id);
    const snapshotId = generateSnapshotId(group.name, snapshotName);
    const displayName = generateDisplayName(snapshotName);

    // Get snapshot path from active profile with env var substitution
    const snapshotProfile = metadataStorage.getActiveProfile();
    if (!snapshotProfile || !snapshotProfile.snapshotPath) {
      return res.status(400).json({
        error: 'No snapshot path configured in active profile. Please configure a snapshot path in your profile settings.'
      });
    }
    const snapshotBasePath = resolveEnvVarSubstitution(snapshotProfile.snapshotPath, 'snapshotPath');

    const pool = await sql.connect(config);
    const databaseSnapshots = [];
    const results = [];

    for (const database of group.databases) {
      try {
        const fullSnapshotName = `${snapshotId}_${database}`;
        const snapshotPath = `${snapshotBasePath}/${fullSnapshotName}.ss`;

        // Get database files (exclude log files - only data files allowed in snapshots)
        const dbFiles = await pool.request().query(`
          SELECT name, physical_name
          FROM sys.master_files
          WHERE database_id = DB_ID('${database}')
          AND type = 0  -- Only data files (type 0), exclude log files (type 1)
        `);

        // Check if we have any data files
        if (dbFiles.recordset.length === 0) {
          throw new Error(`No data files found for database '${database}'. Cannot create snapshot.`);
        }

        let fileList = '';
        for (const file of dbFiles.recordset) {
          const physicalFileName = `${snapshotPath.replace('.ss', `_${file.name}.ss`)}`;
          fileList += `(NAME = '${file.name}', FILENAME = '${physicalFileName}'),`;
        }
        fileList = fileList.slice(0, -1); // Remove trailing comma

        await pool.request().query(`
          CREATE DATABASE [${fullSnapshotName}]
          ON ${fileList}
          AS SNAPSHOT OF [${database}]
        `);

        databaseSnapshots.push({
          database,
          snapshotName: fullSnapshotName,
          success: true
        });

        results.push({ database, snapshotName: fullSnapshotName, success: true });
      } catch (dbError) {
        databaseSnapshots.push({
          database,
          error: dbError.message,
          success: false
        });
        results.push({ database, error: dbError.message, success: false });
      }
    }

    await pool.close();

    // Save snapshot metadata
    const newSnapshot = {
      id: snapshotId,
      groupId: id,
      groupName: group.name,
      displayName: displayName,
      sequence: sequence,
      createdAt: new Date().toISOString(),
      databaseCount: group.databases.length,
      databaseSnapshots: databaseSnapshots
    };

    // Try to add to metadata storage first (if enabled)
    if (metadataStorage.isMetadataTableMode()) {
      try {
        const result = await metadataStorage.addSnapshot(newSnapshot);
        if (result.success && result.mode === 'sql') {
        } else if (result.fallback) {
        }
      } catch (error) {
        console.error('❌ Failed to add snapshot to metadata database:', error.message);
        // Fall back to JSON
      }
    }

    await addToHistory({
      type: 'create_snapshots',
      groupName: group.name,
      snapshotName: displayName,
      snapshotId: snapshotId,
      sequence: sequence,
      results
    });

    // Check if any database snapshots failed
    const failedSnapshots = results.filter(r => !r.success);
    if (failedSnapshots.length > 0) {
      const errorMessages = failedSnapshots.map(r => `${r.database}: ${r.error}`).join('; ');
      return res.status(400).json({
        error: `Snapshot creation failed for ${failedSnapshots.length} database(s): ${errorMessages}`,
        details: failedSnapshots
      });
    }

    res.json(createSuccessResponse({
      snapshot: newSnapshot,
      results: results
    }, [`Snapshot "${displayName}" created successfully`]));
  } catch (error) {
    console.error('Snapshot creation error:', error);
    res.status(500).json({
      error: `Snapshot creation failed: ${error.message}`,
      details: error.stack
    });
  }
});

// Test snapshot path configuration (shows configured path only)
app.get('/api/test-snapshot-path', async (req, res) => {
  try {
    // Get active profile from SQLite
    const profile = metadataStorage.getActiveProfile();

    if (profile && profile.snapshotPath) {
      try {
        // Resolve environment variable substitutions
        const resolvedPath = resolveEnvVarSubstitution(profile.snapshotPath, 'snapshotPath');
        res.json({
          success: true,
          snapshotPath: resolvedPath,
          configured: true
        });
      } catch (error) {
        // If env var substitution fails, return error
        res.status(400).json({
          success: false,
          error: error.message
        });
      }
    } else {
      res.status(400).json({
        success: false,
        error: 'No snapshot path configured in active profile. Please configure a snapshot path in your profile settings.'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get information about non-managed snapshots
app.get('/api/snapshots/unmanaged', async (req, res) => {
  try {
    // Fetching unmanaged snapshots
    const config = await getFreshSqlConfig();
    if (!config) {
      return res.status(400).json({ error: 'No SQL Server configuration found' });
    }

    // Always create a fresh connection to get current data
    const pool = await sql.connect(config);

    // Get all snapshot databases
    const result = await pool.request().query(`
      SELECT name, create_date, state_desc
      FROM sys.databases
      WHERE source_database_id IS NOT NULL
    `);

    await pool.close();

    // Found total snapshots in SQL Server

    // Get our managed snapshots (fresh read)
    const snapshotsData = await getSnapshotsData();
    const managedSnapshotNames = new Set();

    snapshotsData.snapshots.forEach(snapshot => {
      snapshot.databaseSnapshots.forEach(dbSnapshot => {
        if (dbSnapshot.success) {
          managedSnapshotNames.add(dbSnapshot.snapshotName);
        }
      });
    });

    // Found managed snapshots

    // Find unmanaged snapshots
    const unmanagedSnapshots = result.recordset.filter(db =>
      !managedSnapshotNames.has(db.name)
    );

    // Found unmanaged snapshots

    res.json(createSuccessResponse({
      unmanagedCount: unmanagedSnapshots.length,
      unmanagedSnapshots: unmanagedSnapshots.map(db => ({
        name: db.name,
        createDate: db.create_date
      }))
    }));
  } catch (error) {
    console.error('Error fetching unmanaged snapshots:', error);
    res.status(500).json({ error: error.message });
  }
});

// Note: Health check endpoint consolidated above - this duplicate removed

// Note: N8N API health check endpoint removed - external file API no longer supported

// ===== Profile Management Routes =====

// Get all profiles (without passwords) with group counts
app.get('/api/profiles', async (req, res) => {
  try {
    const profiles = metadataStorage.getProfiles();
    const groupCounts = metadataStorage.getGroupCountsByProfile();

    // Add group count to each profile
    const profilesWithCounts = profiles.map(profile => ({
      ...profile,
      groupCount: groupCounts.counts?.[profile.id] || 0
    }));

    res.json({ success: true, data: profilesWithCounts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get a single profile by ID (without password)
app.get('/api/profiles/:id', async (req, res) => {
  try {
    const profile = metadataStorage.getProfile(req.params.id);
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }
    // Don't return password for security (frontend should never receive passwords)
    const { password, ...profileWithoutPassword } = profile;
    res.json({ success: true, data: profileWithoutPassword });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create a new profile
app.post('/api/profiles', async (req, res) => {
  try {
    const result = metadataStorage.createProfile(req.body);
    if (result.success) {
      res.json({ success: true, data: result.profile });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update an existing profile
app.put('/api/profiles/:id', async (req, res) => {
  try {
    const result = metadataStorage.updateProfile(req.params.id, req.body);
    if (result.success) {
      res.json({ success: true, data: result.profile });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a profile
app.delete('/api/profiles/:id', async (req, res) => {
  try {
    const result = metadataStorage.deleteProfile(req.params.id);
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Set a profile as active
app.post('/api/profiles/:id/activate', async (req, res) => {
  try {
    const result = metadataStorage.setActiveProfile(req.params.id);
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get current connection profile (without password) - for backward compatibility
app.get('/api/connection', async (req, res) => {
  try {
    const profile = metadataStorage.getActiveProfile();

    if (!profile) {
      return res.json({ success: true, data: null });
    }

    res.json({
      success: true,
      data: {
        name: profile.name,
        host: profile.host,
        port: profile.port,
        username: profile.username,
        trust_certificate: profile.trustCertificate,
        snapshot_path: profile.snapshotPath
        // Note: password is not returned for security
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Save connection profile (DEPRECATED - use create_profile or update_profile instead)
// Kept for backward compatibility
app.post('/api/save-connection', async (req, res) => {
  try {
    const { host, port, username, password, trustCertificate, snapshotPath } = req.body;

    if (!host || !port || !username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Host, port, username, and password are required'
      });
    }

    // Try to find existing profile by host/port/username
    const profiles = metadataStorage.getProfiles();
    const existingProfile = profiles.find(p =>
      p.host === host && p.port === port && p.username === username
    );

    if (existingProfile) {
      // Update existing profile
      const result = metadataStorage.updateProfile(existingProfile.id, {
        host,
        port: parseInt(port) || 1433,
        username,
        password,
        trustCertificate: trustCertificate !== false,
        snapshotPath: snapshotPath || '/var/opt/mssql/snapshots',
        isActive: true
      });

      if (result.success) {
        res.json({ success: true });
      } else {
        res.status(400).json({
          success: false,
          error: result.error || 'Failed to update profile'
        });
      }
    } else {
      // Create new profile
      const result = metadataStorage.createProfile({
        name: 'Migrated',
        platformType: 'Microsoft SQL Server',
        host,
        port: parseInt(port) || 1433,
        username,
        password,
        trustCertificate: trustCertificate !== false,
        snapshotPath: snapshotPath || '/var/opt/mssql/snapshots',
        isActive: true
      });

      if (result.success) {
        res.json({ success: true });
      } else {
        res.status(400).json({
          success: false,
          error: result.error || 'Failed to create profile'
        });
      }
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Serve static files from frontend/dist (must be before catch-all route)
const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist');
// Express 5 defaults dotfiles to 'ignore', but we need to serve .well-known files
app.use(express.static(frontendDistPath, {
  dotfiles: 'allow'
}));

// Catch-all handler: serve index.html for any non-API routes (for client-side routing)
// This must be after all API routes
// Express 5 requires named wildcards - use /*splat instead of *
app.get('/*splat', (req, res) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      error: 'API endpoint not found'
    });
  }

  // Serve index.html for all other routes (React Router will handle routing)
  const indexPath = path.join(frontendDistPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error('Error serving index.html:', err);
      res.status(500).send('Error loading application');
    }
  });
});

// Export app for testing
module.exports = app;

// Export cleanup function for tests
module.exports.cleanupTimers = cleanupTimers;

// Start server only if not in test environment
if (process.env.NODE_ENV !== 'test') {
  // Express 5 passes error as first argument to callback if server fails to start
  const server = app.listen(PORT, async (err) => {
    if (err) {
      console.error('Failed to start server:', err);
      process.exit(1);
    }
    
    console.log(`SQL Parrot backend running on port ${PORT}`);

    // Initialize SQLite metadata storage (local, should always work)
    try {
      await initializeMetadataStorage();

      // Handle UI_PASSWORD environment variable
      if (process.env.UI_PASSWORD) {
        try {
          const passwordStatus = await metadataStorage.getPasswordStatus();

          if (!passwordStatus.passwordSet) {
            // No password set - hash and store env var password
            const saltRounds = 10;
            const passwordHash = await bcrypt.hash(process.env.UI_PASSWORD, saltRounds);
            await metadataStorage.setPasswordHash(passwordHash);
          } else {
            // Password already exists - check if env var matches
            const settingsResult = await metadataStorage.getSettings();
            const settings = settingsResult.success ? settingsResult.settings : {};
            const storedHash = settings.passwordHash;

            if (storedHash) {
              const envVarMatches = await bcrypt.compare(process.env.UI_PASSWORD, storedHash);
              if (!envVarMatches) {
                console.warn('⚠️ UI_PASSWORD in environment variables is being ignored because a password was already set via the UI.');
                console.warn('   The stored password takes precedence. Remove UI_PASSWORD from your .env/docker-compose.yml or reset the SQLite database to use it.');
              }
            }
          }
        } catch (error) {
          console.error('❌ Error handling UI_PASSWORD:', error.message);
        }
      }

      // Run orphan cleanup on startup
      try {
        await cleanupOrphanedSnapshots();
      } catch (error) {
        console.error('Startup cleanup failed:', error.message);
      }
    } catch (error) {
      console.error('❌ Failed to initialize SQLite metadata storage:', error.message);
      console.error('   The application may not function correctly.');
    }
  });

  // Handle port conflicts - fail immediately instead of port hopping
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ FATAL ERROR: Port ${PORT} is already in use!`);
      console.error(`   Another process is already running on port ${PORT}.`);
      console.error(`   Please stop the conflicting process or use a different port.`);
      console.error(`   To stop SQL Parrot processes, run: scripts\\stop-dev.cmd`);
      console.error('');
      console.error(`   Error details: ${error.message}`);
      process.exit(1);
    } else {
      console.error(`❌ Server error: ${error.message}`);
      process.exit(1);
    }
  });
}
