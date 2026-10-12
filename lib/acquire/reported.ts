import { num } from "./cost";

/**
 * Commission rate on total payable gross.
 * Fixed for Jim Butler Auto Group until rates are configured per auto group.
 */
export const ACQUIRE_COMMISSION_RATE = 0.1;

export type ReportedEconomics = {
  reported_front_gross: number | null;
  reported_back_gross: number | null;
  pack_amount: number | null;
  buy_fee: number | null;
};

/** Reported front + reported back + pack + buy fee. Null when every input is blank. */
export function totalPayableGross(p: ReportedEconomics): number | null {
  const parts = [p.reported_front_gross, p.reported_back_gross, p.pack_amount, p.buy_fee];
  if (parts.every((x) => x == null)) return null;
  return parts.reduce<number>((sum, x) => sum + num(x), 0);
}

/** 10% of total payable gross, rounded to cents. Null when payable gross is blank. */
export function reportedCommission(payable: number | null): number | null {
  if (payable == null || !Number.isFinite(payable)) return null;
  return Math.round(payable * ACQUIRE_COMMISSION_RATE * 100) / 100;
}

/** Drop payable-commission inputs before they reach a non-admin client. */
export function redactReportedEconomics<T extends ReportedEconomics>(p: T): T {
  return {
    ...p,
    reported_front_gross: null,
    reported_back_gross: null,
    pack_amount: null,
    buy_fee: null,
  };
}
