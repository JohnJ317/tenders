-- Create the application role that RLS policies will be enforced against.
-- The admin role (tenderpro_admin) owns the schema and runs migrations — it bypasses RLS
-- because it is the schema owner. The app role does NOT, so RLS is always enforced at runtime.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tenderpro') THEN
    CREATE ROLE tenderpro LOGIN PASSWORD 'tenderpro';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE tenderpro TO tenderpro;
GRANT USAGE ON SCHEMA public TO tenderpro;
-- Tables are created by migrations (as tenderpro_admin); we grant access below
-- at migration time. See prisma/migrations/.../migration.sql.
