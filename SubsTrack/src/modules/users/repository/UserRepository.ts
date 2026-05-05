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

  // User creation goes through an Edge Function because admin SDK is required server-side.
  async createViaFunction(payload: CreateUserPayload): Promise<DbUser> {
    const { data, error } = await this.db.functions.invoke('create-user', {
      body: payload,
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
}
