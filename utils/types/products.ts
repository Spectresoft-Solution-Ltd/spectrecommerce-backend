import type { Currency } from "../../generated/prisma/enums.js";

export interface Product_prices {
  currency: Currency;
  amount: string;
}
