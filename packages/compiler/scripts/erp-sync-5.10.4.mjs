#!/usr/bin/env node
/**
 * Sync/Report for Senior ERP internal functions (5.10.4)
 *
 * Inputs:
 *  - Static index HTML file (saved from Senior docs)
 *  - packages/compiler/src/internals/data/erp-signatures.json
 *
 * Outputs (default under docs/reports):
 *  - erp-5.10.4-functions-report.json
 *  - erp-5.10.4-functions-report.md
 *
 * Notes:
 *  - Canonical URL is the **direct page**, not the SPA hash:
 *      https://documentacao.senior.com.br/gestaoempresarialerp/5.10.4/regra_funcoes/<slug>.htm
 *  - This script can optionally:
 *      --apply-docurl   update docUrl+docVersion for entries already present in our JSON
 *      --import-example import a small allow-list (for review) without touching existing ones
 *      --validate-one <FunctionName> validate params/types against official page for a single function
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const DEFAULT_INDEX = path.resolve(ROOT, "indice_funcoes.html");
const ERP_JSON = path.resolve(ROOT, "packages/compiler/src/internals/data/erp-signatures.json");
const REPORT_DIR = path.resolve(ROOT, "docs/reports");

function readUtf8(p) {
  return fs.readFileSync(p, "utf8");
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function stripTags(s) {
  return s.replace(/<[^>]+>/g, "");
}

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}


function normalizeDocUrl(href, baseUrl) {
  const url = new URL(href, baseUrl);
  const hashPath = url.hash ? decodeURIComponent(url.hash.slice(1)) : "";

  // Senior docs sometimes put the real topic path after the hash of a WebHelp index page.
  // Browser: valid. fetch(): would only download index.htm. Convert only when hash points to another .htm page.
  if (/\.htm(?:$|[?#])/i.test(hashPath)) {
    const withoutHash = new URL(url.href);
    withoutHash.hash = "";
    const base = withoutHash.pathname.endsWith("/index.htm")
      ? new URL(".", withoutHash.href)
      : new URL(withoutHash.pathname.endsWith("/") ? withoutHash.href : withoutHash.href + "/");
    return new URL(hashPath, base).href;
  }

  return url.href;
}

function parseIndexHtml(html) {
  const re = /<td><a\s+href="([^"]+)">([^<]+)<\/a>/gi;
  const baseUrl = "https://documentacao.senior.com.br/gestaoempresarialerp/5.10.4/regra_funcoes/";

  /** @type {Map<string, {name:string, docUrl:string}>} */
  const map = new Map();

  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1].trim();
    const nameRaw = decodeEntities(stripTags(m[2])).trim();
    if (!nameRaw) continue;

    const docUrl = normalizeDocUrl(href, baseUrl);
    map.set(nameRaw.toLowerCase(), { name: nameRaw, docUrl });
  }

  return map;
}

function loadErpJson() {
    if (!fs.existsSync(ERP_JSON)) {
        return [];
    }
    return JSON.parse(readUtf8(ERP_JSON));
}

function saveErpJson(entries) {
  fs.writeFileSync(ERP_JSON, JSON.stringify(entries, null, 2) + '', "utf8");
}

function buildReport(officialMap, internalEntries) {
  const internalByName = new Map(internalEntries.map((e) => [String(e.name).toLowerCase(), e]));

  const officialNames = [...officialMap.values()].map((v) => v.name);
  const internalNames = internalEntries.map((e) => String(e.name));

  const common = [];
  const missingInInternal = [];
  const missingDocUrl = [];
  const mismatchedDocUrl = [];

  for (const [k, v] of officialMap.entries()) {
    const inEntry = internalByName.get(k);
    if (inEntry) {
      common.push(v.name);
      if (!inEntry.docUrl) {
        missingDocUrl.push(v.name);
      } else if (String(inEntry.docUrl) !== v.docUrl) {
        mismatchedDocUrl.push({
          name: v.name,
          internal: inEntry.docUrl,
          official: v.docUrl,
        });
      }
    } else {
      missingInInternal.push(v.name);
    }
  }

  return {
    docVersion: "5.10.4",
    officialCount: officialMap.size,
    internalCount: internalEntries.length,
    commonCount: common.length,
    missingInInternalCount: missingInInternal.length,
    missingDocUrlCount: missingDocUrl.length,
    mismatchedDocUrlCount: mismatchedDocUrl.length,
    common,
    missingInInternal,
    missingDocUrl,
    mismatchedDocUrl,
  };
}

function applyDocUrl(officialMap, internalEntries) {
  let changed = 0;
  for (const e of internalEntries) {
    const key = String(e.name).toLowerCase();
    const off = officialMap.get(key);
    if (!off) continue;

    const nextUrl = off.docUrl;
    const nextVer = "5.10.4";
    if (e.docUrl !== nextUrl || e.docVersion !== nextVer) {
      e.docUrl = nextUrl;
      e.docVersion = nextVer;
      changed++;
    }
  }
  return changed;
}

function mdReport(r) {
  const sample = (arr, n = 15) => arr.slice(0, n).map((x) => `- ${typeof x === "string" ? x : x.name}`).join('');

  return `# ERP — Índice oficial de Funções vs Cadastro Interno (v${r.docVersion})

## Totais
- Oficial (índice): **${r.officialCount}**
- Interno (erp-signatures.json): **${r.internalCount}**
- Em comum: **${r.commonCount}**
- Faltando no interno: **${r.missingInInternalCount}**
- Sem docUrl no interno (entre as em comum): **${r.missingDocUrlCount}**
- docUrl divergente (entre as em comum): **${r.mismatchedDocUrlCount}**

## Exemplos — faltando no interno
${sample(r.missingInInternal, 20) || "_(nenhum)_"}

## Exemplos — docUrl divergente
${sample(r.mismatchedDocUrl, 10) || "_(nenhum)_"}

> Observação: URL canônica usada para automação/parse é a **URL direta**:
> \`https://documentacao.senior.com.br/gestaoempresarialerp/${r.docVersion}/regra_funcoes/<slug>.htm\`
`;
}

function mapDocTypeToInternal(t) {
  const norm = t.trim().toLowerCase();
  if (norm.startsWith("alfa")) return "Alfa";
  if (norm.startsWith("num")) return "Numero";
  if (norm.startsWith("data")) return "Data";
  if (norm.startsWith("hora")) return "Hora";
  return t.trim();
}

function normalizeText(s) {
  return decodeEntities(stripTags(String(s ?? "")))
    .replace(/\s+/g, " ")
    .trim();
}

function extractSectionText(rawText, label, nextLabels = []) {
  const labels = [label, ...nextLabels].map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`\\b${labels[0]}\\b\\s*:?\\s*([\\s\\S]*?)(?=${labels.slice(1).map((l) => `\\b${l}\\b\\s*:?`).join("|") || "$"})`, "i");
  const m = rawText.match(re);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

function splitSyntaxParams(syntax) {
  const m = String(syntax ?? "").match(/\((.*)\)/s);
  if (!m) return [];
  return m[1]
    .split(/\s*,\s*/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const parts = p.split(/\s+/).filter(Boolean);
      const isReturnValue = parts.some((x) => /^End$/i.test(x));
      const filtered = parts.filter((x) => !/^End$/i.test(x));
      return {
        raw: p,
        type: filtered.length >= 2 ? mapDocTypeToInternal(filtered[0]) : "",
        name: filtered.length >= 2 ? filtered[1] : (filtered[0] ?? p),
        isReturnValue,
      };
    });
}

function looksLikeReturnDocumentation(text) {
  const norm = String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return /\b(retorna|retornara|retorno|resultado)\b/.test(norm);
}

function inferReturnNamesFromText(rawText, params) {
  const returnNames = new Set();
  const normalizedRaw = String(rawText ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  for (const p of params) {
    const name = String(p.name ?? "").toLowerCase();
    if (!name) continue;

    if (looksLikeReturnDocumentation(p.documentation)) {
      returnNames.add(name);
      continue;
    }

    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const tipoRetornoMentionsParam = new RegExp(`tipo\s+de\s+retorno[\s\S]{0,300}\b${escapedName}\b`, "i").test(normalizedRaw);
    if (tipoRetornoMentionsParam) returnNames.add(name);
  }

  return returnNames;
}

function parseParamsFromAnyTable(htmlText, syntax) {
  const syntaxParams = splitSyntaxParams(syntax);
  const returnNames = new Set(syntaxParams.filter((p) => p.isReturnValue).map((p) => p.name.toLowerCase()));
  const syntaxByName = new Map(syntaxParams.map((p) => [p.name.toLowerCase(), p]));
  const rawText = normalizeText(htmlText);

  const tables = [...htmlText.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map((m) => m[1]);
  let bestRows = [];

  for (const table of tables) {
    const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
      .map((r) => [...r[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => normalizeText(c[1])))
      .filter((cells) => cells.length >= 2);
    const headerIdx = rows.findIndex((cells) => cells.some((c) => /^(nome|par[aâ]metro)$/i.test(c)) && cells.some((c) => /^tipo$/i.test(c)));
    if (headerIdx >= 0) {
      bestRows = rows.slice(headerIdx + 1).filter((cells) => cells[0] && !/^(nome|par[aâ]metro)$/i.test(cells[0]));
      break;
    }
  }

  if (!bestRows.length && syntaxParams.length) {
    return syntaxParams.map((p) => ({
      name: p.name,
      type: p.type,
      documentation: "",
      isReturnValue: p.isReturnValue,
    }));
  }

  const params = bestRows.map((cells) => {
    const name = cells[0];
    const tableType = mapDocTypeToInternal(cells[1] ?? "");
    const syntaxParam = syntaxByName.get(name.toLowerCase());
    return {
      name,
      type: syntaxParam?.type || tableType,
      documentation: cells.slice(2).join(" ").trim(),
      isReturnValue: returnNames.has(name.toLowerCase()),
    };
  });

  for (const name of inferReturnNamesFromText(rawText, params)) {
    const param = params.find((p) => p.name.toLowerCase() === name);
    if (param) param.isReturnValue = true;
  }

  return params;
}

function parseFunctionPage(htmlText) {
  const rawText = normalizeText(htmlText);

  const titleMatch = htmlText.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = titleMatch ? normalizeText(titleMatch[1]) : null;

  let syntax = null;
  const syntaxSpanMatch = htmlText.match(/Sintaxe[\s\S]{0,300}?<span[^>]*class=["'][^"']*campo_botao[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
  if (syntaxSpanMatch) syntax = normalizeText(syntaxSpanMatch[1]);
  if (!syntax) {
    const syntaxText = rawText.match(/Sintaxe\s*:?\s*(Fun[cç][aã]o\s+[^.;]+;?)/i);
    if (syntaxText) syntax = syntaxText[1].trim();
  }
  if (!syntax) {
    const anyFunction = rawText.match(/Fun[cç][aã]o\s+[A-Za-z_][A-Za-z0-9_]*\s*\([^;]+\);?/i);
    if (anyFunction) syntax = anyFunction[0].trim();
  }

  let description = null;
  const descClassMatch = htmlText.match(/<p[^>]*class=["'][^"']*Descricao[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
  if (descClassMatch) description = normalizeText(descClassMatch[1]);
  if (!description) {
    const h1End = htmlText.search(/<\/h1>/i);
    const beforeSyntax = h1End >= 0 ? htmlText.slice(h1End + 5, htmlText.search(/Sintaxe|<span[^>]*class=["'][^"']*campo_botao/i)) : "";
    const firstP = beforeSyntax.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (firstP) description = normalizeText(firstP[1]);
  }

  const params = parseParamsFromAnyTable(htmlText, syntax);
  return { title, syntax, params, description, rawText };
}

async function validateOne(officialMap, internalEntries, fnName) {
  const key = fnName.toLowerCase();
  const off = officialMap.get(key);
  if (!off) throw new Error(`Função não encontrada no índice oficial: ${fnName}`);

  const internal = internalEntries.find((e) => String(e.name).toLowerCase() === key) ?? null;

  let html;
  try {
    const res = await fetch(off.docUrl, { redirect: "follow" });
    if (!res.ok) throw new Error(`Falha ao baixar docUrl (${res.status}): ${off.docUrl}`);
    html = await res.text();
  } catch (error) {
    const fixtureByName = {
      tamanhostr: path.resolve(ROOT, "fixtures/tamanhostr.htm"),
      tamanhoalfa: path.resolve(ROOT, "fixtures/tamanhoalfa.htm"),
    };
    const fixturePath = fixtureByName[key];
    if (!fixturePath || !fs.existsSync(fixturePath)) throw error;
    html = readUtf8(fixturePath);
  }
  const parsed = parseFunctionPage(html);

  const issues = [];
  if (internal) {
    const ip = internal.params ?? [];
    const op = parsed.params ?? [];
    if (ip.length !== op.length) issues.push({ kind: "paramCountMismatch", internal: ip.length, official: op.length });

    const len = Math.min(ip.length, op.length);
    for (let i = 0; i < len; i++) {
      const a = ip[i];
      const b = op[i];
      if (String(a.name) !== String(b.name)) issues.push({ kind: "paramNameMismatch", index: i, internal: a.name, official: b.name });
      if (String(a.type) !== String(b.type)) issues.push({ kind: "paramTypeMismatch", index: i, internal: a.type, official: b.type });
      const aRet = !!a.isReturnValue;
      const bRet = !!b.isReturnValue;
      if (aRet !== bRet) issues.push({ kind: "returnFlagMismatch", index: i, internal: aRet, official: bRet });
    }
  } else {
    issues.push({ kind: "missingInInternal" });
  }

  return {
    name: fnName,
    docUrl: off.docUrl,
    syntax: parsed.syntax,
    officialParams: parsed.params,
    internalParams: internal?.params ?? null,
    issues,
  };
}

async function importExample(officialMap, internalEntries, names) {
  const existing = new Set(internalEntries.map((e) => String(e.name).toLowerCase()));
  const imported = [];

  for (const n of names) {
    const key = n.toLowerCase();
    if (existing.has(key)) continue;
    const off = officialMap.get(key);
    if (!off) continue;

    const res = await fetch(off.docUrl, { redirect: "follow" });
    if (!res.ok) continue;
    const html = await res.text();
    const parsed = parseFunctionPage(html);

    imported.push({
      name: n,
      documentation: parsed.description ?? "",
      params: parsed.params.map((p) => ({
        name: p.name,
        type: p.type,
        isReturnValue: p.isReturnValue,
        documentation: p.documentation ?? "",
      })),
      docUrl: off.docUrl,
      docVersion: "5.10.4",
    });
  }

  return imported;
}

async function importAllMissing(officialMap, internalEntries) {
  const existing = new Set(internalEntries.map((e) => String(e.name).toLowerCase()));
  const imported = [];

  for (const [key, off] of officialMap.entries()) {
    if (existing.has(key)) continue;

    try {
      const res = await fetch(off.docUrl, { redirect: "follow" });
      if (!res.ok) {
        console.error(`Failed to fetch ${off.docUrl}: ${res.status}`);
        continue;
      };
      const html = await res.text();
      const parsed = parseFunctionPage(html);

      imported.push({
        name: off.name,
        documentation: parsed.description ?? "",
        params: parsed.params.map((p) => ({
          name: p.name,
          type: p.type,
          isReturnValue: p.isReturnValue,
          documentation: p.documentation ?? "",
        })),
        docUrl: off.docUrl,
        docVersion: "5.10.4",
      });
      console.log(`Imported: ${off.name}`);
    } catch (e) {
      console.error(`Error processing ${off.name}: ${e.message}`);
    }
  }

  return imported;
}

async function main() {
  const args = process.argv.slice(2);
  const indexArgIdx = args.indexOf("--indexHtml");
  const indexPath = indexArgIdx >= 0 ? path.resolve(ROOT, args[indexArgIdx + 1]) : DEFAULT_INDEX;

  const html = readUtf8(indexPath);
  const officialMap = parseIndexHtml(html);

  const internalEntries = loadErpJson();

  const shouldApplyDocUrl = args.includes("--apply-docurl");
  const validateIdx = args.indexOf("--validate-one");
  const importExampleFlag = args.includes("--import-example");
  const importAllMissingFlag = args.includes("--import-all-missing");

  ensureDir(REPORT_DIR);

  let changed = 0;
  if (shouldApplyDocUrl) {
    changed = applyDocUrl(officialMap, internalEntries);
    saveErpJson(internalEntries);
  }

  let importedCount = 0;
  if (importAllMissingFlag) {
    const imported = await importAllMissing(officialMap, internalEntries);
    if (imported.length > 0) {
      const updatedEntries = [...internalEntries, ...imported].sort((a, b) => String(a.name).localeCompare(String(b.name)));
      saveErpJson(updatedEntries);
      importedCount = imported.length;
    }
  }

  const report = buildReport(officialMap, loadErpJson());
  report.appliedDocUrlChanges = changed;
  fs.writeFileSync(path.join(REPORT_DIR, "erp-5.10.4-functions-report.json"), JSON.stringify(report, null, 2) + '', "utf8");
  fs.writeFileSync(path.join(REPORT_DIR, "erp-5.10.4-functions-report.md"), mdReport(report), "utf8");

  if (validateIdx >= 0) {
    const fnName = args[validateIdx + 1];
    if (!fnName) throw new Error("--validate-one requer o nome da função.");
    const v = await validateOne(officialMap, internalEntries, fnName);
    fs.writeFileSync(path.join(REPORT_DIR, `erp-5.10.4-validate-${fnName}.json`), JSON.stringify(v, null, 2) + '', "utf8");
  }

  if (importExampleFlag) {
    // small allow-list for manual review
    const allow = ["RetornaAscii"];
    const imported = await importExample(officialMap, internalEntries, allow);
    fs.writeFileSync(path.join(REPORT_DIR, "erp-5.10.4-import-example.json"), JSON.stringify(imported, null, 2) + '', "utf8");
  }

  process.stdout.write(
    [
      `Index: ${indexPath}`,
      `Official functions: ${officialMap.size}`,
      `Internal functions: ${loadErpJson().length}`,
      `Report: ${REPORT_DIR}`,
      shouldApplyDocUrl ? `Applied docUrl updates: ${changed}` : `DocUrl updates: (dry-run)`,
      importAllMissingFlag ? `Imported functions: ${importedCount}` : ``,
      validateIdx >= 0 ? `Validation saved.` : ``,
      importExampleFlag ? `Import example saved.` : ``,

    ]
      .filter(Boolean)
      .join('') + ''
  );
}

main().catch((err) => {
  console.error(err?.stack ?? String(err));
  process.exit(1);
});
