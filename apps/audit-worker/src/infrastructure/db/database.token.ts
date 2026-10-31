// Repositories inject this token instead of creating connections, so one pool serves the service.
export const DATABASE = Symbol('DATABASE');
