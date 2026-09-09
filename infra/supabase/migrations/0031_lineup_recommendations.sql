alter table public.recommendation_results
  drop constraint recommendation_results_workflow_check;

alter table public.recommendation_results
  add constraint recommendation_results_workflow_check
  check (workflow in ('free-agents', 'trades', 'lineup'));
