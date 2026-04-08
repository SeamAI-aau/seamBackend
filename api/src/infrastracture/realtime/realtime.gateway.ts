import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import type { ExtendedError, Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from './realtime.service';

type SocketJwtPayload = {
  sub: string;
  email: string;
  role?: string;
  iat?: number;
  exp?: number;
};

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  afterInit(server: Server) {
    const unauthorized = (): ExtendedError => {
      const err = new Error('Unauthorized') as ExtendedError;
      return err;
    };

    // Validate token during handshake so invalid tokens yield `connect_error` on client
    server.use((socket, next) => {
      try {
        const authToken = (socket.handshake.auth as { token?: string } | undefined)?.token;
        const header = socket.handshake.headers?.authorization;
        let token: string | null = null;
        if (authToken?.trim()) token = authToken.trim();
        else if (typeof header === 'string') {
          const match = header.match(/^Bearer\s+(.+)$/i);
          if (match?.[1]) token = match[1].trim();
        }
        if (!token) return next(unauthorized());
        const payload = this.jwt.verify<SocketJwtPayload>(token);
        const userId = payload?.sub;
        if (!userId) return next(unauthorized());
        socket.data = socket.data || {};
        socket.data.userId = userId;
        return next();
      } catch {
        return next(unauthorized());
      }
    });
  }

  async handleConnection(client: Socket) {
    // `afterInit` middleware already validated the token and set `client.data.userId`.
    const userId = client.data?.userId as string | undefined;
    if (!userId) {
      client.disconnect(true);
      return;
    }
    client.join(`user:${userId}`);

    // Join all project rooms this user can access (owner or ACTIVE member).
    const projects = await this.prisma.project.findMany({
      where: {
        OR: [{ ownerId: userId }, { members: { some: { userId, status: 'ACTIVE' } } }],
      },
      select: { id: true },
    });
    for (const p of projects) {
      client.join(`project:${p.id}`);
    }

    // Make server available to emitters.
    this.realtime.setServer(this.server);
  }

  handleDisconnect(_client: Socket) {
    // no-op
  }
}
