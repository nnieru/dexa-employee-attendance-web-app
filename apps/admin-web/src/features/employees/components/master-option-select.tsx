import type { UseQueryResult } from '@tanstack/react-query';
import type { ComponentPropsWithRef, ReactNode } from 'react';
import type { MasterOption } from '@dexa/contracts';
import { Alert, Button } from '@dexa/ui';
import { selectActiveOptions } from '../utils/select-active-options.js';
import { SelectField } from './select-field.js';

const LOADING_HINT = 'Loading options.';
const NO_ACTIVE_OPTIONS_HINT = 'No active options are available.';
const RETRY_LABEL = 'Try again';

type MasterOptionSelectProps = ComponentPropsWithRef<'select'> & {
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
  error,
  label,
  loadFailureMessage,
  lookup,
  placeholder,
  ...selectProps
}: MasterOptionSelectProps) {
  const activeOptions = lookup.data ? selectActiveOptions(lookup.data) : [];
  return (
    <>
      <SelectField
        {...selectProps}
        label={label}
        error={error}
        disabled={!lookup.isSuccess}
        hint={getOptionsHint(lookup, activeOptions.length)}
      >
        <option value="">{placeholder}</option>
        {activeOptions.map((option) => (
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
