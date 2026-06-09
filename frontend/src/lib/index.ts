// Client-safe barrel for the lib layer.
//
// 刻意「不」re-export ./data：data.ts 是 server-only（用 next/cache + server-only），
// 若放進 barrel 會讓任何匯入此 barrel 的 client component 連帶打包 server-only 程式。
// Server component 請直接 `import { ... } from "@/lib/data"`。
export * from "./types";
export { submitContactForm } from "./contact";
export { getSupabaseClient } from "./supabase";
