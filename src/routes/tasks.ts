import { FastifyInstance } from 'fastify';

// Matches app/app.js Tasks.enablePush (app.js:7043-7056) — registers a Web Push
// subscription for a staff member on the authenticated clinic.
export default async function taskRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string }; Body: { subscription: Record<string, unknown> } }>(
    '/v1/tasks/staff/:id/subscriptions',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { subscription } = request.body || ({} as any);
      const endpoint = (subscription as any)?.endpoint;
      if (!endpoint) {
        return reply.code(400).send({ error: { message: 'Missing push subscription endpoint' } });
      }

      await app.prisma.pushSubscription.create({
        data: {
          clinicId: request.clinicId!,
          staffId: request.params.id,
          endpoint,
          keys: (subscription as any).keys ?? {},
        },
      });

      return reply.code(201).send({ ok: true });
    }
  );
}
