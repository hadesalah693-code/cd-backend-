import { FastifyInstance } from 'fastify';

// "Best cases" gallery — architecture doc section 4: sourced from dentist370's
// case-documentation feature, surfaced on the doctor's recruitment profile.
// Public display requires explicit, documented patient consent (doc section 9).
export default async function caseRoutes(app: FastifyInstance) {
  app.post<{
    Body: { beforeImg: string; afterImg: string; title: string; patientConsent: boolean; isPublic?: boolean };
  }>('/v1/platform/doctors/me/cases', { preHandler: app.verifyPlatformToken }, async (request, reply) => {
    const { beforeImg, afterImg, title, patientConsent, isPublic } = request.body || ({} as any);
    if (!beforeImg || !afterImg || !title) {
      return reply.code(400).send({ error: { message: 'beforeImg, afterImg and title are required' } });
    }
    if (isPublic && !patientConsent) {
      return reply.code(400).send({ error: { message: 'patientConsent is required before a case can be public' } });
    }

    const doctorId = request.doctorId!;
    const doctor = await app.prisma.doctor.findUnique({ where: { doctorId } });
    if (!doctor) {
      return reply.code(404).send({ error: { message: 'Create a doctor profile first via /v1/platform/doctors/me' } });
    }

    const created = await app.prisma.case.create({
      data: { doctorId, beforeImg, afterImg, title, patientConsent: !!patientConsent, isPublic: !!isPublic && !!patientConsent },
    });

    return reply.code(201).send({ case: created });
  });
}
