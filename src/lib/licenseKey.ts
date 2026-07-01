import crypto from 'crypto';
import { LicenseTier } from '@prisma/client';

// Server-side license key format, independent of the app's offline LIC.generate/parse
// (app.js:1793-1805) — that one validates locally without a server; this one is the
// source of truth when Cloud is configured. Format: MX-<TIER>-<RANDOM>-<CHECKSUM>.
const TIERS: LicenseTier[] = ['solo', 'duo', 'clinic'];

function checksum(parts: string[]): string {
  const secret = process.env.ACCESS_TOKEN_SECRET || 'dev';
  return crypto.createHash('sha256').update(parts.join('-') + secret).digest('hex').slice(0, 4).toUpperCase();
}

export function generateLicenseKey(tier: LicenseTier): string {
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  const sum = checksum(['MX', tier.toUpperCase(), random]);
  return `MX-${tier.toUpperCase()}-${random}-${sum}`;
}

export function parseLicenseKey(key: string): { valid: boolean; tier?: LicenseTier } {
  const parts = (key || '').trim().toUpperCase().split('-');
  if (parts.length !== 4 || parts[0] !== 'MX') return { valid: false };
  const tier = parts[1].toLowerCase() as LicenseTier;
  if (!TIERS.includes(tier)) return { valid: false };
  const expected = checksum([parts[0], parts[1], parts[2]]);
  if (expected !== parts[3]) return { valid: false };
  return { valid: true, tier };
}
