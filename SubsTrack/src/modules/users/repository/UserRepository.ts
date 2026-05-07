import { BaseRepository } from '@/src/core/utils/BaseRepository';
import type { DbUser } from '@/src/core/types/db';

interface CreateUserPayload {
  username: string;
  password: string;
  phone: string | null;
  role: 'admin' | 'user';
  tenantId: string;
}

export class UserRepository extends BaseRepository {
  async findAll(): Promise<DbUser[]> {
    const { data, error } = await this.db
      .from('users')
      .select('*')
      .order('username');
    if (error) this.handleError(error);
    return (data ?? []) as DbUser[];
  }

  async create(payload: CreateUserPayload): Promise<DbUser> {
    const { data, error } = await this.db.rpc('create_tenant_user', {
      p_username: payload.username,
      p_password: payload.password,
      p_phone: payload.phone,
      p_role: payload.role,
      p_tenant_id: payload.tenantId,
    });
    if (error) this.handleError(error);
    return data as DbUser;
  }

  async update(
    id: string,
    payload: Partial<Pick<DbUser, 'username' | 'phone_number' | 'role'>>,
  ): Promise<DbUser> {
    const { data, error } = await this.db
      .from('users')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) this.handleError(error);
    return data as DbUser;
  }

  async countAll(): Promise<number> {
    const { count, error } = await this.db
      .from('users')
      .select('id', { count: 'exact', head: true });
    if (error) this.handleError(error);
    return count ?? 0;
  }
}
