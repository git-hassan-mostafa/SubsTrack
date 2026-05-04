import type { AuthUser } from '@/src/core/types';
import type { DbUser } from '@/src/core/types/db';
import { AuthRepository } from '../repository/AuthRepository';

function mapDbUserToAuthUser(db: DbUser): AuthUser {
  return {
    id: db.id,
    username: db.username,
    role: db.role,
    tenantId: db.tenant_id,
  };
}

export class AuthService {
  private repository = new AuthRepository();

  async login(username: string, tenantId: string, password: string): Promise<AuthUser> {
    if (!username.trim()) throw new Error('Username is required');
    if (!tenantId.trim()) throw new Error('Tenant ID is required');
    if (!password) throw new Error('Password is required');

    const email = `${username.trim().toLowerCase()}@${tenantId.trim().toLowerCase()}.subs`;

    let session;
    try {
      session = await this.repository.signIn(email, password);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('credentials')) {
        throw new Error('Invalid username or password');
      }
      throw new Error('Connection error. Please try again.');
    }

    const profile = await this.repository.getUserProfile(session.user.id);
    if (!profile) {
      await this.repository.signOut().catch(() => {});
      throw new Error('account_not_configured');
    }

    return mapDbUserToAuthUser(profile);
  }

  async restoreSession(): Promise<AuthUser | null> {
    const session = await this.repository.getSession();
    if (!session) return null;

    const profile = await this.repository.getUserProfile(session.user.id);
    if (!profile) {
      await this.repository.signOut().catch(() => {});
      return null;
    }

    return mapDbUserToAuthUser(profile);
  }

  async logout(): Promise<void> {
    await this.repository.signOut();
  }
}
