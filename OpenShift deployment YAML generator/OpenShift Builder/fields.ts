// Declarative definition of the form. Each section maps to a group of fields
// whose keys match the JSON contract expected by the "Generate YAML" step.

export type FieldType = "text" | "password" | "number" | "select" | "toggle";

export interface Field {
  key: string;
  label: string;
  type?: FieldType;
  placeholder?: string;
  help?: string;
  options?: string[];
  required?: boolean;
  secret?: boolean; // client-side generate button (APP_SECRET_TOKEN)
  span?: 1 | 2; // grid columns
}

export interface Section {
  id: string;
  title: string;
  blurb: string;
  fields: Field[];
}

export const SECTIONS: Section[] = [
  {
    id: "deployment",
    title: "Deployment",
    blurb: "Names the Helm release and the OpenShift namespace everything lands in.",
    fields: [
      { key: "releaseName", label: "Release name", placeholder: "tines" },
      { key: "namespace", label: "Namespace", placeholder: "tines" },
    ],
  },
  {
    id: "images",
    title: "Container image",
    blurb: "tines-app and tines-sidekiq share this OpenShift FIPS base image.",
    fields: [
      { key: "imageRegistry", label: "Registry", placeholder: "oci.tines.com" },
      { key: "imageRepository", label: "Repository", placeholder: "tines-openshift-fips/tines-app" },
      { key: "imageTag", label: "Image tag", placeholder: "v42.2.2", help: "Defaults to the chart appVersion." },
    ],
  },
  {
    id: "registry",
    title: "Registry credentials",
    blurb: "Pull secret for the Tines container registry. Contact Tines support for these.",
    fields: [
      { key: "registryUrl", label: "Registry URL", placeholder: "oci.tines.com" },
      { key: "registryUsername", label: "Username", required: true },
      { key: "registryPassword", label: "Password", type: "password", required: true },
      { key: "registryEmail", label: "Email", required: true },
    ],
  },
  {
    id: "application",
    title: "Application",
    blurb: "Core Tines app settings applied on first boot and on every restart.",
    fields: [
      { key: "domain", label: "Domain (FQDN)", placeholder: "tines.example.com", span: 2 },
      { key: "appSecretToken", label: "APP_SECRET_TOKEN", required: true, secret: true, span: 2, help: "128-char secret. Use Generate or run: openssl rand -hex 64" },
      { key: "tenantName", label: "Tenant name", placeholder: "your-company" },
      { key: "port", label: "Port", type: "number", placeholder: "443" },
      { key: "appReplicas", label: "tines-app replicas", type: "number", placeholder: "2" },
      { key: "sidekiqReplicas", label: "tines-sidekiq replicas", type: "number", placeholder: "2" },
    ],
  },
  {
    id: "database",
    title: "Database",
    blurb: "PostgreSQL connection. Username and password become the db-secret.",
    fields: [
      { key: "dbUsername", label: "Username", placeholder: "tines", required: true },
      { key: "dbPassword", label: "Password", type: "password", required: true },
      { key: "dbName", label: "Database name", placeholder: "tines_production" },
      { key: "dbHost", label: "Host", placeholder: "db" },
    ],
  },
  {
    id: "route",
    title: "OpenShift Route",
    blurb: "Expose tines-app directly through an OpenShift Route.",
    fields: [
      { key: "routeEnabled", label: "Create Route", type: "toggle", span: 2 },
      { key: "routeHost", label: "Route host", placeholder: "tines.example.com" },
      { key: "routeTls", label: "TLS termination", type: "select", options: ["edge", "passthrough", "reencrypt"] },
    ],
  },
  {
    id: "email",
    title: "Email (optional)",
    blurb: "SMTP relay for invites and password resets. Leave blank to skip.",
    fields: [
      { key: "smtpServer", label: "SMTP server" },
      { key: "smtpDomain", label: "SMTP domain" },
      { key: "smtpUsername", label: "SMTP username" },
      { key: "smtpPassword", label: "SMTP password", type: "password" },
    ],
  },
  {
    id: "seed",
    title: "Seed user (optional)",
    blurb: "Pre-create the first admin user on initial deployment.",
    fields: [
      { key: "seedEmail", label: "Email" },
      { key: "seedFirstName", label: "First name" },
      { key: "seedLastName", label: "Last name" },
    ],
  },
];

export const DEFAULTS: Record<string, any> = {
  releaseName: "tines",
  namespace: "tines",
  imageRegistry: "oci.tines.com",
  imageRepository: "tines-openshift-fips/tines-app",
  imageTag: "",
  registryUrl: "oci.tines.com",
  registryUsername: "",
  registryPassword: "",
  registryEmail: "",
  domain: "",
  appSecretToken: "",
  tenantName: "",
  port: "443",
  appReplicas: "2",
  sidekiqReplicas: "2",
  dbUsername: "tines",
  dbPassword: "",
  dbName: "tines_production",
  dbHost: "db",
  routeEnabled: true,
  routeHost: "",
  routeTls: "edge",
  smtpServer: "",
  smtpDomain: "",
  smtpUsername: "",
  smtpPassword: "",
  seedEmail: "",
  seedFirstName: "",
  seedLastName: "",
};
