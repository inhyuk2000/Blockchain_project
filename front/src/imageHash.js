/** SHA-256 of file bytes, lower-case hex with `0x` prefix (matches Node `crypto.createHash("sha256")`). */
export async function computeImageSha256Hex0x(file) {
  const buf = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buf);
  const bytes = new Uint8Array(hashBuffer);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `0x${hex}`;
}
