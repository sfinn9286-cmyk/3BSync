HTTP endpoint at `POST /generate-openshift` (space-authenticated, `route_type = "api"`). Accepts a JSON body of environment details and returns the rendered OpenShift YAML (`text/yaml`), or `{ "error": ... }` on failure.

It writes the submitted values into a Helm values overlay (JSON is valid YAML), then runs:

```
helm template <release> <chart> -n <namespace> \
  --api-versions security.openshift.io/v1 \
  --api-versions route.openshift.io/v1 \
  -f overlay.json
```

Supplying the OpenShift API versions makes the chart use its `openshiftImage` values, so `tines-app`, the setup job, and `tines-sidekiq` all use `oci.tines.com/tines-openshift-fips/tines-app`, and a `Route` is produced.

The helm binary (v3.16.2) and chart (`tines-42.2.2`) are fetched on first request and cached in the `tinesbuild` volume; later requests reuse them. See [script.ts](script.ts).
