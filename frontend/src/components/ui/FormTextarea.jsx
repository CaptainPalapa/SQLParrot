import React from 'react';
import PropTypes from 'prop-types';

const FormTextarea = ({
  label,
  value,
  onChange,
  onBlur,
  error,
  touched,
  placeholder,
  required = false,
  disabled = false,
  rows = 3,
  className = '',
  ...props
}) => {
  const textareaId = `textarea-${label?.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div className={`space-y-2 ${className}`}>
      {label && (
        <label
          htmlFor={textareaId}
          className="block text-sm font-medium text-secondary-700 dark:text-secondary-300"
        >
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <textarea
        id={textareaId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        className={`input w-full resize-vertical ${
          error && touched
            ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
            : ''
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        aria-invalid={error && touched ? 'true' : 'false'}
        aria-describedby={error && touched ? `${textareaId}-error` : undefined}
        {...props}
      />

      {error && touched && (
        <p
          id={`${textareaId}-error`}
          className="text-sm text-red-600 dark:text-red-400"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
};

FormTextarea.propTypes = {
  label: PropTypes.string,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  onBlur: PropTypes.func,
  error: PropTypes.string,
  touched: PropTypes.bool,
  placeholder: PropTypes.string,
  required: PropTypes.bool,
  disabled: PropTypes.bool,
  rows: PropTypes.number,
  className: PropTypes.string,
};

export default FormTextarea;
