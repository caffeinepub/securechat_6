import { HttpAgent } from "@icp-sdk/core/agent";
import { useEffect, useState } from "react";
import { StorageClient } from "../utils/StorageClient";
import { useInternetIdentity } from "./useInternetIdentity";

interface StorageConfig {
  backendHost: string;
  backendCanisterId: string;
  projectId: string;
  storageGatewayUrl: string;
}

async function loadStorageConfig(): Promise<StorageConfig> {
  const resp = await fetch("/env.json");
  const env = (await resp.json()) as {
    backend_host?: string;
    backend_canister_id?: string;
    project_id?: string;
    storage_gateway_url?: string;
  };
  return {
    backendHost: env.backend_host ?? "http://localhost:4943",
    backendCanisterId: env.backend_canister_id ?? "",
    projectId: env.project_id ?? "",
    storageGatewayUrl:
      env.storage_gateway_url ??
      (env.backend_host
        ? env.backend_host
            .replace("icp0.io", "storage.icp0.io")
            .replace("ic0.app", "storage.ic0.app")
        : "http://localhost:4944"),
  };
}

export function useStorageClient() {
  const { identity } = useInternetIdentity();
  const [storageClient, setStorageClient] = useState<StorageClient | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    loadStorageConfig().then(async (config) => {
      if (cancelled) return;
      try {
        const agent = await HttpAgent.create({
          host: config.backendHost,
          identity: identity ?? undefined,
          shouldFetchRootKey: config.backendHost.includes("localhost"),
        });
        const client = new StorageClient(
          "profile-pictures",
          config.storageGatewayUrl,
          config.backendCanisterId,
          config.projectId,
          agent,
        );
        if (!cancelled) setStorageClient(client);
      } catch (e) {
        console.error("Failed to create storage client:", e);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [identity]);

  return storageClient;
}
