import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_PHOTO_BYTES, PHOTO_FIELD_NAME, type OwnProfile } from '@dexa/contracts';
import { listenForWindowFocus } from '@dexa/session';
import { mswServer } from '../../../test/msw-server.js';
import {
  EMPLOYEE_ACCOUNT,
  OWN_PHOTO_URL,
  OWN_PROFILE,
  OWN_PROFILE_URL,
  accountCheckSucceeds,
  loginSucceeds,
  ownProfileSucceeds,
  renderEmployeeApp,
  signInWith,
} from '../../../test/employee-app-harness.js';
import { PHONE_NUMBER_FORMAT_MESSAGE } from '../utils/phone-number-form.schema.js';

const SAVED_PHONE_NUMBER = '+6281999999999';
const PHOTO_OBJECT_URL = 'blob:dexa-test-edited-photo';
const PHOTO_CHOOSER_LABEL = 'Choose photo';
const OVERSIZE_MESSAGE = 'The photo is larger than 5 MB. Choose a smaller file.';
const SERVER_PHONE_MESSAGE =
  'phoneNumber: must be an optional leading + followed by 8 to 15 digits';

let stopListeningForWindowFocus: () => void = () => undefined;

beforeEach(() => {
  mswServer.use(loginSucceeds(), accountCheckSucceeds(), ownProfileSucceeds());
  stopListeningForWindowFocus = listenForWindowFocus();
  // jsdom has no object URL support, so the test provides it for the uploader's preview and the photo.
  URL.createObjectURL = vi.fn(() => PHOTO_OBJECT_URL);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  stopListeningForWindowFocus();
});

async function openProfileAsSignedInEmployee() {
  const user = userEvent.setup();
  const router = await renderEmployeeApp('/login');
  await signInWith(user, EMPLOYEE_ACCOUNT.email);
  await screen.findByRole('heading', { level: 1, name: 'Attendance' });
  await act(async () => {
    await router.navigate({ href: '/profile' });
  });
  await screen.findByRole('heading', { level: 2, name: OWN_PROFILE.name });
  return { user };
}

/**
 * A profile the test can change through PATCH or PUT, so the refetch after a save shows the stored result.
 * It also records what the client sent, so a test can assert the request body and the multipart field.
 */
function storedProfileHandlers(initialProfile: OwnProfile) {
  let storedProfile = initialProfile;
  const profileReads = { count: 0 };
  const phoneRequestBodies: unknown[] = [];
  const photoFieldNames: string[] = [];
  const handlers = [
    http.get(OWN_PROFILE_URL, () => {
      profileReads.count += 1;
      return HttpResponse.json(storedProfile);
    }),
    http.patch(OWN_PROFILE_URL, async ({ request }) => {
      const body = (await request.json()) as { phoneNumber: string | null };
      phoneRequestBodies.push(body);
      storedProfile = { ...storedProfile, phoneNumber: body.phoneNumber };
      return HttpResponse.json(storedProfile);
    }),
    http.put(OWN_PHOTO_URL, async ({ request }) => {
      // The raw multipart text names each part; jsdom's Blob is not accepted by request.formData() here.
      const multipartBody = await request.text();
      photoFieldNames.push(...readMultipartFieldNames(multipartBody));
      storedProfile = { ...storedProfile, photoUrl: OWN_PHOTO_URL };
      return HttpResponse.json(storedProfile);
    }),
    http.get(OWN_PHOTO_URL, () => new HttpResponse(new Blob([new Uint8Array([0xff, 0xd8, 0xff])]))),
  ];
  return { handlers, profileReads, phoneRequestBodies, photoFieldNames };
}

function readMultipartFieldNames(multipartBody: string): string[] {
  return Array.from(
    multipartBody.matchAll(/Content-Disposition: form-data; name="([^"]+)"/g),
    (match) => match[1] ?? '',
  );
}

function jpegFile(sizeInBytes: number, fileName: string): File {
  const bytes = new Uint8Array(sizeInBytes);
  bytes.set([0xff, 0xd8, 0xff]);
  return new File([bytes], fileName, { type: 'image/jpeg' });
}

describe('profile phone form', () => {
  it('should send the new phone number and show it saved when the save succeeds', async () => {
    const { handlers, profileReads, phoneRequestBodies } = storedProfileHandlers(OWN_PROFILE);
    mswServer.use(...handlers);
    const { user } = await openProfileAsSignedInEmployee();
    const phone = screen.getByRole('textbox', { name: 'Phone number' });
    const readsBeforeSave = profileReads.count;

    await user.clear(phone);
    await user.type(phone, SAVED_PHONE_NUMBER);
    await user.click(screen.getByRole('button', { name: 'Save phone number' }));

    expect(await screen.findByText('Phone number saved.')).toBeInTheDocument();
    expect(phoneRequestBodies).toEqual([{ phoneNumber: SAVED_PHONE_NUMBER }]);
    expect(screen.getByRole('textbox', { name: 'Phone number' })).toHaveValue(SAVED_PHONE_NUMBER);
    expect(profileReads.count).toBeGreaterThan(readsBeforeSave);
    expect(screen.queryByText('Photo updated.')).not.toBeInTheDocument();
  });

  it('should show the server validation message on the phone field when the server refuses the number', async () => {
    mswServer.use(
      http.patch(OWN_PROFILE_URL, () =>
        HttpResponse.json(
          { statusCode: 400, code: 'VALIDATION_FAILED', message: SERVER_PHONE_MESSAGE },
          { status: 400 },
        ),
      ),
    );
    const { user } = await openProfileAsSignedInEmployee();
    const phone = screen.getByRole('textbox', { name: 'Phone number' });

    await user.clear(phone);
    await user.type(phone, '+6281234567');
    await user.click(screen.getByRole('button', { name: 'Save phone number' }));

    expect(await screen.findByText(PHONE_NUMBER_FORMAT_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Phone number' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.queryByText('Phone number saved.')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should show the format message on the field and send no request when the phone number is malformed', async () => {
    const phoneRequestCount = { value: 0 };
    mswServer.use(
      http.patch(OWN_PROFILE_URL, () => {
        phoneRequestCount.value += 1;
        return HttpResponse.json(OWN_PROFILE);
      }),
    );
    const { user } = await openProfileAsSignedInEmployee();
    const phone = screen.getByRole('textbox', { name: 'Phone number' });

    await user.clear(phone);
    await user.type(phone, '12-34');
    await user.click(screen.getByRole('button', { name: 'Save phone number' }));

    expect(await screen.findByText(PHONE_NUMBER_FORMAT_MESSAGE)).toBeInTheDocument();
    expect(phoneRequestCount.value).toBe(0);
  });
});

describe('profile photo upload', () => {
  it('should reject an oversize photo on the client and send no upload request', async () => {
    const photoRequestCount = { value: 0 };
    mswServer.use(
      http.put(OWN_PHOTO_URL, () => {
        photoRequestCount.value += 1;
        return HttpResponse.json(OWN_PROFILE);
      }),
    );
    const { user } = await openProfileAsSignedInEmployee();
    const oversizeFile = jpegFile(MAX_PHOTO_BYTES + 1, 'oversize.jpg');

    await user.upload(screen.getByLabelText(PHOTO_CHOOSER_LABEL), oversizeFile);

    expect(await screen.findByText(OVERSIZE_MESSAGE)).toBeInTheDocument();
    expect(screen.getByLabelText(PHOTO_CHOOSER_LABEL)).toHaveAttribute('aria-invalid', 'true');
    expect(photoRequestCount.value).toBe(0);
    expect(screen.queryByText('Photo updated.')).not.toBeInTheDocument();
  });

  it('should upload the photo as multipart in the photo field and show it updated when the upload succeeds', async () => {
    const { handlers, profileReads, photoFieldNames } = storedProfileHandlers(OWN_PROFILE);
    mswServer.use(...handlers);
    const { user } = await openProfileAsSignedInEmployee();
    const readsBeforeUpload = profileReads.count;

    await user.upload(screen.getByLabelText(PHOTO_CHOOSER_LABEL), jpegFile(1024, 'portrait.jpg'));

    expect(await screen.findByText('Photo updated.')).toBeInTheDocument();
    expect(photoFieldNames).toEqual([PHOTO_FIELD_NAME]);
    expect(profileReads.count).toBeGreaterThan(readsBeforeUpload);
    expect(screen.queryByText('Phone number saved.')).not.toBeInTheDocument();
  });
});
