import { ConversationEntity } from '../entities/ConversationEntity';

/**
 * Shared validation logic for Conversation operations
 * Uses ConversationEntity validation constants for consistency
 */
export class ConversationValidation {
  /**
   * Validate required fields based on operation type
   */
  static validateRequired(data: any, operation: 'create' | 'update'): void {
    if (operation === 'create') {
      // For create operations, check all required fields
      const requiredFields = ConversationEntity.VALIDATION.REQUIRED_FIELDS.filter(
        (field) => field !== 'id' && field !== 'createdAt' // These are auto-generated
      );

      for (const field of requiredFields) {
        if (data[field] === undefined || data[field] === null) {
          throw new Error(`Missing required field: ${field}`);
        }
      }
    }
    // For update operations, no fields are strictly required
  }

  /**
   * Validate field types match expected types
   */
  static validateTypes(data: any): void {
    const typeValidations = ConversationEntity.VALIDATION.FIELD_TYPES;

    for (const [field, expectedType] of Object.entries(typeValidations)) {
      if (data[field] !== undefined && data[field] !== null && typeof data[field] !== expectedType) {
        throw new Error(`Field ${field} must be of type ${expectedType}, got ${typeof data[field]}`);
      }
    }
  }

  /**
   * Validate enum values are within allowed constraints
   */
  static validateEnums(data: any): void {
    const enumValidations = ConversationEntity.VALIDATION.ENUM_CONSTRAINTS;

    for (const [field, allowedValues] of Object.entries(enumValidations)) {
      if (data[field] !== undefined && !allowedValues.includes(data[field])) {
        throw new Error(`Field ${field} must be one of: ${allowedValues.join(', ')}, got: ${data[field]}`);
      }
    }
  }

  /**
   * Validate string field lengths are within bounds
   */
  static validateStringLengths(data: any): void {
    const lengthValidations = ConversationEntity.VALIDATION.STRING_LENGTHS;

    for (const [field, constraints] of Object.entries(lengthValidations)) {
      if (data[field] !== undefined && typeof data[field] === 'string') {
        const value = data[field] as string;
        if (value.length < constraints.min || value.length > constraints.max) {
          throw new Error(`Field ${field} length must be between ${constraints.min} and ${constraints.max}, got length: ${value.length}`);
        }
      }
    }
  }

  /**
   * Validate all conversation data constraints
   */
  static validateAll(data: any, operation: 'create' | 'update' = 'create'): void {
    this.validateRequired(data, operation);
    this.validateTypes(data);
    this.validateEnums(data);
    this.validateStringLengths(data);
  }

  /**
   * Validate specific fields with custom constraints
   */
  static validateFieldSubset(
    data: any,
    fields: (keyof typeof ConversationEntity.VALIDATION.FIELD_TYPES)[],
    operation: 'create' | 'update' = 'update'
  ): void {
    // Create a subset of data with only the specified fields
    const subset: any = {};
    for (const field of fields) {
      if (data[field] !== undefined) {
        subset[field] = data[field];
      }
    }

    // Only validate the subset
    this.validateTypes(subset);
    this.validateEnums(subset);
    this.validateStringLengths(subset);
  }
}

export default ConversationValidation;
