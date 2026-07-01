import jwt from 'jsonwebtoken';

const LICENSE_SIGNING_SECRET = process.env.LICENSE_SIGNING_SECRET || '';
const PLATFORM_TOKEN_TTL = process.env.PLATFORM_TOKEN_TTL || '30d';

// This is the single link between dentist370 and dentistsbook (architecture doc
// section 6): dentistsbook verifies this signature with the shared secret and
// never touches the app's database.
export interface PlatformTokenPayload {
  doctorId: string;
  subscriptionStatus: 'active' | 'expired';
  expiresAt: string | null;
}

export function signPlatformToken(payload: PlatformTokenPayload): string {
  return jwt.sign(payload, LICENSE_SIGNING_SECRET, {
    expiresIn: PLATFORM_TOKEN_TTL as jwt.SignOptions['expiresIn'],
  });
}

export function verifyPlatformToken(token: string): PlatformTokenPayload {
  return jwt.verify(token, LICENSE_SIGNING_SECRET) as PlatformTokenPayload;
}
