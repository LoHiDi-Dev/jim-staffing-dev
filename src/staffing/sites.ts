/** Work location options for staffing login. siteId is sent to JIM API. */
export type StaffingLocationCode = 'HQ' | 'DTX' | 'RCA' | 'FHPA'

export type StaffingSite = {
  code: StaffingLocationCode
  label: string
  siteId: string
}

export const STAFFING_SITES: StaffingSite[] = [
  { code: 'HQ', label: 'HQs — Headquarters', siteId: 'site_seed_main' },
  { code: 'DTX', label: 'DTX — Dallas Warehouse', siteId: 'site_dtx' },
  { code: 'RCA', label: 'RCA — Packaging & Warehouse', siteId: 'site_rca' },
  { code: 'FHPA', label: 'FHPA — E-Commerce Fulfillment', siteId: 'site_phpa' },
]
