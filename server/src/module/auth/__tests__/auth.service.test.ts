import { vi, describe, it, expect, beforeEach } from 'vitest';
import { AuthService } from '../auth.service.js';
import { prisma } from '../../../database/db.js';
import { hashPassword, comparePassword } from '../../../utils/password.utils.js';
import { generateToken } from '../../../utils/jwt.utils.js';
import { sendEmail } from '../../../utils/email.utils.js';
import { createUniqueProfileSlug } from '../../../lib/slug.js';
import { invalidateVersionCache } from '../../../middleware/auth.middleware.js';

// --- MOCK DEPENDENCIES ---
vi.mock('../../../database/db.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../../../utils/password.utils.js', () => ({
  hashPassword: vi.fn(),
  comparePassword: vi.fn(),
}));

vi.mock('../../../utils/jwt.utils.js', () => ({
  generateToken: vi.fn(),
}));

vi.mock('../../../utils/email.utils.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../../lib/slug.js', () => ({
  createUniqueProfileSlug: vi.fn(),
}));

vi.mock('../../../middleware/auth.middleware.js', () => ({
  invalidateVersionCache: vi.fn(),
}));

describe('Auth Service', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
    vi.clearAllMocks();
  });

  describe('register', () => {
    it('successfully registers a new user', async () => {
      const mockInput = { name: 'John Doe', email: 'john@example.com', password: 'password123' };
      const mockCreatedUser = { id: 1, name: 'John Doe', email: 'john@example.com', role: 'STUDENT' };

      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      vi.mocked(hashPassword).mockResolvedValue('hashed_password');
      vi.mocked(prisma.user.create).mockResolvedValue(mockCreatedUser as any);
      vi.mocked(createUniqueProfileSlug).mockResolvedValue('john-doe-1');

      const result = await authService.register(mockInput as any);

      expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          email: 'john@example.com',
          password: 'hashed_password',
        })
      }));
      expect(prisma.user.update).toHaveBeenCalled();
      expect(sendEmail).toHaveBeenCalled();
      expect(result.user).toEqual(expect.objectContaining(mockCreatedUser));
    });

    it('throws an error if email is already registered', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 1, email: 'john@example.com' } as any);

      await expect(authService.register({ name: 'John', email: 'john@example.com', password: 'pass' } as any))
        .rejects.toThrow('Email already registered');
      
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('successfully logs in a verified user', async () => {
      const mockUser = { id: 1, email: 'john@example.com', password: 'hashed_password', isActive: true, isVerified: true, role: 'STUDENT', tokenVersion: 1 };
      
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);
      vi.mocked(comparePassword).mockResolvedValue(true);
      vi.mocked(generateToken).mockReturnValue('mock_jwt_token');

      const result = await authService.login({ email: 'john@example.com', password: 'password123' });

      expect(result.token).toBe('mock_jwt_token');
      expect(result.user.id).toBe(1);
    });

    it('throws an error for wrong password', async () => {
      const mockUser = { id: 1, email: 'john@example.com', password: 'hashed_password', isActive: true };
      
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);
      vi.mocked(comparePassword).mockResolvedValue(false);

      await expect(authService.login({ email: 'john@example.com', password: 'wrongpassword' }))
        .rejects.toThrow('Invalid email or password');
    });

    it('throws an error and sends OTP if email is not verified', async () => {
      const mockUser = { id: 1, email: 'john@example.com', password: 'hashed_password', isActive: true, isVerified: false, role: 'STUDENT' };
      
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);
      vi.mocked(comparePassword).mockResolvedValue(true);

      await expect(authService.login({ email: 'john@example.com', password: 'password123' }))
        .rejects.toThrow('EMAIL_NOT_VERIFIED');

      expect(prisma.user.update).toHaveBeenCalled();
      expect(sendEmail).toHaveBeenCalled();
    });
  });

  describe('forgotPassword', () => {
    it('generates an OTP and sends an email if user exists', async () => {
      const mockUser = { id: 1, email: 'john@example.com', name: 'John' };
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);

      await authService.forgotPassword('john@example.com');

      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({
          passwordResetAttempts: 0,
        })
      }));
      expect(sendEmail).toHaveBeenCalled();
    });

    it('returns silently without sending email if user does not exist', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      await authService.forgotPassword('unknown@example.com');

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(sendEmail).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('successfully resets password and increments tokenVersion', async () => {
      const mockUser = { 
        id: 1, 
        email: 'john@example.com', 
        resetPasswordOtp: 'hashed_otp',
        resetOtpExpiresAt: new Date(Date.now() + 10000)
      };
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);
      vi.mocked(comparePassword).mockResolvedValue(true);
      vi.mocked(hashPassword).mockResolvedValue('new_hashed_password');

      await authService.resetPassword('john@example.com', '123456', 'new_password');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          password: 'new_hashed_password',
          resetPasswordOtp: null,
          resetOtpExpiresAt: null,
          passwordResetAttempts: 0,
          passwordResetLockedUntil: null,
          tokenVersion: { increment: 1 },
        },
      });
      expect(invalidateVersionCache).toHaveBeenCalledWith(1);
    });

    it('throws an error if the reset token is expired', async () => {
      const mockUser = { 
        id: 1, 
        email: 'john@example.com', 
        resetPasswordOtp: 'hashed_otp',
        resetOtpExpiresAt: new Date(Date.now() - 10000)
      };
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);

      await expect(authService.resetPassword('john@example.com', '123456', 'new_password'))
        .rejects.toThrow('Reset code has expired');
    });

    it('increments failed attempts and throws if OTP is incorrect', async () => {
      const mockUser = { 
        id: 1, 
        passwordResetAttempts: 0,
        resetPasswordOtp: 'hashed_otp',
        resetOtpExpiresAt: new Date(Date.now() + 10000) 
      };
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);
      vi.mocked(comparePassword).mockResolvedValue(false);

      await expect(authService.resetPassword('john@example.com', 'wrong_otp', 'new_password'))
        .rejects.toThrow(/Invalid reset code/);

      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { passwordResetAttempts: 1 }
      }));
    });
  });
});