-- 在共享数据库中保存加密的一次性语音连接票据，支持 API 多副本消费。
create table if not exists public.voice_socket_tickets (
  id uuid primary key,
  user_id uuid not null,
  session_id uuid not null references public.interview_sessions(id) on delete cascade,
  access_token_ciphertext text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.voice_socket_tickets enable row level security;

-- 浏览器和 authenticated 角色没有策略；仅 service_role 可签发和原子消费票据。
revoke all on table public.voice_socket_tickets from anon, authenticated;

create index if not exists voice_socket_tickets_expires_at_idx
  on public.voice_socket_tickets (expires_at);
