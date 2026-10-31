<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture
- Chat data lives in `profiles` and `messages` tables with RLS limiting messages to sender/recipient; live delivery uses Realtime postgres_changes on `messages` plus a shared Presence channel for online status — keeps the client the only real-time layer, no custom socket server.
