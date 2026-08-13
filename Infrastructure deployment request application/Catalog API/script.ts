// GET /api/catalog — returns the resource catalog (types + form field schemas).
// The Portal fetches this to build request forms. Route input is an RFC 7230
// HTTP request on stdin; we ignore it and always return the catalog.
import { CATALOG } from "./catalog";

const body = JSON.stringify({ types: CATALOG });

process.stdout.write(
  [
    "HTTP/1.1 200 OK",
    "Content-Type: application/json",
    "Cache-Control: no-store",
    `Content-Length: ${Buffer.byteLength(body)}`,
    "",
    body,
  ].join("\r\n"),
);
