import { Injectable, HttpException } from '@nestjs/common';
import { UsersRepository } from '@gitroom/nestjs-libraries/database/prisma/users/users.repository';
import { Provider } from '@prisma/client';
import { UserDetailDto } from '@gitroom/nestjs-libraries/dtos/users/user.details.dto';
import { OrganizationRepository } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.repository';
import { AuthService } from '@gitroom/helpers/auth/auth.service';

@Injectable()
export class UsersService {
  constructor(
    private _usersRepository: UsersRepository,
    private _organizationRepository: OrganizationRepository
  ) {}

  getUserByEmail(email: string) {
    return this._usersRepository.getUserByEmail(email);
  }

  getUserById(id: string) {
    return this._usersRepository.getUserById(id);
  }

  getImpersonateUser(name: string) {
    return this._organizationRepository.getImpersonateUser(name);
  }

  getUserByProvider(providerId: string, provider: Provider) {
    return this._usersRepository.getUserByProvider(providerId, provider);
  }

  activateUser(id: string) {
    return this._usersRepository.activateUser(id);
  }

  updatePassword(id: string, password: string) {
    return this._usersRepository.updatePassword(id, password);
  }

  getPersonal(userId: string) {
    return this._usersRepository.getPersonal(userId);
  }

  changePersonal(userId: string, body: UserDetailDto) {
    return this._usersRepository.changePersonal(userId, body);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this._usersRepository.getUserById(userId);

    if (!user?.password) {
      throw new HttpException('Password not set for this account', 400);
    }

    if (!AuthService.comparePassword(currentPassword, user.password)) {
      throw new HttpException('Current password is incorrect', 400);
    }

    return this._usersRepository.updatePassword(userId, newPassword);
  }

  // ── Sessions ──
  createSession(data: { userId: string; tokenHash: string; expiresAt: Date; ip: string; userAgent: string }) {
    return this._usersRepository.createSession(data);
  }

  getUserSessions(userId: string) {
    return this._usersRepository.getUserSessions(userId);
  }

  getSessionById(id: string) {
    return this._usersRepository.getSessionById(id);
  }

  findSessionByTokenHash(tokenHash: string) {
    return this._usersRepository.findSessionByTokenHash(tokenHash);
  }

  findSessionByPreviousTokenHash(previousTokenHash: string) {
    return this._usersRepository.findSessionByPreviousTokenHash(previousTokenHash);
  }

  revokeSession(id: string) {
    return this._usersRepository.revokeSession(id);
  }

  revokeAllSessionsExcept(userId: string, currentTokenHash: string) {
    return this._usersRepository.revokeAllSessionsExcept(userId, currentTokenHash);
  }

  revokeAllUserSessions(userId: string) {
    return this._usersRepository.revokeAllUserSessions(userId);
  }

  rotateSessionToken(
    id: string,
    newTokenHash: string,
    previousTokenHash: string,
    ip: string,
    userAgent: string
  ) {
    return this._usersRepository.rotateSessionToken(
      id,
      newTokenHash,
      previousTokenHash,
      ip,
      userAgent
    );
  }

  cleanupExpiredSessions() {
    return this._usersRepository.cleanupExpiredSessions();
  }

  // ── Profile ──
  updateUserAvatar(userId: string, avatarUrl: string) {
    return this._usersRepository.updateUserAvatar(userId, avatarUrl);
  }

  getProfileByUserId(userId: string) {
    return this._usersRepository.getProfileByUserId(userId);
  }
}
