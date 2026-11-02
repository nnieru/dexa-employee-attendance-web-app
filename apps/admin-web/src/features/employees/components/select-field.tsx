import { useId, type ComponentPropsWithRef, type ReactNode } from 'react';

type SelectFieldProps = ComponentPropsWithRef<'select'> & {
  error?: ReactNode;
  hint?: ReactNode;
  label: ReactNode;
};

/**
 * A native select with the same label, error, and hint wiring as TextField. The label stays visible and
 * the error is linked through aria-describedby.
 */
export function SelectField({
  'aria-describedby': ariaDescribedBy,
  children,
  className = '',
  error,
  hint,
  id,
  label,
  ...props
}: SelectFieldProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const hintId = hint ? `${selectId}-hint` : undefined;
  const errorId = error ? `${selectId}-error` : undefined;
  const describedBy = [ariaDescribedBy, hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`dexa-field ${className}`.trim()}>
      <label className="dexa-field__label" htmlFor={selectId}>
        {label}
      </label>
      <select
        {...props}
        id={selectId}
        className="dexa-field__input"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      >
        {children}
      </select>
      {error && (
        <p id={errorId} className="dexa-field__error">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className="dexa-field__hint">
          {hint}
        </p>
      )}
    </div>
  );
}
