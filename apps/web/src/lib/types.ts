export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export interface Balance {
  amount: string;
  currency: string;
  updatedAt: string;
}

export type TransactionType = 'deposit' | 'withdrawal' | 'gateway_credit';

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: string;
  balanceAfter: string;
  currency: string;
  createdAt: string;
}

export interface TransactionPage {
  data: Transaction[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface MovementResponse {
  transaction: Transaction;
  balance: Balance;
}
