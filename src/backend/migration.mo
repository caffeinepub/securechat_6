import Map "mo:core/Map";
import Principal "mo:core/Principal";

module {
  type OldUserProfile = {
    name : Text;
    email : Text;
    passwordHash : Text;
    partnerEmail : Text;
    partnerId : ?Principal;
    profileImageId : ?Text;
    online : Bool;
    lastSeen : Int;
    isTyping : Bool;
    typingTimestamp : Int;
  };

  type OldActor = {
    profiles : Map.Map<Principal, OldUserProfile>;
  };

  type NewUserProfile = {
    name : Text;
    email : Text;
    passwordHash : Text;
    partnerEmail : Text;
    partnerId : ?Principal;
    profileImageId : ?Text;
    online : Bool;
    lastSeen : Int;
    isTyping : Bool;
    typingTimestamp : Int;
    totpSecret : Text; // new field
  };

  type NewActor = {
    profiles : Map.Map<Principal, NewUserProfile>;
  };

  public func run(old : OldActor) : NewActor {
    let newProfiles = old.profiles.map<Principal, OldUserProfile, NewUserProfile>(
      func(_principal, oldUserProfile) {
        { oldUserProfile with totpSecret = "" };
      }
    );
    { profiles = newProfiles };
  };
};
