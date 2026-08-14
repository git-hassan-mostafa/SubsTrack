import type { BranchFilter } from '@/src/core/constants';
import type { DbUser } from '@/src/core/types/db';
import { OfflineBaseRepository } from '@/src/core/offline/OfflineBaseRepository';
import { updateDirty, upsertFromServer } from '@/src/core/offline/db/dml';
import { nowIso } from '@/src/core/offline/ids';
import { isOnline } from '@/src/core/offline/net/connectivity';
import { RequiresConnectionError } from '@/src/core/offline/errors';
import type { CreateUserPayload, IUserRepository } from './IUserRepository';
import { UserRepository } from './UserRepository';

/**
 * SQLite-backed User repository. Reads from the local mirror; field updates and
 * active toggles mutate the mirror and flag the row `_dirty` for the next sync.
 * create / delete / updatePassword run edge functions and are online-only — they
 * delegate to the Supabase sibling (throwing offline).
 * Returns the same `DbUser` shapes as the Supabase repository.
 */
export class OfflineUserRepository extends OfflineBaseRepository implements IUserRepository {
  private online = new UserRepository();

  async findAll(branchFilter: BranchFilter = null): Promise<DbUser[]> {
    const where = this.combineWhere([
      this.branchWhere(branchFilter, this.BRANCH_SCOPES.users, 'users'),
    ]);
    const rows = await this.all(`SELECT * FROM users ${where.sql} ORDER BY username`, where.params);
    return this.decodeAll<DbUser>('users', rows);
  }

  // Edge function — online only. The online sibling records the audit entry.
  async create(payload: CreateUserPayload): Promise<DbUser> {
    if (!(await isOnline())) throw new RequiresConnectionError();
    const user = await this.online.create(payload);
    await upsertFromServer(this.db, 'users', user);
    return user;
  }

  async update(
    id: string,
    payload: Partial<Pick<DbUser, 'username' | 'full_name' | 'phone_number' | 'role' | 'branch_id'>>,
  ): Promise<DbUser> {
    const row = await this.auditedUpdate<DbUser>('users', id, {
      ...payload,
      updated_at: nowIso(),
    });
    if (!row) this.handleError(new Error('User not found'));
    return row;
  }

  async setActive(id: string, active: boolean): Promise<DbUser> {
    const row = await this.auditedUpdate<DbUser>(
      'users',
      id,
      { active, updated_at: nowIso() },
      { action: active ? 'restore' : 'update' },
    );
    if (!row) this.handleError(new Error('User not found'));
    return row;
  }

  async countPayments(id: string): Promise<number> {
    // Cash they collected OR are holding — see IUserRepository.
    return this.count(
      'SELECT COUNT(*) AS n FROM payments WHERE received_by_user_id = ? OR held_by_user_id = ?',
      [id, id],
    );
  }

  // The subset of the given users who have recorded payments or hold cash.
  async usersWithPayments(ids: string[]): Promise<Set<string>> {
    const [recorded, held] = await Promise.all([
      this.referencedIdsIn('payments', 'received_by_user_id', ids),
      this.referencedIdsIn('payments', 'held_by_user_id', ids),
    ]);
    return new Set([...recorded, ...held]);
  }

  // Soft-delete many users — one offline write each.
  async setActiveMany(ids: string[], active: boolean): Promise<void> {
    if (ids.length === 0) return;
    for (const id of ids) {
      await this.auditedUpdate<DbUser>(
        'users',
        id,
        { active, updated_at: nowIso() },
        { action: active ? 'restore' : 'update' },
      );
    }
  }

  // Edge function — online only. The online sibling records the audit entry, so
  // there is nothing to add here (adding one would double-count the delete).
  async delete(id: string): Promise<void> {
    if (!(await isOnline())) throw new RequiresConnectionError();
    await this.online.delete(id);
    await this.db.runAsync('DELETE FROM users WHERE id = ?', [id] as never[]);
  }

  // Edge function — online only.
  async updatePassword(userId: string, newPassword: string): Promise<void> {
    if (!(await isOnline())) throw new RequiresConnectionError();
    return this.online.updatePassword(userId, newPassword);
  }

  async countAll(branchFilter: BranchFilter = null): Promise<number> {
    const where = this.combineWhere([
      this.branchWhere(branchFilter, this.BRANCH_SCOPES.users, 'users'),
    ]);
    return this.count(`SELECT COUNT(*) AS n FROM users ${where.sql}`, where.params);
  }
}
