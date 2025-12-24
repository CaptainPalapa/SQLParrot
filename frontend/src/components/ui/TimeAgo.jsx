// ABOUTME: Displays relative time that auto-updates (e.g., "5 minutes ago", "yesterday")
// ABOUTME: Uses timeago.js for human-readable time formatting with live updates

import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { render, cancel } from 'timeago.js';

const TimeAgo = ({
  datetime,
  className = '',
  live = true,
  locale = 'en_US'
}) => {
  const elementRef = useRef(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !datetime) return;

    if (live) {
      render(element, locale);
    }

    return () => {
      if (live && element) {
        cancel(element);
      }
    };
  }, [datetime, live, locale]);

  if (!datetime) {
    return null;
  }

  const dateValue = datetime instanceof Date ? datetime.toISOString() : datetime;

  return (
    <time
      ref={elementRef}
      dateTime={dateValue}
      className={className}
    />
  );
};

TimeAgo.propTypes = {
  datetime: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.instanceOf(Date)
  ]),
  className: PropTypes.string,
  live: PropTypes.bool,
  locale: PropTypes.string
};

export default TimeAgo;
