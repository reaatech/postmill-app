import { initializeSentry } from '@gitroom/nestjs-libraries/sentry/initialize.sentry';
initializeSentry('orchestrator', true);
import 'source-map-support/register';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);

import { NestFactory } from '@nestjs/core';
import { AppModule } from '@gitroom/orchestrator/app.module';
import { isDev } from '@gitroom/helpers/utils/is.dev';
import * as dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

// `nest start --watch` spawns this process through a wrapper shell and on
// recompile kills only that shell — the old worker is orphaned (reparented to
// init), keeps its port, and runs stale code. Exit when our parent dies.
if (isDev()) {
  setInterval(() => {
    if (process.ppid === 1) process.exit(0);
  }, 2000).unref();
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const port = process.env.ORCHESTRATOR_PORT || 3002;
  await app.listen(port);
  console.log(`Orchestrator health check listening on port ${port}`);
}


bootstrap();
