import type { AppUser } from '@/src/core/types';
import type { DbUser } from '@/src/core/types/db';
import { UserRepository } from '../repository/UserRepository';

function mapDbUserToAppUser(db: DbUser): AppUser {
  return {
    id: db.id,
    username: db.username,
    phoneNumber: db.phone_number,
    role: db.role,
    tenantId: db.tenant_id,
    createdAt: db.created_at,
  };
}

interface CreateUserInput {
  username: string;
  password: string;
  phone: string | null;
  role: 'admin' | 'user';
}

interface UpdateUserInput {
  username: string;
  phone: string | null;
  role: 'admin' | 'user';
}

export class UserService {
  private repository = new UserRepository();

  async getUsers(): Promise<AppUser[]> {
    const rows = await this.repository.findAll();
    return rows.map(mapDbUserToAppUser);
  }

  async createUser(data: CreateUserInput, tenantId: string): Promise<AppUser> {
    if (!data.username.trim()) throw new Error('Username is required');
    if (data.password.length < 8) throw new Error('Password must be at least 8 characters');
    if (!['admin', 'user'].includes(data.role)) throw new Error('Invalid role');

    try {
      const row = await this.repository.create({
        username: data.username.trim().toLowerCase(),
        password: data.password,
        phone: data.phone?.trim() || null,
        role: data.role,
        tenantId,
      });
      return mapDbUserToAppUser(row);
    } catch (err) {
      this.rethrow(err);
    }
  }

  async updateUser(
    id: string,
    currentUserId: string,
    currentUserRole: string,
    data: UpdateUserInput,
  ): Promise<AppUser> {
    if (!data.username.trim()) throw new Error('Username is required');
    if (id === currentUserId && data.role !== currentUserRole) {
      throw new Error('Cannot change your own role');
    }
    try {
      const row = await this.repository.update(id, {
        username: data.username.trim().toLowerCase(),
        phone_number: data.phone?.trim() || null,
        role: data.role,
      });
      return mapDbUserToAppUser(row);
    } catch (err) {
      this.rethrow(err);
    }
  }

  private rethrow(err: unknown): never {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('uq_users_username_tenant') || msg.includes('duplicate')) {
      throw new Error('A user with this username already exists');
    }
    throw err instanceof Error ? err : new Error('Connection error. Please try again.');
  }
}
