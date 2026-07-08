import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FilterPanel } from '../FilterPanel'
import { emptyFilter } from '../lib/filters'
import type { FilterOptions } from '../lib/filters'

const OPTIONS: FilterOptions = {
  projects: [
    { id: 'proj-1', name: 'Alpha Project' },
    { id: 'proj-2', name: 'Beta Project' },
  ],
  pipelines: [
    { id: 'pipe-1', name: 'Ingest Pipeline' },
    { id: 'pipe-2', name: 'Export Pipeline' },
  ],
  dataDomains: ['finance'],
  pipelineTypes: [],
  sourceSystems: [],
  targetSystems: [],
  urgencies: ['critical', 'high', 'medium', 'low'],
  owners: ['alice'],
  runTypes: [],
  sourceTypes: [],
  envScopes: [],
  maintenanceWindows: [],
  reviewStates: [],
  customTags: [],
}

function setup(overrides?: Partial<React.ComponentProps<typeof FilterPanel>>) {
  const onChange = vi.fn()
  const utils = render(
    <FilterPanel
      options={OPTIONS}
      filter={emptyFilter()}
      onChange={onChange}
      visibleCount={10}
      totalCount={10}
      {...overrides}
    />,
  )
  return { onChange, ...utils }
}

describe('FilterPanel', () => {
  it('renders section labels and item counts', () => {
    setup()
    expect(screen.getByText('Projects')).toBeInTheDocument()
    expect(screen.getByText('Pipelines')).toBeInTheDocument()
    expect(screen.getByText('10 shown')).toBeInTheDocument()
  })

  it('shows all project/pipeline options by default', () => {
    setup()
    expect(screen.getByText('Alpha Project')).toBeInTheDocument()
    expect(screen.getByText('Beta Project')).toBeInTheDocument()
    expect(screen.getByText('Ingest Pipeline')).toBeInTheDocument()
    expect(screen.getByText('Export Pipeline')).toBeInTheDocument()
  })

  it('filters options down when searching within filters', () => {
    setup()
    const search = screen.getByLabelText('Search filter options')
    fireEvent.change(search, { target: { value: 'alpha' } })

    expect(screen.getByText('Alpha Project')).toBeInTheDocument()
    expect(screen.queryByText('Beta Project')).not.toBeInTheDocument()
    // Pipeline items not matching "alpha" are also filtered out
    expect(screen.queryByText('Ingest Pipeline')).not.toBeInTheDocument()
    expect(screen.queryByText('Export Pipeline')).not.toBeInTheDocument()
  })

  it('search is case-insensitive and matches partial text', () => {
    setup()
    const search = screen.getByLabelText('Search filter options')
    fireEvent.change(search, { target: { value: 'PIPE' } })

    expect(screen.getByText('Ingest Pipeline')).toBeInTheDocument()
    expect(screen.getByText('Export Pipeline')).toBeInTheDocument()
    expect(screen.queryByText('Alpha Project')).not.toBeInTheDocument()
  })

  it('clears the search filter when input is cleared', () => {
    setup()
    const search = screen.getByLabelText('Search filter options')
    fireEvent.change(search, { target: { value: 'alpha' } })
    expect(screen.queryByText('Beta Project')).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: '' } })
    expect(screen.getByText('Beta Project')).toBeInTheDocument()
  })

  it('toggles a filter option and calls onChange with the updated set', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByLabelText('Alpha Project'))

    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0]
    expect(next.projects.has('proj-1')).toBe(true)
  })

  it('unchecks an already-active filter option', () => {
    const filter = { ...emptyFilter(), projects: new Set(['proj-1']) }
    const { onChange } = setup({ filter })
    fireEvent.click(screen.getByLabelText('Alpha Project'))

    const next = onChange.mock.calls[0][0]
    expect(next.projects.has('proj-1')).toBe(false)
  })

  it('collapses and expands a section on header click', () => {
    setup()
    // "urgency" section starts open by default
    expect(screen.getByText('critical')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Urgency'))
    expect(screen.queryByText('critical')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Urgency'))
    expect(screen.getByText('critical')).toBeInTheDocument()
  })

  it('shows Clear all button only when filters are active, and clears on click', () => {
    const filter = { ...emptyFilter(), projects: new Set(['proj-1']) }
    const { onChange } = setup({ filter })

    const clearBtn = screen.getByRole('button', { name: 'Clear all' })
    expect(clearBtn).toBeInTheDocument()

    fireEvent.click(clearBtn)
    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0]
    expect(next.projects.size).toBe(0)
  })

  it('does not show Clear all button when no filters are active', () => {
    setup()
    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument()
  })

  it('shows visible/total counts when filtered results differ', () => {
    const filter = { ...emptyFilter(), projects: new Set(['proj-1']) }
    setup({ filter, visibleCount: 3, totalCount: 10 })
    expect(screen.getByText('3 / 10')).toBeInTheDocument()
  })
})
