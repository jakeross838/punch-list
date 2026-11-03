-- On Supabase every new table, sequence and function in public is granted to anon and authenticated
-- by default. Here only what each migration grants applies, the same as the database checks run it:
-- those defaults are taken away before anything is made.

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
