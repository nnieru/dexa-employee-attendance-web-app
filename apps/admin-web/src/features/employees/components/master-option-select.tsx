import type { UseQueryResult } from '@tanstack/react-query';
import type { ComponentPropsWithRef, ReactNode } from 'react';
import type { MasterOption } from '@dexa/contracts';
import { Alert, Button } from '@dexa/ui';
import { selectAssignableOptions } from '../utils/select-assignable-options.js';
import { SelectField } from './select-field.js';

const LOADING_HINT = 'Loading options.';
const NO_ACTIVE_OPTIONS_HINT = 'No active options are available.';
const RETRY_LABEL = 'Try again';

type MasterOptionSelectProps = ComponentPropsWithRef<'select'> & {
  /** Replaces the options hint, for example to explain why the select is locked. */
  customHint?: ReactNode;
  /** The option the record already holds. It stays in the list even when it is inactive. */
  currentOptionId?: string;
  error?: ReactNode;
  label: string;
  /** The catalog query. The select is disabled until it succeeds, and a failure offers a retry. */
  lookup: UseQueryResult<ReadonlyArray<MasterOption>, Error>;
  loadFailureMessage: string;
  placeholder: string;
};

/**
 * A select filled from a master catalog (T-EMP-06). Loading and failure are shown beside the field, so the user knows
 * why there are no choices. Only active options are offered for a new assignment.
 */
export function MasterOptionSelect({
  currentOptionId,
  customHint,
  disabled = false,
  error,
  label,
  loadFailureMessage,
  lookup,
  placeholder,
  ...selectProps
}: MasterOptionSelectProps) {
  const options = lookup.data ? selectAssignableOptions(lookup.data, currentOptionId) : [];
  const activeOptionCount = options.filter((option) => option.isActive).length;
  return (
    <>
      <SelectField
        {...selectProps}
        label={label}
        error={error}
        disabled={disabled || !lookup.isSuccess}
        hint={customHint ?? getOptionsHint(lookup, activeOptionCount)}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </SelectField>
      {lookup.isError && (
        <Alert
          variant="error"
          action={
            <Button variant="secondary" onClick={() => void lookup.refetch()}>
              {RETRY_LABEL}
            </Button>
          }
        >
          {loadFailureMessage}
        </Alert>
      )}
    </>
  );
}

function getOptionsHint(
  lookup: UseQueryResult<ReadonlyArray<MasterOption>, Error>,
  activeOptionCount: number,
): string | undefined {
  if (lookup.isPending) return LOADING_HINT;
  if (lookup.isSuccess && activeOptionCount === 0) return NO_ACTIVE_OPTIONS_HINT;
  return undefined;
}
