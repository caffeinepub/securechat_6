import Map "mo:core/Map";
import Array "mo:core/Array";
import Time "mo:core/Time";
import Order "mo:core/Order";
import Runtime "mo:core/Runtime";
import Nat "mo:core/Nat";
import Iter "mo:core/Iter";
import Text "mo:core/Text";
import Principal "mo:core/Principal";

import MixinAuthorization "authorization/MixinAuthorization";
import MixinStorage "blob-storage/Mixin";
import AccessControl "authorization/access-control";
import Migration "migration";

(with migration = Migration.run)
actor {
  // Message type (stored encrypted!)
  type Message = {
    id : Nat;
    senderId : Principal;
    receiverId : Principal;
    content : Text;
    timestamp : Int;
    status : Nat; // 0=sent, 1=delivered, 2=read
  };

  module Message {
    public func compare(m1 : Message, m2 : Message) : Order.Order {
      Nat.compare(m1.id, m2.id);
    };
  };

  public type UserProfile = {
    name : Text;
    email : Text;
    passwordHash : Text;
    partnerEmail : Text;
    partnerId : ?Principal;
    profileImageId : ?Text; // Image blob reference
    online : Bool;
    lastSeen : Int;
    isTyping : Bool;
    typingTimestamp : Int;
    totpSecret : Text; // base32 TOTP secret
  };

  // Sanitized profile without sensitive fields
  public type SafeUserProfile = {
    name : Text;
    email : Text;
    partnerEmail : Text;
    partnerId : ?Principal;
    profileImageId : ?Text;
    online : Bool;
    lastSeen : Int;
    isTyping : Bool;
    typingTimestamp : Int;
  };

  type RegistrationInput = {
    name : Text;
    email : Text;
    passwordHash : Text;
    partnerEmail : Text;
  };

  type LoginInput = {
    email : Text;
    passwordHash : Text;
  };

  type MessageInput = {
    receiverId : Principal;
    content : Text;
  };

  let accessControlState = AccessControl.initState();
  include MixinAuthorization(accessControlState);
  include MixinStorage();

  let profiles = Map.empty<Principal, UserProfile>();
  let messages = Map.empty<Nat, Message>();
  var nextMessageId = 1;

  // Helper function to sanitize profile
  func sanitizeProfile(profile : UserProfile) : SafeUserProfile {
    {
      name = profile.name;
      email = profile.email;
      partnerEmail = profile.partnerEmail;
      partnerId = profile.partnerId;
      profileImageId = profile.profileImageId;
      online = profile.online;
      lastSeen = profile.lastSeen;
      isTyping = profile.isTyping;
      typingTimestamp = profile.typingTimestamp;
    };
  };

  // Generate a random TOTP secret (simplified - in production use proper random generation)
  func generateTOTPSecretString() : Text {
    // This is a placeholder. In production, generate 20 random bytes and encode as base32
    // For now, return a dummy base32 string
    "JBSWY3DPEHPK3PXP"; // 16 chars base32 = 10 bytes, should be 32 chars for 20 bytes
  };

  public shared ({ caller }) func generateTOTPSecret(phoneEmail : Text) : async Text {
    // Check if user already exists
    switch (profiles.get(caller)) {
      case (?_) { Runtime.trap("User already exists") };
      case (null) {
        let totpSecret = generateTOTPSecretString();
        let profile : UserProfile = {
          name = phoneEmail;
          email = phoneEmail;
          passwordHash = "";
          partnerEmail = "";
          partnerId = null;
          profileImageId = null;
          online = false;
          lastSeen = Time.now();
          isTyping = false;
          typingTimestamp = 0;
          totpSecret = totpSecret;
        };
        profiles.add(caller, profile);
        // Assign user role upon TOTP secret generation
        AccessControl.assignRole(accessControlState, caller, caller, #user);
        totpSecret;
      };
    };
  };

  public query ({ caller }) func verifyTOTP(phoneEmail : Text, code : Text) : async Bool {
    // This is a placeholder implementation
    // In production, implement RFC 6238: HMAC-SHA1, 6-digit code, 30-second time step, ±1 step tolerance
    switch (profiles.get(caller)) {
      case (null) { false };
      case (?profile) {
        if (profile.email != phoneEmail) {
          return false;
        };
        // Placeholder: In production, compute TOTP from profile.totpSecret and compare with code
        // For now, accept any 6-digit code
        code.size() == 6;
      };
    };
  };

  public query ({ caller }) func getOrCreateProfile(phoneEmail : Text) : async { isNew : Bool } {
    switch (profiles.get(caller)) {
      case (null) { { isNew = true } };
      case (?profile) {
        // User exists, check if they have a partner set
        let isNew = profile.partnerEmail == "";
        { isNew };
      };
    };
  };

  public shared ({ caller }) func register(input : RegistrationInput) : async () {
    switch (profiles.get(caller)) {
      case (?existingProfile) {
        // User exists, update their profile
        let profile : UserProfile = {
          name = input.name;
          email = input.email;
          passwordHash = input.passwordHash;
          partnerEmail = input.partnerEmail;
          partnerId = existingProfile.partnerId;
          profileImageId = existingProfile.profileImageId;
          online = true;
          lastSeen = Time.now();
          isTyping = false;
          typingTimestamp = 0;
          totpSecret = existingProfile.totpSecret;
        };
        profiles.add(caller, profile);
        updatePartnerId(caller, input.partnerEmail);
        // Ensure user role is assigned
        AccessControl.assignRole(accessControlState, caller, caller, #user);
      };
      case (null) {
        // New user registration
        let totpSecret = generateTOTPSecretString();
        let profile : UserProfile = {
          name = input.name;
          email = input.email;
          passwordHash = input.passwordHash;
          partnerEmail = input.partnerEmail;
          partnerId = null;
          profileImageId = null;
          online = true;
          lastSeen = Time.now();
          isTyping = false;
          typingTimestamp = 0;
          totpSecret;
        };
        profiles.add(caller, profile);
        updatePartnerId(caller, input.partnerEmail);
        // Assign user role upon registration
        AccessControl.assignRole(accessControlState, caller, caller, #user);
      };
    };
  };

  public query ({ caller }) func login(input : LoginInput) : async Bool {
    // NO access control check - this is the login endpoint itself
    switch (profiles.get(caller)) {
      case (null) { false };
      case (?profile) {
        profile.email == input.email and profile.passwordHash == input.passwordHash;
      };
    };
  };

  func updatePartnerId(userId : Principal, partnerEmail : Text) {
    // Find partner principal by email
    let partnerEntry = profiles.entries().find(
      func((_, profile)) { profile.email == partnerEmail }
    );

    switch (partnerEntry) {
      case (?((partnerId, _))) {
        switch (profiles.get(userId)) {
          case (null) {};
          case (?profile) {
            let updatedProfile = { profile with partnerId = ?partnerId };
            profiles.add(userId, updatedProfile);
          };
        };
      };
      case (null) {};
    };
  };

  public query ({ caller }) func getCallerUserProfile() : async ?SafeUserProfile {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only users can access profiles");
    };
    switch (profiles.get(caller)) {
      case (null) { null };
      case (?profile) { ?sanitizeProfile(profile) };
    };
  };

  public query ({ caller }) func getUserProfile(user : Principal) : async ?SafeUserProfile {
    if (caller != user and not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Can only view your own profile");
    };
    switch (profiles.get(user)) {
      case (null) { null };
      case (?profile) { ?sanitizeProfile(profile) };
    };
  };

  public shared ({ caller }) func saveCallerUserProfile(profile : SafeUserProfile) : async () {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only users can save profiles");
    };

    // Get existing profile to preserve sensitive fields
    switch (profiles.get(caller)) {
      case (null) { Runtime.trap("Profile not found") };
      case (?existingProfile) {
        let updatedProfile : UserProfile = {
          name = profile.name;
          email = profile.email;
          passwordHash = existingProfile.passwordHash; // Preserve
          partnerEmail = profile.partnerEmail;
          partnerId = profile.partnerId;
          profileImageId = profile.profileImageId;
          online = profile.online;
          lastSeen = profile.lastSeen;
          isTyping = profile.isTyping;
          typingTimestamp = profile.typingTimestamp;
          totpSecret = existingProfile.totpSecret; // Preserve
        };
        profiles.add(caller, updatedProfile);
      };
    };
  };

  public query ({ caller }) func getOwnProfile() : async SafeUserProfile {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only users can access profiles");
    };

    switch (profiles.get(caller)) {
      case (null) { Runtime.trap("Profile not registered") };
      case (?profile) { sanitizeProfile(profile) };
    };
  };

  public shared ({ caller }) func updateOnlineStatus(online : Bool) : async () {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only users can update online status");
    };

    switch (profiles.get(caller)) {
      case (null) { Runtime.trap("Profile not registered") };
      case (?profile) {
        let updatedProfile = {
          profile with
          online = online;
          lastSeen = Time.now();
        };
        profiles.add(caller, updatedProfile);
      };
    };
  };

  public shared ({ caller }) func setTyping(isTyping : Bool) : async () {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only users can set typing status");
    };

    switch (profiles.get(caller)) {
      case (null) { Runtime.trap("Profile not registered") };
      case (?profile) {
        let updatedProfile = {
          profile with
          isTyping = isTyping;
          typingTimestamp = Time.now();
          lastSeen = Time.now();
        };
        profiles.add(caller, updatedProfile);
      };
    };
  };

  public query ({ caller }) func getPartnerTyping() : async Bool {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only users can check partner typing status");
    };

    switch (profiles.get(caller)) {
      case (null) { Runtime.trap("Profile not registered") };
      case (?profile) {
        switch (profile.partnerId) {
          case (null) { false };
          case (?partnerId) {
            switch (profiles.get(partnerId)) {
              case (?partner) {
                partner.isTyping and (Time.now() - partner.typingTimestamp) < 5_000_000_000;
              };
              case (null) { false };
            };
          };
        };
      };
    };
  };

  public shared ({ caller }) func sendMessage(input : MessageInput) : async () {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only users can send messages");
    };

    switch (profiles.get(caller)) {
      case (null) { Runtime.trap("Sender not registered") };
      case (?senderProfile) {
        // Verify caller's partner is the receiver
        switch (senderProfile.partnerId) {
          case (null) { Runtime.trap("You have no partner set") };
          case (?callerPartnerId) {
            if (callerPartnerId != input.receiverId) {
              Runtime.trap("You can only send messages to your approved partner");
            };
          };
        };

        switch (profiles.get(input.receiverId)) {
          case (null) { Runtime.trap("Receiver not registered") };
          case (?receiverProfile) {
            // Verify receiver's partner is the caller (bidirectional check)
            switch (receiverProfile.partnerId) {
              case (null) { Runtime.trap("Receiver has no partner set") };
              case (?receiverPartnerId) {
                if (receiverPartnerId != caller) {
                  Runtime.trap("Receiver's partner is not you");
                };

                let message : Message = {
                  id = nextMessageId;
                  senderId = caller;
                  receiverId = input.receiverId;
                  content = input.content;
                  timestamp = Time.now();
                  status = 0;
                };
                messages.add(nextMessageId, message);
                nextMessageId += 1;

                let updatedSenderProfile = { senderProfile with lastSeen = Time.now() };
                profiles.add(caller, updatedSenderProfile);
              };
            };
          };
        };
      };
    };
  };

  public query ({ caller }) func getMessages(partnerId : Principal, startIndex : Nat, pageSize : Nat) : async [Message] {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only users can access messages");
    };

    if (caller == partnerId) {
      Runtime.trap("Cannot fetch messages to self");
    };

    switch (profiles.get(caller)) {
      case (null) { Runtime.trap("User not registered") };
      case (?profile) {
        switch (profile.partnerId) {
          case (null) { Runtime.trap("You have no partner set") };
          case (?approvedPartnerId) {
            if (approvedPartnerId != partnerId) {
              Runtime.trap("You can only access messages with your approved partner");
            };
          };
        };
      };
    };

    let conversation = messages.values().toArray().filter(
      func(message) {
        (message.senderId == caller and message.receiverId == partnerId)
        or (message.senderId == partnerId and message.receiverId == caller)
      }
    );

    let sortedMessages = conversation.sort();

    // Only call Array.tabulate with guaranteed valid indices.
    let slicedSize = if (startIndex >= sortedMessages.size()) { 0 } else {
      let endIndex = Nat.min(startIndex + pageSize, sortedMessages.size());
      endIndex - startIndex;
    };

    Array.tabulate(
      slicedSize,
      func(i) { sortedMessages[startIndex + i] },
    );
  };

  public shared ({ caller }) func markAsRead(partnerId : Principal) : async () {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only users can mark messages as read");
    };

    if (caller == partnerId) {
      Runtime.trap("Cannot mark messages to self");
    };

    switch (profiles.get(caller)) {
      case (null) { Runtime.trap("User not registered") };
      case (?profile) {
        switch (profile.partnerId) {
          case (null) { Runtime.trap("You have no partner set") };
          case (?approvedPartnerId) {
            if (approvedPartnerId != partnerId) {
              Runtime.trap("You can only mark messages from your approved partner");
            };
          };
        };
      };
    };

    let filtered = messages.values().toArray().filter(
      func(message) {
        message.senderId == partnerId and message.receiverId == caller
      }
    );

    for (message in filtered.values()) {
      let updatedMsg = { message with status = 2 };
      messages.add(updatedMsg.id, updatedMsg);
    };
  };

  public query ({ caller }) func getUnreadMessageCount(partnerId : Principal) : async Nat {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only users can check unread messages");
    };

    if (caller == partnerId) {
      Runtime.trap("Cannot check unread messages to self");
    };

    switch (profiles.get(caller)) {
      case (null) { Runtime.trap("User not registered") };
      case (?profile) {
        switch (profile.partnerId) {
          case (null) { Runtime.trap("You have no partner set") };
          case (?approvedPartnerId) {
            if (approvedPartnerId != partnerId) {
              Runtime.trap("You can only check unread messages from your approved partner");
            };
          };
        };
      };
    };

    var count = 0;
    for (message in messages.values()) {
      if (message.senderId == partnerId and message.receiverId == caller and message.status < 2) {
        count += 1;
      };
    };
    count;
  };

  // Image management (backend-only references)
  public shared ({ caller }) func setProfilePicture(imageId : Text) : async () {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only users can set profile picture");
    };

    switch (profiles.get(caller)) {
      case (null) { Runtime.trap("Profile not registered") };
      case (?profile) {
        let updatedProfile = { profile with profileImageId = ?imageId };
        profiles.add(caller, updatedProfile);
      };
    };
  };

  public query ({ caller }) func getProfilePictureId(user : Principal) : async ?Text {
    // Authorization: Only authenticated users can view profile pictures
    // This prevents anonymous access to user data
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only users can view profile pictures");
    };

    switch (profiles.get(user)) {
      case (null) { null };
      case (?profile) { profile.profileImageId };
    };
  };

  public query ({ caller }) func hasImageId(imageId : Text) : async Bool {
    for (profile in profiles.values()) {
      switch (profile.profileImageId) {
        case (null) {};
        case (?id) {
          if (id == imageId) { return true };
        };
      };
    };
    false;
  };

  public query ({ caller }) func getOwnProfileImageId() : async ?Text {
    switch (profiles.get(caller)) {
      case (null) { null };
      case (?profile) { profile.profileImageId };
    };
  };
};
