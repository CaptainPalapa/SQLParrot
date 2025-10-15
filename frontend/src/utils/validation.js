import React from 'react';

// Form validation utilities
export const validators = {
  required: (value) => {
    if (!value || value.trim() === '') {
      return 'This field is required';
    }
    return null;
  },

  minLength: (min) => (value) => {
    if (value && value.length < min) {
      return `Must be at least ${min} characters long`;
    }
    return null;
  },

  maxLength: (max) => (value) => {
    if (value && value.length > max) {
      return `Must be no more than ${max} characters long`;
    }
    return null;
  },

  email: (value) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (value && !emailRegex.test(value)) {
      return 'Please enter a valid email address';
    }
    return null;
  },

  number: (value) => {
    if (value && isNaN(Number(value))) {
      return 'Please enter a valid number';
    }
    return null;
  },

  min: (min) => (value) => {
    if (value && Number(value) < min) {
      return `Must be at least ${min}`;
    }
    return null;
  },

  max: (max) => (value) => {
    if (value && Number(value) > max) {
      return `Must be no more than ${max}`;
    }
    return null;
  },

  custom: (validatorFn) => validatorFn,
};

// Validate a single field
export const validateField = (value, rules) => {
  for (const rule of rules) {
    const error = rule(value);
    if (error) {
      return error;
    }
  }
  return null;
};

// Validate an entire form
export const validateForm = (values, validationRules) => {
  const errors = {};
  let isValid = true;

  Object.keys(validationRules).forEach(field => {
    const fieldRules = validationRules[field];
    const error = validateField(values[field], fieldRules);
    if (error) {
      errors[field] = error;
      isValid = false;
    }
  });

  return { errors, isValid };
};

// Custom hook for form validation
export const useFormValidation = (initialValues, validationRules) => {
  const [values, setValues] = React.useState(initialValues);
  const [errors, setErrors] = React.useState({});
  const [touched, setTouched] = React.useState({});

  const setValue = (field, value) => {
    setValues(prev => ({ ...prev, [field]: value }));

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  const setFieldTouched = (field) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  const validate = () => {
    const { errors: newErrors, isValid } = validateForm(values, validationRules);
    setErrors(newErrors);

    // Mark all fields with errors as touched so they show error messages
    if (!isValid) {
      const newTouched = {};
      Object.keys(newErrors).forEach(field => {
        if (newErrors[field]) {
          newTouched[field] = true;
        }
      });
      setTouched(prev => ({ ...prev, ...newTouched }));
    }

    return isValid;
  };

  const reset = () => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
  };

  return {
    values,
    errors,
    touched,
    setValue,
    setFieldTouched,
    validate,
    reset,
    isValid: Object.keys(errors).length === 0,
  };
};
