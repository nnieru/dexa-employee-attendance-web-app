import {
  phoneNumberSchema,
  updateOwnProfileRequestSchema,
  type UpdateOwnProfileRequest,
} from '@dexa/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

export const PHONE_NUMBER_FORMAT_MESSAGE =
  'Enter 8 to 15 digits with an optional leading +. Leave the field empty to remove the number.';

// The contract decides what a number is. An empty field is allowed because it clears the stored number; the
// contract refuses an empty string, so toUpdateOwnProfileRequest sends null for it. Whitespace only is not
// empty and fails the contract, so it cannot clear the number by accident.
export const phoneNumberFormSchema = z.object({
  phoneNumber: z
    .string()
    .refine((value) => value === '' || phoneNumberSchema.safeParse(value).success, {
      error: PHONE_NUMBER_FORMAT_MESSAGE,
    }),
});

export type PhoneNumberFormValues = z.infer<typeof phoneNumberFormSchema>;

export const phoneNumberFormResolver = zodResolver(phoneNumberFormSchema);

export function toUpdateOwnProfileRequest(values: PhoneNumberFormValues): UpdateOwnProfileRequest {
  const phoneNumber = values.phoneNumber === '' ? null : values.phoneNumber;
  return updateOwnProfileRequestSchema.parse({ phoneNumber });
}
