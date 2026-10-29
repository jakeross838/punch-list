-- PowerSync replicates these tables to the phones. The replication role and its password are made
-- during setup (docs/setup.md), never in a migration.

create publication powersync for table
  public.people,
  public.jobs,
  public.locations,
  public.trades,
  public.companies,
  public.job_companies,
  public.job_waiting_on,
  public.items,
  public.item_history,
  public.title_library;
