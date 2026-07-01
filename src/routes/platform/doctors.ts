import { FastifyInstance } from 'fastify';

// dentistsbook recruitment (architecture doc roadmap phase 1: "Core + Recruitment").
export default async function doctorRoutes(app: FastifyInstance) {
  // Public browse: GET /v1/platform/doctors?region=&specialty=&availability=
  app.get<{ Querystring: { region?: string; availability?: string } }>(
    '/v1/platform/doctors',
    async (request, reply) => {
      const { region, availability } = request.query || {};
      const doctors = await app.prisma.doctor.findMany({
        where: {
          ...(availability ? { availability: availability as any } : {}),
          ...(region ? { areas: { some: { region } } } : {}),
        },
        include: { areas: true },
      });
      return reply.send({ doctors });
    }
  );

  app.get<{ Params: { doctorId: string } }>('/v1/platform/doctors/:doctorId', async (request, reply) => {
    const doctor = await app.prisma.doctor.findUnique({
      where: { doctorId: request.params.doctorId },
      include: { areas: true, cases: { where: { isPublic: true } } },
    });
    if (!doctor) return reply.code(404).send({ error: { message: 'Doctor not found' } });
    return reply.send({ doctor });
  });

  // Create/update own profile — requires a valid platform token.
  app.post<{
    Body: {
      name: string;
      bio?: string;
      cvUrl?: string;
      availability?: 'full' | 'part' | 'none';
      contactMode?: string;
      areas?: { region: string; city: string; willingToRelocate?: boolean }[];
    };
  }>('/v1/platform/doctors/me', { preHandler: app.verifyPlatformToken }, async (request, reply) => {
    const doctorId = request.doctorId!;
    const { name, bio, cvUrl, availability, contactMode, areas } = request.body || ({} as any);
    if (!name) return reply.code(400).send({ error: { message: 'name is required' } });

    const doctor = await app.prisma.doctor.upsert({
      where: { doctorId },
      create: { doctorId, name, bio, cvUrl, availability: availability ?? 'none', contactMode },
      update: { name, bio, cvUrl, availability: availability ?? undefined, contactMode },
    });

    if (areas && areas.length) {
      await app.prisma.area.deleteMany({ where: { doctorId } });
      await app.prisma.area.createMany({
        data: areas.map((a) => ({ doctorId, region: a.region, city: a.city, willingToRelocate: !!a.willingToRelocate })),
      });
    }

    return reply.send({ doctor });
  });
}
