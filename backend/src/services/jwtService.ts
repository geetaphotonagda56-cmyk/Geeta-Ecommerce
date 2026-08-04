import jwt from 'jsonwebtoken';
import { UserType } from '../models/Otp';

export interface TokenPayload {
  userId: string;
  userType: UserType;
  role?: string;
  /** Set when this token was minted for a staff member, not the owning Admin/Seller account. */
  isStaff?: boolean;
  staffId?: string;
  staffModule?: 'admin' | 'seller';
  permissions?: string[];
}

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Generate JWT token for authenticated user
 */
export function generateToken(userId: string, userType: UserType, role?: string): string {
  const payload: TokenPayload = {
    userId,
    userType,
    ...(role && { role }),
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

/**
 * Generate a JWT token for a staff member. The token carries the owning
 * Admin/Seller's userId/userType (so existing `requireUserType` checks keep
 * working unchanged) plus staff identity and permission claims that
 * server-side middleware uses to restrict what the staff member can see/do.
 */
export function generateStaffToken(
  ownerId: string,
  ownerUserType: UserType,
  staffId: string,
  staffModule: 'admin' | 'seller',
  permissions: string[]
): string {
  const payload: TokenPayload = {
    userId: ownerId,
    userType: ownerUserType,
    isStaff: true,
    staffId,
    staffModule,
    permissions,
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

/**
 * Verify and decode JWT token
 */
export function verifyToken(token: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
    return decoded;
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token has expired');
    }
    if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid token');
    }
    throw new Error(`Token verification failed: ${error.message}`);
  }
}

