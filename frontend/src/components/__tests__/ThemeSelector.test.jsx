import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ThemeSelector from '../ThemeSelector'
import { ThemeProvider } from '../../contexts/ThemeContext'

// Don't mock useTheme - we want to test the actual ThemeContext behavior

const renderWithTheme = (component) => {
  return render(
    <ThemeProvider>
      {component}
    </ThemeProvider>
  )
}

describe('ThemeSelector', () => {
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock fetch globally with default response for ThemeContext
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { preferences: {}, autoVerification: {} },
        environment: { userName: 'test-user' }
      })
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders when open', async () => {
    renderWithTheme(<ThemeSelector isOpen={true} onClose={mockOnClose} />)

    // Wait for the API call to complete
    await waitFor(() => {
      expect(screen.getByText('Choose Your Theme')).toBeInTheDocument()
    })

    expect(screen.getByText('Ocean Blue')).toBeInTheDocument()
    expect(screen.getByText('Forest Emerald')).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    renderWithTheme(<ThemeSelector isOpen={false} onClose={mockOnClose} />)

    expect(screen.queryByText('Choose Your Theme')).not.toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup()
    renderWithTheme(<ThemeSelector isOpen={true} onClose={mockOnClose} />)

    // Wait for the API call to complete
    await waitFor(() => {
      expect(screen.getByText('Choose Your Theme')).toBeInTheDocument()
    })

    const closeButton = screen.getByLabelText('Close theme selector')
    await user.click(closeButton)

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('has proper accessibility attributes', async () => {
    renderWithTheme(<ThemeSelector isOpen={true} onClose={mockOnClose} />)

    // Wait for the API call to complete
    await waitFor(() => {
      expect(screen.getByText('Choose Your Theme')).toBeInTheDocument()
    })

    const modal = screen.getByRole('dialog')
    expect(modal).toHaveAttribute('aria-modal', 'true')
    expect(modal).toHaveAttribute('aria-labelledby', 'theme-selector-title')
  })
})
