export type Profile = {
  id: string;
  name: string;
  createdAt: string;
  lastAccessed: string;
};

export type ProfileMetadata = {
  activeProfileId: string | null;
  profiles: Profile[];
};

export type CreateProfileInput = {
  name: string;
  emoji: string;
  color: string;
};
