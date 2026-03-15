"use client";
import { useState, type KeyboardEvent, type ChangeEvent } from 'react';

interface KeywordInputProps {
  keywords: string[];
  onAdd: (keyword: string) => void;
  onRemove: (index: number) => void;
}

export function KeywordInput({ keywords, onAdd, onRemove }: KeywordInputProps) {
  const [inputValue, setInputValue] = useState('');

  const addKeywords = (text: string) => {
    const parts = text.split(',').map(s => s.trim()).filter(Boolean);
    parts.forEach(p => onAdd(p));
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val.includes(',')) {
      addKeywords(val);
      setInputValue('');
    } else {
      setInputValue(val);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      onAdd(inputValue.trim());
      setInputValue('');
    }
    if (e.key === 'Backspace' && !inputValue && keywords.length > 0) {
      onRemove(keywords.length - 1);
    }
  };

  return (
    <div style={{ marginBottom: 18 }}>
      <label className="block" style={{ fontSize: 12, fontWeight: 600, color: 'var(--dr-text-muted)', marginBottom: 6 }}>
        Keywords
      </label>
      <div
        className="flex items-center flex-wrap gap-2"
        style={{
          border: '1px solid var(--dr-border)', borderRadius: 8,
          padding: '8px 12px', background: '#fff', minHeight: 42,
        }}
      >
        {keywords.map((kw, i) => (
          <span
            key={i}
            className="flex items-center gap-1.5 font-semibold"
            style={{
              background: 'var(--dr-blue-light)', color: 'var(--dr-blue)',
              fontSize: 12.5, padding: '3px 10px', borderRadius: 20,
            }}
          >
            {kw}
            <span onClick={() => onRemove(i)} className="cursor-pointer" style={{ fontSize: 14, lineHeight: 1, color: '#93C5FD' }}>×</span>
          </span>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={keywords.length === 0 ? "Add a keyword..." : ""}
          className="flex-1 outline-none min-w-[120px]"
          style={{ fontSize: 13, color: 'var(--dr-text)', fontFamily: 'Inter, sans-serif', border: 'none', background: 'transparent' }}
        />
      </div>
      <p style={{ fontSize: 11, color: 'var(--dr-text-muted)', marginTop: 5 }}>
        Each keyword is searched as an exact phrase. Press Enter or comma to add.
      </p>
    </div>
  );
}
