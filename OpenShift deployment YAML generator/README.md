Collects environment details for a self-hosted [Tines](https://www.tines.com) deployment and renders the corresponding **OpenShift** manifests, straight from the latest official [Tines Helm chart](https://helm.tines.com).

**Flow**

1. [OpenShift Builder](<OpenShift Builder/App.tsx>) serves a form at `/openshift-builder` where an operator enters deployment details (namespace, image, registry credentials, database, route, SMTP, seed user).
2. On **Generate**, the browser POSTs the details as JSON to [Generate YAML](<Generate YAML/script.ts>) at `/generate-openshift`.
3. Generate YAML runs `helm template` against the bundled chart with OpenShift API capabilities enabled (`security.openshift.io/v1`, `route.openshift.io/v1`) and returns the multi-document YAML, which the UI shows with copy/download.

**OpenShift specifics** — because the OpenShift API versions are supplied, the chart selects its `openshiftImage` values. `tines-app`, its init job, and `tines-sidekiq` all resolve to `oci.tines.com/tines-openshift-fips/tines-app` (same base image), and an OpenShift `Route` is emitted instead of an Ingress.

**Helm** — the helm binary (v3.16.2) and the chart (`tines-42.2.2`) are downloaded on first use and cached in the `tinesbuild` volume. Bump the versions in [Generate YAML/script.ts](<Generate YAML/script.ts>).

Both routes are space-authenticated. Nothing is deployed to any cluster — this workflow only produces YAML.
