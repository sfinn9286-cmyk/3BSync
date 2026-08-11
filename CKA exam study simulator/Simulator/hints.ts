import type { Question } from "./lib";

export type Hint = { label: string; lines: string[]; note?: string };

const REDACT = "▁▁▁";

const KNOWN_CMDS = new Set([
  "kubectl",
  "kubeadm",
  "crictl",
  "etcdctl",
  "systemctl",
  "journalctl",
  "openssl",
  "curl",
  "ssh",
  "cat",
  "grep",
  "sudo",
  "mv",
  "cp",
  "rm",
  "ls",
  "vi",
  "nano",
  "echo",
  "chmod",
  "swapoff",
  "mount",
  "nslookup",
  "dig",
  "wget",
]);

function tokenize(line: string): string[] {
  return line.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
}

function isCommandLine(line: string): boolean {
  const first = tokenize(line)[0];
  if (!first) return false;
  return KNOWN_CMDS.has(first.replace(/^\$\s*/, ""));
}

const VALUE_SHOWN = new Set(["-o", "--output", "--dry-run", "--type", "--restart"]);

function redactFlag(token: string): string {
  const eq = token.indexOf("=");
  if (eq === -1) return token;
  const name = token.slice(0, eq);
  return VALUE_SHOWN.has(name) ? token : `${name}=${REDACT}`;
}

function skeleton(line: string): string {
  const tokens = tokenize(line);
  const out: string[] = [];
  let bare = 0;
  let leading = true;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.startsWith("-")) {
      leading = false;
      out.push(redactFlag(token));
      const next = tokens[i + 1];
      if (!token.includes("=") && next && !next.startsWith("-")) {
        out.push(VALUE_SHOWN.has(token) ? next : REDACT);
        i += 1;
      }
      continue;
    }
    if (token === "|" || token === "&&") {
      out.push(token);
      bare = 0;
      leading = true;
      continue;
    }
    if (token === ">" || token === ">>" || token === "<") {
      out.push(token, REDACT);
      if (tokens[i + 1] && !tokens[i + 1].startsWith("-")) i += 1;
      continue;
    }
    if (leading && KNOWN_CMDS.has(token)) {
      out.push(token);
      if (token === "ssh" && tokens[i + 1]) {
        out.push(tokens[i + 1]);
        i += 1;
      }
      continue;
    }
    leading = false;
    bare += 1;
    out.push(bare <= 2 ? token : REDACT);
  }
  return out.join(" ");
}

function splitAnswer(answer: string) {
  const lines = answer
    .split("\n")
    .map((l) => l.replace(/(^|\s)#.*$/, "").trim())
    .filter(Boolean);
  const commands = lines.filter(isCommandLine);
  const yaml = lines.filter((l) => !isCommandLine(l) && /^[\w.-]+:/.test(l));
  return { commands, yaml };
}

function flagsIn(commands: string[]): string[] {
  const flags = new Set<string>();
  for (const line of commands) {
    for (const token of tokenize(line)) {
      if (!token.startsWith("-")) continue;
      flags.add(token.split("=")[0]);
    }
  }
  return [...flags];
}

function yamlFields(yaml: string[]): string[] {
  const fields = new Set<string>();
  for (const line of yaml) {
    const key = line.match(/^([\w.-]+):/)?.[1];
    if (key) fields.add(key);
  }
  return [...fields];
}

function helpPointers(commands: string[]): string[] {
  const out = new Set<string>();
  for (const line of commands) {
    const tokens = tokenize(line);
    const bare: string[] = [];
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token.startsWith("-")) {
        const next = tokens[i + 1];
        if (!token.includes("=") && next && !next.startsWith("-")) i += 1;
        continue;
      }
      bare.push(token);
    }
    const [cmd, verb, resource] = bare;
    if (!cmd) continue;
    if (cmd === "kubectl" && verb) {
      out.add(`kubectl ${verb} --help`);
      if (resource && !resource.includes("/") && /^[a-z]+$/.test(resource)) {
        out.add(`kubectl explain ${resource}`);
      }
    } else if (verb) {
      out.add(`${cmd} ${verb} --help`);
    }
  }
  return [...out].slice(0, 4);
}

export function deriveHints(question: Question): Hint[] {
  const answer = question.answer ?? "";
  const { commands, yaml } = splitAnswer(answer);
  const hints: Hint[] = [];

  const shapes = commands.length > 0 ? commands.map(skeleton) : [];
  if (shapes.length > 0) {
    hints.push({
      label: `command shape — ${shapes.length} ${shapes.length === 1 ? "command" : "commands"}`,
      lines: shapes,
      note: `Names, namespaces and values are blanked out as ${REDACT}.`,
    });
  } else if (yaml.length > 0) {
    hints.push({
      label: "this one is solved with a manifest",
      lines: yamlFields(yaml).map((f) => `${f}: ${REDACT}`),
      note: "Top-level fields of the object you need to write.",
    });
  }

  const flags = flagsIn(commands);
  const fields = yamlFields(yaml);
  const keyLines = [
    ...(flags.length > 0 ? [`flags: ${flags.join("  ")}`] : []),
    ...(fields.length > 0 ? [`fields: ${fields.join("  ")}`] : []),
  ];
  if (keyLines.length > 0) {
    hints.push({
      label: "the flags and fields that matter",
      lines: keyLines,
      note: "Every one of these appears in the model answer.",
    });
  }

  const pointers = helpPointers(commands);
  const lookupLines = [
    ...pointers,
    ...(question.verify ? [`verify: ${question.verify}`] : []),
  ];
  hints.push({
    label: "where to look it up",
    lines: lookupLines.length > 0 ? lookupLines : ["kubectl --help"],
    note: `On the real exam you may open kubernetes.io — this task was written from ${question.doc.replace(/^https?:\/\//, "")}.`,
  });

  return hints;
}
