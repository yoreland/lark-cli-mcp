---
name: feishu-lark
description: Operate Feishu/Lark as the logged-in user by running the lark-cli command-line tool directly in a shell — send, read, reply to, and search messages, find group chats and users, and view threads. No MCP server required; uses the shell/bash tool to invoke lark-cli. Use whenever the user wants to (1) send a Feishu/Lark message to a person or group, (2) read recent messages in a chat, (3) reply to a message (optionally in-thread), (4) search messages by keyword, (5) find a group chat's chat_id, (6) look up a user's open_id by name/email, or (7) view a message thread. Triggers include phrasing like "在飞书群里说…", "看看 XX 群最近聊了什么", "回复那条消息", "搜一下谁提过…", "帮我找一下某人", "send a Lark message", "check the group chat". All actions run as the real user (not a bot).
---

# Feishu / Lark via lark-cli (user identity)

Operate Feishu/Lark messaging by running the `lark-cli` CLI directly through the shell tool. Every command uses `--as user`, so the sender shown in Feishu is the logged-in human, not a bot. Output is JSON (parse it to extract ids, sender names, text).

## Setup check (run once if commands fail)

`lark-cli` must be installed and logged in on this machine. If a command returns `not configured` or auth errors, instruct the user to run these interactive steps in a terminal (do NOT run login on their behalf — it is personal/interactive):

```bash
npx -y @yoreland/lark-cli-mcp -- config init --new   # scan QR to bind the Feishu app
npx -y @yoreland/lark-cli-mcp auth                    # OAuth device-flow login
```

If `lark-cli` is on PATH (global install), commands below can use `lark-cli` directly. Otherwise prefix with the npx passthrough form: `npx -y @yoreland/lark-cli-mcp -- <args>`. Prefer plain `lark-cli` when available.

## Command cheatsheet

All commands add `--as user`. ID conventions: chat = `oc_xxx`, user open_id = `ou_xxx`, message = `om_xxx`, thread = `om_/omt_xxx`. Time args are ISO 8601 (e.g. `2026-06-04T00:00:00+08:00`).

| Goal | Command |
| --- | --- |
| Send to group | `lark-cli im +messages-send --as user --chat-id oc_xxx --text "..."` |
| Send DM | `lark-cli im +messages-send --as user --user-id ou_xxx --text "..."` |
| Send markdown | `lark-cli im +messages-send --as user --chat-id oc_xxx --markdown "..."` |
| Read chat | `lark-cli im +chat-messages-list --as user --chat-id oc_xxx --page-size 20` |
| Read DM history | `lark-cli im +chat-messages-list --as user --user-id ou_xxx --page-size 20` |
| Reply | `lark-cli im +messages-reply --as user --message-id om_xxx --text "..."` |
| Reply in thread | add `--reply-in-thread` to the reply command |
| Search messages | `lark-cli im +messages-search --as user --query "关键词"` |
| Find group → chat_id | `lark-cli im +chat-search --as user --query "群名"` |
| Find user → open_id | `lark-cli contact +search-user --as user --query "姓名或邮箱"` |
| View thread | `lark-cli im +threads-messages-list --as user --thread om_xxx` |

Flag notes:
- `--chat-id` and `--user-id` are mutually exclusive (pick one).
- `+chat-messages-list` page-size max is 50; sort with `--sort asc|desc`; time range `--start`/`--end` (ISO 8601).
- `+messages-search` time range `--start`/`--end` (ISO 8601 with tz); scope with `--chat-id`, `--sender`.
- `+messages-send`/`+messages-reply` need one of `--text` / `--markdown`.

## Core workflows

### Send to a group given only its name
1. `lark-cli im +chat-search --as user --query "<group name>"` → parse JSON, pick the `chat_id` of the match.
2. If several chats match, list them and ask the user which one.
3. `lark-cli im +messages-send --as user --chat-id <oc_...> --text "<message>"`.

### Send a DM given a person's name
1. `lark-cli contact +search-user --as user --query "<name or email>"` → get `open_id` (`ou_...`).
2. `lark-cli im +messages-send --as user --user-id <ou_...> --text "<message>"`.

### Read / summarize a chat
1. Resolve `chat_id` via `+chat-search` if only a name is given.
2. `lark-cli im +chat-messages-list --as user --chat-id <oc_...> --page-size 20`.
3. Parse JSON and summarize; attribute messages to sender names.

### Reply to a message
Obtain the `message_id` (`om_...`) — reuse the id from a prior read if the user says "that message". Add `--reply-in-thread` for thread replies.

### Search
`lark-cli im +messages-search --as user --query "<keyword>"`; narrow with `--chat-id`, `--sender`, `--start`/`--end`.

## Rules & safety

- **Sending runs as the real user — it is a real outbound message.** Before sending to any person or group, confirm the resolved target (show the chat/user name and id) and the exact message text, unless the user already gave an explicit, unambiguous send instruction.
- Never invent a `chat_id` or `open_id`. Always resolve via `+chat-search` / `+search-user` first, and verify the match.
- Quote arguments to handle spaces/CJK. Pass message text as a single `--text`/`--markdown` argument.
- Use `--markdown` for formatted messages, `--text` for plain.
- Attachments (image/file) and interactive cards are out of scope for these flows.

## Troubleshooting

- `missing required scope(s)` → re-login requesting needed scopes:
  `npx -y @yoreland/lark-cli-mcp auth --domain im,contact`
  or a specific scope, e.g. send-as-user: `npx -y @yoreland/lark-cli-mcp auth --scope "im:message:send_as_user"`
- `not configured` / `not_configured` → `npx -y @yoreland/lark-cli-mcp -- config init --new`.
- Token expired / auth errors → re-run `npx -y @yoreland/lark-cli-mcp auth`.
- `command not found: lark-cli` → use the npx passthrough form `npx -y @yoreland/lark-cli-mcp -- <args>`, or install globally: `npm i -g @larksuite/cli`.
