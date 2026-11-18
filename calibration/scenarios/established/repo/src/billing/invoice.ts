export interface Invoice { id: string; orderId: string; capturedCents: number; refundedCents: number }

export function remainingRefundable(invoice: Invoice): number {
  return Math.max(0, invoice.capturedCents - invoice.refundedCents);
}

export function invoiceNumber(year: number, seq: number): string {
  return `INV-${year}-${String(seq).padStart(6, "0")}`;
}
