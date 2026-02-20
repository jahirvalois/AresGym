import React, { useState, useRef, useEffect } from 'react';

interface Option {
  value: string;
  label: string;
}

interface Props {
  options: Option[];
  value?: string | null;
  placeholder?: string;
  onChange: (value: string | null) => void;
  className?: string;
}

export const SearchableSelect: React.FC<Props> = ({ options, value = null, placeholder = 'Select...', onChange, className = '' }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);

  const filtered = query.trim() === ''
    ? options
    : options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  useEffect(() => setHighlight(0), [query, open]);

  // Clear the input query when the controlled value is cleared by the parent
  useEffect(() => {
    if (!value) setQuery('');
  }, [value]);

  const selected = options.find(o => o.value === value) || null;

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => Math.min(h + 1, filtered.length - 1));
      setOpen(true);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlight]) {
        onChange(filtered[highlight].value);
        setOpen(false);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <input
        className="w-full bg-white border-2 p-3 rounded-2xl font-black uppercase italic text-xs shadow-sm outline-none"
        placeholder={selected ? selected.label : placeholder}
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKey}
        aria-expanded={open}
        aria-haspopup="listbox"
      />

      {open && (
        <ul role="listbox" className="absolute z-40 left-0 right-0 mt-2 max-h-56 overflow-auto bg-white border rounded-lg shadow-lg">
          {filtered.length === 0 && (
            <li className="p-3 text-sm text-slate-500">No results</li>
          )}
          {filtered.map((opt, i) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={value === opt.value}
              onMouseDown={(ev) => { ev.preventDefault(); onChange(opt.value); setOpen(false); setQuery(''); }}
              onMouseEnter={() => setHighlight(i)}
              className={`px-3 py-2 cursor-pointer text-sm ${i === highlight ? 'bg-slate-100' : ''} ${value === opt.value ? 'font-bold' : ''}`}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SearchableSelect;

/* Usage example:
import { SearchableSelect } from './components/SearchableSelect';

const users = [
  { value: '69967b272ea25cec6a9d4fdf', label: 'jared valois cepeda' },
  { value: '6997b2d1a5c0f2e3c11e74e3', label: 'Jahir Valois' },
  // ...
];

<SearchableSelect options={users} value={selectedId} onChange={setSelectedId} placeholder="Selecciona Guerrero" />
*/
