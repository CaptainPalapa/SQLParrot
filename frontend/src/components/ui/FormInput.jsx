import React from 'react';
import PropTypes from 'prop-types';

const FormInput = ({
  label,
  type = 'text',
  value,
  onChange,
  onBlur,
  error,
  touched,
  placeholder,
  required = false,
  disabled = false,
  className = '',
  ...props
}) => {
  const inputId = `input-${label?.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div className={`space-y-2 ${className}`}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-secondary-700 dark:text-secondary-300"
        >
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <input
        id={inputId}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        className={`input w-full ${
          error && touched
            ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
            : ''
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        aria-invalid={error && touched ? 'true' : 'false'}
        aria-describedby={error && touched ? `${inputId}-error` : undefined}
        {...props}
      />

      {error && touched && (
        <p
          id={`${inputId}-error`}
          className="text-sm text-red-600 dark:text-red-400"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
};

FormInput.propTypes = {
  label: PropTypes.string,
  type: PropTypes.string,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  onBlur: PropTypes.func,
  error: PropTypes.string,
  touched: PropTypes.bool,
  placeholder: PropTypes.string,
  required: PropTypes.bool,
  disabled: PropTypes.bool,
  className: PropTypes.string,
};

export default FormInput;
