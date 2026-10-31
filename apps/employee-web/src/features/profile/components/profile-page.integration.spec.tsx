import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listenForWindowFocus } from '@dexa/session';
import { mswServer } from '../../../test/msw-server.js';
import {
  ACCESS_TOKEN,
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

const PHOTO_OBJECT_URL = 'blob:dexa-test-photo';
const PHOTO_ALT_TEXT = `Profile photo of ${OWN_PROFILE.name}`;
const INITIALS = 'RK';

let stopListeningForWindowFocus: () => void = () => undefined;

beforeEach(() => {
  mswServer.use(loginSucceeds(), accountCheckSucceeds(), ownProfileSucceeds());
  stopListeningForWindowFocus = listenForWindowFocus();
  // jsdom has no object URL support, so the test provides it and can observe revocation.
  URL.createObjectURL = vi.fn(() => PHOTO_OBJECT_URL);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  stopListeningForWindowFocus();
});

function photoSucceeds(onRequest: (request: Request) => void = () => undefined) {
  return http.get(OWN_PHOTO_URL, ({ request }) => {
    onRequest(request);
    return new HttpResponse(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])]), {
      headers: { 'Content-Type': 'image/jpeg' },
    });
  });
}

async function openProfileAsSignedInEmployee() {
  const user = userEvent.setup();
  const router = await renderEmployeeApp('/login');
  await signInWith(user, EMPLOYEE_ACCOUNT.email);
  await screen.findByRole('heading', { level: 1, name: 'Attendance' });
  await act(async () => {
    await router.navigate({ href: '/profile' });
  });
  return { user, router };
}

describe('profile page', () => {
  it('should show the name, company email, position, phone, and profile status when the profile loads', async () => {
    await openProfileAsSignedInEmployee();

    expect(await screen.findByRole('heading', { level: 1, name: 'Profile' })).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { level: 2, name: OWN_PROFILE.name }),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Company email' })).toHaveValue(OWN_PROFILE.email);
    expect(screen.getByRole('textbox', { name: 'Position' })).toHaveValue(
      OWN_PROFILE.position.name,
    );
    expect(screen.getByRole('textbox', { name: 'Phone number' })).toHaveValue(
      OWN_PROFILE.phoneNumber,
    );
    expect(screen.getByText('Profile complete')).toBeInTheDocument();
  });

  it('should keep the name, email, and position read-only when the employee types into them', async () => {
    const { user } = await openProfileAsSignedInEmployee();
    const email = await screen.findByRole('textbox', { name: 'Company email' });
    const position = screen.getByRole('textbox', { name: 'Position' });

    expect(email).toHaveAttribute('readonly');
    expect(position).toHaveAttribute('readonly');
    expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument();

    await user.type(email, 'someone.else@dexa.test');
    await user.type(position, 'Manager');

    expect(email).toHaveValue(OWN_PROFILE.email);
    expect(position).toHaveValue(OWN_PROFILE.position.name);
  });

  it('should show an empty phone field with Not recorded yet when no phone number is saved', async () => {
    mswServer.use(ownProfileSucceeds({ ...OWN_PROFILE, phoneNumber: null }));
    await openProfileAsSignedInEmployee();

    const phone = await screen.findByRole('textbox', { name: 'Phone number' });
    expect(phone).toHaveValue('');
    expect(phone).toHaveAccessibleDescription('Not recorded yet');
  });

  it.each([
    { profileStatus: 'COMPLETE' as const, text: 'Profile complete' },
    { profileStatus: 'INCOMPLETE' as const, text: 'Profile incomplete' },
  ])(
    'should show $text when the profile status is $profileStatus',
    async ({ profileStatus, text }) => {
      mswServer.use(ownProfileSucceeds({ ...OWN_PROFILE, profileStatus }));
      await openProfileAsSignedInEmployee();

      expect(await screen.findByText(text)).toBeInTheDocument();
    },
  );

  it('should show the loading message until the profile arrives', async () => {
    let releaseProfile: () => void = () => undefined;
    const profileReleased = new Promise<void>((resolve) => {
      releaseProfile = resolve;
    });
    mswServer.use(
      http.get(OWN_PROFILE_URL, async () => {
        await profileReleased;
        return HttpResponse.json(OWN_PROFILE);
      }),
    );
    await openProfileAsSignedInEmployee();

    expect(await screen.findByText('Loading profile…')).toBeInTheDocument();

    await act(async () => {
      releaseProfile();
    });
    expect(
      await screen.findByRole('heading', { level: 2, name: OWN_PROFILE.name }),
    ).toBeInTheDocument();
  });

  it('should show an error with a retry that fetches the profile again and then shows it when the first request fails', async () => {
    let profileRequestCount = 0;
    mswServer.use(
      http.get(OWN_PROFILE_URL, () => {
        profileRequestCount += 1;
        if (profileRequestCount === 1) {
          return HttpResponse.json(
            { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Internal error.' },
            { status: 500 },
          );
        }
        return HttpResponse.json(OWN_PROFILE);
      }),
    );
    const { user } = await openProfileAsSignedInEmployee();

    expect(await screen.findByRole('alert')).toHaveTextContent('Your profile could not be loaded.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(
      await screen.findByRole('heading', { level: 2, name: OWN_PROFILE.name }),
    ).toBeInTheDocument();
    expect(profileRequestCount).toBe(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should request the photo with the Bearer token in the Authorization header and no token in the URL when the profile has a photo', async () => {
    const photoRequests: Request[] = [];
    mswServer.use(
      ownProfileSucceeds({ ...OWN_PROFILE, photoUrl: OWN_PHOTO_URL }),
      photoSucceeds((request) => {
        photoRequests.push(request);
      }),
    );
    await openProfileAsSignedInEmployee();
    await screen.findByRole('img', { name: PHOTO_ALT_TEXT });

    expect(photoRequests).toHaveLength(1);
    const photoRequest = photoRequests[0];
    if (!photoRequest) throw new Error('The photo was not requested');
    expect(photoRequest.headers.get('Authorization')).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(new URL(photoRequest.url).search).toBe('');
    expect(photoRequest.url).not.toContain(ACCESS_TOKEN);
  });

  it('should show the photo through an object URL when the photo loads', async () => {
    mswServer.use(ownProfileSucceeds({ ...OWN_PROFILE, photoUrl: OWN_PHOTO_URL }), photoSucceeds());
    await openProfileAsSignedInEmployee();

    const photo = await screen.findByRole('img', { name: PHOTO_ALT_TEXT });
    expect(photo).toHaveAttribute('src', PHOTO_OBJECT_URL);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('should revoke the photo object URL when the employee leaves Profile', async () => {
    mswServer.use(ownProfileSucceeds({ ...OWN_PROFILE, photoUrl: OWN_PHOTO_URL }), photoSucceeds());
    const { router } = await openProfileAsSignedInEmployee();
    await screen.findByRole('img', { name: PHOTO_ALT_TEXT });

    await act(async () => {
      await router.navigate({ href: '/attendance' });
    });

    expect(URL.revokeObjectURL).toHaveBeenCalledWith(PHOTO_OBJECT_URL);
  });

  it('should show initials and no photo request when the profile has no photo', async () => {
    const photoRequestCount = { value: 0 };
    mswServer.use(
      http.get(OWN_PHOTO_URL, () => {
        photoRequestCount.value += 1;
        return new HttpResponse(null, { status: 404 });
      }),
    );
    await openProfileAsSignedInEmployee();

    expect(await screen.findByRole('img', { name: OWN_PROFILE.name })).toHaveTextContent(INITIALS);
    expect(photoRequestCount.value).toBe(0);
  });

  it('should show initials and keep the profile when the photo request fails', async () => {
    let photoResponseCount = 0;
    mswServer.use(
      ownProfileSucceeds({ ...OWN_PROFILE, photoUrl: OWN_PHOTO_URL }),
      http.get(OWN_PHOTO_URL, () => {
        photoResponseCount += 1;
        return HttpResponse.json(
          { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Internal error.' },
          { status: 500 },
        );
      }),
    );
    await openProfileAsSignedInEmployee();

    await waitFor(() => {
      expect(photoResponseCount).toBe(1);
    });
    expect(
      await screen.findByRole('heading', { level: 2, name: OWN_PROFILE.name }),
    ).toBeInTheDocument();
    expect(screen.getByRole('img', { name: OWN_PROFILE.name })).toHaveTextContent(INITIALS);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
