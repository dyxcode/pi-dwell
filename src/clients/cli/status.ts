import { type HostStatus, isHostStatus } from "../../shared/protocol.ts";

export async function readHostStatus(port: number): Promise<HostStatus> {
  const url = `http://127.0.0.1:${port}`;
  let response: Response;
  try {
    response = await fetch(`${url}/api/v1/status`, {
      signal: AbortSignal.timeout(3000),
      redirect: "error",
      headers: { Accept: "application/json" },
    });
  } catch (error: unknown) {
    throw new Error(
      `Cannot reach pi-dwell at ${url}. Check the host or start it with: npm start -- --port ${port}`,
      { cause: error },
    );
  }
  if (!response.ok) throw new Error(`Host returned HTTP ${response.status}.`);
  const status: unknown = await response.json();
  if (!isHostStatus(status)) throw new Error("Incompatible pi-dwell host status.");
  return status;
}
