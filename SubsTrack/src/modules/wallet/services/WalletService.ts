import type { BranchFilter } from '@/src/core/constants';
import type { UserWallet, UserWalletDetail, WalletItem } from '@/src/core/types';
import i18n from '@/src/core/i18n';
import { collectionService } from '@/src/modules/ledger';
import { userService } from '@/src/modules/admin/users';
import {
  canCloseOut,
  canReceiveFrom,
  custodyTargetFor,
  receiveBlock,
  type WalletActor,
} from '../utils/custody';
import { groupByCurrency, sumUsd } from '@/src/core/utils/currency';


/** One holder, resolved from the user list — what the chain rules need. */
type HolderInfo = WalletActor & { fullName: string; active: boolean };

class WalletService {
  async getWalletsView(
    viewer: WalletActor,
    branchFilter: BranchFilter = null,
  ): Promise<UserWallet[]> {
    const [items, holders] = await Promise.all([
      this.collectItems(branchFilter, null),
      this.holderMap(),
    ]);
    this.nameCollectors(items, holders);
    const byHolder = new Map<string, WalletItem[]>();
    for (const it of items) {
      const arr = byHolder.get(it.holderUserId);
      if (arr) arr.push(it);
      else byHolder.set(it.holderUserId, [it]);
    }
    const wallets: UserWallet[] = [];
    for (const [id, its] of byHolder) {
      const holder = holders.get(id);
      if (!holder) continue;
      wallets.push(this.foldWallet(holder, viewer, its));
    }
    wallets.sort((a, b) => b.totalUsd - a.totalUsd);
    return wallets;
  }

  async getWalletDetail(
    holderUserId: string,
    viewer: WalletActor,
    branchFilter: BranchFilter = null,
  ): Promise<UserWalletDetail> {
    const [items, holders] = await Promise.all([
      this.collectItems(branchFilter, holderUserId),
      this.holderMap(),
    ]);
    this.nameCollectors(items, holders);
    const holder = holders.get(holderUserId) ?? this.unknownHolder(holderUserId);
    const wallet = this.foldWallet(holder, viewer, items);
    const sorted = [...items].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return { ...wallet, items: sorted };
  }

  async receiveFrom(
    holderUserId: string,
    ids: string[],
    viewer: WalletActor,
  ): Promise<void> {
    await this.assertCanReceive(holderUserId, viewer);
    await this.moveCustody(ids, holderUserId, custodyTargetFor(viewer), viewer.id);
  }

  async receiveAllFrom(
    holderUserId: string,
    viewer: WalletActor,
    branchFilter: BranchFilter = null,
  ): Promise<void> {
    await this.assertCanReceive(holderUserId, viewer);
    const items = await this.collectItems(branchFilter, holderUserId);
    await this.moveCustody(
      items.map((i) => i.id),
      holderUserId,
      custodyTargetFor(viewer),
      viewer.id,
    );
  }

  async closeOut(ids: string[], viewer: WalletActor): Promise<void> {
    this.assertCanCloseOut(viewer);
    await this.moveCustody(ids, viewer.id, null, viewer.id);
  }

  async closeOutAll(viewer: WalletActor, branchFilter: BranchFilter = null): Promise<void> {
    this.assertCanCloseOut(viewer);
    const items = await this.collectItems(branchFilter, viewer.id);
    await this.moveCustody(
      items.map((i) => i.id),
      viewer.id,
      null,
      viewer.id,
    );
  }


  private async moveCustody(
    ids: string[],
    fromUserId: string,
    toUserId: string | null,
    actorUserId: string,
  ): Promise<void> {
    await collectionService.transferCustody(ids, fromUserId, toUserId, actorUserId);
  }

  private async collectItems(
    branchFilter: BranchFilter,
    holderUserId: string | null,
  ): Promise<WalletItem[]> {
    const held = await collectionService.getHeld(branchFilter, holderUserId);
    const items: WalletItem[] = [];
    for (const c of held) {
      if (!c.heldByUserId) continue;
      items.push({
        id: c.id,
        source: c.kind,
        collectorUserId: c.receivedByUserId ?? c.heldByUserId,
        collectorName: null,
        holderUserId: c.heldByUserId,
        customerId: c.customerId,
        customerName: c.customerName,
        label: c.itemLabels.filter(Boolean).join(', ') || null,
        amount: c.amount,
        currencyId: c.currencyId,
        ratePerUsdSnapshot: c.ratePerUsdSnapshot,
        date: c.receivedAt,
      });
    }
    return items;
  }

  private nameCollectors(items: WalletItem[], holders: Map<string, HolderInfo>): void {
    for (const it of items) {
      if (it.collectorUserId === it.holderUserId) continue;
      it.collectorName = holders.get(it.collectorUserId)?.fullName ?? null;
    }
  }

  private foldWallet(holder: HolderInfo, viewer: WalletActor, items: WalletItem[]): UserWallet {
    const byCurrency = groupByCurrency(items);
    const totalUsd = sumUsd(items);
    const isSelf = holder.id === viewer.id;
    return {
      holderUserId: holder.id,
      holderName: holder.fullName,
      active: holder.active,
      byCurrency,
      itemCount: items.length,
      totalUsd,
      isSelf,
      receiveBlock: receiveBlock(viewer, holder),
      canCloseOut: isSelf && canCloseOut(viewer),
    };
  }

  private async holderMap(): Promise<Map<string, HolderInfo>> {
    const users = await userService.getUsers(null);
    const map = new Map<string, HolderInfo>();
    for (const u of users) {
      map.set(u.id, {
        id: u.id,
        role: u.role,
        branchId: u.branchId,
        fullName: u.fullName,
        active: u.active,
      });
    }
    return map;
  }

  private unknownHolder(id: string): HolderInfo {
    return {
      id,
      role: 'superadmin',
      branchId: null,
      fullName: i18n.t('wallet.unknown_collector'),
      active: false,
    };
  }

  private async assertCanReceive(holderUserId: string, viewer: WalletActor): Promise<void> {
    const holder = (await this.holderMap()).get(holderUserId);
    if (!holder || !canReceiveFrom(viewer, holder)) {
      throw new Error(i18n.t('errors.forbidden'));
    }
  }

  private assertCanCloseOut(viewer: WalletActor): void {
    if (!canCloseOut(viewer)) throw new Error(i18n.t('errors.forbidden'));
  }
}

export default new WalletService();
