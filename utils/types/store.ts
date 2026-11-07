export interface Members {
  username: string;
  role: Role;
}

export interface PaymentProviders {
  provider: string;
  public_key: string;
  secret_key: string;
  is_enabled?: boolean;
}

enum Role {
  "ADMIN",
  "STAFF",
}
