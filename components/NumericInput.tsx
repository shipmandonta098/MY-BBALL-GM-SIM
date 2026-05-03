import React, { useState, useEffect } from 'react';

interface NumericInputProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  onBlur?: () => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Numeric input that lets users freely clear and retype values.
 * Commits (parses + clamps) only on blur or Enter — never mid-keystroke.
 * Uses type="text" + inputMode="numeric" for full mobile keyboard support.
 */
const NumericInput: React.FC<NumericInputProps> = ({
  value,
  min,
  max,
  onChange,
  onBlur: externalBlur,
  className = '',
  placeholder = '',
  disabled = false,
}) => {
  const [draft, setDraft] = useState(String(value));

  // Keep draft in sync when external value changes (e.g. programmatic reset)
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const parsed = parseInt(draft, 10);
    if (!isNaN(parsed)) {
      let clamped = parsed;
      if (min !== undefined) clamped = Math.max(min, clamped);
      if (max !== undefined) clamped = Math.min(max, clamped);
      setDraft(String(clamped));
      onChange(clamped);
    } else {
      // Revert to last committed value on invalid input
      setDraft(String(value));
    }
    externalBlur?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="-?[0-9]*"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
    />
  );
};

export default NumericInput;
