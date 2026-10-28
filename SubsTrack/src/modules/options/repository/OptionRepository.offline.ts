import type { DbAppOption } from "@shared/core/types/db";
import { OfflineBaseRepository } from "@/src/core/offline/OfflineBaseRepository";
import { isOnline } from "@/src/core/offline/net/connectivity";
import type { IOptionRepository } from "@shared/modules/options/repository/IOptionRepository";
import { OptionRepository } from "@shared/modules/options/repository/OptionRepository";

// Online first: the mirror fills only after login, but the login screen needs options too.
export class OfflineOptionRepository
  extends OfflineBaseRepository
  implements IOptionRepository
{
  private online = new OptionRepository();

  async findAll(): Promise<DbAppOption[]> {
    if (await isOnline()) {
      try {
        return await this.online.findAll();
      } catch {}
    }
    const rows = await this.all("SELECT * FROM app_options ORDER BY key");
    return this.decodeAll<DbAppOption>("app_options", rows);
  }

  async findByKey(key: string): Promise<DbAppOption | null> {
    if (await isOnline()) {
      try {
        return await this.online.findByKey(key);
      } catch {}
    }
    const row = await this.first("SELECT * FROM app_options WHERE key = ?", [
      key,
    ]);
    return this.decodeOne<DbAppOption>("app_options", row);
  }
}
