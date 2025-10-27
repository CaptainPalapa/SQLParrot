import '@testing-library/jest-dom'
import { beforeAll, afterEach, afterAll, vi } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

// Mock localStorage before MSW initializes
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
  writable: true,
})

// Mock sessionStorage as well
Object.defineProperty(window, 'sessionStorage', {
  value: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
  writable: true,
})

// Mock API handlers
const handlers = [
  // Mock groups API
  http.get('/api/groups', () => {
    return HttpResponse.json({
      success: true,
      data: {
        groups: [
          {
            id: 'test-group-1',
            name: 'Test Group 1',
            databases: ['test_db_1', 'test_db_2'],
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z'
          }
        ]
      },
      messages: {
        error: [],
        warning: [],
        info: [],
        success: []
      },
      timestamp: '2024-01-01T00:00:00Z'
    })
  }),

  // Mock snapshot creation API
  http.post('/api/groups/:id/snapshots', ({ params }) => {
    return HttpResponse.json({
      success: true,
      data: {
        snapshot: {
          id: 'test-snapshot-1',
          displayName: 'Test Snapshot',
          groupId: params.id,
          sequence: 1,
          databaseCount: 2,
          createdAt: '2024-01-01T00:00:00Z'
        },
        results: [
          { database: 'test_db_1', success: true },
          { database: 'test_db_2', success: true }
        ]
      },
      messages: {
        error: [],
        warning: [],
        info: [],
        success: ['Snapshot "Test Snapshot" created successfully']
      },
      timestamp: '2024-01-01T00:00:00Z'
    })
  }),

  // Mock snapshot listing API
  http.get('/api/groups/:id/snapshots', ({ params }) => {
    return HttpResponse.json({
      success: true,
      data: [
        {
          id: 'test-snapshot-1',
          displayName: 'Test Snapshot 1',
          groupId: params.id,
          sequence: 1,
          databaseCount: 2,
          createdAt: '2024-01-01T00:00:00Z'
        },
        {
          id: 'test-snapshot-2',
          displayName: 'Test Snapshot 2',
          groupId: params.id,
          sequence: 2,
          databaseCount: 2,
          createdAt: '2024-01-01T01:00:00Z'
        }
      ],
      messages: {
        error: [],
        warning: [],
        info: [],
        success: []
      },
      timestamp: '2024-01-01T00:00:00Z'
    })
  }),

  // Mock settings API - this is crucial for ThemeContext
  http.get('/api/settings', () => {
    return HttpResponse.json({
      success: true,
      data: {
        preferences: {
          defaultGroup: '',
          maxHistoryEntries: 100
        },
        autoVerification: {
          enabled: false,
          intervalMinutes: 15
        },
        environment: {
          userName: 'test_user'
        }
      },
      messages: {
        error: [],
        warning: [],
        info: [],
        success: []
      },
      timestamp: '2024-01-01T00:00:00Z'
    })
  }),

  // Mock error responses
  http.post('/api/groups', () => {
    return HttpResponse.json({
      success: false,
      data: null,
      messages: {
        error: ['Group name already exists'],
        warning: [],
        info: [],
        success: []
      },
      timestamp: '2024-01-01T00:00:00Z'
    }, { status: 400 })
  }),

  // Mock snapshot path API
  http.get('/api/test-snapshot-path', () => {
    return HttpResponse.json({
      snapshotPath: '/var/opt/mssql/snapshots'
    })
  })
]

// Setup MSW server
const server = setupServer(...handlers)

// Start server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

// Reset handlers after each test
afterEach(() => server.resetHandlers())

// Clean up after all tests
afterAll(() => server.close())

// Export server for use in tests
export { server }
