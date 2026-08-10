import Image from "next/image";

// 後台上傳的封面圖比例極不一致（實測正式站 news 封面從 0.6 的直式到 2.8 的超寬都有），
// 而卡片框是固定比例。過去用 object-cover 填滿，等於一律裁切——這些圖多半是含文字的
// 宣傳 banner，一裁就看不完整。
//
// 解法：同一張圖鋪兩層。底層放大 + 模糊填滿整個框當背景，上層以 object-contain
// 完整顯示。任何比例都不裁切，卡片高度仍然齊一，也不會留下難看的空白色塊。
// 兩層是同一個 src，Next/Image 產生的最佳化 URL 相同，瀏覽器只會實際下載一次。
export function CoverImage({
  src,
  alt,
  sizes,
  priority = false,
  className = "",
}: {
  src: string;
  alt: string;
  sizes: string;
  priority?: boolean;
  /** 套在前景圖上的額外 class（例如 hover 放大效果）。 */
  className?: string;
}) {
  return (
    <>
      {/* 模糊底：scale-125 讓模糊擴散後的邊緣不會露出透明縫隙。 */}
      <Image
        src={src}
        alt=""
        aria-hidden="true"
        fill
        sizes={sizes}
        className="scale-125 object-cover blur-2xl"
      />
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className={`object-contain ${className}`}
      />
    </>
  );
}
