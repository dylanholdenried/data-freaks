"use client";

import type { InvUnitRow } from "@/lib/inventory-command/types";
import { ageTone, IC, photoTone, pomTone } from "@/lib/inventory-command/midmo";
import { fmtMoney, fmtNum, fmtPct } from "@/lib/inventory-command/format";
import type { IcCol } from "./IcTable";

/** Shared column builders used across MidMo-style tables. */
export function colStock<T extends InvUnitRow>(): IcCol<T> {
  return { key: "stk", label: "Stock #", bold: true };
}

export function colVeh<T extends InvUnitRow>(): IcCol<T> {
  return { key: "veh", label: "Vehicle" };
}

export function colAge<T extends InvUnitRow>(): IcCol<T> {
  return {
    key: "age",
    label: "Age",
    right: true,
    color: (u) => ageTone(u.age),
    render: (u) => u.age ?? "—",
  };
}

export function colCost<T extends InvUnitRow>(): IcCol<T> {
  return {
    key: "cost",
    label: "Cost",
    right: true,
    render: (u) => fmtMoney(u.cost),
  };
}

export function colPrice<T extends InvUnitRow>(): IcCol<T> {
  return {
    key: "price",
    label: "Price",
    right: true,
    bold: true,
    render: (u) => fmtMoney(u.price),
  };
}

export function colPom<T extends InvUnitRow>(): IcCol<T> {
  return {
    key: "pom",
    label: "% Mkt",
    right: true,
    color: (u) => pomTone(u.pom),
    render: (u) => fmtPct(u.pom, 1),
  };
}

export function colPhotos<T extends InvUnitRow>(): IcCol<T> {
  return {
    key: "ph",
    label: "Photos",
    right: true,
    color: (u) => photoTone(u.ph),
    render: (u) => u.ph ?? 0,
  };
}

export function colSrp<T extends InvUnitRow>(): IcCol<T> {
  return { key: "srp", label: "SRP", right: true, render: (u) => fmtNum(u.srp) };
}

export function colVdp<T extends InvUnitRow>(): IcCol<T> {
  return { key: "vdp", label: "VDP", right: true, render: (u) => fmtNum(u.vdp) };
}

export function colVr<T extends InvUnitRow>(): IcCol<T> {
  return {
    key: "vr",
    label: "VDP %",
    right: true,
    render: (u) => (u.vr == null ? "—" : `${u.vr}%`),
  };
}

export function colDsr<T extends InvUnitRow>(): IcCol<T> {
  return {
    key: "dsr",
    label: "Days since $",
    right: true,
    color: (u) => ((u.dsr ?? 0) >= 7 ? IC.red : IC.text),
    render: (u) => u.dsr ?? "—",
  };
}
