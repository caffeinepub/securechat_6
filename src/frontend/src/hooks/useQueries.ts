import type { Principal } from "@icp-sdk/core/principal";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Message, UserProfile } from "../backend.d";
import { useDerivedActor } from "./useDerivedActor";

// ─── Profile queries ───────────────────────────────────────────────────────

export function useOwnProfile() {
  const { actor, isFetching } = useDerivedActor();
  return useQuery<UserProfile | null>({
    queryKey: ["ownProfile"],
    queryFn: async () => {
      if (!actor) return null;
      return actor.getOwnProfile();
    },
    enabled: !!actor && !isFetching,
  });
}

export function useUserProfile(principal: Principal | null) {
  const { actor, isFetching } = useDerivedActor();
  return useQuery<UserProfile | null>({
    queryKey: ["userProfile", principal?.toString()],
    queryFn: async () => {
      if (!actor || !principal) return null;
      return actor.getUserProfile(principal);
    },
    enabled: !!actor && !isFetching && !!principal,
  });
}

export function useOwnProfileImageId() {
  const { actor, isFetching } = useDerivedActor();
  return useQuery<string | null>({
    queryKey: ["ownProfileImageId"],
    queryFn: async () => {
      if (!actor) return null;
      return actor.getOwnProfileImageId();
    },
    enabled: !!actor && !isFetching,
  });
}

export function usePartnerProfileImageId(partner: Principal | null) {
  const { actor, isFetching } = useDerivedActor();
  return useQuery<string | null>({
    queryKey: ["partnerProfileImageId", partner?.toString()],
    queryFn: async () => {
      if (!actor || !partner) return null;
      return actor.getProfilePictureId(partner);
    },
    enabled: !!actor && !isFetching && !!partner,
  });
}

// ─── Message queries ───────────────────────────────────────────────────────

export function useMessages(partnerId: Principal | null) {
  const { actor, isFetching } = useDerivedActor();
  return useQuery<Message[]>({
    queryKey: ["messages", partnerId?.toString()],
    queryFn: async () => {
      if (!actor || !partnerId) return [];
      return actor.getMessages(partnerId, BigInt(0), BigInt(100));
    },
    enabled: !!actor && !isFetching && !!partnerId,
    staleTime: 0,
  });
}

export function useUnreadCount(partnerId: Principal | null) {
  const { actor, isFetching } = useDerivedActor();
  return useQuery<bigint>({
    queryKey: ["unreadCount", partnerId?.toString()],
    queryFn: async () => {
      if (!actor || !partnerId) return BigInt(0);
      return actor.getUnreadMessageCount(partnerId);
    },
    enabled: !!actor && !isFetching && !!partnerId,
  });
}

export function usePartnerTyping() {
  const { actor, isFetching } = useDerivedActor();
  return useQuery<boolean>({
    queryKey: ["partnerTyping"],
    queryFn: async () => {
      if (!actor) return false;
      return actor.getPartnerTyping();
    },
    enabled: !!actor && !isFetching,
    staleTime: 0,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────

export function useSendMessage() {
  const { actor } = useDerivedActor();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      content,
      receiverId,
    }: {
      content: string;
      receiverId: Principal;
    }) => {
      if (!actor) throw new Error("Actor not ready");
      return actor.sendMessage({ content, receiverId });
    },
    onSuccess: (_, { receiverId }) => {
      queryClient.invalidateQueries({
        queryKey: ["messages", receiverId.toString()],
      });
    },
  });
}

export function useMarkAsRead() {
  const { actor } = useDerivedActor();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (partnerId: Principal) => {
      if (!actor) throw new Error("Actor not ready");
      return actor.markAsRead(partnerId);
    },
    onSuccess: (_, partnerId) => {
      queryClient.invalidateQueries({
        queryKey: ["unreadCount", partnerId.toString()],
      });
      queryClient.invalidateQueries({ queryKey: ["messages"] });
    },
  });
}

export function useSetTyping() {
  const { actor } = useDerivedActor();
  return useMutation({
    mutationFn: async (isTyping: boolean) => {
      if (!actor) throw new Error("Actor not ready");
      return actor.setTyping(isTyping);
    },
  });
}

export function useUpdateOnlineStatus() {
  const { actor } = useDerivedActor();
  return useMutation({
    mutationFn: async (online: boolean) => {
      if (!actor) throw new Error("Actor not ready");
      return actor.updateOnlineStatus(online);
    },
  });
}

export function useSetProfilePicture() {
  const { actor } = useDerivedActor();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (imageId: string) => {
      if (!actor) throw new Error("Actor not ready");
      return actor.setProfilePicture(imageId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ownProfileImageId"] });
      queryClient.invalidateQueries({ queryKey: ["ownProfile"] });
    },
  });
}

export function useSaveProfile() {
  const { actor } = useDerivedActor();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (profile: UserProfile) => {
      if (!actor) throw new Error("Actor not ready");
      return actor.saveCallerUserProfile(profile);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ownProfile"] });
    },
  });
}

export function useRegister() {
  const { actor } = useDerivedActor();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      partnerEmail: string;
      email: string;
      passwordHash: string;
    }) => {
      if (!actor) throw new Error("Actor not ready");
      return actor.register(input);
    },
  });
}

export function useLogin() {
  const { actor } = useDerivedActor();
  return useMutation({
    mutationFn: async (input: { email: string; passwordHash: string }) => {
      if (!actor) throw new Error("Actor not ready");
      return actor.login(input);
    },
  });
}
