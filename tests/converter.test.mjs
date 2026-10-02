import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const windows = process.platform === "win32";
const converter = path.join(root, "bin", windows ? "mdh.cmd" : "mdh");

function run(args, cwd, env = process.env) {
  const options = { cwd, env, encoding: "utf8" };
  if (windows) {
    const command = `"${[converter, ...args].map((arg) => `"${arg}"`).join(" ")}"`;
    return spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", command], {
      ...options, windowsVerbatimArguments: true,
    });
  }
  return spawnSync(process.execPath, [converter, ...args], options);
}

function fixture(t, markdown = "# はじめに\r\n\r\n```sh\r\nprintf test\r\n```\r\n\r\n![画像](画像.svg)\r\n") {
  const dir = mkdtempSync(path.join(tmpdir(), "md-to-html-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const docDir = path.join(dir, "日本語 documents & (test)!");
  mkdirSync(docDir);
  const input = path.join(docDir, "手順書 sample.v1.md");
  const output = path.join(docDir, "手順書 sample.v1.html");
  writeFileSync(path.join(docDir, "画像.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="blue"/></svg>');
  writeFileSync(input, markdown);
  return { dir, input, output };
}

function succeeds(result) {
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

function verifyDefaultHTML(output) {
  const html = readFileSync(output, "utf8");
  assert.match(html, /<html[^>]*lang="ja"/);
  assert.match(html, /<nav id="(?:mdh-toc|TOC)"/);
  assert.match(html, /<style\b/);
  assert.match(html, /<script\b/);
  assert.match(html, /class="header-section-number">1<\/span>/);
  assert.match(html, /class="toc-section-number">1<\/span>/);
  // Pandoc のバージョンにより SVG は data URI またはインライン SVG になる。
  assert.match(html, /(?:data:image\/svg\+xml|<svg\b)/);
  assert.doesNotMatch(html, /<link[^>]+stylesheet|<script[^>]+src=/);
  assert.ok(!html.includes("\r"), "HTML must use LF line endings");
}

test("help aliases succeed and invalid arguments exit with code 2", (t) => {
  const { dir, input } = fixture(t);
  for (const option of ["--help", "-h"]) {
    const result = run([option], dir);
    succeeds(result);
    assert.match(result.stdout, /Usage: mdh/);
    assert.match(result.stdout, /--no-number-sections/);
    assert.match(result.stdout, /既定は章番号付き/);
  }
  for (const args of [[], [input, input], ["--unknown"], [input, "-o"]]) assert.equal(run(args, dir).status, 2);
});

test("version and doctor run through the launcher", (t) => {
  const { dir } = fixture(t);
  const version = run(["--version"], dir), doctor = run(["--doctor"], dir);
  succeeds(version); succeeds(doctor);
  assert.equal(version.stdout.trim(), JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version);
  for (const label of ["Node", "Pandoc", "Assets"]) assert.match(doctor.stdout, new RegExp(`^${label}: OK`, "m"));
});

test("caller-relative input/output embed defaults and images without changing the input", (t) => {
  const { dir, input, output } = fixture(t);
  const source = readFileSync(input, "utf8"), relativeInput = path.relative(dir, input);
  succeeds(run([relativeInput], dir));
  verifyDefaultHTML(output);
  succeeds(run([relativeInput, "-o", "出力 HTML/別の手順書.html"], dir));
  verifyDefaultHTML(path.join(dir, "出力 HTML/別の手順書.html"));
  assert.equal(readFileSync(input, "utf8"), source);
});

test("section numbering can be disabled through the launcher and the last explicit switch wins", (t) => {
  const { dir, input, output } = fixture(t);
  const source = readFileSync(input, "utf8");
  for (const [options, numbered] of [
    [["--no-number-sections"], false],
    [["--number-sections"], true],
    [["--number-sections", "--no-number-sections"], false],
    [["--no-number-sections", "--number-sections"], true],
  ]) {
    succeeds(run([path.relative(dir, input), ...options], dir));
    const html = readFileSync(output, "utf8");
    assert.match(html, /<nav id="(?:mdh-toc|TOC)"/);
    assert.match(html, /href="#はじめに"/);
    for (const kind of ["header", "toc"]) {
      const pattern = new RegExp(`class="${kind}-section-number">1<\\/span>`);
      if (numbered) assert.match(html, pattern);
      else assert.doesNotMatch(html, new RegExp(`class="${kind}-section-number"`));
    }
    assert.equal(readFileSync(input, "utf8"), source);
  }
});

test("caller-relative custom assets keep unspecified defaults, including without headings", (t) => {
  const { dir, input, output } = fixture(t, "見出しのない文書です。\n");
  writeFileSync(path.join(dir, "custom style.css"), "body { --custom-style-marker: 123; }");
  writeFileSync(path.join(dir, "custom body.html"), '<aside id="custom-after-body">追加内容</aside>');
  const css = ["--css", "custom style.css"], afterBody = ["--after-body", "custom body.html"];
  for (const args of [css, afterBody, [...css, ...afterBody]]) {
    succeeds(run([path.relative(dir, input), ...args], dir));
    const html = readFileSync(output, "utf8");
    assert.match(html, /見出しのない文書です。/);
    assert.doesNotMatch(html, /<nav\b/);
    assert.match(html, args.includes("--css") ? /--custom-style-marker: 123/ : /<style\b/);
    assert.match(html, args.includes("--after-body") ? /<aside id="custom-after-body">追加内容<\/aside>/ : /<script\b/);
  }
});

test("missing custom assets exit with code 1 and preserve existing HTML", (t) => {
  const { dir, input, output } = fixture(t);
  writeFileSync(output, "existing HTML");
  for (const option of ["--css", "--after-body"]) {
    assert.equal(run([input, option, "missing asset"], dir).status, 1);
    assert.equal(readFileSync(output, "utf8"), "existing HTML");
  }
});

test("missing, directory and HTML inputs fail without overwriting HTML", (t) => {
  const { dir, output } = fixture(t);
  writeFileSync(output, "existing HTML");
  for (const input of ["missing.md", dir, output]) assert.equal(run([input], dir).status, 1);
  assert.equal(readFileSync(output, "utf8"), "existing HTML");
});

test("pinned Pandoc container embeds the same assets", {
  skip: windows || !process.env.TEST_CONTAINER_RUNTIME,
}, (t) => {
  const { dir, input, output } = fixture(t);
  succeeds(run(["--container", input], dir, {
    ...process.env, CONTAINER_RUNTIME: process.env.TEST_CONTAINER_RUNTIME,
  }));
  verifyDefaultHTML(output);
});