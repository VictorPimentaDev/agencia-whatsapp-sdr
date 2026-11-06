import { Desk } from '@/components/desk';
export const dynamic = 'force-dynamic';
export default function Page() {
  return (
    <Desk
      connection={
        process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
          ? { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_ANON_KEY }
          : null
      }
    />
  );
}
