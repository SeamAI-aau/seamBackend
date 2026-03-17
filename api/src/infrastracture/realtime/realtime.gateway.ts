import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
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
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async handleConnection(client: Socket) {
    const token = this.extractToken(client);
    if (!token) {
      client.disconnect(true);
      return;
    }

    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) {
      client.disconnect(true);
      return;
    }

    let payload: SocketJwtPayload | null = null;
    try {
      payload = this.jwt.verify<SocketJwtPayload>(token, { secret });
    } catch {
      client.disconnect(true);
      return;
    }

    const userId = payload?.sub;
    if (!userId) {
      client.disconnect(true);
      return;
    }

    client.data.userId = userId;
    client.join(`user:${userId}`);

    // Join all project rooms this user can access (owner or ACTIVE member).
    const projects = await this.prisma.project.findMany({
      where: {
        OR: [
          { ownerId: userId },
          { members: { some: { userId, status: 'ACTIVE' } } },
        ],
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

  private extractToken(client: Socket): string | null {
    const authToken = (client.handshake.auth as { token?: string } | undefined)?.token;
    if (authToken?.trim()) return authToken.trim();

    const header = client.handshake.headers?.authorization;
    if (typeof header === 'string') {
      const match = header.match(/^Bearer\s+(.+)$/i);
      if (match?.[1]) return match[1].trim();
    }
    return null;
  }
}

