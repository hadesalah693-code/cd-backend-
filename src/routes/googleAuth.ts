import { FastifyInstance } from 'fastify';
import { OAuth2Client } from 'google-auth-library';
import { issueTokens } from './auth';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const client = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

// Matches the new app/app.js Cloud.loginWithGoogle (app.js Cloud object), which posts
// { idToken, deviceName } and expects the same { tokens } shape as /v1/auth/login.
export default async function googleAuthRoutes(app: FastifyInstance) {
  app.post<{ Body: { idToken: string; deviceName?: string } }>(
    '/v1/auth/google',
    async (request, reply) => {
      if (!client) {
        return reply.code(501).send({ error: { message: 'Google sign-in is not configured on this server (GOOGLE_CLIENT_ID missing)' } });
      }

      const { idToken, deviceName } = request.body || ({} as any);
      if (!idToken) {
        return reply.code(400).send({ error: { message: 'idToken is required' } });
      }

      let payload;
      try {
        const ticket = await client.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
        payload = ticket.getPayload();
      } catch {
        return reply.code(401).send({ error: { message: 'Invalid Google token' } });
      }

      if (!payload?.email || !payload.sub) {
        return reply.code(401).send({ error: { message: 'Google token missing email' } });
      }

      let clinic = await app.prisma.clinic.findUnique({ where: { email: payload.email } });
      if (!clinic) {
        clinic = await app.prisma.clinic.create({
          data: { name: payload.name || payload.email, email: payload.email, googleId: payload.sub },
        });
      } else if (!clinic.googleId) {
        clinic = await app.prisma.clinic.update({ where: { id: clinic.id }, data: { googleId: payload.sub } });
      }

      const tokens = await issueTokens(app, clinic.id, request.headers['x-device-id'] as string, deviceName);
      return reply.send({ tokens, clinicId: clinic.id });
    }
  );
}
