-- Harden the SECURITY DEFINER surface (advisors 0028/0029).
-- Trigger functions are fired by triggers, never called directly, so remove them
-- from the callable/API surface entirely.
revoke all on function public.stamp_tenant()    from public, anon, authenticated;
revoke all on function public.stamp_statement()  from public, anon, authenticated;

-- Claim helpers are referenced inside RLS policies (authenticated MUST keep
-- EXECUTE for RLS to evaluate), but anon must never be able to call them.
revoke all on function public.current_tenant_id() from public, anon;
revoke all on function public.current_user_role() from public, anon;
grant execute on function public.current_tenant_id() to authenticated;
grant execute on function public.current_user_role() to authenticated;
