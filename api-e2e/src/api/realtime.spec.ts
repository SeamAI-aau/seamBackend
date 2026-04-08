import { JwtService } from '@nestjs/jwt';
import { io as socketConnect } from 'socket.io-client';

type IoFn = typeof socketConnect;

describe('RealtimeGateway (e2e)', () => {
  const connect: IoFn = socketConnect;
  let jwt: JwtService;
  let port: number;
  let token: string;

  beforeAll(async () => {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 10) {
      throw new Error(
        'JWT_SECRET (min 10 chars) must be set for realtime e2e — same value the API uses. ' +
          'Load your api .env via test-setup or export JWT_SECRET before running nx e2e.',
      );
    }
    jwt = new JwtService({ secret });
    port = process.env.PORT ? Number(process.env.PORT) : 3000;
    token = jwt.sign({ sub: 'test-user-id', email: 'test@example.com' });
  });

  it('connects with valid token', (done) => {
    const socket = connect(`http://localhost:${port}`, {
      auth: { token },
    });

    socket.on('connect', () => {
      expect(socket.connected).toBe(true);
      socket.disconnect();
      done();
    });

    socket.on('connect_error', (err: unknown) => {
      socket.disconnect();
      done(err instanceof Error ? err : new Error(String(err)));
    });
  });

  it('rejects invalid token', (done) => {
    const socket = connect(`http://localhost:${port}`, {
      auth: { token: 'some-invalid-token' },
      reconnection: false,
    });

    socket.on('connect', () => {
      socket.disconnect();
      done(new Error('Expected connect_error, but connected'));
    });

    socket.on('connect_error', () => {
      expect(socket.connected).toBe(false);
      done();
    });
  });
});
