export type AuthType = "api_key" | "oauth2" | "basic_auth" | "bearer" | "custom";

export interface CredentialField {
  name: string;
  type: "string" | "number" | "boolean";
  label: string;
  required: boolean;
  sensitive: boolean;
  description?: string;
  placeholder?: string;
  regex?: string;
  options?: string[];
}

export interface CredentialTypeDefinition {
  id: string;
  name: string;
  description: string;
  authType: AuthType;
  fields: CredentialField[];
  testEndpoint?: {
    url: string;
    method: "GET" | "POST";
    headerTemplate?: Record<string, string>;
  };
  category?: string;
}

export interface StoredCredential {
  id: string;
  name: string;
  type_id: string;
  public_data: string;     // JSON of non-sensitive fields
  encrypted_blob: string | null;  // JSON of EncryptedBlob for sensitive fields
  created_at: string;
  updated_at: string;
  tags: string;           // JSON array
}

export interface Credential {
  id: string;
  name: string;
  typeId: string;
  data: Record<string, unknown>; // resolved (decrypted) data
  createdAt: string;
  updatedAt: string;
  tags: string[];
}

export interface CredentialSummary {
  id: string;
  name: string;
  typeId: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
}
