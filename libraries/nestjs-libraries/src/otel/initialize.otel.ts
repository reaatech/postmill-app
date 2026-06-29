import { Logger } from '@nestjs/common';

// OpenTelemetry bootstrap. No-ops unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set and
// `DEV_DISABLE_OPENTELEMETRY` is unset. When configured, starts a NodeSDK with auto
// instrumentations + an OTLP/HTTP trace exporter. The SDK is started before Sentry and
// before the Nest app is created (call from main.ts first), so instrumentations can patch
// modules as they load. Shutdown is registered on SIGTERM/SIGINT to compose with the
// graceful-shutdown handler (G1).
let sdk: import('@opentelemetry/sdk-node').NodeSDK | null = null;

export function initializeOtel(): void {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  if (!endpoint || process.env.DEV_DISABLE_OPENTELEMETRY) {
    return;
  }

  if (sdk) {
    // Already initialized — guard against a double call.
    return;
  }

  try {
    // Lazily require so the bundle/build never depends on these being present when OTel
    // is disabled, and so the import cost is only paid when actually configured.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NodeSDK } = require('@opentelemetry/sdk-node');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const {
      getNodeAutoInstrumentations,
    } = require('@opentelemetry/auto-instrumentations-node');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const {
      OTLPTraceExporter,
    } = require('@opentelemetry/exporter-trace-otlp-http');

    sdk = new NodeSDK({
      serviceName: process.env.OTEL_SERVICE_NAME || 'postmill-backend',
      traceExporter: new OTLPTraceExporter({ url: endpoint }),
      instrumentations: [getNodeAutoInstrumentations()],
    });

    sdk!.start();
    new Logger('OpenTelemetry').log(
      `OpenTelemetry tracing started (exporter: ${endpoint})`
    );

    const shutdown = () => {
      sdk
        ?.shutdown()
        .catch((err: unknown) =>
          new Logger('OpenTelemetry').warn(
            `OpenTelemetry shutdown error: ${
              err instanceof Error ? err.message : String(err)
            }`
          )
        );
    };
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
  } catch (err) {
    new Logger('OpenTelemetry').warn(
      `OpenTelemetry failed to initialize: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}
