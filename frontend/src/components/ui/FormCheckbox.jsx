import React from 'react';
import PropTypes from 'prop-types';

const FormCheckbox = ({
  label,
  checked,
  onChange,
  error,
  touched,
  disabled = false,
  className = '',
  ...props
}) => {
  const checkboxId = `checkbox-${label?.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center space-x-2">
        <input
          id={checkboxId}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className={`rounded border-secondary-300 text-primary-600 focus:ring-primary-500 ${
            error && touched ? 'border-red-500' : ''
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          aria-invalid={error && touched ? 'true' : 'false'}
          aria-describedby={error && touched ? `${checkboxId}-error` : undefined}
          {...props}
        />

        {label && (
          <label
            htmlFor={checkboxId}
            className="text-sm text-secondary-700 dark:text-secondary-300 cursor-pointer"
          >
            {label}
          </label>
        )}
      </div>

      {error && touched && (
        <p
          id={`${checkboxId}-error`}
          className="text-sm text-red-600 dark:text-red-400"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
};

FormCheckbox.propTypes = {
  label: PropTypes.string,
  checked: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
  error: PropTypes.string,
  touched: PropTypes.bool,
  disabled: PropTypes.bool,
  className: PropTypes.string,
};

export default FormCheckbox;
