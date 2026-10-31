import {
  useId,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
} from 'react';
import { IconButton } from './icon-button.js';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

type DialogProps = {
  children?: ReactNode;
  className?: string;
  description?: ReactNode;
  footer?: ReactNode;
  /**
   * Element that receives focus when the dialog opens. Pass a ref from useRef: a new ref object on
   * every render reopens the dialog. Defaults to the first focusable element inside it.
   */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** When false, Escape and the close button are ignored, for example while a request is in flight. */
  isDismissible?: boolean;
  onClose: () => void;
  open: boolean;
  showCloseButton?: boolean;
  title: ReactNode;
};

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/**
 * Returns the element that must receive focus instead of the browser's next Tab stop, or null when
 * the browser may move focus natively. Focus that has left the dialog is brought back to its edge.
 */
function findFocusWrapTarget(
  focusable: readonly HTMLElement[],
  activeElement: Element | null,
  isBackward: boolean,
): HTMLElement | null {
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) {
    return null;
  }

  const isInside = focusable.some((element) => element === activeElement);
  if (isBackward && (activeElement === first || !isInside)) {
    return last;
  }
  if (!isBackward && (activeElement === last || !isInside)) {
    return first;
  }
  return null;
}

/**
 * Controlled modal built on the native dialog element. showModal() provides the inert background
 * and top layer; this component adds the Tab wrap, initial focus, and focus restore that jsdom and
 * some browsers do not guarantee. `open` is the source of truth: Escape reports through onClose and
 * never closes the dialog on its own.
 */
export function Dialog({
  children,
  className = '',
  description,
  footer,
  initialFocusRef,
  isDismissible = true,
  onClose,
  open,
  showCloseButton = true,
  title,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) {
      return;
    }

    const triggerElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    (initialFocusRef?.current ?? getFocusableElements(dialog)[0] ?? dialog).focus();

    // Listening on the document catches Tab even when focus has somehow left the dialog; a listener
    // on the dialog element would never see that key press.
    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') {
        return;
      }
      const wrapTarget = findFocusWrapTarget(
        getFocusableElements(dialog),
        document.activeElement,
        event.shiftKey,
      );
      if (wrapTarget) {
        event.preventDefault();
        wrapTarget.focus();
      }
    };
    document.addEventListener('keydown', handleDocumentKeyDown);

    return () => {
      document.removeEventListener('keydown', handleDocumentKeyDown);
      dialog.close();
      triggerElement?.focus();
    };
  }, [initialFocusRef, open]);

  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    // Stop the browser from closing the dialog itself so React state stays the source of truth.
    event.preventDefault();
    if (isDismissible) {
      onClose();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={`dexa-dialog ${className}`.trim()}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={handleCancel}
    >
      <div className="dexa-dialog__header">
        <div className="dexa-dialog__heading">
          <h2 id={titleId} className="dexa-dialog__title">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="dexa-dialog__description">
              {description}
            </p>
          )}
        </div>
        {showCloseButton && (
          <IconButton
            className="dexa-dialog__close"
            aria-label="Close"
            iconName="x"
            disabled={!isDismissible}
            onClick={onClose}
          />
        )}
      </div>
      {children && <div className="dexa-dialog__body">{children}</div>}
      {footer && <div className="dexa-dialog__footer">{footer}</div>}
    </dialog>
  );
}
