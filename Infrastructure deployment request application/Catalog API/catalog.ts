// Shared catalog definition: the resource types users can request.
// This is the single source of truth for the request form fields and
// for server-side validation. Terraform templates for each type live in
// the Terraform runner steps, keyed by the same `id`.

export type Field = {
  name: string;
  label: string;
  type: "text" | "number" | "select" | "boolean";
  required?: boolean;
  default?: string | number | boolean;
  options?: { value: string; label: string }[];
  help?: string;
  pattern?: string;
};

export type ResourceType = {
  id: string;
  name: string;
  description: string;
  fields: Field[];
};

const REGIONS: { value: string; label: string }[] = [
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "us-west-2", label: "US West (Oregon)" },
  { value: "eu-west-1", label: "EU (Ireland)" },
  { value: "eu-central-1", label: "EU (Frankfurt)" },
  { value: "ap-southeast-2", label: "Asia Pacific (Sydney)" },
];

const regionField: Field = {
  name: "region",
  label: "AWS Region",
  type: "select",
  required: true,
  default: "us-east-1",
  options: REGIONS,
};

export const CATALOG: ResourceType[] = [
  {
    id: "ec2_instance",
    name: "EC2 Instance",
    description:
      "A single Amazon Linux 2023 virtual machine. Latest AL2023 AMI is selected automatically.",
    fields: [
      {
        name: "name",
        label: "Name tag",
        type: "text",
        required: true,
        pattern: "^[A-Za-z0-9._-]{1,64}$",
        help: "Alphanumeric, dot, dash, underscore. Max 64 chars.",
      },
      regionField,
      {
        name: "instance_type",
        label: "Instance type",
        type: "select",
        required: true,
        default: "t3.micro",
        options: [
          { value: "t3.micro", label: "t3.micro (2 vCPU / 1 GiB)" },
          { value: "t3.small", label: "t3.small (2 vCPU / 2 GiB)" },
          { value: "t3.medium", label: "t3.medium (2 vCPU / 4 GiB)" },
        ],
      },
    ],
  },
  {
    id: "s3_bucket",
    name: "S3 Bucket",
    description: "A private S3 bucket with public access blocked. Optional versioning.",
    fields: [
      {
        name: "bucket_name",
        label: "Bucket name",
        type: "text",
        required: true,
        pattern: "^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$",
        help: "Globally unique. Lowercase letters, numbers, dots and dashes; 3-63 chars.",
      },
      regionField,
      {
        name: "versioning",
        label: "Enable versioning",
        type: "boolean",
        default: false,
      },
    ],
  },
  {
    id: "rds_postgres",
    name: "RDS PostgreSQL",
    description:
      "A managed PostgreSQL database instance. A strong master password is generated and returned in outputs.",
    fields: [
      {
        name: "identifier",
        label: "DB identifier",
        type: "text",
        required: true,
        pattern: "^[a-z][a-z0-9-]{0,62}$",
        help: "Lowercase, starts with a letter. Letters, numbers, dashes.",
      },
      regionField,
      {
        name: "instance_class",
        label: "Instance class",
        type: "select",
        required: true,
        default: "db.t3.micro",
        options: [
          { value: "db.t3.micro", label: "db.t3.micro" },
          { value: "db.t4g.micro", label: "db.t4g.micro" },
          { value: "db.t3.small", label: "db.t3.small" },
        ],
      },
      {
        name: "allocated_storage",
        label: "Storage (GiB)",
        type: "number",
        required: true,
        default: 20,
      },
      {
        name: "db_name",
        label: "Initial database name",
        type: "text",
        required: true,
        default: "appdb",
        pattern: "^[A-Za-z][A-Za-z0-9_]{0,62}$",
      },
      {
        name: "username",
        label: "Master username",
        type: "text",
        required: true,
        default: "dbadmin",
        pattern: "^[A-Za-z][A-Za-z0-9_]{0,62}$",
      },
    ],
  },
];

export function findType(id: string): ResourceType | undefined {
  return CATALOG.find((t) => t.id === id);
}

// Validate + coerce a params object against a resource type's field schema.
// Returns { ok, value, errors }.
export function validateParams(
  type: ResourceType,
  params: Record<string, unknown>,
): { ok: boolean; value: Record<string, unknown>; errors: string[] } {
  const errors: string[] = [];
  const value: Record<string, unknown> = {};
  for (const f of type.fields) {
    let v = params[f.name];
    if (v === undefined || v === null || v === "") {
      if (f.default !== undefined) v = f.default;
      else if (f.required) {
        errors.push(`${f.label} is required`);
        continue;
      } else {
        continue;
      }
    }
    if (f.type === "number") {
      const n = Number(v);
      if (Number.isNaN(n)) {
        errors.push(`${f.label} must be a number`);
        continue;
      }
      value[f.name] = n;
    } else if (f.type === "boolean") {
      value[f.name] = v === true || v === "true";
    } else if (f.type === "select") {
      const allowed = (f.options ?? []).map((o) => o.value);
      if (!allowed.includes(String(v))) {
        errors.push(`${f.label} must be one of: ${allowed.join(", ")}`);
        continue;
      }
      value[f.name] = String(v);
    } else {
      const s = String(v);
      if (f.pattern && !new RegExp(f.pattern).test(s)) {
        errors.push(`${f.label} is invalid (${f.help ?? f.pattern})`);
        continue;
      }
      value[f.name] = s;
    }
  }
  return { ok: errors.length === 0, value, errors };
}
