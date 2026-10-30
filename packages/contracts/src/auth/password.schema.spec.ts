import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordSchema } from './password.schema.js';

// One code point, two UTF-16 units. Written as an escape so the test shows what it measures.
const GRINNING_FACE = '\u{1F600}';

const TOO_SHORT_MESSAGE = `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
const TOO_LONG_MESSAGE = `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
const MISSING_LETTER_MESSAGE = 'Password must include a letter.';
const MISSING_NUMBER_MESSAGE = 'Password must include a number.';

describe('passwordSchema', () => {
  it.each([
    { condition: 'it is 8 characters with a letter and a digit', password: 'abcdef12' },
    {
      condition: 'it is 128 characters',
      password: `a1${'a'.repeat(PASSWORD_MAX_LENGTH - 2)}`,
    },
    {
      condition: 'it is 128 code points that include emoji',
      password: `a1${GRINNING_FACE.repeat(PASSWORD_MAX_LENGTH - 2)}`,
    },
    { condition: 'it has leading and trailing spaces', password: ' abcdef12 ' },
  ])('should accept the password unchanged when $condition', ({ password }) => {
    expect(passwordSchema.parse(password)).toBe(password);
  });

  it.each([
    {
      condition: 'it is 7 characters',
      password: 'abcdef1',
      messages: [TOO_SHORT_MESSAGE],
    },
    {
      condition: 'it is 7 code points with emoji (12 UTF-16 units)',
      password: `a1${GRINNING_FACE.repeat(5)}`,
      messages: [TOO_SHORT_MESSAGE],
    },
    {
      condition: 'it is 129 characters',
      password: `a1${'a'.repeat(PASSWORD_MAX_LENGTH - 1)}`,
      messages: [TOO_LONG_MESSAGE],
    },
    {
      condition: 'it has only letters',
      password: 'abcdefgh',
      messages: [MISSING_NUMBER_MESSAGE],
    },
    {
      condition: 'it has only digits',
      password: '12345678',
      messages: [MISSING_LETTER_MESSAGE],
    },
    {
      condition: 'it is empty',
      password: '',
      messages: [TOO_SHORT_MESSAGE, MISSING_LETTER_MESSAGE, MISSING_NUMBER_MESSAGE],
    },
  ])(
    'should reject the password with the expected messages when $condition',
    ({ password, messages }) => {
      const issueMessages = passwordSchema
        .safeParse(password)
        .error?.issues.map((issue) => issue.message);

      expect(issueMessages).toEqual(messages);
    },
  );
});
