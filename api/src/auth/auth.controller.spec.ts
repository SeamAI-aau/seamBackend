import { BadRequestException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';
import type { AuthMailService } from './auth-mail.service';
import { clearAuthCookies, setAuthCookies } from '../common/config/auth-cookie.config';

jest.mock('../common/config/auth-cookie.config', () => ({
  setAuthCookies: jest.fn(),
  clearAuthCookies: jest.fn(),
}));

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<
    Pick<AuthService, 'register' | 'login' | 'refreshToken' | 'logout'>
  >;

  beforeEach(() => {
    authService = {
      register: jest.fn(),
      login: jest.fn(),
      refreshToken: jest.fn(),
      logout: jest.fn(),
    };

    controller = new AuthController(
      authService as unknown as AuthService,
      {} as AuthMailService,
    );
    jest.clearAllMocks();
  });

  it('register calls service, sets cookies, and returns message + user', async () => {
    authService.register.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      accessExpiresMs: 900000,
      refreshExpiresMs: 604800000,
      message: 'User registered successfully',
      user: { id: 'u1', email: 'dev@example.com' },
    });

    const dto = {
      email: 'dev@example.com',
      name: 'Dev',
      password: 'StrongP@ssw0rd',
    };
    const res = {} as Response;

    const result = await controller.register(dto, res);

    expect(authService.register).toHaveBeenCalledWith(dto);
    expect(setAuthCookies).toHaveBeenCalledWith(
      res,
      expect.objectContaining({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      }),
    );
    expect(result).toEqual({
      message: 'User registered successfully',
      user: { id: 'u1', email: 'dev@example.com' },
    });
  });

  it('login calls service, sets cookies, and returns success message', async () => {
    authService.login.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      accessExpiresMs: 900000,
      refreshExpiresMs: 604800000,
    });

    const dto = { email: 'dev@example.com', password: 'StrongP@ssw0rd' };
    const res = {} as Response;

    const result = await controller.login(dto, res);

    expect(authService.login).toHaveBeenCalledWith(dto);
    expect(setAuthCookies).toHaveBeenCalledWith(
      res,
      expect.objectContaining({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      }),
    );
    expect(result).toEqual({ message: 'Logged in successfully' });
  });

  it('refresh reads token from body, rotates tokens, and sets cookies', async () => {
    authService.refreshToken.mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      accessExpiresMs: 900000,
      refreshExpiresMs: 604800000,
    });

    const req = { cookies: {} } as Request;
    const res = {} as Response;

    const result = await controller.refresh('old-token', req, res);

    expect(authService.refreshToken).toHaveBeenCalledWith('old-token');
    expect(setAuthCookies).toHaveBeenCalledWith(
      res,
      expect.objectContaining({ accessToken: 'new-access', refreshToken: 'new-refresh' }),
    );
    expect(result).toEqual({ message: 'Tokens refreshed' });
  });

  it('refresh falls back to refreshToken cookie when body token missing', async () => {
    authService.refreshToken.mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      accessExpiresMs: 900000,
      refreshExpiresMs: 604800000,
    });

    const req = { cookies: { refreshToken: 'cookie-refresh-token' } } as unknown as Request;
    const res = {} as Response;

    await controller.refresh(undefined as unknown as string, req, res);

    expect(authService.refreshToken).toHaveBeenCalledWith('cookie-refresh-token');
  });

  it('refresh throws bad request when token missing from body and cookie', async () => {
    const req = { cookies: {} } as Request;
    const res = {} as Response;

    await expect(
      controller.refresh(undefined as unknown as string, req, res),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(authService.refreshToken).not.toHaveBeenCalled();
  });

  it('logout revokes tokens and clears cookies', async () => {
    authService.logout.mockResolvedValue(undefined);
    const res = {} as Response;
    const user = { userId: 'user-1' };

    const result = await controller.logout(user as any, res);

    expect(authService.logout).toHaveBeenCalledWith('user-1');
    expect(clearAuthCookies).toHaveBeenCalledWith(res);
    expect(result).toEqual({ message: 'Logged out successfully' });
  });
});
