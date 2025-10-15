import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ThemeSelector from '../ThemeSelector'
import { ThemeProvider } from '../../contexts/ThemeContext'

// Mock the useTheme hook
vi.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    currentTheme: 'blue',
    changeTheme: vi.fn(),
    themes: [
      { id: 'blue', name: 'Ocean Blue', colors: { primary: '#3b82f6', secondary: '#64748b' } },
      { id: 'emerald', name: 'Forest Emerald', colors: { primary: '#10b981', secondary: '#64748b' } },
    ]
  })
}))

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
  })

  it('renders when open', () => {
    renderWithTheme(<ThemeSelector isOpen={true} onClose={mockOnClose} />)

    expect(screen.getByText('Choose Your Theme')).toBeInTheDocument()
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

    const closeButton = screen.getByLabelText('Close theme selector')
    await user.click(closeButton)

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('has proper accessibility attributes', () => {
    renderWithTheme(<ThemeSelector isOpen={true} onClose={mockOnClose} />)

    const modal = screen.getByRole('dialog')
    expect(modal).toHaveAttribute('aria-modal', 'true')
    expect(modal).toHaveAttribute('aria-labelledby', 'theme-selector-title')
  })
})
