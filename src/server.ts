import 'dotenv/config';
import Fastify from 'fastify';
import prismaPlugin from './plugins/prisma';
import authenticatePlugin from './plugins/authenticate';
import platformAuthPlugin from './plugins/platformAuth';
import authRoutes from './routes/auth';
import googleAuthRoutes from './routes/googleAuth';
import licenseRoutes from './routes/license';
import syncRoutes from './routes/sync';
import taskRoutes from './routes/tasks';
import doctorRoutes from './routes/platform/doctors';
import caseRoutes from './routes/platform/cases';

async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(prismaPlugin);
  await app.register(authenticatePlugin);
  await app.register(platformAuthPlugin);

  app.get('/health', async () => ({ ok: true }));

  // /v1/* — dentist370's existing Cloud client contract (app/app.js:7106-7193)
  await app.register(authRoutes);
  await app.register(googleAuthRoutes);
  await app.register(licenseRoutes);
  await app.register(syncRoutes);
  await app.register(taskRoutes);

  // /v1/platform/* — dentistsbook (recruitment phase, architecture doc section 4 & 10)
  await app.register(doctorRoutes);
  await app.register(caseRoutes);

  return app;
}

async function start() {
  const app = await buildServer();
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  try {
    await app.listen({ port, host });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
