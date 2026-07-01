import { FastifyInstance } from 'fastify';

interface SyncEnvelope {
  ciphertext: string;
  iv: string;
  salt: string;
  alg: string;
  kdf: unknown;
  baseVersion: number;
  clientUpdatedAt: string;
}

// Matches app/app.js Cloud.push/pull (app.js:7175-7191). The server only ever
// stores/returns ciphertext — it cannot decrypt the clinic DB, by design.
export default async function syncRoutes(app: FastifyInstance) {
  app.post<{ Body: SyncEnvelope; Querystring: { force?: string } }>(
    '/v1/sync/push',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const clinicId = request.clinicId!;
      const { ciphertext, iv, salt, alg, kdf, baseVersion, clientUpdatedAt } = request.body || ({} as any);
      if (!ciphertext || !iv || !salt || !alg) {
        return reply.code(400).send({ error: { message: 'Missing encryption envelope fields' } });
      }

      const force = request.query?.force === 'true';
      const existing = await app.prisma.syncBlob.findUnique({ where: { clinicId } });

      if (existing && !force && (baseVersion ?? 0) < existing.version) {
        return reply.code(409).send({ error: { message: 'Conflict', serverVersion: existing.version } });
      }

      const nextVersion = (existing?.version ?? 0) + 1;
      await app.prisma.syncBlob.upsert({
        where: { clinicId },
        create: {
          clinicId,
          version: nextVersion,
          ciphertext,
          iv,
          salt,
          alg,
          kdf: kdf ?? {},
          clientUpdatedAt: clientUpdatedAt ? new Date(clientUpdatedAt) : null,
        },
        update: {
          version: nextVersion,
          ciphertext,
          iv,
          salt,
          alg,
          kdf: kdf ?? {},
          clientUpdatedAt: clientUpdatedAt ? new Date(clientUpdatedAt) : null,
        },
      });

      return reply.send({ version: nextVersion });
    }
  );

  app.get<{ Querystring: { sinceVersion?: string } }>(
    '/v1/sync/pull',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const clinicId = request.clinicId!;
      const sinceVersion = Number(request.query?.sinceVersion || 0);

      const blob = await app.prisma.syncBlob.findUnique({ where: { clinicId } });
      if (!blob || blob.version <= sinceVersion) {
        return reply.code(204).send();
      }

      return reply.send({
        ciphertext: blob.ciphertext,
        iv: blob.iv,
        salt: blob.salt,
        alg: blob.alg,
        kdf: blob.kdf,
        version: blob.version,
      });
    }
  );
}
