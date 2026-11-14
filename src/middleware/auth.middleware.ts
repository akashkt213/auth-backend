// src/middleware/authMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { JwtPayload } from '../types/auth.types.js';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'access-secret-key';

export const authenticateToken = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ message: 'Access denied. No token provided.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, ACCESS_SECRET) as JwtPayload;
    req.user = decoded;
    
    next();
  } catch (error) {
    // Return 401 or 403 if the token is expired or tampered with
    res.status(401).json({ message: 'Invalid or expired token.' });
  }
};
