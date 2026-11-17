import { describe, it, expect } from 'vitest'
import { duplicateTransportCardMessage } from '@/lib/rates/transport-duplicate'

describe('duplicateTransportCardMessage', () => {
  it('a second card for another sight says to add the sight to the existing card', () => {
    const m = duplicateTransportCardMessage({
      vehicle: 'sedan', routeName: 'LUXOR-HALF-DAY', city: 'Luxor', areaLabel: 'East Bank',
      hasSupplier: true, coversSights: ['Luxor Temple'],
    })
    expect(m).toContain('A sedan card named "LUXOR-HALF-DAY" (Luxor, East Bank) already exists for this supplier.')
    expect(m).toContain('"Sights covered"')
    expect(m).toContain('different route name')
  })

  it('a card with no sights says to edit the existing card or rename', () => {
    const m = duplicateTransportCardMessage({ vehicle: 'hiace', routeName: 'LUXOR-AIRPORT', city: 'Luxor', hasSupplier: true, coversSights: [] })
    expect(m).toBe('A hiace card named "LUXOR-AIRPORT" (Luxor) already exists for this supplier. Edit "LUXOR-AIRPORT" (Luxor) instead, or give this one a different route name.')
  })

  it('no supplier: suggests picking one', () => {
    const m = duplicateTransportCardMessage({ vehicle: 'bus', routeName: 'X', hasSupplier: false })
    expect(m).toContain('with no supplier')
    expect(m).toContain('or pick its supplier')
  })
})
