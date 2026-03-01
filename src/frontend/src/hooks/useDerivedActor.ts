/**
 * useDerivedActor - creates an actor using the Ed25519 identity derived from
 * the user's email+password and stored in localStorage.
 *
 * This is the primary actor hook for SecureChat. It replaces useActor for all
 * authenticated operations, giving each user a unique IC Principal.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { backendInterface } from "../backend";
import { createActorWithConfig } from "../config";
import { loadStoredIdentity } from "../utils/identity";

const DERIVED_ACTOR_KEY = "derivedActor";

export function useDerivedActor() {
  const queryClient = useQueryClient();

  const actorQuery = useQuery<backendInterface>({
    queryKey: [DERIVED_ACTOR_KEY],
    queryFn: async () => {
      const identity = loadStoredIdentity();
      if (!identity) {
        // Return anonymous actor when not logged in
        return createActorWithConfig();
      }
      return createActorWithConfig({ agentOptions: { identity } });
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  useEffect(() => {
    if (actorQuery.data) {
      queryClient.invalidateQueries({
        predicate: (query) => !query.queryKey.includes(DERIVED_ACTOR_KEY),
      });
    }
  }, [actorQuery.data, queryClient]);

  return {
    actor: actorQuery.data ?? null,
    isFetching: actorQuery.isFetching,
    refetch: actorQuery.refetch,
  };
}

/**
 * Invalidates the derived actor cache so it gets re-created with the new identity.
 * Call this after storing/clearing the identity.
 */
export function invalidateDerivedActor(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  queryClient.invalidateQueries({ queryKey: [DERIVED_ACTOR_KEY] });
  queryClient.removeQueries({ queryKey: [DERIVED_ACTOR_KEY] });
}
