import { JwtService } from '@nestjs/jwt';

/** Callable io() from socket.io-client (module has no call signature; the .io property does). */
type IoFn = (url: string, opts?: Record<string, unknown>) => { on: (ev: string, fn: (...args: unknown[]) => void) => unknown; disconnect: () => void; connected: boolean };

let io: IoFn | null = null;
try {
  const mod = require('socket.io-client');
  const fn = typeof mod === 'function' ? mod : mod?.io;
  io = fn ? (fn as IoFn) : null;
} catch {
  io = null;
}

const describeIf = io ? describe : describe.skip;

describeIf('RealtimeGateway (e2e)', () => {
  const connect = io as IoFn;
  let jwt: JwtService;
  let port: number;
  let token: string;

  beforeAll(async () => {
    const secret = process.env.JWT_SECRET ?? 'test-secret';
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
      done.fail(err as Error);
    });
  });

  it('rejects invalid token', (done) => {
    const socket = connect(`http://localhost:${port}`, {
      auth: { token: 'some-invalid-token' },
      reconnection: false,
    });

    socket.on('connect', () => {
      socket.disconnect();
      done.fail(new Error('Expected connect_error, but connected'));
    });

    socket.on('connect_error', () => {
      expect(socket.connected).toBe(false);
      done();
    });
  });
});
