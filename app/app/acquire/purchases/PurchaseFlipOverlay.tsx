"use client";

import { useEffect, useMemo, useState } from "react";
import type { AcqBuyer, AcqPurchase } from "@/lib/acquire/types";
import { cn } from "@/lib/utils";
import { PurchaseCardFace, type CardOriginRect } from "./PurchaseCard";
import PurchaseDetail from "./PurchaseDetail";
import type { VehicleCatalogMake, VehicleCatalogModel } from "./AcquireVehicleFields";

const FLIP_MS = 560;

function targetRect(): CardOriginRect {
  const maxW = Math.min(672, window.innerWidth - 32); // ~max-w-2xl
  const maxH = Math.min(window.innerHeight * 0.92, 880);
  const width = maxW;
  const height = maxH;
  return {
    width,
    height,
    left: (window.innerWidth - width) / 2,
    top: (window.innerHeight - height) / 2,
  };
}

export default function PurchaseFlipOverlay({
  purchase,
  storeName,
  buyers,
  vehicleMakes,
  vehicleModels,
  canEdit,
  origin,
  onClose,
  onSaved,
}: {
  purchase: AcqPurchase;
  storeName: string;
  buyers: AcqBuyer[];
  vehicleMakes: VehicleCatalogMake[];
  vehicleModels: VehicleCatalogModel[];
  canEdit: boolean;
  origin: CardOriginRect;
  onClose: () => void;
  onSaved?: (updated: AcqPurchase) => void;
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [displayPurchase, setDisplayPurchase] = useState(purchase);
  const dest = useMemo(() => targetRect(), []);

  useEffect(() => {
    setDisplayPurchase(purchase);
  }, [purchase]);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setOpen(true);
      return;
    }
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setOpen(true));
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") requestClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function requestClose() {
    if (closing) return;
    setClosing(true);
    setOpen(false);
    window.setTimeout(() => onClose(), FLIP_MS);
  }

  function handleSaved(updated: AcqPurchase) {
    setDisplayPurchase(updated);
    onSaved?.(updated);
  }

  const box = open && !closing ? dest : origin;
  const flipped = open && !closing;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <button
        type="button"
        className={cn("acq-card-backdrop absolute inset-0 bg-black/65", !open && "opacity-0")}
        style={{
          transition: `opacity ${FLIP_MS}ms ease`,
          opacity: flipped ? 1 : 0,
        }}
        aria-label="Close"
        onClick={requestClose}
      />

      <div
        className="acq-flip-scene pointer-events-none fixed"
        style={{
          top: box.top,
          left: box.left,
          width: box.width,
          height: box.height,
          transitionProperty: "top, left, width, height",
          transitionDuration: `${FLIP_MS}ms`,
          transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
          perspective: 1600,
          zIndex: 1,
        }}
      >
        <div
          className={cn("acq-flip-inner h-full w-full", flipped && "is-flipped")}
          style={{
            transition: `transform ${FLIP_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
          }}
        >
          <div className="acq-flip-face acq-flip-front pointer-events-none">
            <PurchaseCardFace
              purchase={displayPurchase}
              storeName={storeName}
              canEdit={canEdit}
              interactive={false}
              className="rounded-xl"
            />
          </div>
          <div className="acq-flip-face acq-flip-back pointer-events-auto">
            <PurchaseDetail
              key={purchase.id}
              purchase={purchase}
              storeName={storeName}
              buyers={buyers}
              vehicleMakes={vehicleMakes}
              vehicleModels={vehicleModels}
              canEdit={canEdit}
              onClose={requestClose}
              onSaved={handleSaved}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
