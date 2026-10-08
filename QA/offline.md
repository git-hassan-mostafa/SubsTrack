# Offline (phone)

Turn on airplane mode, do the action, turn the network back on and sync. Then check the web app.

1. Offline: collect a month, collect part of another, void a payment → all work at once on the phone; after sync the web shows the same.
2. Two phones offline both collect Jan $20 → after sync: one bill for Jan, two payments; the extra $20 is visible as paid twice.
3. Phone A voids Oct and syncs; phone B (offline, not synced) collects Oct, then syncs → Oct is Paid with B's money; one bill only.
4. Kill the app in the middle of an offline save → on reopen, either all of it is saved or none of it (never a payment without its bill, never a corrected payment without its replacement).
5. Two phones sell the last unit offline → both sales are kept; stock reads "Short by 1".
6. Offline sale edit that also collects money → after sync the sale, its bill and the new payment all arrive together.
7. Two phones correct the same payment offline → after sync there is one live corrected payment, not two.
8. Two admins receive the same cash offline → after sync it sits with exactly one of them.
9. Collect money offline, then reopen the app the same day (sync not due yet) → the payment is still pushed to the server.
10. Two phones write off the same unpaid month offline → after sync there is one written-off bill for that month, not two.
