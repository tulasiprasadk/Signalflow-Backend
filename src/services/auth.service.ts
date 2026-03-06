import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as jwt from 'jsonwebtoken';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

type AuthPayload = {
  sub: string;
  email: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private getJwtSecret() {
    return this.config.get<string>('JWT_SECRET') || 'growthinfra-dev-secret';
  }

  private signToken(payload: AuthPayload) {
    return jwt.sign(payload, this.getJwtSecret(), { expiresIn: '7d' });
  }

  private verifyToken(token: string): AuthPayload {
    return jwt.verify(token, this.getJwtSecret()) as AuthPayload;
  }

  private sanitizeUser(user: { id: string; email: string }) {
    return {
      id: user.id,
      email: user.email,
    };
  }

  private hashPassword(password: string) {
    const salt = randomBytes(16).toString('hex');
    const derived = scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${derived}`;
  }

  private verifyPassword(password: string, storedHash: string) {
    const [salt, storedDerived] = (storedHash || '').split(':');
    if (!salt || !storedDerived) {
      return false;
    }

    const incoming = scryptSync(password, salt, 64);
    const existing = Buffer.from(storedDerived, 'hex');

    if (incoming.length !== existing.length) {
      return false;
    }

    return timingSafeEqual(incoming, existing);
  }

  async signup(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      throw new ConflictException('User already exists');
    }

    const hashedPassword = this.hashPassword(password);
    const orgLabel = normalizedEmail.split('@')[0] || 'growthinfra';

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          password: hashedPassword,
        },
      });

      const organization = await tx.organization.create({
        data: {
          name: `${orgLabel} organization`,
          description: 'Default organization',
          category: 'general',
          location: 'remote',
          website: '',
        },
      });

      await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          role: 'owner',
        },
      });

      return user;
    });

    const token = this.signToken({ sub: created.id, email: created.email });
    return {
      token,
      user: this.sanitizeUser(created),
    };
  }

  async login(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordOk = this.verifyPassword(password, user.password);
    if (!passwordOk) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const token = this.signToken({ sub: user.id, email: user.email });
    return {
      token,
      user: this.sanitizeUser(user),
    };
  }

  async getMe(token: string) {
    let payload: AuthPayload;

    try {
      payload = this.verifyToken(token);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.sanitizeUser(user);
  }
}
