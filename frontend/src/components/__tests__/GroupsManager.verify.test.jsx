import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GroupsManager from '../GroupsManager';
import { api } from '../../api';

vi.mock('../../api', () => ({
  api: {
    get: vi.fn(),
    getProfiles: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
  isTauri: () => false,
}));

vi.mock('../../hooks/useModal', () => ({
  useConfirmationModal: vi.fn(() => ({
    modalState: { isOpen: false },
    showConfirmation: vi.fn(),
    hideConfirmation: vi.fn(),
    handleConfirm: vi.fn(),
  })),
  useInputModal: vi.fn(() => ({
    modalState: { isOpen: false },
    showInputModal: vi.fn(),
    hideInputModal: vi.fn(),
    handleSubmit: vi.fn(),
  })),
}));

vi.mock('../../hooks/useNotification', () => ({
  useNotification: () => ({
    notification: { isVisible: false },
    showSuccess: vi.fn(),
    showError: vi.fn(),
    hideNotification: vi.fn(),
  }),
}));

vi.mock('../../contexts/PasswordContext', () => ({
  usePassword: () => ({
    isAuthenticated: true,
    checkPassword: vi.fn().mockResolvedValue(true),
  }),
  PasswordProvider: ({ children }) => children,
}));

vi.mock('../../contexts/ThemeContext', () => ({
  ThemeProvider: ({ children }) => children,
  useTheme: () => ({
    theme: { name: 'Ocean Blue', mode: 'dark' },
    setTheme: vi.fn(),
  }),
}));

// Two groups on purpose: the consistency check is server-wide, not per-group,
// so Verify must call it once regardless of how many groups exist. Looping
// per group previously double/triple-reported the same orphaned or stale
// snapshot as separate rows in the dialog.
const mockGroups = [
  { id: 'group-1', name: 'Group One', databases: ['db1'], profileId: 'profile-1' },
  { id: 'group-2', name: 'Group Two', databases: ['db2'], profileId: 'profile-1' },
];

const mockProfiles = [{ id: 'profile-1', name: 'Profile 1', isActive: true }];

const setupApiMocks = (verifyResponse) => {
  api.get.mockImplementation((endpoint) => {
    if (endpoint === '/api/groups') {
      return Promise.resolve({ success: true, data: mockGroups });
    }
    if (endpoint === '/api/health') {
      return Promise.resolve({ connected: true });
    }
    if (endpoint === '/api/settings') {
      return Promise.resolve({
        success: true,
        data: { preferences: { autoCreateCheckpoint: true, maxHistoryEntries: 100 } },
      });
    }
    if (endpoint.match(/\/groups\/[^/]+\/snapshots$/)) {
      return Promise.resolve({ success: true, data: [] });
    }
    return Promise.resolve({ success: true, data: [] });
  });

  api.getProfiles.mockResolvedValue({ success: true, data: mockProfiles });

  api.post.mockImplementation((endpoint) => {
    if (endpoint === '/api/snapshots/verify') {
      return Promise.resolve(verifyResponse);
    }
    return Promise.resolve({ success: true });
  });
};

describe('GroupsManager - Verify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls the consistency check exactly once, not once per group', async () => {
    setupApiMocks({ success: true, verified: true, issues: [], orphanedInSQL: [], missingInSQL: [], unhealthyDatabases: [] });
    render(<GroupsManager />);

    await waitFor(() => {
      expect(screen.getByText('Group One')).toBeInTheDocument();
      expect(screen.getByText('Group Two')).toBeInTheDocument();
    });

    const verifyButton = screen.getByRole('button', { name: /Verify snapshot consistency/i });
    await userEvent.click(verifyButton);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/snapshots/verify', {});
    });

    const verifyCalls = api.post.mock.calls.filter(([endpoint]) => endpoint === '/api/snapshots/verify');
    expect(verifyCalls).toHaveLength(1);
  });

  it('does not report the same orphaned snapshot more than once', async () => {
    setupApiMocks({
      success: true,
      verified: false,
      issues: ['1 external snapshot found on SQL Server'],
      orphanedInSQL: ['dgl_a22b9015_vsrwest_dev_usr_dgl'],
      missingInSQL: [],
      unhealthyDatabases: [],
    });
    render(<GroupsManager />);

    await waitFor(() => {
      expect(screen.getByText('Group One')).toBeInTheDocument();
    });

    const verifyButton = screen.getByRole('button', { name: /Verify snapshot consistency/i });
    await userEvent.click(verifyButton);

    await waitFor(() => {
      expect(screen.getByText(/External Snapshots \(1\)/i)).toBeInTheDocument();
    });

    // The orphaned snapshot name should appear exactly once in the DROP DATABASE list
    const occurrences = screen.getAllByText(/dgl_a22b9015_vsrwest_dev_usr_dgl/i);
    expect(occurrences).toHaveLength(1);
  });

  it('shows a database-not-online banner instead of reporting all clear', async () => {
    setupApiMocks({
      success: true,
      verified: false,
      issues: ['1 database not online (likely an interrupted Discard Changes)'],
      orphanedInSQL: [],
      missingInSQL: [],
      unhealthyDatabases: [{ database: 'vsrwest_dev_usr_dgl', state: 'RESTORING' }],
    });
    render(<GroupsManager />);

    await waitFor(() => {
      expect(screen.getByText('Group One')).toBeInTheDocument();
    });

    const verifyButton = screen.getByRole('button', { name: /Verify snapshot consistency/i });
    await userEvent.click(verifyButton);

    await waitFor(() => {
      expect(screen.getByText(/Databases Not Online/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/vsrwest_dev_usr_dgl/)).toBeInTheDocument();
    expect(screen.getByText(/RESTORING/)).toBeInTheDocument();
    expect(screen.queryByText(/No issues detected/i)).not.toBeInTheDocument();
  });
});
