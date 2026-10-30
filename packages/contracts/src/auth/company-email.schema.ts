import { z } from 'zod';

// Matches accounts.company_email, varchar(254) in DATABASE §3.
const COMPANY_EMAIL_MAX_LENGTH = 254;

// Sign-in and provisioning share these rules, so both accept and reject the same addresses.
export const companyEmailSchema = z
  .string()
  .trim()
  .max(COMPANY_EMAIL_MAX_LENGTH, {
    error: `must be at most ${COMPANY_EMAIL_MAX_LENGTH} characters`,
  })
  .pipe(z.email({ error: 'must be an email address' }));
