export function isImageKitUrl(url) {
  return typeof url === "string" && url.includes("ik.imagekit.io");
}

/** Append a `tr` query param to an ImageKit URL (no-op for other URLs). */
export function withTransform(url, transform) {
  if (!isImageKitUrl(url)) return url;
  const [path, query = ""] = url.split("?");
  const params = new URLSearchParams(query);
  params.set("tr", transform);
  return `${path}?${params.toString()}`;
}