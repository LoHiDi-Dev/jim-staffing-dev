/** Work location options for staffing login. siteId is sent to JIM API. */
export type StaffingLocationCode = 'HQ' | 'DTX' | 'RCA' | 'FHPA'

export type StaffingSite = {
  code: StaffingLocationCode
  label: string
  siteId: string
}

export const STAFFING_SITES: StaffingSite[] = [
  { code: 'HQ', label: 'HQs', siteId: 'site_seed_main' },
  { code: 'DTX', label: 'DTX', siteId: 'site_dtx' },
  { code: 'RCA', label: 'RCA', siteId: 'site_rca' },
  { code: 'FHPA', label: 'FHPA', siteId: 'site_phpa' },
]
