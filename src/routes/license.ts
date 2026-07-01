import { FastifyInstance } from 'fastify';
import { parseLicenseKey } from '../lib/licenseKey';
import { signPlatformToken } from '../lib/licenseToken';

// Matches app/app.js Cloud client:
//   activate -> { tier } at minimum, read at app.js:5523            (Bearer auth)
//   me       -> license object, 402 if none, read at app.js:7171-7174 (Bearer auth)
// `me` additionally returns `platformToken`, the signed JWT dentistsbook verifies
// (architecture doc section 6) — an additive field, doesn't break the existing contract.
export default async function licenseRoutes(app: FastifyInstance) {
  app.post<{ Body: { key: string } }>(
    '/v1/license/activate',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { key } = request.body || ({} as any);
      const parsed = parseLicenseKey(key);
      if (!parsed.valid || !parsed.tier) {
        return reply.code(400).send({ error: { message: 'Invalid license key' } });
      }

      const clinicId = request.clinicId!;
      const license = await app.prisma.license.upsert({
        where: { clinicId },
        create: { clinicId, key: key.toUpperCase(), tier: parsed.tier, doctorId: clinicId },
        update: { key: key.toUpperCase(), tier: parsed.tier, status: 'active', activatedAt: new Date() },
      });

      return reply.send({ tier: license.tier, activatedAt: license.activatedAt, expiresAt: license.expiresAt });
    }
  );

  app.get('/v1/license/me', { preHandler: app.authenticate }, async (request, reply) => {
    const license = await app.prisma.license.findUnique({ where: { clinicId: request.clinicId! } });
    const expired = !!license?.expiresAt && license.expiresAt < new Date();
    if (!license || license.status !== 'active' || expired) {
      return reply.code(402).send({ error: { message: 'No active license' } });
    }

    const platformToken = signPlatformToken({
      doctorId: license.doctorId || license.clinicId,
      subscriptionStatus: 'active',
      expiresAt: license.expiresAt ? license.expiresAt.toISOString() : null,
    });

    return reply.send({
      tier: license.tier,
      activatedAt: license.activatedAt,
      expiresAt: license.expiresAt,
      platformToken,
    });
  });
}
