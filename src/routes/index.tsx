import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Lock, Zap, MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/chat/Logo";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ChatWave — Simple real-time messaging" },
      { name: "description", content: "Chat one-to-one in real time with ChatWave. Fast, clean and private." },
      { property: "og:title", content: "ChatWave — Simple real-time messaging" },
      { property: "og:description", content: "Chat one-to-one in real time with ChatWave. Fast, clean and private." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/chat", replace: true });
    });
  }, [navigate]);

  return (
    <div className="chat-pattern flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <Logo />
        <Button asChild variant="ghost">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-6xl">
          Messages that arrive <span className="text-primary">instantly</span>.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-muted-foreground">
          ChatWave is a clean, lightweight way to talk one-to-one. Create an account and start chatting in seconds.
        </p>
        <div className="mt-8 flex gap-3">
          <Button asChild size="lg" className="rounded-full">
            <Link to="/auth">Get started</Link>
          </Button>
        </div>
        <div className="mt-14 grid w-full gap-4 sm:grid-cols-3">
          {[
            { icon: Zap, t: "Real-time", d: "No refreshing, ever." },
            { icon: Lock, t: "Private", d: "Only you and them." },
            { icon: MessagesSquare, t: "Saved", d: "History kept safely." },
          ].map(({ icon: Icon, t, d }) => (
            <div key={t} className="rounded-2xl bg-card p-5 text-left shadow-soft">
              <Icon className="h-5 w-5 text-primary" />
              <div className="mt-3 font-bold text-foreground">{t}</div>
              <div className="text-sm text-muted-foreground">{d}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
