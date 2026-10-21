export type DealerAddress = { line: string | null; locality: string | null };

export type DealerAddressFields = { addressLine: string; postalCode: string; city: string };

export function dealerAddress(dealer: DealerAddressFields): DealerAddress | null {
  const line = dealer.addressLine.trim() || null;
  const locality = [dealer.postalCode.trim(), dealer.city.trim()].filter(Boolean).join(" ") || null;
  return line || locality ? { line, locality } : null;
}
