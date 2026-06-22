import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { ShortLinkPreference, SubscriptionTier, Provider, StorageProviderType } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { CreateOrgUserDto } from '@gitroom/nestjs-libraries/dtos/auth/create.org.user.dto';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';

@Injectable()
export class OrganizationRepository {
  constructor(
    private _organization: PrismaRepository<'organization'>,
    private _userOrg: PrismaRepository<'userOrganization'>,
    private _user: PrismaRepository<'user'>,
    private _storage: PrismaRepository<'storageProviderConfig'>,
    private _appRole: PrismaRepository<'appRole'>
  ) {}

  async createMaxUser(id: string, name: string, saasName: string, email: string) {
    const ownerRole = await this._appRole.model.appRole.findFirst({
      where: { organizationId: null, key: 'owner', isSystem: true },
    });
    return this._organization.model.organization.create({
      select: {
        id: true,
      },
      data: {
        name: name ? `${name}###${id}` : `Unnamed User###${id}`,
        isTrailing: false,
        subscription: {
          create: {
            totalChannels: 1000000,
            subscriptionTier: 'ULTIMATE',
            isLifetime: true,
            period: 'YEARLY',
          },
        },
        users: {
          create: {
            roleRef: ownerRole ? { connect: { id: ownerRole.id } } : undefined,
            user: {
              create: {
                activated: true,
                email: email
                  ? email.split('@').join(`+${saasName}@`)
                  : `${saasName}+` + makeId(10) + '@postiz.com',
                providerName: 'LOCAL',
                password: AuthService.hashPassword(makeId(500)),
                profile: {
                  create: {
                    name: name ? `${name}###${id}` : `Unnamed User###${id}`,
                  },
                },
              },
            },
          },
        },
        storageProviders: {
          create: {
            type: StorageProviderType.LOCAL,
            name: 'Local Storage',
          },
        },
      },
    });
  }

  getCount() {
    return this._organization.model.organization.count();
  }

  getAllIds() {
    return this._organization.model.organization.findMany({
      select: { id: true },
    });
  }

  getUserOrg(id: string) {
    return this._userOrg.model.userOrganization.findFirst({
      where: {
        id,
      },
      select: {
        user: true,
        organization: {
          include: {
            users: {
              select: {
                id: true,
                disabled: true,
                roleId: true,
                userId: true,
              },
            },
            subscription: {
              select: {
                subscriptionTier: true,
                totalChannels: true,
                isLifetime: true,
              },
            },
          },
        },
      },
    });
  }

  getImpersonateUser(name: string) {
    return this._userOrg.model.userOrganization.findMany({
      where: {
        OR: [
          {
            organizationId: {
              contains: name,
            },
          },
          {
            user: {
              OR: [
                {
                  profile: {
                    name: {
                      contains: name,
                    },
                  },
                },
                {
                  email: {
                    contains: name,
                  },
                },
                {
                  id: {
                    contains: name,
                  },
                },
              ],
            },
          },
        ],
      },
      select: {
        id: true,
        organization: {
          select: {
            id: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            profile: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });
  }

  async getOrgsByUserId(userId: string) {
    return this._organization.model.organization.findMany({
      where: {
        users: {
          some: {
            userId,
          },
        },
      },
      include: {
        users: {
          where: {
            userId,
          },
          select: {
            disabled: true,
            roleId: true,
          },
        },
        subscription: {
          select: {
            subscriptionTier: true,
            totalChannels: true,
            isLifetime: true,
            createdAt: true,
          },
        },
      },
    });
  }

  async getOrgById(id: string) {
    return this._organization.model.organization.findUnique({
      where: {
        id,
      },
    });
  }

  async addUserToOrg(
    userId: string,
    id: string,
    orgId: string,
    role: 'USER' | 'ADMIN',
    roleId?: string,
  ) {
    const checkIfInviteExists = await this._user.model.user.findFirst({
      where: {
        inviteId: id,
      },
    });

    if (checkIfInviteExists) {
      return false;
    }

    const checkForSubscription =
      await this._organization.model.organization.findFirst({
        where: {
          id: orgId,
        },
        select: {
          subscription: true,
        },
      });

    if (
      process.env.STRIPE_PUBLISHABLE_KEY &&
      checkForSubscription?.subscription?.subscriptionTier ===
        SubscriptionTier.STANDARD
    ) {
      return false;
    }

    const appRole = roleId
      ? await this._appRole.model.appRole.findUnique({ where: { id: roleId } })
      : await this._appRole.model.appRole.findFirst({
          where: { organizationId: null, key: role === 'ADMIN' ? 'admin' : 'member', isSystem: true },
        });

    const create = await this._userOrg.model.userOrganization.create({
      data: {
        roleId: appRole?.id,
        userId,
        organizationId: orgId,
      },
    });

    await this._user.model.user.update({
      where: {
        id: userId,
      },
      data: {
        inviteId: id,
      },
    });

    return create;
  }

  async createOrgAndUser(
    body: Omit<CreateOrgUserDto, 'providerToken'> & { providerId?: string; name?: string; lastName?: string },
    hasEmail: boolean,
    ip: string,
    userAgent: string
  ) {
    const ownerRole = await this._appRole.model.appRole.findFirst({
      where: { organizationId: null, key: 'owner', isSystem: true },
    });
    return this._organization.model.organization.create({
      data: {
        name: body.company,
        allowTrial: true,
        isTrailing: true,
        users: {
          create: {
            roleRef: ownerRole ? { connect: { id: ownerRole.id } } : undefined,
            user: {
              create: {
                activated: body.provider !== 'LOCAL' || !hasEmail,
                email: body.email,
                password: body.password
                  ? AuthService.hashPassword(body.password)
                  : '',
                providerName: body.provider,
                providerId: body.providerId || '',
                ip,
                agent: userAgent,
                profile: {
                  create: {
                    name: body.name || null,
                    lastName: body.lastName || null,
                  },
                },
              },
            },
          },
        },
        storageProviders: {
          create: {
            type: StorageProviderType.LOCAL,
            name: 'Local Storage',
          },
        },
      },
      select: {
        id: true,
        users: {
          select: {
            user: {
              include: {
                profile: true,
              },
            },
          },
        },
      },
    });
  }

  getOrgByCustomerId(customerId: string) {
    return this._organization.model.organization.findFirst({
      where: {
        paymentId: customerId,
      },
    });
  }

  async setStreak(organizationId: string, type: 'start' | 'end') {
    try {
      await this._organization.model.organization.update({
        where: {
          id: organizationId,
          ...(type === 'start'
            ? {
                streakSince: null,
              }
            : {}),
        },
        data: {
          ...(type === 'end' ? { streakSince: null } : {}),
          ...(type === 'start' ? { streakSince: new Date() } : {}),
        },
      });
    } catch (err) {}
  }

  async createTeamUser(orgId: string, email: string, password: string, roleKey: string, roleId?: string) {
    const user = await this._user.model.user.create({
      data: {
        email,
        password: AuthService.hashPassword(password),
        providerName: Provider.LOCAL,
        activated: true,
      },
    });

    const appRole = roleId
      ? await this._appRole.model.appRole.findUnique({ where: { id: roleId } })
      : await this._appRole.model.appRole.findFirst({
          where: { organizationId: null, key: roleKey, isSystem: true },
        });

    await this._userOrg.model.userOrganization.create({
      data: {
        userId: user.id,
        organizationId: orgId,
        roleId: appRole?.id,
      },
    });

    return { id: user.id, email: user.email, role: appRole?.key ?? roleKey };
  }

  async getTeam(orgId: string) {
    return this._organization.model.organization.findUnique({
      where: {
        id: orgId,
      },
      select: {
        users: {
          select: {
            roleId: true,
            user: {
              select: {
                email: true,
                id: true,
                profile: {
                  select: {
                    name: true,
                    pictureId: true,
                    sendSuccessEmails: true,
                    sendFailureEmails: true,
                    sendStreakEmails: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  getAllUsersOrgs(orgId: string) {
    return this._organization.model.organization.findUnique({
      where: {
        id: orgId,
      },
      select: {
        users: {
          select: {
            user: {
              select: {
                email: true,
                id: true,
                profile: {
                  select: {
                    sendSuccessEmails: true,
                    sendFailureEmails: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async deleteTeamMember(orgId: string, userId: string) {
    return this._userOrg.model.userOrganization.delete({
      where: {
        userId_organizationId: {
          userId,
          organizationId: orgId,
        },
      },
    });
  }

  async changeTeamMemberRole(
    orgId: string,
    userId: string,
    role: 'USER' | 'ADMIN',
    roleId?: string,
  ) {
    const appRole = roleId
      ? await this._appRole.model.appRole.findUnique({ where: { id: roleId } })
      : await this._appRole.model.appRole.findFirst({
          where: { organizationId: null, key: role === 'ADMIN' ? 'admin' : 'member', isSystem: true },
        });
    return this._userOrg.model.userOrganization.update({
      where: {
        userId_organizationId: {
          userId,
          organizationId: orgId,
        },
      },
      data: { roleId: appRole?.id },
    });
  }

  async getOwnerRoleId() {
    const role = await this._appRole.model.appRole.findFirst({
      where: { organizationId: null, key: 'owner', isSystem: true },
    });
    return role?.id || '';
  }

  async disableOrEnableNonSuperAdminUsers(orgId: string, disable: boolean) {
    const ownerRole = await this._appRole.model.appRole.findFirst({
      where: { organizationId: null, key: 'owner', isSystem: true },
    });
    return this._userOrg.model.userOrganization.updateMany({
      where: {
        organizationId: orgId,
        roleId: {
          not: ownerRole?.id || '',
        },
      },
      data: {
        disabled: disable,
      },
    });
  }

  getShortlinkPreference(orgId: string) {
    return this._organization.model.organization.findUnique({
      where: {
        id: orgId,
      },
      select: {
        shortlink: true,
      },
    });
  }

  updateShortlinkPreference(orgId: string, shortlink: ShortLinkPreference) {
    return this._organization.model.organization.update({
      where: {
        id: orgId,
      },
      data: {
        shortlink,
      },
    });
  }
}
