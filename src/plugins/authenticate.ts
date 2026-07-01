import fp from 'fastify-plugin';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { verifyAccessToken } from '../lib/tokens';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    clinicId?: string;
  }
}

// Verifies the Bearer access token issued by /v1/auth/* and attaches clinicId,
// matching the Authorization header app.js's Cloud.headers() always sends (app.js:7117-7120).
export default fp(async function authenticatePlugin(app: FastifyInstance) {
  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) {
      reply.code(401).send({ error: { message: 'Missing access token' } });
      return;
    }
    try {
      const payload = verifyAccessToken(token);
      request.clinicId = payload.clinicId;
    } catch {
      reply.code(401).send({ error: { message: 'Invalid or expired access token' } });
    }
  });
});
