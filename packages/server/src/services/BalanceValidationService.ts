/**
 * Balance Validation Service - Centralized wallet balance validation
 * Enforces $0.05 minimum threshold for all billable operations
 * Handles string-based decimal balances with 6-digit precision
 */

export interface WalletInfo {
  id: string;
  balance: string;
}

export interface BalanceValidationResult {
  isValid: boolean;
  currentBalance: string;
  currentBalanceNum: number;
  minimumRequired: string;
  minimumRequiredNum: number;
  shortfall: string;
  shortfallNum: number;
}

export interface BalanceErrorDetails {
  code: string;
  message: string;
  details: {
    currentBalance: string;
    minimumRequired: string;
    shortfall: string;
  };
}

export class BalanceValidationService {
  private static readonly MINIMUM_THRESHOLD = '0.050000'; // $0.05 minimum threshold (6 decimal places)

  /**
   * Convert string balance to number for comparisons
   */
  private static balanceStrToNum(balanceStr: string): number {
    return Number(balanceStr) || 0;
  }

  /**
   * Convert number to 6-decimal string format
   */
  private static numToBalanceStr(num: number): string {
    return num.toFixed(6);
  }

  /**
   * Perform precise decimal subtraction for string balances
   */
  private static subtractBalances(minuend: string, subtrahend: string): string {
    const result = this.balanceStrToNum(minuend) - this.balanceStrToNum(subtrahend);
    return this.numToBalanceStr(Math.max(0, result));
  }

  /**
   * Validate if wallet has sufficient balance for operations
   */
  static validateBalance(wallet: WalletInfo): BalanceValidationResult {
    const currentBalance = wallet.balance;
    const currentBalanceNum = this.balanceStrToNum(currentBalance);
    const minimumRequired = this.MINIMUM_THRESHOLD;
    const minimumRequiredNum = this.balanceStrToNum(minimumRequired);
    const shortfall = this.subtractBalances(minimumRequired, currentBalance);
    const shortfallNum = this.balanceStrToNum(shortfall);

    return {
      isValid: currentBalanceNum >= minimumRequiredNum,
      currentBalance,
      currentBalanceNum,
      minimumRequired,
      minimumRequiredNum,
      shortfall,
      shortfallNum,
    };
  }

  /**
   * Get user-friendly error details for insufficient balance
   */
  static getInsufficientBalanceError(currentBalance: string): BalanceErrorDetails {
    const currentBalanceNum = this.balanceStrToNum(currentBalance);
    const shortfall = this.subtractBalances(this.MINIMUM_THRESHOLD, currentBalance);

    return {
      code: 'INSUFFICIENT_BALANCE',
      message: `Minimum balance of $${this.MINIMUM_THRESHOLD} required to continue. Please add funds to your wallet.`,
      details: {
        currentBalance: currentBalanceNum.toFixed(6),
        minimumRequired: this.MINIMUM_THRESHOLD,
        shortfall,
      },
    };
  }

  /**
   * Check if balance is running low (for warnings) - $0.20 threshold
   */
  static isLowBalance(wallet: WalletInfo): boolean {
    const currentBalanceNum = this.balanceStrToNum(wallet.balance);
    const lowThreshold = this.balanceStrToNum('0.200000'); // $0.20 warning threshold
    const minimumThreshold = this.balanceStrToNum(this.MINIMUM_THRESHOLD);

    return currentBalanceNum < lowThreshold && currentBalanceNum >= minimumThreshold;
  }

  /**
   * Check if balance is critical (below minimum threshold)
   */
  static isCriticalBalance(wallet: WalletInfo): boolean {
    const currentBalanceNum = this.balanceStrToNum(wallet.balance);
    const minimumThreshold = this.balanceStrToNum(this.MINIMUM_THRESHOLD);
    return currentBalanceNum < minimumThreshold;
  }

  /**
   * Get balance status for UI indicators
   */
  static getBalanceStatus(wallet: WalletInfo): {
    level: 'critical' | 'low' | 'good' | 'excellent';
    percentage: number;
    description: string;
    balanceStr: string;
  } {
    const currentBalance = wallet.balance;
    const currentBalanceNum = this.balanceStrToNum(currentBalance);

    if (currentBalanceNum < this.balanceStrToNum(this.MINIMUM_THRESHOLD)) {
      const percentage = Math.max(0, (currentBalanceNum / this.balanceStrToNum(this.MINIMUM_THRESHOLD)) * 25);
      return {
        level: 'critical',
        percentage,
        description: `Below minimum threshold of $${this.MINIMUM_THRESHOLD}`,
        balanceStr: currentBalance,
      };
    }

    if (currentBalanceNum < this.balanceStrToNum('0.200000')) {
      // $0.20
      const range = this.balanceStrToNum('0.200000') - this.balanceStrToNum(this.MINIMUM_THRESHOLD);
      const progress = currentBalanceNum - this.balanceStrToNum(this.MINIMUM_THRESHOLD);
      const percentage = 25 + (progress / range) * 25;
      return {
        level: 'low',
        percentage,
        description: 'Balance is getting low',
        balanceStr: currentBalance,
      };
    }

    if (currentBalanceNum < 1.0) {
      const range = 1.0 - this.balanceStrToNum('0.200000');
      const progress = currentBalanceNum - this.balanceStrToNum('0.200000');
      const percentage = 50 + (progress / range) * 25;
      return {
        level: 'good',
        percentage,
        description: 'Healthy balance',
        balanceStr: currentBalance,
      };
    }

    return {
      level: 'excellent',
      percentage: 100,
      description: 'Excellent balance',
      balanceStr: currentBalance,
    };
  }

  /**
   * Calculate suggested topup amount (shortfall + buffer)
   */
  static calculateSuggestedTopup(wallet: WalletInfo): string {
    const validation = this.validateBalance(wallet);
    if (validation.isValid) {
      return '0.000000'; // No topup needed
    }

    // Suggest shortfall + $1 buffer, rounded up to 2 decimal places for user display
    const buffer = 1.0;
    const suggestedNum = validation.shortfallNum + buffer;
    return this.numToBalanceStr(suggestedNum);
  }
}

export default BalanceValidationService;
