import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { JwtPayload } from '../types/auth.types.js';
// token.service throws at startup if JWT_ACCESS_SECRET is missing
import { ACCESS_KEY } from '../services/token.service.js';

export const authenticateToken = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const token = req.cookies?.accessToken ?? req.headers.authorization?.split(" ")[1];

  if (!token) {
    res.status(401).json({ message: 'Access denied. No token provided.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, ACCESS_KEY) as JwtPayload;
    req.user = decoded;
    
    next();
  } catch (error) {
    // Return 401 or 403 if the token is expired or tampered with
    res.status(401).json({ message: 'Invalid or expired token.' });
  }
};
