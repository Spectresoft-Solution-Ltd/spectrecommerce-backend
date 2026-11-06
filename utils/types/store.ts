export interface Members {
  username: string;
  role: Role;
}

export interface PaymentProviders {
  provider: string;
  public_key: string;
  sectret_key: string;
  is_enabled?: boolean;
}

enum Role {
  "ADMIN",
  "STAFF",
}
