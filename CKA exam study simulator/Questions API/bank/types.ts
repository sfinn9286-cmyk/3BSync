export type Domain =
  | "Troubleshooting"
  | "Cluster Architecture, Installation & Configuration"
  | "Services & Networking"
  | "Workloads & Scheduling"
  | "Storage";

export type Question = {
  id: string;
  domain: Domain;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  doc: string;
} & (
  | {
      type: "mcq";
      prompt: string;
      options: string[];
      answerIndex: number;
      explanation: string;
    }
  | {
      type: "command";
      prompt: string;
      answer: string;
      accepted?: string[];
      explanation: string;
    }
  | {
      type: "scenario";
      prompt: string;
      answer: string;
      rubric: string[];
      verify?: string;
      explanation: string;
    }
  | {
      type: "lab";
      prompt: string;
      answer: string;
      explanation: string;
      lab: Lab;
    }
);

export type LabInit = {
  context?: string;
  nodes?: {
    name: string;
    roles?: string;
    version?: string;
    ready?: boolean;
    schedulable?: boolean;
    labels?: Record<string, string>;
    taints?: { key: string; value?: string; effect: string }[];
    cpu?: string;
    memory?: string;
  }[];
  namespaces?: string[];
  hosts?: Record<string, HostInit>;
  resources?: Record<string, unknown>[];
  logs?: Record<string, string>;
  exec?: Record<string, string>;
};

export type LabCheck = {
  description: string;
  kind: string;
  name?: string;
  namespace?: string;
  selector?: string;
  host?: string;
  absent?: boolean;
  count?: number;
  minCount?: number;
  path?: string;
  equals?: string | number | boolean;
  contains?: string;
  gte?: number;
};

export type Lab = {
  brief: string;
  init: LabInit;
  checks: LabCheck[];
};

export type HostInit = {
  files?: Record<string, string>;
  services?: Record<string, { active?: boolean; enabled?: boolean; log?: string }>;
  containers?: { id?: string; name: string; pod?: string; state?: string; log?: string }[];
  swap?: boolean;
};
