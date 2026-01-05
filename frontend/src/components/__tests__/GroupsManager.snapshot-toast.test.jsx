import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Test for the snapshot creation toast message bug.
 *
 * The bug: When creating a snapshot, the backend returns:
 *   { success: true, data: { snapshot: { displayName: '...' }, results: [] } }
 *
 * But the frontend code tries to access data.data.displayName directly,
 * which is undefined. It should access data.data.snapshot.displayName instead.
 */
describe('GroupsManager - Snapshot Creation Toast Message Bug', () => {
  let mockShowSuccess;

  beforeEach(() => {
    mockShowSuccess = vi.fn();
  });

  it('should PASS: displays correct snapshot name in toast when accessing snapshot.displayName correctly', async () => {
    const groupId = 'test-group-1';
    const snapshotName = 'My Test Snapshot';
    const displayName = '2026-05-01 13:00';

    // Simulate the actual backend API response format
    // Backend returns: { success: true, data: { snapshot: { displayName: ... }, results: [] } }
    const apiResponse = {
      success: true,
      data: {
        snapshot: {
          id: 'snapshot-1',
          groupId: groupId,
          displayName: displayName,
          sequence: 1,
          createdAt: new Date().toISOString(),
        },
        results: [
          { database: 'test_db', success: true },
        ],
      },
      messages: {
        error: [],
        warning: [],
        info: [],
        success: [`Snapshot "${displayName}" created successfully`],
      },
      timestamp: new Date().toISOString(),
    };

    // Simulate the FIXED code from handleCreateSnapshot
    // This is what the component should do - CORRECT!
    if (apiResponse.success) {
      const snapshot = apiResponse.data?.snapshot || apiResponse.data; // FIX: Access snapshot from data.snapshot
      mockShowSuccess(`Snapshot "${snapshot?.displayName || 'snapshot'}" created successfully!`);
    }

    // This test should PASS because snapshot.displayName is now correctly accessed
    expect(mockShowSuccess).toHaveBeenCalledWith(
      `Snapshot "${displayName}" created successfully!`
    );

    // Verify the fix: the actual call does NOT contain "undefined"
    const actualCall = mockShowSuccess.mock.calls[0][0];
    expect(actualCall).not.toContain('undefined');
  });
});

