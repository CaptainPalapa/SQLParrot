import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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

describe('GroupsManager - Discard Changes Modal', () => {
  const mockGroups = [
    { id: 'group-1', name: 'Test Group', databases: ['db1'], profileId: 'profile-1' },
  ];

  const mockSnapshots = [
    {
      id: 'snapshot-1',
      groupId: 'group-1',
      displayName: 'Automatic - 3/8/2026, 3:19:32 PM',
      createdAt: new Date().toISOString(),
      sequence: 1,
      databaseSnapshots: [{ database: 'db1', success: true, snapshotName: 'snap_1_db1' }],
    },
  ];

  const mockProfiles = [{ id: 'profile-1', name: 'Profile 1', isActive: true }];

  const setupApiMocks = (autoCreateCheckpoint = true) => {
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
          data: {
            preferences: { autoCreateCheckpoint, maxHistoryEntries: 100 },
          },
        });
      }
      if (endpoint.includes('check-external')) {
        return Promise.resolve({ hasExternalSnapshots: false });
      }
      if (endpoint.match(/\/groups\/[^/]+\/snapshots$/)) {
        return Promise.resolve({ success: true, data: mockSnapshots });
      }
      return Promise.resolve({ success: true, data: [] });
    });

    api.getProfiles.mockResolvedValue({ success: true, data: mockProfiles });
    api.post.mockResolvedValue({ success: true, message: 'Discarded changes' });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setupApiMocks(true);
  });

  it('should show checkbox checked when autoCreateCheckpoint setting is true', async () => {
    setupApiMocks(true);
    render(<GroupsManager />);

    await waitFor(() => {
      expect(screen.getByText('Test Group')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Discard Changes/i })).toBeInTheDocument();
    });

    const discardButton = screen.getByRole('button', { name: /Discard Changes/i });
    await userEvent.click(discardButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Discard Changes/i })).toBeInTheDocument();
    });

    const checkbox = screen.getByRole('checkbox', { name: /Create checkpoint after rollback/i });
    expect(checkbox).toBeChecked();
    expect(screen.getByText(/will be created/)).toBeInTheDocument();
    expect(screen.queryByText(/will NOT be created/)).not.toBeInTheDocument();
  });

  it('should show checkbox unchecked when autoCreateCheckpoint setting is false', async () => {
    setupApiMocks(false);
    render(<GroupsManager />);

    await waitFor(() => {
      expect(screen.getByText('Test Group')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Discard Changes/i })).toBeInTheDocument();
    });

    const discardButton = screen.getByRole('button', { name: /Discard Changes/i });
    await userEvent.click(discardButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Discard Changes/i })).toBeInTheDocument();
    });

    const dialog = screen.getByRole('dialog', { name: /Discard Changes/i });
    const checkbox = within(dialog).getByRole('checkbox', { name: /Create checkpoint after rollback/i });
    expect(checkbox).not.toBeChecked();
  });

  it('should show "will NOT be created" when user unchecks the checkbox', async () => {
    setupApiMocks(true);
    render(<GroupsManager />);

    await waitFor(() => {
      expect(screen.getByText('Test Group')).toBeInTheDocument();
    });

    const discardButton = screen.getByRole('button', { name: /Discard Changes/i });
    await userEvent.click(discardButton);

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /Create checkpoint after rollback/i })).toBeInTheDocument();
    });

    const checkbox = screen.getByRole('checkbox', { name: /Create checkpoint after rollback/i });
    await userEvent.click(checkbox);

    await waitFor(() => {
      expect(checkbox).not.toBeChecked();
    });
  });

  it('should show "will be created" when user checks the checkbox', async () => {
    setupApiMocks(false);
    render(<GroupsManager />);

    await waitFor(() => {
      expect(screen.getByText('Test Group')).toBeInTheDocument();
    });

    const discardButton = screen.getByRole('button', { name: /Discard Changes/i });
    await userEvent.click(discardButton);

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /Create checkpoint after rollback/i })).toBeInTheDocument();
    });

    const checkbox = screen.getByRole('checkbox', { name: /Create checkpoint after rollback/i });
    await userEvent.click(checkbox);

    await waitFor(() => {
      expect(checkbox).toBeChecked();
      expect(screen.getByText(/will be created/)).toBeInTheDocument();
    });
  });

  it('should call rollback API with autoCreateCheckpoint: true when checkbox is checked', async () => {
    setupApiMocks(true);
    render(<GroupsManager />);

    await waitFor(() => {
      expect(screen.getByText('Test Group')).toBeInTheDocument();
    });

    const discardButtons = screen.getAllByRole('button', { name: /Discard Changes/i });
    await userEvent.click(discardButtons[0]);

    await waitFor(() => {
      const dialog = screen.getByRole('dialog', { name: /Discard Changes/i });
      expect(within(dialog).getByRole('button', { name: /^Discard Changes$/ })).toBeInTheDocument();
    });

    const dialog = screen.getByRole('dialog', { name: /Discard Changes/i });
    const confirmButton = within(dialog).getByRole('button', { name: /^Discard Changes$/ });
    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/api/snapshots/snapshot-1/rollback',
        expect.objectContaining({ autoCreateCheckpoint: true })
      );
    });
  });

  it('should call rollback API with autoCreateCheckpoint: false when checkbox is unchecked', async () => {
    setupApiMocks(true);
    render(<GroupsManager />);

    await waitFor(() => {
      expect(screen.getByText('Test Group')).toBeInTheDocument();
    });

    const discardButtons = screen.getAllByRole('button', { name: /Discard Changes/i });
    await userEvent.click(discardButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /Create checkpoint after rollback/i })).toBeInTheDocument();
    });

    const checkbox = screen.getByRole('checkbox', { name: /Create checkpoint after rollback/i });
    await userEvent.click(checkbox);

    const dialog = screen.getByRole('dialog', { name: /Discard Changes/i });
    const confirmButton = within(dialog).getByRole('button', { name: /^Discard Changes$/ });
    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/api/snapshots/snapshot-1/rollback',
        expect.objectContaining({ autoCreateCheckpoint: false })
      );
    });
  });
});
