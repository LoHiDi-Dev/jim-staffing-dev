export type WarehouseCode = 'RCA' | 'FHPA' | 'DTX' | 'HQ'

export type Warehouse = {
  code: WarehouseCode
  label: 'RCA – Riverside' | 'FHPA – Fairless Hills' | 'DTX – Dallas' | 'Headquarters'
  siteId: 'site_rca' | 'site_phpa' | 'site_dtx' | 'site_seed_main'
}

export const WAREHOUSES: Warehouse[] = [
  { code: 'RCA', label: 'RCA – Riverside', siteId: 'site_rca' },
  { code: 'FHPA', label: 'FHPA – Fairless Hills', siteId: 'site_phpa' },
  { code: 'DTX', label: 'DTX – Dallas', siteId: 'site_dtx' },
  { code: 'HQ', label: 'Headquarters', siteId: 'site_seed_main' },
]

export const WAREHOUSE_CONTEXT_STORAGE_KEY = 'jim.warehouseContext'
