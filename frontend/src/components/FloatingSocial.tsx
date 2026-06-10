import { Facebook, MessageCircle } from "lucide-react";

// Floating contact widget (勁賀空壓), fixed bottom-right on every page.
const KAITAIN_LINE = "https://page.line.me/189njhgy?openQrModal=true";
const KAITAIN_FB = "https://www.facebook.com/kaitain0120/";

export function FloatingSocial() {
  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col gap-3 md:right-6 md:bottom-6">
      <a
        href={KAITAIN_LINE}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="勁賀空壓 LINE 官方帳號"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-[#06C755] text-white shadow-lg ring-1 ring-black/5 transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
      >
        <MessageCircle className="h-7 w-7" aria-hidden="true" />
      </a>
      <a
        href={KAITAIN_FB}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="勁賀空壓 Facebook 粉絲專頁"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-[#1877F2] text-white shadow-lg ring-1 ring-black/5 transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
      >
        <Facebook className="h-7 w-7" aria-hidden="true" />
      </a>
    </div>
  );
}
