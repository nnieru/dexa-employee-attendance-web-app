import { masterOptionListSchema, masterOptionSchema } from './master-option.schema.js';

const OPTION_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';

describe('masterOptionSchema', () => {
  it('should accept the option when its ID, code, name, and activation state are valid', () => {
    const option = {
      id: OPTION_ID,
      code: 'HR_OFFICER',
      name: 'HR Officer',
      isActive: false,
    };

    expect(masterOptionSchema.parse(option)).toEqual(option);
  });

  it.each([
    {
      condition: 'the ID is not a UUID',
      body: { id: 'position-1', code: 'HR_OFFICER', name: 'HR Officer', isActive: true },
    },
    {
      condition: 'the code is empty',
      body: { id: OPTION_ID, code: '', name: 'HR Officer', isActive: true },
    },
    {
      condition: 'the name is missing',
      body: { id: OPTION_ID, code: 'HR_OFFICER', isActive: true },
    },
    {
      condition: 'the activation state is not a boolean',
      body: { id: OPTION_ID, code: 'HR_OFFICER', name: 'HR Officer', isActive: 'yes' },
    },
  ])('should reject the option when $condition', ({ body }) => {
    expect(masterOptionSchema.safeParse(body).success).toBe(false);
  });

  it('should reject an option that carries a field outside the contract', () => {
    // Extra keys are stripped rather than rejected, so the response can never carry a raw row's columns.
    const parsed = masterOptionSchema.parse({
      id: OPTION_ID,
      code: 'HR_OFFICER',
      name: 'HR Officer',
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    expect(parsed).not.toHaveProperty('createdAt');
  });
});

describe('masterOptionListSchema', () => {
  it('should accept an empty list when no catalog row exists', () => {
    expect(masterOptionListSchema.parse([])).toEqual([]);
  });

  it('should reject the list when one of its options is invalid', () => {
    const body = [{ id: 'not-a-uuid', code: 'HR_OFFICER', name: 'HR Officer', isActive: true }];

    expect(masterOptionListSchema.safeParse(body).success).toBe(false);
  });
});
