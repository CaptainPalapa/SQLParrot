import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GroupsManager from '../GroupsManager';
import { api } from '../../api';
import { useConfirmationModal } from '../../hooks/useModal';

// Mock dependencies
vi.mock('../../api', () => ({
  api: {
    get: vi.fn(),
    getProfiles: vi.fn(),
  },
  isTauri: () => false,
}));

vi.mock('../../hooks/useModal', () => ({
  useConfirmationModal: vi.fn(),
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

describe('GroupsManager - Profile Change Validation', () => {
  const mockShowConfirmation = vi.fn();
  const mockProfiles = [
    { id: 'profile-1', name: 'Profile 1', isActive: true },
    { id: 'profile-2', name: 'Profile 2', isActive: false },
  ];

  const mockGroups = [
    {
      id: 'group-1',
      name: 'Test Group',
      databases: ['db1', 'db2'],
      profileId: 'profile-1',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    useConfirmationModal.mockReturnValue({
      modalState: { isOpen: false },
      showConfirmation: mockShowConfirmation,
      hideConfirmation: vi.fn(),
      handleConfirm: vi.fn(),
    });

    api.get.mockImplementation((endpoint) => {
      if (endpoint === '/api/groups') {
        return Promise.resolve({ success: true, data: mockGroups });
      }
      if (endpoint === '/api/health') {
        return Promise.resolve({ connected: true });
      }
      if (endpoint.includes('/snapshots')) {
        return Promise.resolve({ success: true, data: [] });
      }
      return Promise.resolve({ success: true, data: [] });
    });

    api.getProfiles.mockResolvedValue({
      success: true,
      data: mockProfiles,
    });
  });

  it('should show warning when changing profile with snapshots', async () => {
    // Mock snapshots for the group
    api.get.mockImplementation((endpoint) => {
      if (endpoint === '/api/groups') {
        return Promise.resolve({ success: true, data: mockGroups });
      }
      if (endpoint.includes('/snapshots')) {
        return Promise.resolve({
          success: true,
          data: [
            {
              id: 'snapshot-1',
              groupId: 'group-1',
              displayName: 'Test Snapshot',
            },
          ],
        });
      }
      return Promise.resolve({ success: true, data: [] });
    });

    render(<GroupsManager />);

    await waitFor(() => {
      expect(screen.getByText('Test Group')).toBeInTheDocument();
    });

    // Click edit button
    const editButton = screen.getByLabelText(/Edit group Test Group/i);
    await userEvent.click(editButton);

    await waitFor(() => {
      expect(screen.getByText('Edit Group')).toBeInTheDocument();
    });

    // Change profile
    const profileSelect = screen.getByLabelText(/Connection Profile/i);
    await userEvent.selectOptions(profileSelect, 'profile-2');

    await waitFor(() => {
      expect(mockShowConfirmation).toHaveBeenCalled();
      const callArgs = mockShowConfirmation.mock.calls[0][0];
      expect(callArgs.title).toBe('Change Connection Profile');
      expect(callArgs.type).toBe('danger');
      expect(callArgs.confirmText).toContain('Delete Snapshots');
      // Should mention snapshots
      expect(callArgs.message.props.children).toBeDefined();
    });
  });

  it('should show warning when changing profile with saved databases', async () => {
    // No snapshots, but has databases
    api.get.mockImplementation((endpoint) => {
      if (endpoint === '/api/groups') {
        return Promise.resolve({ success: true, data: mockGroups });
      }
      if (endpoint.includes('/snapshots')) {
        return Promise.resolve({ success: true, data: [] });
      }
      return Promise.resolve({ success: true, data: [] });
    });

    render(<GroupsManager />);

    await waitFor(() => {
      expect(screen.getByText('Test Group')).toBeInTheDocument();
    });

    // Click edit button
    const editButton = screen.getByLabelText(/Edit group Test Group/i);
    await userEvent.click(editButton);

    await waitFor(() => {
      expect(screen.getByText('Edit Group')).toBeInTheDocument();
    });

    // Change profile
    const profileSelect = screen.getByLabelText(/Connection Profile/i);
    await userEvent.selectOptions(profileSelect, 'profile-2');

    await waitFor(() => {
      expect(mockShowConfirmation).toHaveBeenCalled();
      const callArgs = mockShowConfirmation.mock.calls[0][0];
      expect(callArgs.title).toBe('Change Connection Profile');
      expect(callArgs.type).toBe('warning');
      expect(callArgs.confirmText).toBe('Change Profile');
    });
  });

  it('should not show warning when no snapshots and no saved databases', async () => {
    // Group with no databases and no snapshots
    const emptyGroup = [
      {
        id: 'group-1',
        name: 'Empty Group',
        databases: [],
        profileId: 'profile-1',
      },
    ];

    api.get.mockImplementation((endpoint) => {
      if (endpoint === '/api/groups') {
        return Promise.resolve({ success: true, data: emptyGroup });
      }
      if (endpoint.includes('/snapshots')) {
        return Promise.resolve({ success: true, data: [] });
      }
      return Promise.resolve({ success: true, data: [] });
    });

    render(<GroupsManager />);

    await waitFor(() => {
      expect(screen.getByText('Empty Group')).toBeInTheDocument();
    });

    // Click edit button
    const editButton = screen.getByLabelText(/Edit group Empty Group/i);
    await userEvent.click(editButton);

    await waitFor(() => {
      expect(screen.getByText('Edit Group')).toBeInTheDocument();
    });

    // Change profile
    const profileSelect = screen.getByLabelText(/Connection Profile/i);
    await userEvent.selectOptions(profileSelect, 'profile-2');

    // Should not show confirmation - profile should change silently
    await waitFor(() => {
      // Give it a moment to ensure no confirmation was called
      expect(mockShowConfirmation).not.toHaveBeenCalled();
    });
  });

  it('should not show warning when selecting same profile', async () => {
    render(<GroupsManager />);

    await waitFor(() => {
      expect(screen.getByText('Test Group')).toBeInTheDocument();
    });

    // Click edit button
    const editButton = screen.getByLabelText(/Edit group Test Group/i);
    await userEvent.click(editButton);

    await waitFor(() => {
      expect(screen.getByText('Edit Group')).toBeInTheDocument();
    });

    // Select the same profile (profile-1)
    const profileSelect = screen.getByLabelText(/Connection Profile/i);
    await userEvent.selectOptions(profileSelect, 'profile-1');

    // Should not show confirmation
    await waitFor(() => {
      expect(mockShowConfirmation).not.toHaveBeenCalled();
    });
  });
});
