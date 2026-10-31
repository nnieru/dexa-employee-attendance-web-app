// Validated settings for this service. Only the config module reads process.env; everything else
// injects this token.
export const CONFIG = Symbol('CONFIG');
