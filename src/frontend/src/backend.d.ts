import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface RegistrationInput {
    name: string;
    partnerEmail: string;
    email: string;
    passwordHash: string;
}
export interface SafeUserProfile {
    typingTimestamp: bigint;
    profileImageId?: string;
    name: string;
    partnerEmail: string;
    email: string;
    partnerId?: Principal;
    isTyping: boolean;
    lastSeen: bigint;
    online: boolean;
}
export interface Message {
    id: bigint;
    status: bigint;
    content: string;
    receiverId: Principal;
    timestamp: bigint;
    senderId: Principal;
}
export interface MessageInput {
    content: string;
    receiverId: Principal;
}
export interface LoginInput {
    email: string;
    passwordHash: string;
}
export enum UserRole {
    admin = "admin",
    user = "user",
    guest = "guest"
}
export interface backendInterface {
    assignCallerUserRole(user: Principal, role: UserRole): Promise<void>;
    generateTOTPSecret(phoneEmail: string): Promise<string>;
    getCallerUserProfile(): Promise<SafeUserProfile | null>;
    getCallerUserRole(): Promise<UserRole>;
    getMessages(partnerId: Principal, startIndex: bigint, pageSize: bigint): Promise<Array<Message>>;
    getOrCreateProfile(phoneEmail: string): Promise<{
        isNew: boolean;
    }>;
    getOwnProfile(): Promise<SafeUserProfile>;
    getOwnProfileImageId(): Promise<string | null>;
    getPartnerTyping(): Promise<boolean>;
    getProfilePictureId(user: Principal): Promise<string | null>;
    getUnreadMessageCount(partnerId: Principal): Promise<bigint>;
    getUserProfile(user: Principal): Promise<SafeUserProfile | null>;
    hasImageId(imageId: string): Promise<boolean>;
    isCallerAdmin(): Promise<boolean>;
    login(input: LoginInput): Promise<boolean>;
    markAsRead(partnerId: Principal): Promise<void>;
    register(input: RegistrationInput): Promise<void>;
    saveCallerUserProfile(profile: SafeUserProfile): Promise<void>;
    sendMessage(input: MessageInput): Promise<void>;
    setProfilePicture(imageId: string): Promise<void>;
    setTyping(isTyping: boolean): Promise<void>;
    updateOnlineStatus(online: boolean): Promise<void>;
    verifyTOTP(phoneEmail: string, code: string): Promise<boolean>;
}
