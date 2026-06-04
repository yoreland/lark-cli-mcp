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
    {
      name: "feishu_search_docs",
      description:
        "搜索飞书云文档（文档/Wiki/表格），按关键词。返回标题、token、URL 等",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "搜索关键词" },
          count: { type: "number", description: "结果数量，默认 15，最大 20" },
        },
        required: ["query"],
      },
    },
    {
      name: "feishu_doc_fetch",
      description: "读取一篇飞书文档的内容（传文档 URL 或 token）",
      inputSchema: {
        type: "object",
        properties: {
          doc: { type: "string", description: "文档 URL 或 token" },
        },
        required: ["doc"],
      },
    },
    {
      name: "feishu_doc_create",
      description: "新建一篇飞书文档（Markdown 内容）",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "文档标题" },
          markdown: { type: "string", description: "Markdown 内容" },
          folder_token: {
            type: "string",
            description: "目标文件夹 token（可选）",
          },
        },
        required: ["title"],
      },
    },
    {
      name: "feishu_doc_update",
      description: "更新一篇飞书文档内容",
      inputSchema: {
        type: "object",
        properties: {
          doc: { type: "string", description: "文档 URL 或 token" },
          markdown: { type: "string", description: "新的 Markdown 内容" },
          mode: {
            type: "string",
            description:
              "更新模式：append | overwrite | replace_all | insert_before | insert_after（默认 append）",
          },
          new_title: { type: "string", description: "同时更新标题（可选）" },
        },
        required: ["doc", "markdown"],
      },
    },
    {
      name: "feishu_drive_search",
      description:
        "在云盘中搜索文件（doc/sheet/bitable/file 等），支持类型筛选",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "搜索关键词（可空，纯按筛选浏览）" },
          doc_types: {
            type: "string",
            description:
              "类型逗号分隔：doc,sheet,bitable,mindnote,file,wiki,docx,folder,slides",
          },
          mine: { type: "boolean", description: "仅我拥有的文档" },
        },
      },
    },
    {
      name: "feishu_wiki_node_list",
      description: "列出某个 Wiki 空间或父节点下的节点",
      inputSchema: {
        type: "object",
        properties: {
          space_id: {
            type: "string",
            description: "Wiki 空间 ID（个人库用 my_library）",
          },
          parent_node_token: {
            type: "string",
            description: "父节点 token（可选，省略则列根节点）",
          },
        },
        required: ["space_id"],
      },
    },
    {
      name: "feishu_wiki_node_get",
      description: "读取一个 Wiki 节点详情（支持传 Lark URL / node_token / obj_token）",
      inputSchema: {
        type: "object",
        properties: {
          node_token: {
            type: "string",
            description: "wiki node_token / obj_token / Lark URL",
          },
        },
        required: ["node_token"],
      },
    },
    {
      name: "feishu_base_table_list",
      description: "列出某个多维表格（Bitable/Base）下的所有数据表",
      inputSchema: {
        type: "object",
        properties: {
          base_token: { type: "string", description: "多维表格 app_token / URL" },
        },
        required: ["base_token"],
      },
    },
    {
      name: "feishu_base_field_list",
      description: "列出多维表格某个数据表的字段（列）",
      inputSchema: {
        type: "object",
        properties: {
          base_token: { type: "string", description: "多维表格 app_token / URL" },
          table_id: { type: "string", description: "数据表 ID（tbl_xxx）或表名" },
        },
        required: ["base_token", "table_id"],
      },
    },
    {
      name: "feishu_base_record_list",
      description: "列出多维表格某个数据表的记录（行），支持筛选/排序",
      inputSchema: {
        type: "object",
        properties: {
          base_token: { type: "string", description: "多维表格 app_token / URL" },
          table_id: { type: "string", description: "数据表 ID 或表名" },
          limit: { type: "number", description: "返回条数 1-200，默认 100" },
          filter_json: {
            type: "string",
            description: "筛选条件 JSON（与视图 filter 同结构，可选）",
          },
          sort_json: {
            type: "string",
            description: '排序 JSON，如 [{"field":"Updated","desc":true}]（可选）',
          },
        },
        required: ["base_token", "table_id"],
      },
    },
    {
      name: "feishu_base_record_search",
      description: "在多维表格数据表中检索记录",
      inputSchema: {
        type: "object",
        properties: {
          base_token: { type: "string", description: "多维表格 app_token / URL" },
          table_id: { type: "string", description: "数据表 ID 或表名" },
          limit: { type: "number", description: "返回条数 1-200，默认 10" },
        },
        required: ["base_token", "table_id"],
      },
    },
    {
      name: "feishu_base_record_upsert",
      description:
        "在多维表格数据表中创建或更新一条记录（给 record_id 则更新，否则创建）",
      inputSchema: {
        type: "object",
        properties: {
          base_token: { type: "string", description: "多维表格 app_token / URL" },
          table_id: { type: "string", description: "数据表 ID 或表名" },
          fields_json: {
            type: "string",
            description:
              '字段值 JSON，如 {"Name":"Alice","Status":"Todo"}（不要包 fields）',
          },
          record_id: {
            type: "string",
            description: "记录 ID（传则更新该记录，不传则新建）",
          },
        },
        required: ["base_token", "table_id", "fields_json"],
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
        if (start_time) cmd.push("--start", start_time);
        if (end_time) cmd.push("--end", end_time);
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
        if (start_time) cmd.push("--start", start_time);
        if (end_time) cmd.push("--end", end_time);
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

      // ---- Docs / Wiki / Drive ----
      case "feishu_search_docs": {
        const { query, count } = args;
        const cmd = ["docs", "+search", "--as", "user", "--query", query];
        if (count) cmd.push("--page-size", String(count));
        return await run(cmd);
      }
      case "feishu_doc_fetch": {
        const { doc } = args;
        return await run(["docs", "+fetch", "--as", "user", "--doc", doc]);
      }
      case "feishu_doc_create": {
        const { title, markdown, folder_token } = args;
        const cmd = ["docs", "+create", "--as", "user", "--title", title];
        if (markdown) cmd.push("--markdown", markdown);
        if (folder_token) cmd.push("--folder-token", folder_token);
        return await run(cmd);
      }
      case "feishu_doc_update": {
        const { doc, markdown, mode, new_title } = args;
        const cmd = [
          "docs",
          "+update",
          "--as",
          "user",
          "--doc",
          doc,
          "--markdown",
          markdown,
          "--mode",
          mode || "append",
        ];
        if (new_title) cmd.push("--new-title", new_title);
        return await run(cmd);
      }
      case "feishu_drive_search": {
        const { query, doc_types, mine } = args;
        const cmd = ["drive", "+search", "--as", "user"];
        if (query) cmd.push("--query", query);
        if (doc_types) cmd.push("--doc-types", doc_types);
        if (mine === true) cmd.push("--mine");
        return await run(cmd);
      }
      case "feishu_wiki_node_list": {
        const { space_id, parent_node_token } = args;
        const cmd = [
          "wiki",
          "+node-list",
          "--as",
          "user",
          "--space-id",
          space_id,
        ];
        if (parent_node_token)
          cmd.push("--parent-node-token", parent_node_token);
        return await run(cmd);
      }
      case "feishu_wiki_node_get": {
        const { node_token } = args;
        return await run([
          "wiki",
          "+node-get",
          "--as",
          "user",
          "--node-token",
          node_token,
        ]);
      }

      // ---- Bitable / Base ----
      case "feishu_base_table_list": {
        const { base_token } = args;
        return await run([
          "base",
          "+table-list",
          "--as",
          "user",
          "--base-token",
          base_token,
        ]);
      }
      case "feishu_base_field_list": {
        const { base_token, table_id } = args;
        return await run([
          "base",
          "+field-list",
          "--as",
          "user",
          "--base-token",
          base_token,
          "--table-id",
          table_id,
        ]);
      }
      case "feishu_base_record_list": {
        const { base_token, table_id, limit, filter_json, sort_json } = args;
        const cmd = [
          "base",
          "+record-list",
          "--as",
          "user",
          "--base-token",
          base_token,
          "--table-id",
          table_id,
        ];
        if (limit) cmd.push("--limit", String(limit));
        if (filter_json) cmd.push("--filter-json", filter_json);
        if (sort_json) cmd.push("--sort-json", sort_json);
        return await run(cmd);
      }
      case "feishu_base_record_search": {
        const { base_token, table_id, limit } = args;
        const cmd = [
          "base",
          "+record-search",
          "--as",
          "user",
          "--base-token",
          base_token,
          "--table-id",
          table_id,
        ];
        if (limit) cmd.push("--limit", String(limit));
        return await run(cmd);
      }
      case "feishu_base_record_upsert": {
        const { base_token, table_id, fields_json, record_id } = args;
        const cmd = [
          "base",
          "+record-upsert",
          "--as",
          "user",
          "--base-token",
          base_token,
          "--table-id",
          table_id,
          "--json",
          fields_json,
          "--format",
          "json",
        ];
        if (record_id) cmd.push("--record-id", record_id);
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
