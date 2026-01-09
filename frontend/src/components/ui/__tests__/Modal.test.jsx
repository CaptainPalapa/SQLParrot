import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmationModal, InputModal } from '../Modal';
import Modal from '../Modal';

describe('Modal Components', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ConfirmationModal', () => {
    const mockOnClose = vi.fn();
    const mockOnConfirm = vi.fn();

    it('renders when open', () => {
      render(
        <ConfirmationModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          title="Test Title"
          message="Test message"
        />
      );

      expect(screen.getByText('Test Title')).toBeInTheDocument();
      expect(screen.getByText('Test message')).toBeInTheDocument();
      expect(screen.getByText('Confirm')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('does not render when closed', () => {
      render(
        <ConfirmationModal
          isOpen={false}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          title="Test Title"
          message="Test message"
        />
      );

      expect(screen.queryByText('Test Title')).not.toBeInTheDocument();
    });

    it('calls onClose when cancel button is clicked', async () => {
      const user = userEvent.setup();
      render(
        <ConfirmationModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          title="Test Title"
          message="Test message"
        />
      );

      const cancelButton = screen.getByText('Cancel');
      await user.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
      expect(mockOnConfirm).not.toHaveBeenCalled();
    });

    it('calls onConfirm and onClose when confirm button is clicked', async () => {
      const user = userEvent.setup();
      render(
        <ConfirmationModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          title="Test Title"
          message="Test message"
        />
      );

      const confirmButton = screen.getByText('Confirm');
      await user.click(confirmButton);

      expect(mockOnConfirm).toHaveBeenCalledTimes(1);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('closes when ESC key is pressed', async () => {
      const user = userEvent.setup();
      render(
        <ConfirmationModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          title="Test Title"
          message="Test message"
        />
      );

      await user.keyboard('{Escape}');

      expect(mockOnClose).toHaveBeenCalledTimes(1);
      expect(mockOnConfirm).not.toHaveBeenCalled();
    });

    it('closes when Enter key is pressed if dismissOnEnter is true', async () => {
      const user = userEvent.setup();
      render(
        <ConfirmationModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          title="Test Title"
          message="Test message"
          dismissOnEnter={true}
        />
      );

      await user.keyboard('{Enter}');

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('does not close on Enter when dismissOnEnter is false', async () => {
      const user = userEvent.setup();
      render(
        <ConfirmationModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          title="Test Title"
          message="Test message"
          dismissOnEnter={false}
        />
      );

      await user.keyboard('{Enter}');

      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('renders with danger type', () => {
      render(
        <ConfirmationModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          title="Delete Item"
          message="Are you sure?"
          type="danger"
        />
      );

      expect(screen.getByText('Delete Item')).toBeInTheDocument();
    });

    it('renders with warning type', () => {
      render(
        <ConfirmationModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          title="Warning"
          message="This action cannot be undone"
          type="warning"
        />
      );

      expect(screen.getByText('Warning')).toBeInTheDocument();
    });

    it('hides cancel button when hideCancelButton is true', () => {
      render(
        <ConfirmationModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          title="Test Title"
          message="Test message"
          hideCancelButton={true}
        />
      );

      expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
      expect(screen.getByText('Confirm')).toBeInTheDocument();
    });

    it('uses custom confirm and cancel text', () => {
      render(
        <ConfirmationModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          title="Test Title"
          message="Test message"
          confirmText="Yes, delete"
          cancelText="No, keep it"
        />
      );

      expect(screen.getByText('Yes, delete')).toBeInTheDocument();
      expect(screen.getByText('No, keep it')).toBeInTheDocument();
    });
  });

  describe('InputModal', () => {
    const mockOnClose = vi.fn();
    const mockOnSubmit = vi.fn();

    it('renders when open', () => {
      render(
        <InputModal
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          title="Enter Name"
          label="Name"
          placeholder="Type your name"
        />
      );

      expect(screen.getByText('Enter Name')).toBeInTheDocument();
      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Type your name')).toBeInTheDocument();
    });

    it('does not render when closed', () => {
      render(
        <InputModal
          isOpen={false}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          title="Enter Name"
          label="Name"
        />
      );

      expect(screen.queryByText('Enter Name')).not.toBeInTheDocument();
    });

    it('calls onSubmit with input value when form is submitted', async () => {
      const user = userEvent.setup();
      render(
        <InputModal
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          title="Enter Name"
          label="Name"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Enter Name')).toBeInTheDocument();
      });

      const input = screen.getByRole('textbox');
      await user.type(input, 'Test Name');
      const submitButton = screen.getByText('Submit');
      await user.click(submitButton);

      expect(mockOnSubmit).toHaveBeenCalledWith('Test Name');
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when cancel button is clicked', async () => {
      const user = userEvent.setup();
      render(
        <InputModal
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          title="Enter Name"
          label="Name"
        />
      );

      const cancelButton = screen.getByText('Cancel');
      await user.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('closes when ESC key is pressed', async () => {
      const user = userEvent.setup();
      render(
        <InputModal
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          title="Enter Name"
          label="Name"
        />
      );

      await user.keyboard('{Escape}');

      expect(mockOnClose).toHaveBeenCalledTimes(1);
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('initializes with initialValue', () => {
      render(
        <InputModal
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          title="Enter Name"
          label="Name"
          initialValue="Initial Value"
        />
      );

      const input = screen.getByRole('textbox');
      expect(input).toHaveValue('Initial Value');
    });

    it('prevents submission when required and value is empty', async () => {
      const user = userEvent.setup();
      render(
        <InputModal
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          title="Enter Name"
          label="Name"
          required={true}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Enter Name')).toBeInTheDocument();
      });

      const submitButton = screen.getByText('Submit');
      expect(submitButton).toBeDisabled();

      const input = screen.getByRole('textbox');
      await user.type(input, '   '); // Only whitespace
      
      // Still disabled because trimmed value is empty
      expect(submitButton).toBeDisabled();
    });

    it('allows submission when required and value is provided', async () => {
      const user = userEvent.setup();
      render(
        <InputModal
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          title="Enter Name"
          label="Name"
          required={true}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Enter Name')).toBeInTheDocument();
      });

      const input = screen.getByRole('textbox');
      await user.type(input, 'Test Name');
      
      const submitButton = screen.getByText('Submit');
      expect(submitButton).not.toBeDisabled();
    });

    it('trims whitespace from submitted value', async () => {
      const user = userEvent.setup();
      render(
        <InputModal
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          title="Enter Name"
          label="Name"
        />
      );

      // Wait for modal to render
      await waitFor(() => {
        expect(screen.getByText('Enter Name')).toBeInTheDocument();
      });

      const input = screen.getByRole('textbox');
      await user.type(input, '  Test Name  ');
      const submitButton = screen.getByText('Submit');
      await user.click(submitButton);

      expect(mockOnSubmit).toHaveBeenCalledWith('Test Name');
    });

    it('uses custom submit and cancel text', () => {
      render(
        <InputModal
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          title="Enter Name"
          label="Name"
          submitText="Save"
          cancelText="Discard"
        />
      );

      expect(screen.getByText('Save')).toBeInTheDocument();
      expect(screen.getByText('Discard')).toBeInTheDocument();
    });
  });

  describe('Modal (Generic)', () => {
    const mockOnClose = vi.fn();

    it('renders when open', () => {
      render(
        <Modal isOpen={true} onClose={mockOnClose} title="Test Modal">
          <p>Modal content</p>
        </Modal>
      );

      expect(screen.getByText('Test Modal')).toBeInTheDocument();
      expect(screen.getByText('Modal content')).toBeInTheDocument();
    });

    it('does not render when closed', () => {
      render(
        <Modal isOpen={false} onClose={mockOnClose} title="Test Modal">
          <p>Modal content</p>
        </Modal>
      );

      expect(screen.queryByText('Test Modal')).not.toBeInTheDocument();
      expect(screen.queryByText('Modal content')).not.toBeInTheDocument();
    });

    it('calls onClose when close button is clicked', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <Modal isOpen={true} onClose={mockOnClose} title="Test Modal">
          <p>Modal content</p>
        </Modal>
      );

      // Close button is an X icon without aria-label, find by role or parent button
      const closeButton = container.querySelector('button');
      await user.click(closeButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('closes when ESC key is pressed', async () => {
      const user = userEvent.setup();
      render(
        <Modal isOpen={true} onClose={mockOnClose} title="Test Modal">
          <p>Modal content</p>
        </Modal>
      );

      await user.keyboard('{Escape}');

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('renders without title', () => {
      render(
        <Modal isOpen={true} onClose={mockOnClose}>
          <p>Modal content</p>
        </Modal>
      );

      expect(screen.getByText('Modal content')).toBeInTheDocument();
      expect(screen.queryByLabelText('Close')).not.toBeInTheDocument();
    });

    it('applies correct size class for sm', () => {
      const { container } = render(
        <Modal isOpen={true} onClose={mockOnClose} title="Test" size="sm">
          <p>Content</p>
        </Modal>
      );

      const modalContent = container.querySelector('.max-w-sm');
      expect(modalContent).toBeInTheDocument();
    });

    it('applies correct size class for lg', () => {
      const { container } = render(
        <Modal isOpen={true} onClose={mockOnClose} title="Test" size="lg">
          <p>Content</p>
        </Modal>
      );

      const modalContent = container.querySelector('.max-w-lg');
      expect(modalContent).toBeInTheDocument();
    });

    it('applies correct size class for xl', () => {
      const { container } = render(
        <Modal isOpen={true} onClose={mockOnClose} title="Test" size="xl">
          <p>Content</p>
        </Modal>
      );

      const modalContent = container.querySelector('.max-w-xl');
      expect(modalContent).toBeInTheDocument();
    });

    it('applies default size class (md) when size not specified', () => {
      const { container } = render(
        <Modal isOpen={true} onClose={mockOnClose} title="Test">
          <p>Content</p>
        </Modal>
      );

      const modalContent = container.querySelector('.max-w-md');
      expect(modalContent).toBeInTheDocument();
    });
  });
});
