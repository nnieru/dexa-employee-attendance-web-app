import '@testing-library/jest-dom/vitest';

/*
 * jsdom 30 exposes <dialog> without showModal() or close(). Browsers provide them natively, so this
 * shim is installed only when they are missing. It reproduces what Dialog relies on: the open
 * attribute, and a cancelable `cancel` event sent to the open modal when Escape is pressed.
 * It does not model the inert background or native focus handling; Dialog implements the Tab wrap
 * and focus restore itself, and those behaviours are checked in dialog.spec.tsx.
 */
if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') {
      return;
    }
    document
      .querySelector('dialog[open]')
      ?.dispatchEvent(new Event('cancel', { cancelable: true }));
  });
}
