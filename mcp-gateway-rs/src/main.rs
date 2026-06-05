use anyhow::{anyhow, Context, Result};
use reqwest::Client;
use serde_json::{json, Map, Value};
use std::env;
use tokio::io::{self, AsyncBufReadExt, AsyncWriteExt, BufReader};

const PROTOCOL_VERSION: &str = "2025-06-18";

#[tokio::main]
async fn main() -> Result<()> {
    let bridge_url = env::var("XUEMATE_RENDERER_BRIDGE_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:8788".to_string())
        .trim_end_matches('/')
        .to_string();
    let gateway = Gateway {
        bridge_url,
        client: Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .context("failed to build HTTP client")?,
    };

    eprintln!(
        "[xuemate-mcp-gateway] stdio server ready, bridge={}",
        gateway.bridge_url
    );

    let stdin = BufReader::new(io::stdin());
    let mut lines = stdin.lines();
    let mut stdout = io::stdout();

    while let Some(line) = lines.next_line().await? {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let request: Value = match serde_json::from_str(line) {
            Ok(value) => value,
            Err(error) => {
                write_response(
                    &mut stdout,
                    json!({
                        "jsonrpc": "2.0",
                        "id": Value::Null,
                        "error": { "code": -32700, "message": format!("Parse error: {error}") }
                    }),
                )
                .await?;
                continue;
            }
        };

        let id = request.get("id").cloned();
        let Some(id_value) = id else {
            // MCP notifications, e.g. notifications/initialized.
            continue;
        };

        let method = request
            .get("method")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let params = request.get("params").cloned().unwrap_or_else(|| json!({}));

        let payload = match gateway.handle(method, params).await {
            Ok(result) => json!({ "jsonrpc": "2.0", "id": id_value, "result": result }),
            Err(error) => json!({
                "jsonrpc": "2.0",
                "id": id_value,
                "error": { "code": -32603, "message": error.to_string() }
            }),
        };
        write_response(&mut stdout, payload).await?;
    }

    Ok(())
}

async fn write_response(stdout: &mut io::Stdout, value: Value) -> Result<()> {
    stdout.write_all(serde_json::to_string(&value)?.as_bytes()).await?;
    stdout.write_all(b"\n").await?;
    stdout.flush().await?;
    Ok(())
}

struct Gateway {
    bridge_url: String,
    client: Client,
}

impl Gateway {
    async fn handle(&self, method: &str, params: Value) -> Result<Value> {
        match method {
            "initialize" => Ok(json!({
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {
                    "tools": { "listChanged": false },
                    "resources": { "subscribe": false, "listChanged": false }
                },
                "serverInfo": {
                    "name": "xuemate-mcp-gateway",
                    "version": env!("CARGO_PKG_VERSION")
                }
            })),
            "ping" => Ok(json!({})),
            "tools/list" => Ok(json!({ "tools": tools() })),
            "tools/call" => self.call_tool(params).await,
            "resources/list" => Ok(json!({ "resources": resources() })),
            "resources/read" => self.read_resource(params).await,
            _ => Err(anyhow!("unsupported MCP method: {method}")),
        }
    }

    async fn call_tool(&self, params: Value) -> Result<Value> {
        let name = params
            .get("name")
            .and_then(Value::as_str)
            .ok_or_else(|| anyhow!("tools/call missing params.name"))?;
        let args = params
            .get("arguments")
            .cloned()
            .unwrap_or_else(|| json!({}));

        let value = match name {
            "xuemate.bridge.health" => self.get("/health").await?,
            "xuemate.rag.collections" => self.get("/api/rag/collections").await?,
            "xuemate.rag.documents" => {
                let path = with_collection("/api/rag/documents", &args);
                self.get(&path).await?
            }
            "xuemate.rag.stats" => {
                let path = with_collection("/api/rag/stats", &args);
                self.get(&path).await?
            }
            "xuemate.learningGraph.get" => {
                let path = with_collection("/api/rag/learningGraph", &args);
                self.get(&path).await?
            }
            "xuemate.rag.retrieve" => self.post("/api/rag/retrieve", args).await?,
            "xuemate.memory.get" => self.get("/api/memory?includeSystemPrompt=1").await?,
            "xuemate.quickSearch.run" => self.post("/api/quick-search/run", args).await?,
            _ => return Err(anyhow!("unknown tool: {name}")),
        };

        Ok(json!({
            "content": [{
                "type": "text",
                "text": serde_json::to_string_pretty(&value)?
            }],
            "isError": false
        }))
    }

    async fn read_resource(&self, params: Value) -> Result<Value> {
        let uri = params
            .get("uri")
            .and_then(Value::as_str)
            .ok_or_else(|| anyhow!("resources/read missing params.uri"))?;

        let value = match uri {
            "xuemate://bridge/health" => self.get("/health").await?,
            "xuemate://rag/collections" => self.get("/api/rag/collections").await?,
            "xuemate://memory/profile" => self.get("/api/memory?includeSystemPrompt=1").await?,
            uri if uri.starts_with("xuemate://learning-graph/") => {
                let collection = uri.trim_start_matches("xuemate://learning-graph/");
                self.get(&format!(
                    "/api/rag/learningGraph?collectionId={}",
                    url_encode(collection)
                ))
                .await?
            }
            uri if uri.starts_with("xuemate://memory/archive/") => {
                let module = uri.trim_start_matches("xuemate://memory/archive/");
                self.get(&format!("/api/memory/archive?module={}", url_encode(module)))
                    .await?
            }
            _ => return Err(anyhow!("unknown resource uri: {uri}")),
        };

        Ok(json!({
            "contents": [{
                "uri": uri,
                "mimeType": "application/json",
                "text": serde_json::to_string_pretty(&value)?
            }]
        }))
    }

    async fn get(&self, path: &str) -> Result<Value> {
        let url = format!("{}{}", self.bridge_url, path);
        let response = self.client.get(url).send().await?;
        parse_response(response).await
    }

    async fn post(&self, path: &str, body: Value) -> Result<Value> {
        let url = format!("{}{}", self.bridge_url, path);
        let response = self.client.post(url).json(&body).send().await?;
        parse_response(response).await
    }
}

async fn parse_response(response: reqwest::Response) -> Result<Value> {
    let status = response.status();
    let text = response.text().await?;
    if !status.is_success() {
        return Err(anyhow!("bridge HTTP {status}: {text}"));
    }
    serde_json::from_str(&text).with_context(|| format!("bridge returned non-JSON: {text}"))
}

fn with_collection(path: &str, args: &Value) -> String {
    let collection = args
        .get("collectionId")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .unwrap_or("all");
    format!("{path}?collectionId={}", url_encode(collection))
}

fn url_encode(value: &str) -> String {
    let mut out = String::new();
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char)
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

fn schema(properties: Map<String, Value>, required: Vec<&str>) -> Value {
    json!({
        "type": "object",
        "properties": properties,
        "required": required
    })
}

fn tools() -> Value {
    json!([
        {
            "name": "xuemate.bridge.health",
            "description": "检查 XueMate 本地 Electron bridge 是否在线。",
            "inputSchema": schema(Map::new(), vec![])
        },
        {
            "name": "xuemate.rag.collections",
            "description": "列出 XueMate 知识库资料夹。",
            "inputSchema": schema(Map::new(), vec![])
        },
        {
            "name": "xuemate.rag.documents",
            "description": "列出指定资料夹中的文档。",
            "inputSchema": schema(map([("collectionId", json!({ "type": "string", "default": "default" }))]), vec![])
        },
        {
            "name": "xuemate.rag.stats",
            "description": "读取指定资料夹的 RAG 文档/片段统计。",
            "inputSchema": schema(map([("collectionId", json!({ "type": "string", "default": "all" }))]), vec![])
        },
        {
            "name": "xuemate.rag.retrieve",
            "description": "从 XueMate 本地知识库检索真实课程资料并可返回引用上下文。",
            "inputSchema": schema(map([
                ("query", json!({ "type": "string" })),
                ("collectionId", json!({ "type": "string", "default": "all" })),
                ("topK", json!({ "type": "integer", "default": 5, "minimum": 1, "maximum": 20 })),
                ("candidateK", json!({ "type": "integer", "default": 48, "minimum": 5, "maximum": 200 })),
                ("minScore", json!({ "type": "number", "default": 0.18, "minimum": 0, "maximum": 1 })),
                ("useMmr", json!({ "type": "boolean", "default": true })),
                ("includeContext", json!({ "type": "boolean", "default": true })),
                ("maxChars", json!({ "type": "integer", "default": 3600, "minimum": 500, "maximum": 12000 }))
            ]), vec!["query"])
        },
        {
            "name": "xuemate.learningGraph.get",
            "description": "生成资料、知识点、记忆和复习任务融合后的学习图谱。",
            "inputSchema": schema(map([("collectionId", json!({ "type": "string", "default": "all" }))]), vec![])
        },
        {
            "name": "xuemate.memory.get",
            "description": "读取学生长期记忆、学习画像、薄弱点和系统提示词。",
            "inputSchema": schema(Map::new(), vec![])
        },
        {
            "name": "xuemate.quickSearch.run",
            "description": "搜索并整理适合学习使用的网页资源。",
            "inputSchema": schema(map([("query", json!({ "type": "string" }))]), vec!["query"])
        }
    ])
}

fn resources() -> Value {
    json!([
        {
            "uri": "xuemate://bridge/health",
            "name": "XueMate bridge health",
            "mimeType": "application/json"
        },
        {
            "uri": "xuemate://rag/collections",
            "name": "XueMate RAG collections",
            "mimeType": "application/json"
        },
        {
            "uri": "xuemate://learning-graph/all",
            "name": "XueMate full learning graph",
            "mimeType": "application/json"
        },
        {
            "uri": "xuemate://memory/profile",
            "name": "XueMate memory profile",
            "mimeType": "application/json"
        },
        {
            "uri": "xuemate://memory/archive/topics",
            "name": "XueMate memory topics archive",
            "mimeType": "application/json"
        }
    ])
}

fn map(items: impl IntoIterator<Item = (&'static str, Value)>) -> Map<String, Value> {
    let mut out = Map::new();
    for (key, value) in items {
        out.insert(key.to_string(), value);
    }
    out
}
