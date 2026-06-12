import { redirect } from "next/navigation";

// Interim launch: any URL that doesn't match a real route falls through to this
// root catch-all and is 307-redirected back to the home page, so visitors never
// land on a dead 404 while the full site is still being built out. Concrete
// routes (/, /events, /contact, /maintenance, …) take priority over this.
export default function CatchAll() {
  redirect("/");
}
