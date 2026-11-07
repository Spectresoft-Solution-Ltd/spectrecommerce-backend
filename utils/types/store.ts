export interface Members {
  username: string;
  role: Role;
}

export interface BankAccouts {
  bank_id?: number;
  bank_name: string;
  account_name: string;
  account_number: string;
  is_enabled: boolean;
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

export enum Currency {
  "DOLLAR",
  "NAIRA",
}
