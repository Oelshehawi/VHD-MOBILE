# Hide Mark Cheque Received Button When Invoice Is Paid

**Date:** 2026-04-13
**Status:** Planning / verification

## Goal

Hide the `Mark Cheque Received` action when the synced invoice status is `paid`.

Backend invoice status values from the main app schema:

```ts
status: {
  type: String,
  enum: ["pending", "overdue", "paid"],
  default: "pending",
}
```

The app's local type already matches this shape in `types/index.ts`:

```ts
status?: 'pending' | 'overdue' | 'paid';
```

## Current Local Finding

This appears to already be implemented in `components/schedule/InvoiceModal.tsx`.

Current condition:

```tsx
{/* Mark Cheque Received Section - Only show if invoice is not paid */}
{invoice?.status !== 'paid' && (
  <View className='flex flex-col gap-4'>
    ...
  </View>
)}
```

So the button should already be hidden when `invoice.status === 'paid'`.

## Recommended Work

Treat this as a verification and hardening task rather than a new feature implementation.

1. Confirm the invoice rows synced from the backend populate local `invoices.status` with exactly `paid` for paid invoices.
2. Confirm there is no secondary cheque button elsewhere in the app by searching for `Mark Cheque`, `cheque`, `received`, and `recieved`.
3. Add or update a component test for `InvoiceModal` if the test setup supports bottom sheet/modal rendering.
4. If a component test is too costly, add a small helper function and unit test it:

```ts
export function canMarkChequeReceived(invoice?: Pick<InvoiceType, 'status'> | null) {
  return invoice?.status !== 'paid';
}
```

5. Replace the inline condition with the helper only if it improves testability without adding unnecessary indirection.
6. Run:

```bash
pnpm run lint:types
pnpm run lint:eslint
```

## Acceptance Criteria

- Paid invoices do not show the `Mark Cheque Received` button.
- Pending and overdue invoices still show the button.
- Marking a cheque payment updates local PowerSync `invoices.status` to `paid`, `paymentMethod` to `cheque`, and `paymentDatePaid` to the current timestamp.
- The UI hides the section after the paid status is reflected by the reactive invoice query.
- Type checking and ESLint pass.

## Notes

The current UI state uses `chequeMarked` after a local write, but the surrounding section is gated by `invoice?.status !== 'paid'`. If the reactive invoice object updates immediately, the success state inside that same gated section may disappear. That is acceptable if the intended UX is simply to remove the action once paid. If a confirmation message must remain visible, it should live outside the paid-status gate.
