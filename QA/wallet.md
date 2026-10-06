# Wallet (who holds the cash)

Cash moves up: collector → branch admin → tenant-wide admin → owner.

## What enters a wallet

1. Collector collects $50 → My Wallet +50.
2. Collector collects $10 of a $20 month → wallet +10 (cash, not the bill).
3. Add a custom debt or record a pay-later sale → no wallet changes.
4. Collect $50 and 2,000,000 LBP → two separate lines in the wallet, never one converted figure.

## Handing cash up

5. Branch admin receives all from a collector → collector's wallet 0, branch admin's wallet holds it, the Wallets grand total is unchanged; rows still say "Collected by" the collector.
6. Tenant-wide admin receives from the branch admin → cash moves to the tenant-wide admin; the grand total is unchanged.
7. Tenant-wide admin receives straight from a collector → allowed.
8. Anyone tries to receive their own cash → not allowed.
9. Branch admin tries to receive from another branch's collector, another branch admin, or a tenant-wide admin → not allowed. Two tenant-wide admins → not allowed.

## Cash leaving

10. Owner receives from a tenant-wide admin → the cash leaves every wallet; the grand total drops.
11. Tenant-wide admin closes out their own wallet → it empties; dashboard "Cash on hand" drops by that amount.
12. Branch admin and collector → no Close out.

## After a void

13. Void a payment whose cash already moved up to an admin → that admin's wallet drops by it.
14. Void a month and collect it again → the new cash is with the collector who took it, not the old holder.

## Dashboard

15. "Cash on hand" = sum of every wallet in the branch scope; handing cash up does not change it.

## Many hand-overs

16. Receive all from a collector holding 300+ payments → every one moves; the collector's wallet reads 0.
17. A collector holds more than 1,000 payments → the wallet lists every one and its total equals their sum; the Wallets total includes them all.
18. Void a payment while another admin has that wallet open, then they receive it → the voided payment does not move and never shows in any wallet.
19. The network drops in the middle of Receive all → an error shows and the wallet shows exactly what already moved; Receive all again moves the rest.
