import { EventName } from '@dexa/contracts';
import {
  buildPasswordChangedEvent,
  type PasswordChangedEventInput,
} from './password-changed-event.rules.js';

const EVENT_ID = '0c7d2f5e-3a9b-4c18-9e27-5b6d8f1a2c3e';
const ACCOUNT_ID = '9b1e4c7d-2f3a-4e5b-8c6d-1a2b3c4d5e6f';
const OCCURRED_AT = new Date('2026-10-30T03:15:00.000Z');
// Values that must never reach an event. They are used only to check that the built event lacks
// them.
const PLAINTEXT_PASSWORD = 'secret-plaintext-7';
const PASSWORD_HASH = '$argon2id$v=19$m=65536,t=3,p=4$placeholder';

const VALID_INPUT: PasswordChangedEventInput = {
  eventId: EVENT_ID,
  occurredAt: OCCURRED_AT,
  accountId: ACCOUNT_ID,
  actorAccountId: ACCOUNT_ID,
};

describe('buildPasswordChangedEvent', () => {
  it('should build the envelope with the event type, the event ID, and the UTC instant', () => {
    expect(buildPasswordChangedEvent(VALID_INPUT)).toEqual({
      eventId: EVENT_ID,
      type: EventName.ACCOUNT_PASSWORD_CHANGED,
      occurredAt: '2026-10-30T03:15:00.000Z',
      payload: {
        accountId: ACCOUNT_ID,
        actorAccountId: ACCOUNT_ID,
        changedFields: ['password'],
      },
    });
  });

  it.each([
    {
      condition: 'the account changed its own password',
      actorAccountId: ACCOUNT_ID,
    },
    {
      condition: 'an HR account changed the password',
      actorAccountId: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13',
    },
  ])(
    'should name only the affected account and the actor when $condition',
    ({ actorAccountId }) => {
      const event = buildPasswordChangedEvent({ ...VALID_INPUT, actorAccountId });

      expect(event.payload).toEqual({
        accountId: ACCOUNT_ID,
        actorAccountId,
        changedFields: ['password'],
      });
    },
  );

  it.each([
    { condition: 'a plaintext password is passed', extra: { password: PLAINTEXT_PASSWORD } },
    { condition: 'a password hash is passed', extra: { passwordHash: PASSWORD_HASH } },
    {
      condition: 'an old and new value pair is passed',
      extra: {
        oldValues: { password: PASSWORD_HASH },
        newValues: { password: PLAINTEXT_PASSWORD },
      },
    },
  ])(
    'should drop the extra values and keep the payload to three fields when $condition',
    ({ extra }) => {
      // The cast bypasses the compile-time type on purpose, to check the builder itself.
      const event = buildPasswordChangedEvent({
        ...VALID_INPUT,
        ...extra,
      } as PasswordChangedEventInput);

      expect(Object.keys(event.payload as object).sort()).toEqual([
        'accountId',
        'actorAccountId',
        'changedFields',
      ]);
      expect(JSON.stringify(event)).not.toContain(PLAINTEXT_PASSWORD);
      expect(JSON.stringify(event)).not.toContain(PASSWORD_HASH);
    },
  );

  it.each([
    { condition: 'the account ID is not a UUID', input: { ...VALID_INPUT, accountId: 'acc-1' } },
    {
      condition: 'the actor ID is not a UUID',
      input: { ...VALID_INPUT, actorAccountId: 'actor-1' },
    },
  ])('should throw when $condition', ({ input }) => {
    expect(() => buildPasswordChangedEvent(input)).toThrow();
  });
});
