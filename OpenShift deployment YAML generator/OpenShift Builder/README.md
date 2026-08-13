Webpage served at `/openshift-builder` (space-authenticated). A dark "control-plane" form where an operator fills in environment details for a self-hosted Tines OpenShift deployment.

On **Generate** it POSTs the whole form as JSON to the [Generate YAML](<../Generate YAML/script.ts>) step (`/generate-openshift`, with the current `?branch=` appended on drafts) and renders the returned manifests with lightweight YAML highlighting, plus copy and download.

Field and section definitions live in [fields.ts](fields.ts); inputs render through [components/FieldInput.tsx](components/FieldInput.tsx) and the output pane is [components/YamlView.tsx](components/YamlView.tsx). The branch id is injected into the page by [render.ts](render.ts).
