begin;
create or replace function public.audit_funding_review()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status is distinct from old.status and new.status in ('approved','rejected') and auth.uid() is not null and public.is_support_admin() then
    insert into public.admin_audit_events(actor_id,target_id,action,details)
    values(auth.uid(),new.owner_id,'deposit.'||new.status,jsonb_build_object('request_id',new.id,'amount',new.amount,'currency',new.currency,'credit_seconds',new.credits_granted_seconds,'note',new.admin_note));
  end if;
  return new;
end; $$;
revoke all on function public.audit_funding_review() from public,anon,authenticated;
drop trigger if exists audit_funding_review on public.manual_funding_requests;
create trigger audit_funding_review after update on public.manual_funding_requests for each row execute function public.audit_funding_review();
commit;
