## JIM Staffing® — Agency Integration Pack

Prepared by: **Joel S. Premier — Senior Software Engineer**

This folder documents the **Staffing Agency API** exposed by the JIM Staffing® (Workforce Attendance) service.

### Audience
- Staffing agencies (Prologistix, Staff Force)
- Payroll / reporting integrators

### Authentication
Agency endpoints require an API key via `Authorization: Bearer <API_KEY>`.

Environment variables:
- `STAFFING_API_KEY_PROLOGISTIX`
- `STAFFING_API_KEY_STAFF_FORCE`

### Base URL
- Agency API: `/api/staffing/v1`
- Employee portal API: `/api/v1`

### Files
- `api.md`: Requests/responses and error behavior
- `openapi.yaml`: OpenAPI schema for the agency endpoints
- `timecard-pdf-spec.md`: One-page timecard rules (employee portal PDF)
- `csv-spec.md`: CSV export fields for payroll import

