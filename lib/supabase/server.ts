import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export function createSupabaseServerClient() {
  const cookieStore = cookies();

  // Do not forward the incoming Accept header. Next.js server actions send
  // Accept: text/x-component, which PostgREST rejects (PGRST107) and breaks
  // queries during mutations like calendar toggles.
  const incoming = headers();
  const globalHeaders: Record<string, string> = {
    Accept: "application/json",
  };
  const authorization = incoming.get("authorization");
  if (authorization) globalHeaders.Authorization = authorization;

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: "", ...options });
        },
      },
      global: {
        headers: globalHeaders,
      },
    }
  );
}
