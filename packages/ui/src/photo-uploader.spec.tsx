import { afterEach, beforeEach, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhotoUploader } from './photo-uploader.js';

const FIVE_MEGABYTES = 5 * 1024 * 1024;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff, 0xe0];
const UPLOAD_LABEL = 'Choose photo';

/** A file whose first bytes are the given signature, padded with zeros to sizeBytes. */
function createImageFile(
  signature: readonly number[],
  mimeType: string,
  fileName: string,
  sizeBytes = signature.length,
): File {
  const bytes = new Uint8Array(sizeBytes);
  bytes.set(signature);
  return new File([bytes], fileName, { type: mimeType });
}

let createObjectURL: Mock<(object: Blob) => string>;
let revokeObjectURL: Mock<(url: string) => void>;

beforeEach(() => {
  createObjectURL = vi.fn<(object: Blob) => string>().mockReturnValue('blob:preview-1');
  revokeObjectURL = vi.fn<(url: string) => void>();
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
});

afterEach(() => {
  Reflect.deleteProperty(URL, 'createObjectURL');
  Reflect.deleteProperty(URL, 'revokeObjectURL');
});

it('should reject a file whose type is not JPG or PNG with a message when it is chosen', async () => {
  // applyAccept is off so the file reaches the component, as it does when a user picks "All files".
  const user = userEvent.setup({ applyAccept: false });
  const onSelect = vi.fn();
  render(<PhotoUploader label={UPLOAD_LABEL} maxBytes={FIVE_MEGABYTES} onSelect={onSelect} />);
  const textFile = new File(['hello'], 'notes.txt', { type: 'text/plain' });

  await user.upload(screen.getByLabelText(UPLOAD_LABEL), textFile);

  expect(await screen.findByText('Choose a JPG or PNG image.')).toBeInTheDocument();
  expect(screen.getByLabelText(UPLOAD_LABEL)).toHaveAttribute('aria-invalid', 'true');
  expect(onSelect).not.toHaveBeenCalled();
});

it('should reject a file larger than maxBytes with the limit in the message when it is chosen', async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  const oversizeFile = createImageFile(PNG_SIGNATURE, 'image/png', 'large.png', 2048);
  render(<PhotoUploader label={UPLOAD_LABEL} maxBytes={1024} onSelect={onSelect} />);

  await user.upload(screen.getByLabelText(UPLOAD_LABEL), oversizeFile);

  expect(
    await screen.findByText('The photo is larger than 1 KB. Choose a smaller file.'),
  ).toBeInTheDocument();
  expect(onSelect).not.toHaveBeenCalled();
});

it.each([
  { name: 'PNG', signature: PNG_SIGNATURE, mimeType: 'image/png', fileName: 'face.png' },
  { name: 'JPEG', signature: JPEG_SIGNATURE, mimeType: 'image/jpeg', fileName: 'face.jpg' },
])('should call onSelect with the file when a valid $name is chosen', async (testCase) => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  const imageFile = createImageFile(testCase.signature, testCase.mimeType, testCase.fileName, 64);
  render(<PhotoUploader label={UPLOAD_LABEL} maxBytes={FIVE_MEGABYTES} onSelect={onSelect} />);

  await user.upload(screen.getByLabelText(UPLOAD_LABEL), imageFile);

  await waitFor(() => expect(onSelect).toHaveBeenCalledWith(imageFile));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('should reject a file whose bytes are not an image when its type says image/png', async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  const renamedFile = new File(['this is plain text'], 'renamed.png', { type: 'image/png' });
  render(<PhotoUploader label={UPLOAD_LABEL} maxBytes={FIVE_MEGABYTES} onSelect={onSelect} />);

  await user.upload(screen.getByLabelText(UPLOAD_LABEL), renamedFile);

  expect(
    await screen.findByText('This file is not a JPG or PNG image. Choose another file.'),
  ).toBeInTheDocument();
  expect(onSelect).not.toHaveBeenCalled();
});

it('should show the selected image as a preview with alt text when a valid file is chosen', async () => {
  const user = userEvent.setup();
  const imageFile = createImageFile(PNG_SIGNATURE, 'image/png', 'face.png', 64);
  render(<PhotoUploader label={UPLOAD_LABEL} maxBytes={FIVE_MEGABYTES} onSelect={vi.fn()} />);

  await user.upload(screen.getByLabelText(UPLOAD_LABEL), imageFile);

  const preview = await screen.findByRole('img', { name: 'Preview of the selected photo' });
  expect(preview).toHaveAttribute('src', 'blob:preview-1');
});

it('should revoke the preview URL when the uploader unmounts', async () => {
  const user = userEvent.setup();
  const imageFile = createImageFile(PNG_SIGNATURE, 'image/png', 'face.png', 64);
  const { unmount } = render(
    <PhotoUploader label={UPLOAD_LABEL} maxBytes={FIVE_MEGABYTES} onSelect={vi.fn()} />,
  );
  await user.upload(screen.getByLabelText(UPLOAD_LABEL), imageFile);
  await screen.findByRole('img', { name: 'Preview of the selected photo' });

  unmount();

  expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
});

it('should revoke the previous preview URL when a different valid file is chosen', async () => {
  const user = userEvent.setup();
  createObjectURL.mockReturnValueOnce('blob:preview-1').mockReturnValueOnce('blob:preview-2');
  render(<PhotoUploader label={UPLOAD_LABEL} maxBytes={FIVE_MEGABYTES} onSelect={vi.fn()} />);
  const input = screen.getByLabelText(UPLOAD_LABEL);

  await user.upload(input, createImageFile(PNG_SIGNATURE, 'image/png', 'first.png', 64));
  await screen.findByRole('img', { name: 'Preview of the selected photo' });
  await user.upload(input, createImageFile(JPEG_SIGNATURE, 'image/jpeg', 'second.jpg', 64));

  await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1'));
  expect(screen.getByRole('img', { name: 'Preview of the selected photo' })).toHaveAttribute(
    'src',
    'blob:preview-2',
  );
});

it('should keep the last accepted preview and show the reason when a later file is rejected', async () => {
  // applyAccept is off so the text file reaches the component, as it does when a user picks "All files".
  const user = userEvent.setup({ applyAccept: false });
  const onSelect = vi.fn();
  render(<PhotoUploader label={UPLOAD_LABEL} maxBytes={FIVE_MEGABYTES} onSelect={onSelect} />);
  const input = screen.getByLabelText(UPLOAD_LABEL);
  await user.upload(input, createImageFile(PNG_SIGNATURE, 'image/png', 'face.png', 64));
  await screen.findByRole('img', { name: 'Preview of the selected photo' });

  await user.upload(input, new File(['text'], 'notes.txt', { type: 'text/plain' }));

  expect(await screen.findByText('Choose a JPG or PNG image.')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Preview of the selected photo' })).toBeInTheDocument();
  expect(onSelect).toHaveBeenCalledTimes(1);
});

it('should show the app error and mark the input invalid when error is given', () => {
  render(
    <PhotoUploader
      label={UPLOAD_LABEL}
      maxBytes={FIVE_MEGABYTES}
      onSelect={vi.fn()}
      error="The photo could not be saved. Try again."
    />,
  );

  const input = screen.getByLabelText(UPLOAD_LABEL);
  expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(input).toHaveAccessibleDescription(
    'JPG or PNG, up to 5 MB. The photo could not be saved. Try again.',
  );
});

it('should accept only JPG and PNG in the file input and state the size limit when rendered', () => {
  render(<PhotoUploader label={UPLOAD_LABEL} maxBytes={FIVE_MEGABYTES} onSelect={vi.fn()} />);

  const input = screen.getByLabelText(UPLOAD_LABEL);
  expect(input).toHaveAttribute('type', 'file');
  expect(input).toHaveAttribute('accept', 'image/jpeg,image/png');
  expect(input).toHaveAccessibleDescription('JPG or PNG, up to 5 MB.');
});

it('should disable the file input when isDisabled is set', () => {
  render(
    <PhotoUploader label={UPLOAD_LABEL} maxBytes={FIVE_MEGABYTES} onSelect={vi.fn()} isDisabled />,
  );

  expect(screen.getByLabelText(UPLOAD_LABEL)).toBeDisabled();
});
