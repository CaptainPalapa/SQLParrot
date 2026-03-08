/**
 * Smoke test for the root App (react-dom + React tree).
 * Ensures the app mounts and renders a recognizable shell after dependency
 * updates (e.g. react-dom, @testing-library/react).
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import App from './App'

describe('App (smoke)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
    // Password status: skipped so we get past gate and see main UI (matches api/auth/password-status shape)
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          status: 'skipped',
          passwordSet: false,
          passwordSkipped: true,
          envVarIgnored: false
        }
      })
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders app shell (SQL Parrot heading or main nav)', async () => {
    render(<App />)
    await waitFor(
      () => {
        expect(screen.getByText('SQL Parrot')).toBeInTheDocument()
      },
      { timeout: 3000 }
    )
    expect(screen.getByText('Groups')).toBeInTheDocument()
  })
})
