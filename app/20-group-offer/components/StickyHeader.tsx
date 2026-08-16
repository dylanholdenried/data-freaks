import Link from "next/link";
import DealerAcqLogo from "@/components/brand/DealerAcqLogo";

export function StickyHeader() {
  return (
    <nav className="da-nav">
      <div className="da-wrap da-nav-in">
        <DealerAcqLogo href="/" />
        <div className="da-nav-actions">
          <Link
            href="/signup"
            className="da-btn da-btn-green whitespace-nowrap !px-3 !py-2 !text-[13px] sm:!px-[22px] sm:!py-[11px] sm:!text-[15px]"
          >
            Create your free account
          </Link>
        </div>
      </div>
    </nav>
  );
}
