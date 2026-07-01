import { FastifyInstance } from 'fastify';
import { hashPassword, verifyPassword } from '../lib/passwords';
import { signAccessToken, generateRefreshToken, hashRefreshToken } from '../lib/tokens';

// Matches app/app.js Cloud client exactly:
//   register/login -> { tokens: { access, refresh } }   (app.js:7124-7130)
//   refresh         -> { tokens: { access, refresh } }   (app.js:7132-7135)
//   logout          -> any 2xx, fire-and-forget          (app.js:7145)
export default async function authRoutes(app: FastifyInstance) {
  app.post<{
    Body: { clinicName: string; email: string; password: string; deviceName?: string };
  }>('/v1/auth/register', async (request, reply) => {
    const { clinicName, email, password, deviceName } = request.body || ({} as any);
    if (!clinicName || !email || !password) {
      return reply.code(400).send({ error: { message: 'clinicName, email and password are required' } });
    }

    const existing = await app.prisma.clinic.findUnique({ where: { email } });
    if (existing) {
      return reply.code(409).send({ error: { message: 'Email already registered' } });
    }

    const passwordHash = await hashPassword(password);
    const clinic = await app.prisma.clinic.create({
      data: { name: clinicName, email, passwordHash },
    });

    const tokens = await issueTokens(app, clinic.id, request.headers['x-device-id'] as string, deviceName);
    return reply.code(201).send({ tokens, clinicId: clinic.id });
  });

  app.post<{ Body: { email: string; password: string; deviceName?: string } }>(
    '/v1/auth/login',
    async (request, reply) => {
      const { email, password, deviceName } = request.body || ({} as any);
      if (!email || !password) {
        return reply.code(400).send({ error: { message: 'email and password are required' } });
      }

      const clinic = await app.prisma.clinic.findUnique({ where: { email } });
      if (!clinic || !clinic.passwordHash || !(await verifyPassword(password, clinic.passwordHash))) {
        return reply.code(401).send({ error: { message: 'Invalid email or password' } });
      }

      const tokens = await issueTokens(app, clinic.id, request.headers['x-device-id'] as string, deviceName);
      return reply.send({ tokens, clinicId: clinic.id });
    }
  );

  app.post<{ Body: { refreshToken: string } }>('/v1/auth/refresh', async (request, reply) => {
    const { refreshToken } = request.body || ({} as any);
    if (!refreshToken) {
      return reply.code(401).send({ error: { message: 'Missing refresh token' } });
    }

    const tokenHash = hashRefreshToken(refreshToken);
    const stored = await app.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      return reply.code(401).send({ error: { message: 'Refresh token invalid or expired' } });
    }

    // Rotate: revoke the old refresh token and issue a new pair.
    await app.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    const tokens = await issueTokens(app, stored.clinicId, stored.deviceId, stored.deviceName ?? undefined);
    return reply.send({ tokens });
  });

  app.post<{ Body: { refreshToken?: string } }>('/v1/auth/logout', async (request, reply) => {
    const { refreshToken } = request.body || ({} as any);
    if (refreshToken) {
      const tokenHash = hashRefreshToken(refreshToken);
      await app.prisma.refreshToken
        .updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } })
        .catch(() => {});
    }
    return reply.code(204).send();
  });
}

export async function issueTokens(app: FastifyInstance, clinicId: string, deviceId?: string, deviceName?: string) {
  const access = signAccessToken({ clinicId });
  const { token: refresh, hash, expiresAt } = generateRefreshToken();
  await app.prisma.refreshToken.create({
    data: {
      clinicId,
      tokenHash: hash,
      deviceId: deviceId || 'unknown',
      deviceName: deviceName || null,
      expiresAt,
    },
  });
  return { access, refresh };
}
