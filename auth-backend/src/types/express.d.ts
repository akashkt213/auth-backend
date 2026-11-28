// src/types/express.d.ts
import type { JwtPayload } from './auth.types.js';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
