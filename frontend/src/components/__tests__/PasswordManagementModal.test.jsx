import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PasswordManagementModal from '../PasswordManagementModal';
import { PasswordProvider } from '../../contexts/PasswordContext';

// Mock the API client
vi.mock('../../api/client', () => ({
  api: {
    get: vi.fn().mockResolvedValue({
      success: true,
      data: { status: 'skipped', passwordSet: false, passwordSkipped: true }
    }),
    post: vi.fn().mockResolvedValue({
      success: true,
      data: {}
    })
  }
}));

describe('PasswordManagementModal', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders when open', async () => {
    render(
      <PasswordProvider>
        <PasswordManagementModal isOpen={true} onClose={mockOnClose} />
      </PasswordProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Password Protection')).toBeInTheDocument();
    });

    expect(screen.getByText(/status/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <PasswordProvider>
        <PasswordManagementModal isOpen={false} onClose={mockOnClose} />
      </PasswordProvider>
    );

    expect(screen.queryByText('Password Protection')).not.toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <PasswordProvider>
        <PasswordManagementModal isOpen={true} onClose={mockOnClose} />
      </PasswordProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Password Protection')).toBeInTheDocument();
    });

    const closeButton = screen.getByLabelText('Close');
    await user.click(closeButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when ESC key is pressed', async () => {
    const user = userEvent.setup();
    render(
      <PasswordProvider>
        <PasswordManagementModal isOpen={true} onClose={mockOnClose} />
      </PasswordProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Password Protection')).toBeInTheDocument();
    });

    await user.keyboard('{Escape}');

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('shows confirm password field when new password is entered', async () => {
    const user = userEvent.setup();
    render(
      <PasswordProvider>
        <PasswordManagementModal isOpen={true} onClose={mockOnClose} />
      </PasswordProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Password Protection')).toBeInTheDocument();
    });

    const newPasswordInput = screen.getByLabelText(/new password/i);
    await user.type(newPasswordInput, 'test123');

    await waitFor(() => {
      expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    });
  });

  it('shows error when passwords do not match', async () => {
    const user = userEvent.setup();
    render(
      <PasswordProvider>
        <PasswordManagementModal isOpen={true} onClose={mockOnClose} />
      </PasswordProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Password Protection')).toBeInTheDocument();
    });

    const newPasswordInput = screen.getByLabelText(/new password/i);
    await user.type(newPasswordInput, 'test123');

    await waitFor(() => {
      expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    });

    const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
    await user.type(confirmPasswordInput, 'different');

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });
  });

  it('shows error when password is too short', async () => {
    const user = userEvent.setup();
    render(
      <PasswordProvider>
        <PasswordManagementModal isOpen={true} onClose={mockOnClose} />
      </PasswordProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Password Protection')).toBeInTheDocument();
    });

    const newPasswordInput = screen.getByLabelText(/new password/i);
    await user.type(newPasswordInput, '123');

    await waitFor(() => {
      expect(screen.getByText(/must be at least 6 characters/i)).toBeInTheDocument();
    });
  });
});
