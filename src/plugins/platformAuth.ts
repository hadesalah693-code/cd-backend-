import fp from 'fastify-plugin';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { verifyPlatformToken } from '../lib/licenseToken';

declare module 'fastify' {
  interface FastifyInstance {
    verifyPlatformToken: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    doctorId?: string;
  }
}

// Verifies the platformToken issued by /v1/license/me, signed with
// LICENSE_SIGNING_SECRET — the single link between dentist370 and dentistsbook
// (architecture doc section 6). No clinic-DB lookup needed: the signature alone
// proves an active subscription.
export default fp(async function platformAuthPlugin(app: FastifyInstance) {
  app.decorate('verifyPlatformToken', async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) {
      reply.code(401).send({ error: { message: 'Missing platform token' } });
      return;
    }
    try {
      const payload = verifyPlatformToken(token);
      if (payload.subscriptionStatus !== 'active') {
        reply.code(403).send({ error: { message: 'Subscription not active' } });
        return;
      }
      request.doctorId = payload.doctorId;
    } catch {
      reply.code(401).send({ error: { message: 'Invalid or expired platform token' } });
    }
  });
});
