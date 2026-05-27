import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AddressInfo } from 'net';
import * as http from 'http';
import { HealthModule } from './health.module';

describe('HealthModule (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HealthModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves GET /health with status and ISO timestamp', async () => {
    const server = app.getHttpServer() as http.Server;
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as AddressInfo | null;
    if (!address) throw new Error('Unable to resolve test server port');

    const body = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: address.port,
          path: '/health',
          method: 'GET',
        },
        (res) => {
          let data = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            resolve({ statusCode: res.statusCode ?? 0, body: data });
          });
        },
      );
      req.on('error', reject);
      req.end();
    });
    server.close();

    expect(body.statusCode).toBe(200);
    const parsedBody = JSON.parse(body.body) as { status: string; timestamp: string };
    expect(parsedBody.status).toBe('ok');
    expect(Number.isNaN(Date.parse(parsedBody.timestamp))).toBe(false);
  });
});
