import { Cluster, kubectl, tokenize, STATIC_POD_PATH, type HostState, type Result } from "./cluster";

const NODE_HELP = `You are on a simulated node. Supported here:

  systemctl status|start|stop|restart|enable|disable|is-active|is-enabled <unit>
  systemctl daemon-reload
  journalctl -u <unit> [-n N] [--no-pager]
  crictl ps [-a] [--name X] | crictl pods | crictl logs <id>
  cat <file> | ls [dir] | rm <file> | mkdir -p <dir> | cp <a> <b> | mv <a> <b>
  cat > <file> <<EOF ... EOF        (this is how you edit files here)
  ETCDCTL_API=3 etcdctl snapshot save|status <file> [--endpoints --cacert --cert --key]
  swapoff -a | free -h | df -h | hostname | whoami | pwd | exit

kubectl also works from the node. Units are kubelet and containerd; the
control-plane static pod manifests live in /etc/kubernetes/manifests.`;

const WORKSTATION_HELP = `Simulated kubectl. Supported verbs:

  get, describe, create, apply -f, delete, run, expose, scale, set image,
  label, annotate, taint, cordon, uncordon, drain, rollout, patch, logs,
  exec, auth can-i, top, config, api-resources, cluster-info, version

Common flags: -n/--namespace, -A/--all-namespaces, -l/--selector, -o
(wide|yaml|json|name|jsonpath=...), --show-labels, --dry-run=client.

Manifests: end a line with <<EOF to open a heredoc, e.g.

  kubectl apply -f - <<EOF
  apiVersion: v1
  ...
  EOF

Node access: ssh <node> drops you onto that node, where systemctl,
journalctl, crictl, etcdctl and file editing work; 'exit' comes back.
Type 'help' on the node for its command list.`;

function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i <= 0 ? "/" : path.slice(0, i);
}

// Tokens are re-joined before being handed to kubectl, so anything the shell
// already unquoted has to be re-quoted or the second parse would split it.
function requote(arg: string): string {
  if (!/[\s"']/.test(arg)) return arg;
  return `'${arg.replace(/'/g, "")}'`;
}

function servicePretty(unit: string, svc: HostState["services"][string]): string {
  return [
    `● ${unit}.service - ${unit === "kubelet" ? "kubelet: The Kubernetes Node Agent" : unit}`,
    `     Loaded: loaded (/usr/lib/systemd/system/${unit}.service; ${svc.enabled ? "enabled" : "disabled"}; preset: enabled)`,
    `     Active: ${svc.active ? "active (running)" : "inactive (dead)"}`,
    ...(svc.log.length ? ["", ...svc.log.slice(-5).map((l) => `     ${l}`)] : []),
  ].join("\n");
}

function applyFilter(input: string, filter: string[]): Result {
  const [cmd, ...args] = filter;
  const lines = input.split("\n");
  if (cmd === "grep") {
    const invert = args.includes("-v");
    const ignoreCase = args.includes("-i");
    const after = Number(args.find((a) => a.startsWith("-A"))?.slice(2) ?? 0);
    const pattern = args.filter((a) => !a.startsWith("-"))[0] ?? "";
    const hit = (line: string) =>
      ignoreCase ? line.toLowerCase().includes(pattern.toLowerCase()) : line.includes(pattern);
    const kept: string[] = [];
    lines.forEach((line, i) => {
      if (hit(line) !== invert) {
        kept.push(line);
        for (let j = 1; j <= after; j++) if (lines[i + j] !== undefined) kept.push(lines[i + j]);
      }
    });
    return { out: kept.join("\n"), code: kept.length ? 0 : 1 };
  }
  if (cmd === "head") {
    const n = Number(args.find((a) => a.startsWith("-"))?.replace(/\D/g, "") ?? 10);
    return { out: lines.slice(0, n).join("\n"), code: 0 };
  }
  if (cmd === "tail") {
    const n = Number(args.find((a) => a.startsWith("-"))?.replace(/\D/g, "") ?? 10);
    return { out: lines.slice(-n).join("\n"), code: 0 };
  }
  if (cmd === "wc") {
    return { out: String(input ? lines.length : 0), code: 0 };
  }
  return { out: `${cmd}: not simulated in this lab`, code: 127 };
}

function splitPipeline(command: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let quote: string | null = null;
  for (const ch of command) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === "|") {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

export class Shell {
  cluster: Cluster;
  host: string | null = null;

  constructor(cluster: Cluster) {
    this.cluster = cluster;
  }

  get prompt(): string {
    return this.host ? `root@${this.host}:~#` : "$";
  }

  run(line: string): Result {
    const firstNewline = line.indexOf("\n");
    const command = firstNewline === -1 ? line : line.slice(0, firstNewline);
    const heredoc = firstNewline === -1 ? "" : line.slice(firstNewline + 1);
    const segments = splitPipeline(command);
    if (!segments.length) return { out: "", code: 0 };

    let result = this.runSingle(
      firstNewline === -1 ? segments[0] : `${segments[0]}\n${heredoc}`,
    );
    for (const filter of segments.slice(1)) {
      const filtered = applyFilter(result.out, tokenize(filter));
      result = { out: filtered.out, code: filtered.code };
    }
    return result;
  }

  private runSingle(line: string): Result {
    const firstNewline = line.indexOf("\n");
    const head = firstNewline === -1 ? line : line.slice(0, firstNewline);
    const body = firstNewline === -1 ? "" : line.slice(firstNewline + 1);
    let tokens = tokenize(head.replace(/<<-?'?[A-Za-z_][A-Za-z0-9_]*'?\s*$/, ""));
    if (!tokens.length) return { out: "", code: 0 };

    const env: Record<string, string> = {};
    while (tokens.length && /^[A-Z_][A-Z0-9_]*=/.test(tokens[0])) {
      const [k, ...v] = tokens[0].split("=");
      env[k] = v.join("=");
      tokens = tokens.slice(1);
    }
    if (tokens[0] === "sudo") tokens = tokens.slice(1);
    if (!tokens.length) return { out: "", code: 0 };

    const [bin, ...args] = tokens;

    if (bin === "help") return { out: this.host ? NODE_HELP : WORKSTATION_HELP, code: 0 };
    if (bin === "kubectl" || bin === "k") {
      const rebuilt = [bin, ...args.map(requote)].join(" ");
      return kubectl(this.cluster, firstNewline === -1 ? rebuilt : `${rebuilt}\n${body}`);
    }

    if (bin === "ssh") {
      const target = (args.find((a) => !a.startsWith("-")) ?? "").replace(/^[^@]+@/, "");
      if (!target) return { out: "usage: ssh <node>", code: 1 };
      if (!this.cluster.hosts[target]) {
        return { out: `ssh: Could not resolve hostname ${target}: Name or service not known`, code: 255 };
      }
      this.host = target;
      return {
        out: `Welcome to Ubuntu 24.04.2 LTS (GNU/Linux 6.8.0-generic x86_64)\nLast login: ${new Date().toUTCString()}`,
        code: 0,
      };
    }

    if (!this.host) {
      return {
        out: `${bin}: command not found. This is the exam workstation — run kubectl here, or 'ssh <node>' to work on a node.`,
        code: 127,
      };
    }

    const host = this.cluster.hosts[this.host];
    return this.runOnHost(host, bin, args, body, env);
  }

  private runOnHost(
    host: HostState,
    bin: string,
    args: string[],
    body: string,
    env: Record<string, string>,
  ): Result {
    const readFile = (path: string) => host.files[path];
    const writeFile = (path: string, content: string) => {
      host.files[path] = content;
      this.cluster.reconcile();
    };

    switch (bin) {
      case "exit":
      case "logout":
        this.host = null;
        return { out: "logout", code: 0 };
      case "hostname":
        return { out: host.name, code: 0 };
      case "whoami":
        return { out: "root", code: 0 };
      case "pwd":
        return { out: "/root", code: 0 };
      case "swapon":
        return { out: args.includes("-a") ? "" : "swapon: no swap devices configured", code: 0 };
      case "swapoff":
        host.swap = false;
        this.cluster.reconcile();
        return { out: "", code: 0 };
      case "free":
        return {
          out: `               total        used        free\nMem:            4.0Gi       1.2Gi       2.4Gi\nSwap:          ${host.swap ? " 2.0Gi       0.0Ki       2.0Gi" : "    0B          0B          0B"}`,
          code: 0,
        };
      case "df":
        return {
          out: "Filesystem      Size  Used Avail Use% Mounted on\n/dev/vda1        40G   14G   26G  35% /",
          code: 0,
        };
      case "systemctl": {
        const sub = args[0];
        if (sub === "daemon-reload") return { out: "", code: 0 };
        const units = args.slice(1).filter((a) => !a.startsWith("-")).map((u) => u.replace(/\.service$/, ""));
        const now = args.includes("--now");
        if (!units.length) return { out: "systemctl: unit name required in this lab", code: 1 };
        const lines: string[] = [];
        for (const unit of units) {
          const svc = host.services[unit];
          if (!svc) return { out: `Failed to ${sub} ${unit}.service: Unit ${unit}.service not found.`, code: 5 };
          switch (sub) {
            case "status":
              lines.push(servicePretty(unit, svc));
              break;
            case "start":
            case "restart":
              svc.active = true;
              svc.log.push(`${unit}: Started ${unit}.service.`);
              break;
            case "stop":
              svc.active = false;
              svc.log.push(`${unit}: Stopped ${unit}.service.`);
              break;
            case "enable":
              svc.enabled = true;
              if (now) svc.active = true;
              lines.push(`Created symlink /etc/systemd/system/multi-user.target.wants/${unit}.service → /usr/lib/systemd/system/${unit}.service.`);
              break;
            case "disable":
              svc.enabled = false;
              if (now) svc.active = false;
              lines.push(`Removed "/etc/systemd/system/multi-user.target.wants/${unit}.service".`);
              break;
            case "is-active":
              lines.push(svc.active ? "active" : "inactive");
              break;
            case "is-enabled":
              lines.push(svc.enabled ? "enabled" : "disabled");
              break;
            default:
              return { out: `systemctl ${sub}: not simulated in this lab`, code: 1 };
          }
        }
        this.cluster.reconcile();
        const failing = units.some((u) => !host.services[u].active);
        return { out: lines.join("\n\n"), code: sub === "is-active" || sub === "is-enabled" ? (failing && sub === "is-active" ? 3 : 0) : 0 };
      }
      case "journalctl": {
        const unitIdx = args.findIndex((a) => a === "-u" || a === "--unit");
        const unit = (unitIdx >= 0 ? args[unitIdx + 1] : "kubelet").replace(/\.service$/, "");
        const svc = host.services[unit];
        if (!svc) return { out: `-- No entries --`, code: 0 };
        const nIdx = args.findIndex((a) => a === "-n" || a === "--lines");
        const n = nIdx >= 0 ? Number(args[nIdx + 1]) : 25;
        const log = svc.log.length ? svc.log : [`${unit}: no entries recorded in this lab fixture`];
        return { out: log.slice(-n).map((l) => `${new Date().toISOString()} ${host.name} ${l}`).join("\n"), code: 0 };
      }
      case "crictl": {
        const sub = args[0];
        if (sub === "ps") {
          const nameIdx = args.findIndex((a) => a === "--name");
          const filter = nameIdx >= 0 ? args[nameIdx + 1] : "";
          const all = args.includes("-a") || args.includes("--all");
          if (!host.services.containerd.active) {
            return { out: 'FATA[0000] connect: connect endpoint "unix:///run/containerd/containerd.sock": no such file or directory', code: 1 };
          }
          const rows = host.containers
            .filter((c) => (all ? true : c.state === "Running"))
            .filter((c) => !filter || c.name.includes(filter));
          const header = "CONTAINER           NAME                     STATE       POD";
          return {
            out: [header, ...rows.map((c) => `${c.id.padEnd(20)}${c.name.padEnd(25)}${c.state.padEnd(12)}${c.pod ?? ""}`)].join("\n"),
            code: 0,
          };
        }
        if (sub === "pods") {
          const pods = [...new Set(host.containers.map((c) => c.pod).filter(Boolean))];
          return { out: ["POD", ...pods].join("\n"), code: 0 };
        }
        if (sub === "logs") {
          const id = args.slice(1).find((a) => !a.startsWith("-")) ?? "";
          const container = host.containers.find((c) => c.id === id || c.id.startsWith(id) || c.name === id);
          if (!container) return { out: `FATA[0000] no container with ID "${id}"`, code: 1 };
          return { out: container.log ?? `no log output recorded for ${container.name} in this lab fixture`, code: 0 };
        }
        return { out: `crictl ${sub ?? ""}: not simulated in this lab (try ps, pods, logs)`, code: 1 };
      }
      case "etcdctl": {
        if (env.ETCDCTL_API && env.ETCDCTL_API !== "3") {
          return { out: `Error: etcdctl API version ${env.ETCDCTL_API} is not supported`, code: 1 };
        }
        const sub = args[0];
        if (sub !== "snapshot") return { out: `etcdctl ${sub ?? ""}: only 'snapshot save' and 'snapshot status' are simulated`, code: 1 };
        const action = args[1];
        const path = args.slice(2).find((a) => !a.startsWith("-"));
        const flag = (name: string) => {
          const inline = args.find((a) => a.startsWith(`--${name}=`));
          if (inline) return inline.split("=").slice(1).join("=");
          const idx = args.indexOf(`--${name}`);
          return idx >= 0 ? args[idx + 1] : undefined;
        };
        if (action === "save") {
          if (!path) return { out: "Error: snapshot save expects one argument", code: 1 };
          const missing = ["cacert", "cert", "key"].filter((f) => !flag(f));
          if (missing.length) {
            return {
              out: `{"level":"warn","error":"context deadline exceeded"}\nError: failed to get the status of endpoint ${flag("endpoints") ?? "127.0.0.1:2379"} (context deadline exceeded)\n\nThe API server's etcd is TLS-only: pass --cacert, --cert and --key (missing: ${missing.map((m) => `--${m}`).join(", ")}).`,
              code: 1,
            };
          }
          writeFile(path, `etcd snapshot taken at ${new Date().toISOString()}\nrevision: 42871\n`);
          return { out: `{"level":"info","msg":"saved","path":"${path}"}\nSnapshot saved at ${path}`, code: 0 };
        }
        if (action === "status") {
          if (!path || readFile(path) === undefined) return { out: `Error: stat ${path}: no such file or directory`, code: 1 };
          return {
            out: "+----------+----------+------------+------------+\n|   HASH   | REVISION | TOTAL KEYS | TOTAL SIZE |\n+----------+----------+------------+------------+\n| f8e6a1c2 |    42871 |       1174 |     4.1 MB |\n+----------+----------+------------+------------+",
            code: 0,
          };
        }
        if (action === "restore") {
          if (!path || readFile(path) === undefined) return { out: `Error: stat ${path}: no such file or directory`, code: 1 };
          const dataDir = flag("data-dir") ?? "/var/lib/etcd";
          host.files[`${dataDir}/member/snap/db`] = "restored from snapshot";
          this.cluster.reconcile();
          return {
            out: `{"level":"info","msg":"restored snapshot","path":"${path}","data-dir":"${dataDir}"}\nNow point spec.volumes hostPath in ${STATIC_POD_PATH}/etcd.yaml at ${dataDir} so the kubelet restarts etcd against it.`,
            code: 0,
          };
        }
        return { out: `etcdctl snapshot ${action ?? ""}: not simulated`, code: 1 };
      }
      case "cat": {
        const redirect = args.findIndex((a) => a === ">" || a === ">>");
        if (redirect >= 0) {
          const path = args[redirect + 1];
          if (!path) return { out: "bash: syntax error near unexpected token `newline'", code: 2 };
          const content = body.replace(/(^|\n)EOF\s*$/, "\n");
          writeFile(path, args[redirect] === ">>" ? (readFile(path) ?? "") + content : content);
          return { out: "", code: 0 };
        }
        const paths = args.filter((a) => !a.startsWith("-"));
        if (!paths.length) return { out: "cat: missing file operand", code: 1 };
        const out: string[] = [];
        for (const path of paths) {
          const content = readFile(path);
          if (content === undefined) return { out: `cat: ${path}: No such file or directory`, code: 1 };
          out.push(content.replace(/\n$/, ""));
        }
        return { out: out.join("\n"), code: 0 };
      }
      case "ls": {
        const dir = (args.filter((a) => !a.startsWith("-"))[0] ?? "/root").replace(/\/$/, "");
        const entries = new Set<string>();
        for (const path of Object.keys(host.files)) {
          if (path === dir) entries.add(path.slice(path.lastIndexOf("/") + 1));
          if (dirname(path) === dir) entries.add(path.slice(dir.length + 1));
          else if (path.startsWith(`${dir}/`)) entries.add(`${path.slice(dir.length + 1).split("/")[0]}/`);
        }
        if (!entries.size) return { out: `ls: cannot access '${dir}': No such file or directory`, code: 2 };
        return { out: [...entries].sort().join(args.includes("-l") ? "\n" : "  "), code: 0 };
      }
      case "rm": {
        const paths = args.filter((a) => !a.startsWith("-"));
        for (const path of paths) {
          if (readFile(path) === undefined && !args.includes("-f")) {
            return { out: `rm: cannot remove '${path}': No such file or directory`, code: 1 };
          }
          delete host.files[path];
        }
        this.cluster.reconcile();
        return { out: "", code: 0 };
      }
      case "mkdir":
        return { out: "", code: 0 };
      case "cp":
      case "mv": {
        const [from, to] = args.filter((a) => !a.startsWith("-"));
        const content = readFile(from);
        if (content === undefined) return { out: `${bin}: cannot stat '${from}': No such file or directory`, code: 1 };
        host.files[to] = content;
        if (bin === "mv") delete host.files[from];
        this.cluster.reconcile();
        return { out: "", code: 0 };
      }
      case "vi":
      case "vim":
      case "nano":
        return {
          out: `${bin}: interactive editors are not simulated. Read a file with 'cat <path>' and rewrite it with:\n  cat > <path> <<EOF\n  ...\n  EOF`,
          code: 1,
        };
      case "echo":
        return { out: args.join(" "), code: 0 };
      default:
        return { out: `${bin}: command not found on this simulated node — type 'help' for what works here.`, code: 127 };
    }
  }
}
