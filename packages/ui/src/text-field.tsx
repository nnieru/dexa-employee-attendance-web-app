import { useId, type ComponentPropsWithRef, type ReactNode } from 'react';

type TextFieldProps = ComponentPropsWithRef<'input'> & {
  error?: ReactNode;
  hint?: ReactNode;
  label: ReactNode;
};

/**
 * The label is always visible: placeholders never replace it. Error and hint text are linked
 * through aria-describedby so screen readers announce them with the input.
 */
export function TextField({
  'aria-describedby': ariaDescribedBy,
  className = '',
  error,
  hint,
  id,
  label,
  readOnly = false,
  ...props
}: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [ariaDescribedBy, hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`dexa-field ${className}`.trim()}>
      <label className="dexa-field__label" htmlFor={inputId}>
        {label}
      </label>
      {hint && (
        <p id={hintId} className="dexa-field__hint">
          {hint}
        </p>
      )}
      <input
        {...props}
        id={inputId}
        className="dexa-field__input"
        readOnly={readOnly}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {error && (
        <p id={errorId} className="dexa-field__error">
          {error}
        </p>
      )}
    </div>
  );
}
