import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ImportModal } from '../ImportModal'

const VALID_DOC = {
  schemaVersion: '1.0',
  projects: [
    {
      id: 'proj-1',
      name: 'Project One',
      timezone: 'Asia/Taipei',
      tags: {},
      pipelineRefs: [{ pipelineId: 'pipe-1' }],
    },
  ],
  pipelines: [
    {
      id: 'pipe-1',
      name: 'Pipeline One',
      timezone: 'Asia/Taipei',
      tags: {},
      schedules: [
        {
          id: 'sched-1',
          title: 'Schedule One',
          enabled: true,
          timezone: 'Asia/Taipei',
          schedule: {
            type: 'recurring',
            startDate: '2026-01-01',
            time: '09:00',
            durationSeconds: 300,
            recurrence: { mode: 'simple', frequency: 'daily', interval: 1 },
          },
          tags: {},
        },
      ],
    },
  ],
}

function setup() {
  const onImport = vi.fn()
  const onClose = vi.fn()
  render(<ImportModal onImport={onImport} onClose={onClose} />)
  return { onImport, onClose }
}

describe('ImportModal', () => {
  it('renders the paste editor and import button', () => {
    setup()
    expect(screen.getByLabelText('Paste JSON')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument()
  })

  it('disables the Import button when the textarea is empty', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled()
  })

  it('shows an actionable error message for unparseable JSON', () => {
    setup()
    const textarea = screen.getByLabelText('Paste JSON')
    fireEvent.change(textarea, { target: { value: '{ not valid json' } })
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/1 validation error/)).toBeInTheDocument()
    expect(screen.getByText(/Invalid JSON/)).toBeInTheDocument()
  })

  it('shows validation errors for JSON that fails schema validation', () => {
    setup()
    const textarea = screen.getByLabelText('Paste JSON')
    fireEvent.change(textarea, { target: { value: JSON.stringify({ foo: 'bar' }) } })
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))

    expect(screen.getByRole('alert')).toBeInTheDocument()
    // schemaVersion, projects, pipelines are all required and missing
    expect(screen.getAllByText(/./).length).toBeGreaterThan(0)
  })

  it('does not call onImport/onClose on invalid input, leaving the modal open', () => {
    const { onImport, onClose } = setup()
    const textarea = screen.getByLabelText('Paste JSON')
    fireEvent.change(textarea, { target: { value: '{ broken' } })
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))

    expect(onImport).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    // Modal stays mounted/visible for the user to correct the input
    expect(screen.getByLabelText('Paste JSON')).toBeInTheDocument()
  })

  it('accepts valid JSON and calls onImport with parsed data, then onClose', () => {
    const { onImport, onClose } = setup()
    const textarea = screen.getByLabelText('Paste JSON')
    fireEvent.change(textarea, { target: { value: JSON.stringify(VALID_DOC) } })
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))

    expect(onImport).toHaveBeenCalledTimes(1)
    expect(onImport.mock.calls[0][0].schemaVersion).toBe('1.0')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('clears prior errors when the user edits the text again', () => {
    setup()
    const textarea = screen.getByLabelText('Paste JSON')
    fireEvent.change(textarea, { target: { value: '{ broken' } })
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()

    fireEvent.change(textarea, { target: { value: '{ broken again' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('calls onClose when the close button is clicked', () => {
    const { onClose } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
