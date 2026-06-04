#!/usr/bin/env node
/**
 * @yoreland/lark-cli-mcp — MCP server
 *
 * Wraps the official `lark-cli` (Feishu/Lark CLI) and exposes message
 * operations as MCP tools. All actions run with `--as user`, so messages
 * are sent/read as the logged-in human, not as a bot.
 *
 * The bundled `lark-cli` binary (a dependency of this package) is resolved
 * automatically, so end users only need `npx @yoreland/lark-cli-mcp`.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

/**
 * Resolve the lark-cli executable.
 * Priority:
 *   1. LARK_CLI_BIN env override
 *   2. bundled binary inside this package's node_modules (.bin)
 *   3. fall back to "lark-cli" on PATH (global install)
 */
function resolveLarkCli() {
  if (process.env.LARK_CLI_BIN && existsSync(process.env.LARK_CLI_BIN)) {
    return process.env.LARK_CLI_BIN;
  }
  try {
    const require = createRequire(import.meta.url);
    // Locate the package, then walk to the .bin shim.
    const pkgJson = require.resolve("@larksuite/cli/package.json");
    const pkgDir = dirname(pkgJson);
    // node_modules/@larksuite/cli -> node_modules/.bin/lark-cli
    const binDir = join(pkgDir, "..", "..", ".bin");
    const candidate = join(
      binDir,
      process.platform === "win32" ? "lark-cli.cmd" : "lark-cli"
    );
    if (existsSync(candidate)) return candidate;
  } catch {
    /* ignore — fall through to PATH */
  }
  return "lark-cli";
}

const LARK_CLI = resolveLarkCli();

const server = new Server(
  { name: "lark-cli-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "feishu_send_message",
      description:
        "以用户身份发送飞书/Lark 消息到群聊或个人（支持纯文本与 Markdown）",
      inputSchema: {
        type: "object",
        properties: {
          chat_id: { type: "string", description: "群聊 ID（oc_xxx）" },
          user_id: {
            type: "string",
            description: "用户 open_id（ou_xxx），发私聊",
          },
          text: { type: "string", description: "纯文本消息内容" },
          markdown: {
            type: "string",
            description: "Markdown 消息内容（与 text 二选一）",
          },
        },
      },
    },
    {
      name: "feishu_get_messages",
      description: "查看群聊或私聊的最近消息记录",
      inputSchema: {
        type: "object",
        properties: {
          chat_id: { type: "string", description: "群聊 ID（oc_xxx）" },
          user_id: { type: "string", description: "用户 open_id（查私聊）" },
          count: { type: "number", description: "消息数量，默认 20" },
          start_time: { type: "string", description: "起始时间（Unix 秒）" },
          end_time: { type: "string", description: "结束时间（Unix 秒）" },
        },
      },
    },
    {
      name: "feishu_reply_message",
      description: "回复某条飞书消息（支持线程回复）",
      inputSchema: {
        type: "object",
        properties: {
          message_id: { type: "string", description: "消息 ID（om_xxx）" },
          text: { type: "string", description: "回复内容" },
          in_thread: { type: "boolean", description: "是否线程回复" },
        },
        required: ["message_id", "text"],
      },
    },
    {
      name: "feishu_search_messages",
      description: "跨群搜索飞书消息（用户身份）",
      inputSchema: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "搜索关键词" },
          chat_id: { type: "string", description: "限定群（可选）" },
          start_time: { type: "string", description: "起始时间（Unix 秒）" },
          end_time: { type: "string", description: "结束时间（Unix 秒）" },
        },
        required: ["keyword"],
      },
    },
    {
      name: "feishu_list_chats",
      description: "搜索飞书群聊列表（按关键词找 chat_id）",
      inputSchema: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "搜索关键词（可选）" },
        },
      },
    },
    {
      name: "feishu_search_user",
      description: "按名字/邮箱搜索飞书用户，拿到 open_id",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "用户名字或邮箱" },
        },
        required: ["query"],
      },
    },
    {
      name: "feishu_get_thread",
      description: "查看某条消息的完整线程讨论",
      inputSchema: {
        type: "object",
        properties: {
          message_id: { type: "string", description: "消息/线程 ID（om_/omt_）" },
          count: { type: "number", description: "回复数量，默认 50" },
        },
        required: ["message_id"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  try {
    switch (name) {
      case "feishu_send_message": {
        const { chat_id, user_id, text, markdown } = args;
        if (!chat_id && !user_id) return error("需要 chat_id 或 user_id");
        if (!text && !markdown) return error("需要 text 或 markdown");
        const cmd = ["im", "+messages-send", "--as", "user"];
        if (chat_id) cmd.push("--chat-id", chat_id);
        else cmd.push("--user-id", user_id);
        if (markdown) cmd.push("--markdown", markdown);
        else cmd.push("--text", text);
        return await run(cmd);
      }
      case "feishu_get_messages": {
        const { chat_id, user_id, count, start_time, end_time } = args;
        if (!chat_id && !user_id) return error("需要 chat_id 或 user_id");
        const cmd = ["im", "+chat-messages-list", "--as", "user"];
        if (chat_id) cmd.push("--chat-id", chat_id);
        else cmd.push("--user-id", user_id);
        if (count) cmd.push("--page-size", String(count));
        if (start_time) cmd.push("--start-time", start_time);
        if (end_time) cmd.push("--end-time", end_time);
        return await run(cmd);
      }
      case "feishu_reply_message": {
        const { message_id, text, in_thread } = args;
        const cmd = [
          "im",
          "+messages-reply",
          "--as",
          "user",
          "--message-id",
          message_id,
          "--text",
          text,
        ];
        if (in_thread === true) cmd.push("--reply-in-thread");
        return await run(cmd);
      }
      case "feishu_search_messages": {
        const { keyword, chat_id, start_time, end_time } = args;
        const cmd = [
          "im",
          "+messages-search",
          "--as",
          "user",
          "--query",
          keyword,
        ];
        if (chat_id) cmd.push("--chat-id", chat_id);
        if (start_time) cmd.push("--start-time", start_time);
        if (end_time) cmd.push("--end-time", end_time);
        return await run(cmd);
      }
      case "feishu_list_chats": {
        const { keyword } = args;
        const cmd = ["im", "+chat-search", "--as", "user"];
        if (keyword) cmd.push("--query", keyword);
        return await run(cmd);
      }
      case "feishu_search_user": {
        const { query } = args;
        return await run([
          "contact",
          "+search-user",
          "--as",
          "user",
          "--query",
          query,
        ]);
      }
      case "feishu_get_thread": {
        const { message_id, count } = args;
        const cmd = [
          "im",
          "+threads-messages-list",
          "--as",
          "user",
          "--thread",
          message_id,
        ];
        if (count) cmd.push("--page-size", String(count));
        return await run(cmd);
      }
      default:
        return error(`未知工具: ${name}`);
    }
  } catch (err) {
    return error(`执行失败: ${err.message}\n${err.stderr || ""}`);
  }
});

async function run(cmdArgs) {
  const { stdout, stderr } = await execFileAsync(LARK_CLI, cmdArgs, {
    timeout: 60000,
    maxBuffer: 1024 * 1024 * 5,
  });
  return { content: [{ type: "text", text: stdout || stderr || "(no output)" }] };
}

function error(msg) {
  return { content: [{ type: "text", text: msg }], isError: true };
}

const transport = new StdioServerTransport();
await server.connect(transport);
