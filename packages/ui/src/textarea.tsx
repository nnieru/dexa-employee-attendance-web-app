import { useId, type ComponentPropsWithRef, type ReactNode } from 'react';

type TextareaProps = ComponentPropsWithRef<'textarea'> & {
  error?: ReactNode;
  hint?: ReactNode;
  label: ReactNode;
};

const MINIMUM_TEXTAREA_ROWS = 3;

/**
 * Same field rules as TextField: persistent label, linked hint and error, aria-invalid on error.
 * A required textarea shows a visible "required" word after the label, as in the mockup's reason
 * fields. The word sits outside the label and is hidden from assistive technology, because the
 * native required attribute already announces it; reading both would repeat it.
 */
export function Textarea({
  'aria-describedby': ariaDescribedBy,
  className = '',
  error,
  hint,
  id,
  label,
  required,
  rows = MINIMUM_TEXTAREA_ROWS,
  ...props
}: TextareaProps) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const hintId = hint ? `${textareaId}-hint` : undefined;
  const errorId = error ? `${textareaId}-error` : undefined;
  const describedBy = [ariaDescribedBy, hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`dexa-field ${className}`.trim()}>
      <div className="dexa-field__heading">
        <label className="dexa-field__label" htmlFor={textareaId}>
          {label}
        </label>
        {required && (
          <span className="dexa-field__required" aria-hidden="true">
            required
          </span>
        )}
      </div>
      <textarea
        {...props}
        id={textareaId}
        required={required}
        rows={Math.max(rows, MINIMUM_TEXTAREA_ROWS)}
        className="dexa-field__input dexa-textarea"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
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
