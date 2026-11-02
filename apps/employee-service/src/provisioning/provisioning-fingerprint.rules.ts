import { createHash } from 'node:crypto';

/** The non-secret fields that identify one create request under its operation ID. */
export type ProvisioningFingerprintFields = {
  readonly email: string;
  readonly name: string;
  readonly positionId: string;
  readonly employeeStatusId: string;
  readonly phoneNumber: string | null;
};

/**
 * Returns the lowercase hex SHA-256 of a canonical JSON of the fields. The keys are written in one fixed order and
 * the text fields are normalized, so the same request always yields the same fingerprint. The password is not a
 * field, so it never reaches the fingerprint, the stored record, or a log.
 */
export function calculateProvisioningFingerprint(fields: ProvisioningFingerprintFields): string {
  const canonicalJson = JSON.stringify({
    email: fields.email.trim().toLowerCase(),
    employeeStatusId: fields.employeeStatusId,
    name: fields.name.trim(),
    phoneNumber: fields.phoneNumber === null ? null : fields.phoneNumber.trim(),
    positionId: fields.positionId,
  });
  return createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
}
