import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { Server } from 'socket.io';

/**
 * Enables Socket.IO broadcasts across multiple API instances when Redis is configured.
 * Skipped when DISABLE_QUEUES=true (typical local dev without Redis) unless REALTIME_REDIS_ADAPTER=force.
 */
export function attachRedisSocketAdapter(server: Server, config: ConfigService): void {
  const force = config.get<string>('REALTIME_REDIS_ADAPTER') === 'force';
  const disabled =
    config.get<string>('REALTIME_REDIS_ADAPTER') === 'false' ||
    config.get<string>('DISABLE_QUEUES') === 'true';

  if (disabled && !force) {
    return;
  }

  const host = config.get<string>('REDIS_HOST')?.trim();
  if (!host && !force) {
    return;
  }

  const port = config.get<number>('REDIS_PORT', 6379);
  const password = config.get<string>('REDIS_PASSWORD');
  const useTls = config.get<string>('REDIS_TLS') === 'true';

  const connection = {
    host: host ?? 'localhost',
    port,
    ...(password ? { password } : {}),
    ...(useTls ? { tls: {} } : {}),
  };

  const pubClient = new Redis(connection);
  const subClient = pubClient.duplicate();
  const logger = new Logger('RealtimeRedisAdapter');

  pubClient.on('error', (err) => logger.warn(`Redis pub client error: ${err.message}`));
  subClient.on('error', (err) => logger.warn(`Redis sub client error: ${err.message}`));

  server.adapter(createAdapter(pubClient, subClient));
  logger.log('Socket.IO Redis adapter attached for multi-instance realtime');
}
