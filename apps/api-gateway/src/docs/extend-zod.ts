// Patches the zod copy this package imports, so contract schemas can carry `.openapi` metadata with it later
// (see zod-to-openapi §Extend). The contract schemas themselves document through inline conversion.
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);
