import type { MasterDataDocument } from './master-data-setting.schema.js';

// Illustrative labels for local development only. The config schema refuses this data when
// NODE_ENV is production. Real positions are supplied by the organization through EMPLOYEE_MASTER_DATA.
export const FIXTURE_MASTER_DATA: MasterDataDocument = {
  positions: [
    { code: 'FULLSTACK_DEVELOPER', name: 'Fullstack Developer' },
    { code: 'HR_OFFICER', name: 'HR Officer' },
    { code: 'PRODUCT_DESIGNER', name: 'Product Designer' },
    { code: 'QA_ENGINEER', name: 'QA Engineer' },
  ],
  employeeStatuses: [
    { code: 'ACTIVE', name: 'Active' },
    { code: 'INACTIVE', name: 'Inactive' },
  ],
};
