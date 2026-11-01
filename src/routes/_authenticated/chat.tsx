import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, CheckCheck, ArrowLeft, LogOut, MessageCircle, Search, SendHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo, UserAvatar } from "@/components/chat/Logo";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Profile = Tables<"profiles">;
type Message = Tables<"messages">;

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({
    meta: [
      { title: "ChatWave" },
      { name: "description", content: "Your ChatWave conversations." },
      { property: "og:title", content: "Chats — ChatWave" },
      { property: "og:description", content: "Your ChatWave conversations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatPage,
});

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const t = formatTime(iso);
  if (t.includes(":")) return "Today";
  if (t === "Yesterday") return t;
  return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
}

function ChatPage() {
  const { user } = Route.useRouteContext();
  const me = user.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [typing, setTyping] = useState<Record<string, number>>({});
  const [now, setNow] = useState(Date.now());
  const lastTypingSent = useRef(0);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const isTyping = (id: string) => (typing[id] ?? 0) > now - 5000;

  const addMessage = (m: Message) =>
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));

  // Initial load: People come from conversation records, not the global user list
  useEffect(() => {
    let active = true;
    (async () => {
      const m = await supabase
        .from("messages")
        .select("*")
        .or(`sender_id.eq.${me},recipient_id.eq.${me}`)
        .order("created_at", { ascending: true })
        .limit(1000);
      const ids = new Set<string>([me]);
      for (const x of m.data ?? []) ids.add(x.sender_id === me ? x.recipient_id : x.sender_id);
      const p = await supabase.from("profiles").select("*").in("id", [...ids]);
      if (!active) return;
      if (p.error || m.error) toast.error("Couldn't load your chats");
      setProfiles(p.data ?? []);
      setMessages(m.data ?? []);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [me]);

  const [finding, setFinding] = useState(false);
  async function startByEmail() {
    const email = search.trim();
    if (!email.includes("@") || finding) return;
    setFinding(true);
    const { data, error } = await supabase.rpc("find_profile_by_email", { _email: email });
    setFinding(false);
    const found = data?.[0];
    if (error || !found) {
      toast.error("No ChatWave user with that email.");
      return;
    }
    setProfiles((cur) =>
      cur.some((c) => c.id === found.id)
        ? cur
        : [...cur, { id: found.id, display_name: found.display_name, email, last_seen: new Date(0).toISOString(), created_at: "" }],
    );
    setSelectedId(found.id);
    setSearch("");
  }

  // Realtime messages + new users
  useEffect(() => {
    const channel = supabase
      .channel(`messages-${me}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new as Message;
        if (m.sender_id === me || m.recipient_id === me) {
          addMessage(m);
          if (m.sender_id !== me) {
            setProfiles((prev) => {
              if (prev.some((p) => p.id === m.sender_id)) return prev;
              supabase.from("profiles").select("*").eq("id", m.sender_id).single().then(({ data }) => {
                if (data) setProfiles((cur) => (cur.some((c) => c.id === data.id) ? cur : [...cur, data]));
              });
              return prev;
            });
          }
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new as Message;
        setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_activity", filter: `recipient_id=eq.${me}` }, (payload) => {
        const a = payload.new as { user_id?: string; typing_at?: string | null };
        if (!a?.user_id) return;
        setTyping((t) => ({ ...t, [a.user_id!]: a.typing_at ? new Date(a.typing_at).getTime() : 0 }));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [me]);

  function sendActivity(typingNow: boolean) {
    if (!selectedId) return;
    supabase
      .from("chat_activity")
      .upsert({ user_id: me, recipient_id: selectedId, typing_at: typingNow ? new Date().toISOString() : null, seen_at: new Date().toISOString() })
      .then(() => {});
  }
  function onDraftChange(v: string) {
    setDraft(v);
    if (v && Date.now() - lastTypingSent.current > 2500) {
      lastTypingSent.current = Date.now();
      sendActivity(true);
    }
  }

  // Presence (online status)
  useEffect(() => {
    const channel = supabase.channel("chatwave-online", { config: { presence: { key: me } } });
    channel
      .on("presence", { event: "sync" }, () => {
        setOnline(new Set(Object.keys(channel.presenceState())));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await channel.track({ at: Date.now() });
      });
    const touch = () => supabase.from("profiles").update({ last_seen: new Date().toISOString() }).eq("id", me);
    touch();
    const interval = setInterval(touch, 60_000);
    return () => {
      clearInterval(interval);
      touch();
      supabase.removeChannel(channel);
    };
  }, [me]);

  const meProfile = profiles.find((p) => p.id === me);
  const others = profiles.filter((p) => p.id !== me);

  const conversations = useMemo(() => {
    const last = new Map<string, Message>();
    for (const m of messages) {
      const other = m.sender_id === me ? m.recipient_id : m.sender_id;
      last.set(other, m);
    }
    const q = search.trim().toLowerCase();
    return others
      .filter((p) => !q || p.display_name.toLowerCase().includes(q) || (p.email ?? "").toLowerCase().includes(q))
      .map((p) => ({ profile: p, last: last.get(p.id) }))
      .sort((a, b) => {
        if (a.last && b.last) return b.last.created_at.localeCompare(a.last.created_at);
        if (a.last) return -1;
        if (b.last) return 1;
        return a.profile.display_name.localeCompare(b.profile.display_name);
      });
  }, [messages, others, search, me]);

  const selected = others.find((p) => p.id === selectedId) ?? null;
  const thread = useMemo(
    () =>
      selectedId
        ? messages.filter(
            (m) =>
              (m.sender_id === me && m.recipient_id === selectedId) ||
              (m.sender_id === selectedId && m.recipient_id === me),
          )
        : [],
    [messages, selectedId, me],
  );

  // Read receipts: mark incoming messages in the open chat as read
  useEffect(() => {
    if (!selectedId || typeof document === "undefined" || document.hidden) return;
    const unread = thread.filter((m) => m.sender_id === selectedId && !m.read_at);
    if (!unread.length) return;
    const at = new Date().toISOString();
    setMessages((prev) => prev.map((m) => (unread.some((u) => u.id === m.id) ? { ...m, read_at: at } : m)));
    for (const m of unread) supabase.rpc("message_action", { _id: m.id, _action: "read" }).then(() => {});
  }, [thread, selectedId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [thread.length, selectedId]);

  async function send() {
    const content = draft.trim();
    if (!content || !selectedId || sending) return;
    setSending(true);
    setDraft("");
    lastTypingSent.current = 0;
    sendActivity(false);
    const { data, error } = await supabase
      .from("messages")
      .insert({ sender_id: me, recipient_id: selectedId, content })
      .select()
      .single();
    setSending(false);
    if (error) {
      setDraft(content);
      toast.error("Message not sent. Please try again.");
      return;
    }
    if (data) addMessage(data);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const lastSeenText = (p: Profile) =>
    online.has(p.id) ? "Online" : `Last seen ${formatTime(p.last_seen).toLowerCase()}`;

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className={`${selected ? "hidden md:flex" : "flex"} w-full flex-col border-r border-border bg-card md:w-[340px] lg:w-[380px]`}
      >
        <div className="flex items-center justify-between px-4 pt-4">
          <Logo />
          <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out" title="Sign out">
            <LogOut />
          </Button>
        </div>
        <div className="mx-4 mt-4 flex items-center gap-3 rounded-2xl bg-secondary p-3">
          <UserAvatar name={meProfile?.display_name ?? user.email ?? "Me"} online size="sm" />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-foreground">{meProfile?.display_name ?? "You"}</div>
            <div className="truncate text-xs text-muted-foreground">{user.email}</div>
          </div>
        </div>
        <div className="relative mx-4 my-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search chats or enter an email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") startByEmail();
            }}
            className="rounded-full border-transparent bg-secondary pl-9"
          />
        </div>
        {search.includes("@") && (
          <div className="mx-4 mb-2">
            <Button size="sm" className="w-full rounded-full" onClick={startByEmail} disabled={finding}>
              {finding ? "Looking up…" : `Start chat with ${search.trim()}`}
            </Button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {loading ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Loading chats…</p>
          ) : conversations.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {search ? "No chats match your search." : "No conversations yet. Enter a friend's email above to start one."}
            </p>
          ) : (
            conversations.map(({ profile, last }) => (
              <button
                key={profile.id}
                onClick={() => setSelectedId(profile.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${
                  selectedId === profile.id ? "bg-accent" : "hover:bg-secondary"
                }`}
              >
                <UserAvatar name={profile.display_name} online={online.has(profile.id)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-semibold text-foreground">{profile.display_name}</span>
                    {last && <span className="shrink-0 text-xs text-muted-foreground">{formatTime(last.created_at)}</span>}
                  </div>
                  <div className={`truncate text-sm ${isTyping(profile.id) ? "font-medium text-primary" : "text-muted-foreground"}`}>
                    {isTyping(profile.id) ? "typing…" : last ? `${last.sender_id === me ? "You: " : ""}${last.content}` : "Start a conversation"}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Chat panel */}
      <section className={`${selected ? "flex" : "hidden md:flex"} chat-pattern flex-1 flex-col`}>
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <div className="bg-brand flex h-16 w-16 items-center justify-center rounded-3xl text-primary-foreground shadow-soft">
              <MessageCircle className="h-8 w-8" />
            </div>
            <h2 className="mt-5 text-2xl font-bold text-foreground">Welcome to ChatWave</h2>
            <p className="mt-2 max-w-sm text-muted-foreground">Pick someone from the list to start chatting.</p>
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b border-border bg-card px-3 py-3 md:px-5">
              <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSelectedId(null)} aria-label="Back">
                <ArrowLeft />
              </Button>
              <UserAvatar name={selected.display_name} online={online.has(selected.id)} />
              <div className="min-w-0">
                <div className="truncate font-bold text-foreground">{selected.display_name}</div>
                <div className={`text-xs ${online.has(selected.id) ? "font-medium text-primary" : "text-muted-foreground"}`}>
                  {isTyping(selected.id) ? "typing…" : lastSeenText(selected)}
                </div>
              </div>
            </header>
            <div className="flex-1 overflow-y-auto px-3 py-4 md:px-10">
              {thread.length === 0 && (
                <div className="mx-auto mt-10 w-fit rounded-full bg-card px-4 py-2 text-sm text-muted-foreground shadow-soft">
                  Say hello to {selected.display_name}
                </div>
              )}
              <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
                {thread.map((m, i) => {
                  const mine = m.sender_id === me;
                  const prev = thread[i - 1];
                  const showDay = !prev || dayLabel(prev.created_at) !== dayLabel(m.created_at);
                  return (
                    <div key={m.id} className="flex flex-col">
                      {showDay && (
                        <div className="my-3 self-center rounded-full bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-soft">
                          {dayLabel(m.created_at)}
                        </div>
                      )}
                      <div
                        className={`animate-bubble max-w-[80%] rounded-2xl px-3.5 py-2 shadow-soft md:max-w-[65%] ${
                          mine
                            ? "self-end rounded-br-md bg-bubble-out text-bubble-out-foreground"
                            : "self-start rounded-bl-md bg-bubble-in text-bubble-in-foreground"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{m.content}</p>
                        <div className={`mt-0.5 flex items-center justify-end gap-1 text-[11px] ${mine ? "opacity-80" : "text-muted-foreground"}`}>
                          {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          {mine &&
                            (m.read_at ? (
                              <CheckCheck className="h-3.5 w-3.5 text-accent-foreground" aria-label="Read" />
                            ) : (
                              <Check className="h-3.5 w-3.5" aria-label="Sent" />
                            ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {isTyping(selected.id) && (
                  <div className="flex gap-1 self-start rounded-2xl rounded-bl-md bg-bubble-in px-4 py-3 shadow-soft" aria-label="typing">
                    {[0, 1, 2].map((d) => (
                      <span key={d} className="animate-typing h-2 w-2 rounded-full bg-muted-foreground" style={{ animationDelay: `${d * 0.15}s` }} />
                    ))}
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="flex items-end gap-2 border-t border-border bg-card px-3 py-3 md:px-5"
            >
              <textarea
                value={draft}
                onChange={(e) => onDraftChange(e.target.value)}
                onKeyDown={onKey}
                rows={1}
                maxLength={4000}
                placeholder="Type a message"
                className="max-h-32 min-h-11 flex-1 resize-none rounded-3xl bg-secondary px-4 py-3 text-[15px] text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
              />
              <Button
                type="submit"
                size="icon"
                className="h-11 w-11 shrink-0 rounded-full"
                disabled={!draft.trim() || sending}
                aria-label="Send message"
              >
                <SendHorizontal />
              </Button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
