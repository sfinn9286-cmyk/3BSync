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
);
