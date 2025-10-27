import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FormInput from '../FormInput'
import FormTextarea from '../FormTextarea'
import FormCheckbox from '../FormCheckbox'

describe('Form Components', () => {
  describe('FormInput', () => {
    it('renders with label and input', () => {
      const mockOnChange = vi.fn()
      render(
        <FormInput
          label="Test Input"
          value=""
          onChange={mockOnChange}
        />
      )

      expect(screen.getByText('Test Input')).toBeInTheDocument()
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })

    it('shows error when provided', () => {
      const mockOnChange = vi.fn()
      render(
        <FormInput
          label="Test Input"
          value=""
          onChange={mockOnChange}
          error="This field is required"
          touched={true}
        />
      )

      expect(screen.getByText('This field is required')).toBeInTheDocument()
      expect(screen.getByRole('textbox')).toHaveClass('border-red-500')
    })

    it('calls onChange when input changes', async () => {
      const user = userEvent.setup()
      const mockOnChange = vi.fn()
      render(
        <FormInput
          label="Test Input"
          value=""
          onChange={mockOnChange}
        />
      )

      const input = screen.getByRole('textbox')
      await user.type(input, 'hello')

      expect(mockOnChange).toHaveBeenCalledWith('h')
      expect(mockOnChange).toHaveBeenCalledWith('e')
      expect(mockOnChange).toHaveBeenCalledWith('l')
      expect(mockOnChange).toHaveBeenCalledWith('l')
      expect(mockOnChange).toHaveBeenCalledWith('o')
    })

    it('shows required indicator when required', () => {
      const mockOnChange = vi.fn()
      render(
        <FormInput
          label="Test Input"
          value=""
          onChange={mockOnChange}
          required
        />
      )

      expect(screen.getByText('*')).toBeInTheDocument()
    })
  })

  describe('FormTextarea', () => {
    it('renders with label and textarea', () => {
      const mockOnChange = vi.fn()
      render(
        <FormTextarea
          label="Test Textarea"
          value=""
          onChange={mockOnChange}
        />
      )

      expect(screen.getByText('Test Textarea')).toBeInTheDocument()
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })

    it('shows error when provided', () => {
      const mockOnChange = vi.fn()
      render(
        <FormTextarea
          label="Test Textarea"
          value=""
          onChange={mockOnChange}
          error="This field is required"
          touched={true}
        />
      )

      expect(screen.getByText('This field is required')).toBeInTheDocument()
    })
  })

  describe('FormCheckbox', () => {
    it('renders with label and checkbox', () => {
      const mockOnChange = vi.fn()
      render(
        <FormCheckbox
          label="Test Checkbox"
          checked={false}
          onChange={mockOnChange}
        />
      )

      expect(screen.getByText('Test Checkbox')).toBeInTheDocument()
      expect(screen.getByRole('checkbox')).toBeInTheDocument()
    })

    it('calls onChange when checkbox is clicked', async () => {
      const user = userEvent.setup()
      const mockOnChange = vi.fn()
      render(
        <FormCheckbox
          label="Test Checkbox"
          checked={false}
          onChange={mockOnChange}
        />
      )

      const checkbox = screen.getByRole('checkbox')
      await user.click(checkbox)

      expect(mockOnChange).toHaveBeenCalledWith(true)
    })

    it('shows error when provided', () => {
      const mockOnChange = vi.fn()
      render(
        <FormCheckbox
          label="Test Checkbox"
          checked={false}
          onChange={mockOnChange}
          error="This field is required"
          touched={true}
        />
      )

      expect(screen.getByText('This field is required')).toBeInTheDocument()
    })
  })
})
