// ABOUTME: Displays relative time that auto-updates (e.g., "5 minutes ago", "yesterday")
// ABOUTME: Uses a single shared timer for synchronized updates across all instances

import React, { useEffect, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { format } from 'timeago.js';

// Shared state for synchronized updates
let globalTick = 0;
let listeners = new Set();
let intervalId = null;

const UPDATE_INTERVAL = 5000; // Update every 5 seconds

function startGlobalTimer() {
  if (intervalId) return;
  intervalId = setInterval(() => {
    globalTick++;
    listeners.forEach(listener => listener(globalTick));
  }, UPDATE_INTERVAL);
}

function stopGlobalTimer() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function subscribe(listener) {
  listeners.add(listener);
  if (listeners.size === 1) {
    startGlobalTimer();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stopGlobalTimer();
    }
  };
}

const TimeAgo = ({
  datetime,
  className = '',
  live = true,
  locale = 'en_US'
}) => {
  const [, setTick] = useState(0);

  // Subscribe to global timer for synchronized updates
  useEffect(() => {
    if (!live) return;
    return subscribe(setTick);
  }, [live]);

  // Format the time
  const formatTime = useCallback(() => {
    if (!datetime) return '';
    return format(datetime, locale);
  }, [datetime, locale]);

  if (!datetime) {
    return null;
  }

  const dateValue = datetime instanceof Date ? datetime.toISOString() : datetime;

  return (
    <time dateTime={dateValue} className={className}>
      {formatTime()}
    </time>
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
