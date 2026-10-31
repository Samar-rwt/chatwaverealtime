# ChatWave premium upgrade

## Outcome
Transform the existing app into a premium dark messaging product, preserve all current accounts and conversations, and add a completely separate private ChatWave AI assistant. Implement and verify one phase at a time.

## Inspection findings
- Current messaging supports saved one-to-one text messages, exact-email contact lookup, live incoming messages, online status, and mobile chat navigation.
- The live database has `profiles` and `messages`. Both have row-level security enabled. Message reads are participant-only; profile reads are limited to yourself and existing conversation partners.
- Messages currently support insertion and reading only; editing, deletion, media, replies, reactions, pins, typing, and receipts need additional storage and permissions.
- The current message content rule requires 1–4,000 characters. Attachment-only messages must be supported without breaking existing text messages.
- The current interface is light green. There is no AI assistant or disappearing-message functionality.
- Existing tests cover basic route matching, not cross-account messaging or privacy.

## Non-negotiable safeguards
- No disappearing messages, timers, or automatic expiry.
- No account resets, destructive schema changes, or removal of existing messages.
- People remain conversation partners only; no global user directory or signup announcements.
- Sender-only editing and delete-for-everyone; delete-for-me affects only the requesting participant.
- Attachments, reactions, pins, receipts, and replies are accessible only to the relevant participants.
- AI conversations belong exclusively to their owner. Regular private messages are never automatically included in AI requests.
- Existing sign-in and email-confirmation behavior stays intact.

## Phase 1 — Premium appearance and foundation
- Create a charcoal/black theme with restrained green accents, refined borders, compact spacing, and elegant typography.
- Upgrade sign-in, the existing welcome page, sidebar, conversation list, message area, and composer without changing account behavior.
- Preserve the ChatWave favicon and branding.
- Split the large messaging screen into focused, reusable parts; introduce stable conversation identity and paginated history so older messages remain accessible beyond the current 1,000-message load.
- Maintain desktop and mobile navigation, accessible controls, and reduced-motion support.

**Check:** Sign in, load existing history, find a contact by exact email, exchange messages, sign out, and check both screen sizes.

## Phase 2 — Message actions
- Reply through double-click, right-click menus, and mobile swipes; show quoted previews and navigation to the original message.
- Add emoji reactions, sender-only editing with an edited marker, and explicit deletion confirmations.
- Delete-for-me hides a message only for that user. Delete-for-everyone replaces visible content with a deletion notice while preserving conversation continuity.
- Forward selected messages to an existing conversation or an exact-email contact; mark forwarded messages.
- Add shared conversation pins and a pinned-message view with unpin and jump-to-message actions.
- Validate same-conversation reply references and enforce permissions in the database, not only the interface.

**Check:** Two participants see live edits, reactions, replies, deletions, and pins; a third account cannot access or alter them.

## Phase 3 — Private media and voice
- Add image, video, and file attachments with upload progress, cancel/error states, image previews, video playback, and file downloads.
- Store media privately and grant access only to its conversation participants; avoid permanent public media links.
- Add microphone recording with permission handling, recording duration, preview, discard, send, and audio playback. Show an unavailable state when recording is unsupported.
- Support media-only messages while retaining the existing text limit.
- Forward attachments through an authorized copy into the destination conversation, without widening access to the original file.
- Apply documented upload size and file-type limits and reject unsafe files; no silent automatic deletion of media belonging to existing messages.

**Check:** Upload and play an image, video, file, and recorded voice message; verify unauthorized accounts cannot download the underlying files.

## Phase 4 — Delivery state
- Add conversation-scoped typing indicators and read receipts.
- Mark messages read only when the recipient has the conversation visible; retain clear sent/read states.
- Preserve online status without exposing a global directory or broadcasting typing to unrelated users.
- Handle reconnection, deduplication, and ordered message updates.

**Check:** Two active sessions see typing and read state change; unrelated accounts receive neither conversation metadata nor message content.

## Phase 5 — Separate ChatWave AI
- Add a dedicated AI Assistant destination in the main navigation with distinct ChatWave AI branding.
- Use multiple saved private conversations, a visible history list, and a dedicated URL for each conversation; provide new, rename, and delete actions.
- Add suggested starting prompts for summarization, writing, grammar, translation, and Hindi/English questions.
- Stream formatted answers with syntax-highlighted code, immediate typing feedback, copy and regenerate controls, and a working Stop action.
- Keep AI conversation state isolated from ordinary messaging. Summarization uses only text the user explicitly submits to the assistant.
- Restore the correct history after navigation and reload, including deliberately stopped partial responses.
- Show actionable AI service errors without retrying terminal access or credit failures.

**Check:** Send real requests, create two AI conversations, rename one, regenerate and copy answers, stop a response, reload both histories, and verify owner-only access.

**Usage:** AI requests consume Lovable AI credits after the included allowance; insufficient credits or service access restrictions will be shown rather than hidden behind simulated replies.

## Phase 6 — Final regression and privacy verification
- Add focused tests for participant visibility, author permissions, per-user deletion, attachment authorization, reply validation, receipts, and AI thread ownership.
- Test direct unauthorized read/write attempts as well as visible UI behavior using three accounts.
- Exercise the central flows with real input and saved results, including reconnection and error handling.
- Verify desktop/mobile layouts, keyboard accessibility, media rendering, and page-specific sharing metadata.
- Fix reported check errors and leave all requested features functional before declaring completion.

## Technical approach
- Reuse `profiles` and `messages`; extend them additively and use supporting participant-scoped tables where appropriate.
- Keep contact identity separate from message visibility so explicit per-user deletion does not accidentally expose or erase contact relationships.
- Use atomic authorized operations for sensitive edits/deletions and secure media forwarding; enforce row-level security, grants, and reference validation for every new storage path.
- Retain client-managed live messaging, with private per-user notifications or authorized participant-scoped state for new live features. Do not add a custom socket server.
- Use private Lovable Cloud Storage for attachments, with short-lived authorized access.
- Use TanStack server functions for app operations and an authenticated streaming server endpoint for AI, not Edge Functions. Verify every private handler independently of the page gate.
- Use the Lovable AI Gateway default model through the AI SDK with server-only credentials, AI Elements chat primitives, structured message parts, and persisted thread history.
- Record structural decisions in `AGENTS.md`; keep focused permission and behavior tests beside the existing tests.

## Delivery order
Approval starts Phase 1. Each later phase builds on verified earlier work; incomplete functionality will not be represented by dummy controls. No publishing or destructive data action is part of this plan.