import { describe, it, expect } from 'vitest'
import { validators, validateField, validateForm } from '../../utils/validation'

describe('Validation Utilities', () => {
  describe('validators', () => {
    describe('required', () => {
      it('returns error for empty string', () => {
        expect(validators.required('')).toBe('This field is required')
        expect(validators.required('   ')).toBe('This field is required')
      })

      it('returns null for valid input', () => {
        expect(validators.required('hello')).toBeNull()
        expect(validators.required('0')).toBeNull()
      })
    })

    describe('minLength', () => {
      it('returns error for string shorter than minimum', () => {
        const validator = validators.minLength(5)
        expect(validator('hi')).toBe('Must be at least 5 characters long')
      })

      it('returns null for string meeting minimum length', () => {
        const validator = validators.minLength(5)
        expect(validator('hello')).toBeNull()
        expect(validator('hello world')).toBeNull()
      })
    })

    describe('maxLength', () => {
      it('returns error for string longer than maximum', () => {
        const validator = validators.maxLength(5)
        expect(validator('hello world')).toBe('Must be no more than 5 characters long')
      })

      it('returns null for string within maximum length', () => {
        const validator = validators.maxLength(5)
        expect(validator('hello')).toBeNull()
        expect(validator('hi')).toBeNull()
      })
    })

    describe('email', () => {
      it('returns error for invalid email', () => {
        expect(validators.email('invalid')).toBe('Please enter a valid email address')
        expect(validators.email('test@')).toBe('Please enter a valid email address')
        expect(validators.email('@domain.com')).toBe('Please enter a valid email address')
      })

      it('returns null for valid email', () => {
        expect(validators.email('test@example.com')).toBeNull()
        expect(validators.email('user.name@domain.co.uk')).toBeNull()
      })
    })

    describe('number', () => {
      it('returns error for non-numeric input', () => {
        expect(validators.number('abc')).toBe('Please enter a valid number')
        expect(validators.number('12abc')).toBe('Please enter a valid number')
      })

      it('returns null for numeric input', () => {
        expect(validators.number('123')).toBeNull()
        expect(validators.number('12.34')).toBeNull()
        expect(validators.number('-5')).toBeNull()
      })
    })
  })

  describe('validateField', () => {
    it('returns first error found', () => {
      const rules = [validators.required, validators.minLength(5)]
      expect(validateField('hi', rules)).toBe('Must be at least 5 characters long')
    })

    it('returns null when all validations pass', () => {
      const rules = [validators.required, validators.minLength(3)]
      expect(validateField('hello', rules)).toBeNull()
    })
  })

  describe('validateForm', () => {
    it('returns errors for invalid fields', () => {
      const values = { name: '', email: 'invalid' }
      const rules = {
        name: [validators.required],
        email: [validators.email]
      }

      const result = validateForm(values, rules)
      expect(result.isValid).toBe(false)
      expect(result.errors.name).toBe('This field is required')
      expect(result.errors.email).toBe('Please enter a valid email address')
    })

    it('returns no errors for valid form', () => {
      const values = { name: 'John', email: 'john@example.com' }
      const rules = {
        name: [validators.required],
        email: [validators.email]
      }

      const result = validateForm(values, rules)
      expect(result.isValid).toBe(true)
      expect(result.errors).toEqual({})
    })
  })
})
