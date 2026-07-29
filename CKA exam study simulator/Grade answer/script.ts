type Payload = {
  type: "mcq" | "command" | "scenario";
  prompt: string;
  userAnswer: string;
  modelAnswer?: string;
  accepted?: string[];
  rubric?: string[];
  selectedIndex?: number;
  answerIndex?: number;
  options?: string[];
  explanation?: string;
};

function readBody(raw: string): Payload {
  const idx = raw.indexOf("\r\n\r\n");
  const body = idx === -1 ? raw : raw.slice(idx + 4);
  return JSON.parse(body);
}

function respond(status: string, body: unknown) {
  const payload = JSON.stringify(body);
  process.stdout.write(
    `HTTP/1.1 ${status}\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nContent-Length: ${Buffer.byteLength(payload)}\r\n\r\n${payload}`,
  );
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/["']/g, "")
    .replace(/\s*=\s*/g, "=")
    .trim();
}

function tokens(s: string): Set<string> {
  return new Set(
    normalise(s)
      .split(/[\s,]+/)
      .filter((t) => t.length > 1),
  );
}

function commandOverlap(userAnswer: string, candidates: string[]): number {
  let best = 0;
  const user = tokens(userAnswer);
  for (const candidate of candidates) {
    const want = tokens(candidate);
    if (want.size === 0) continue;
    let hit = 0;
    for (const t of want) if (user.has(t)) hit++;
    best = Math.max(best, hit / want.size);
  }
  return best;
}

const GRADER_SYSTEM = `You are an examiner for the Certified Kubernetes Administrator (CKA) exam, which is performance-based: the candidate writes kubectl commands and YAML manifests.

Grade the candidate's answer against the model answer and rubric. Rules:
- Accept any technically correct and complete solution, even if it differs from the model answer in style, flag order, imperative vs declarative form, or use of equivalent shorthand (deploy/deployment, -n/--namespace, kubectl create vs apply).
- Reject answers that would not actually work: wrong apiVersion, wrong apiGroup in RBAC, missing required fields, wrong resource, commands that target the wrong object or namespace.
- Judge each rubric point independently as met or not met.
- Be strict about correctness and generous about form. Do not award points for intent alone.
- Keep feedback terse and technical, in the voice of a senior Kubernetes operator. No praise, no filler.

Respond with a tool call to submit_grade.`;

const TOOL = {
  name: "submit_grade",
  description: "Return the grade for the candidate's answer.",
  input_schema: {
    type: "object",
    required: ["score", "verdict", "rubricResults", "feedback"],
    properties: {
      score: {
        type: "number",
        description: "Fraction of the task solved correctly, 0 to 1.",
      },
      verdict: { type: "string", enum: ["correct", "partial", "incorrect"] },
      rubricResults: {
        type: "array",
        items: {
          type: "object",
          required: ["point", "met"],
          properties: {
            point: { type: "string" },
            met: { type: "boolean" },
            note: { type: "string" },
          },
        },
      },
      feedback: {
        type: "string",
        description: "What was wrong or missing, and why it matters. 1-4 sentences.",
      },
      correctedAnswer: {
        type: "string",
        description: "The candidate's answer minimally corrected, if it was not already correct.",
      },
    },
  },
} as const;

async function gradeWithClaude(p: Payload) {
  const rubric = (p.rubric ?? []).map((r, i) => `${i + 1}. ${r}`).join("\n");
  const base = process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com/v1";
  const response = await fetch(`${base.replace(/\/$/, "")}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": "injected-by-connector",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 2000,
      system: GRADER_SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "submit_grade" },
      messages: [
        {
          role: "user",
          content: `TASK\n${p.prompt}\n\nMODEL ANSWER\n${p.modelAnswer ?? "(none supplied)"}\n\nRUBRIC\n${rubric || "(none supplied — grade against the model answer)"}\n\nCANDIDATE ANSWER\n${p.userAnswer}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API ${response.status}: ${(await response.text()).slice(0, 400)}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; name?: string; input?: unknown }>;
  };
  const call = data.content.find((c) => c.type === "tool_use" && c.name === "submit_grade");
  if (!call?.input) throw new Error("Model returned no submit_grade tool call");
  return call.input as Record<string, unknown>;
}

const payload = readBody(await Bun.stdin.text());

if (payload.type === "mcq") {
  const correct = payload.selectedIndex === payload.answerIndex;
  respond("200 OK", {
    graded: "deterministic",
    score: correct ? 1 : 0,
    verdict: correct ? "correct" : "incorrect",
    feedback: payload.explanation ?? "",
    correctOption:
      typeof payload.answerIndex === "number" ? payload.options?.[payload.answerIndex] : undefined,
  });
  process.exit(0);
}

if (payload.type === "command") {
  const candidates = [payload.modelAnswer ?? "", ...(payload.accepted ?? [])].filter(Boolean);
  const overlap = commandOverlap(payload.userAnswer, candidates);
  if (overlap >= 0.9) {
    respond("200 OK", {
      graded: "deterministic",
      score: 1,
      verdict: "correct",
      overlap,
      feedback: payload.explanation ?? "",
      modelAnswer: payload.modelAnswer,
    });
    process.exit(0);
  }
}

try {
  const grade = await gradeWithClaude(payload);
  respond("200 OK", { graded: "ai", modelAnswer: payload.modelAnswer, ...grade });
} catch (error) {
  console.error(`AI grading unavailable: ${(error as Error).message}`);
  respond("200 OK", {
    graded: "self",
    modelAnswer: payload.modelAnswer,
    rubric: payload.rubric ?? [],
    feedback:
      "AI grading is unavailable (no Anthropic connector attached to this step). Compare your answer with the model answer and tick the rubric points you met.",
  });
}
